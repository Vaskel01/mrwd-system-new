import { readFile } from 'node:fs/promises'

import { createClient } from '@supabase/supabase-js'

function parseEnvironment(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map(match => [match[1], match[2].replace(/^['"]|['"]$/g, '')]))
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, payload }
}

function expectStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, received ${result.status}: ${result.payload.error || 'no error message'}`)
  }
}

const serverEnvironment = parseEnvironment(await readFile(new URL('../server/.env', import.meta.url), 'utf8'))
const supabaseUrl = serverEnvironment.SUPABASE_URL
const anonKey = serverEnvironment.SUPABASE_ANON_KEY
const serviceRoleKey = serverEnvironment.SUPABASE_SERVICE_ROLE_KEY
const apiUrl = process.env.MRWD_LOCAL_API_URL || 'http://127.0.0.1:4010/api'

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required in server/.env.')
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const email = `qa-first-login-${suffix}@example.invalid`
const temporaryPassword = `Temp-${crypto.randomUUID()}-7`
const permanentPassword = `Changed-${crypto.randomUUID()}-8`
let userId = null

try {
  const health = await requestJson(`${apiUrl}/health`)
  expectStatus(health, 200, 'Local API health check')

  const created = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: 'QA ONLY First Login' },
  })
  if (created.error || !created.data.user) {
    throw new Error(`Temporary user creation failed: ${created.error?.message || 'missing user'}`)
  }
  userId = created.data.user.id

  const profile = await admin.from('profiles').update({
    full_name: 'QA ONLY First Login',
    role: 'maintenance_personnel',
    is_active: true,
    must_change_password: true,
    last_password_changed_at: null,
  }).eq('id', userId).select('id').single()
  if (profile.error) throw new Error(`Temporary profile setup failed: ${profile.error.message}`)

  const login = await requestJson(`${apiUrl}/auth/login`, {
    method: 'POST', body: JSON.stringify({ email, password: temporaryPassword }),
  })
  expectStatus(login, 200, 'Temporary-password login')
  if (!login.payload.user?.must_change_password || !login.payload.access_token) {
    throw new Error('Login did not return the required first-login flag and session.')
  }

  const authorization = { Authorization: `Bearer ${login.payload.access_token}` }
  const missingCurrent = await requestJson(`${apiUrl}/auth/password`, {
    method: 'PATCH', headers: authorization, body: JSON.stringify({ password: permanentPassword }),
  })
  expectStatus(missingCurrent, 400, 'Missing-current-password rejection')

  const wrongCurrent = await requestJson(`${apiUrl}/auth/password`, {
    method: 'PATCH', headers: authorization,
    body: JSON.stringify({ current_password: `${temporaryPassword}wrong`, password: permanentPassword }),
  })
  expectStatus(wrongCurrent, 400, 'Wrong-current-password rejection')

  const reusedPassword = await requestJson(`${apiUrl}/auth/password`, {
    method: 'PATCH', headers: authorization,
    body: JSON.stringify({ current_password: temporaryPassword, password: temporaryPassword }),
  })
  expectStatus(reusedPassword, 400, 'Reused-password rejection')

  const weakPassword = await requestJson(`${apiUrl}/auth/password`, {
    method: 'PATCH', headers: authorization,
    body: JSON.stringify({ current_password: temporaryPassword, password: 'weak' }),
  })
  expectStatus(weakPassword, 400, 'Weak-password rejection')

  const changed = await requestJson(`${apiUrl}/auth/password`, {
    method: 'PATCH', headers: authorization,
    body: JSON.stringify({ current_password: temporaryPassword, password: permanentPassword }),
  })
  expectStatus(changed, 200, 'Valid password change')
  if (!changed.payload.access_token || !changed.payload.refresh_token) {
    throw new Error('Password change did not return the refreshed session.')
  }

  const refreshedAuthorization = { Authorization: `Bearer ${changed.payload.access_token}` }
  const me = await requestJson(`${apiUrl}/auth/me`, { headers: refreshedAuthorization })
  expectStatus(me, 200, 'Refreshed profile lookup')
  if (me.payload.user.must_change_password || !me.payload.user.last_password_changed_at) {
    throw new Error('The first-login flag or password-change timestamp was not updated.')
  }

  const oldPasswordLogin = await requestJson(`${apiUrl}/auth/login`, {
    method: 'POST', body: JSON.stringify({ email, password: temporaryPassword }),
  })
  expectStatus(oldPasswordLogin, 401, 'Old-password rejection')

  const newPasswordLogin = await requestJson(`${apiUrl}/auth/login`, {
    method: 'POST', body: JSON.stringify({ email, password: permanentPassword }),
  })
  expectStatus(newPasswordLogin, 200, 'New-password login')

  const session = await userClient.auth.setSession({
    access_token: newPasswordLogin.payload.access_token,
    refresh_token: newPasswordLogin.payload.refresh_token,
  })
  if (session.error) throw new Error(`Session setup for teardown failed: ${session.error.message}`)

  console.log('PASS temporary login; PASS invalid password boundaries; PASS first-login flag cleared; PASS old password rejected; PASS new password accepted')
} finally {
  if (userId) {
    await admin.from('profiles').update({ is_active: false }).eq('id', userId)
    await userClient.auth.signOut({ scope: 'global' })
    const removed = await admin.auth.admin.deleteUser(userId)
    if (removed.error) throw new Error(`Temporary user cleanup failed: ${removed.error.message}`)

    const remainingProfile = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (remainingProfile.error || remainingProfile.data) {
      throw new Error(`Temporary profile cleanup failed: ${remainingProfile.error?.message || 'profile remains'}`)
    }
  }
}
