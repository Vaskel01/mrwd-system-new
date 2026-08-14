import { Router } from 'express'
import { supabaseAnonClient } from '../supabaseClient.js'
import { requireAuth } from '../middleware/auth.js'
import { writeAudit } from '../lib/activity.js'

const router = Router()
const PROFILE_FIELDS = 'id, email, full_name, role, is_active, account_number, phone, service_address, barangay, availability_status, availability_note, availability_until, department_id, staff_position, supervisor_id, account_validation_status, account_validated_at, email_notifications_enabled, sms_notifications_enabled, department:departments(id, code, name)'
const PASSWORD_ERROR = 'Use at least 8 characters with at least one letter and one number.'

function isPasswordValid(password = '') {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' })

  const client = supabaseAnonClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data?.session) return res.status(401).json({ error: 'Incorrect email or password.' })

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', data.user.id)
    .single()

  if (profileErr || !profile) return res.status(403).json({ error: 'No profile found for this account. Contact the district office.' })
  if (profile.is_active === false) {
    await client.auth.signOut()
    return res.status(403).json({ error: 'This account has been deactivated. Contact an administrator.' })
  }

  res.json({ user: profile, access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})

router.post('/signup', async (req, res) => {
  const { email, password, full_name } = req.body || {}
  if (!email || !password || !full_name) return res.status(400).json({ error: 'Full name, email, and password are required.' })
  if (!isPasswordValid(password)) return res.status(400).json({ error: PASSWORD_ERROR })

  const client = supabaseAnonClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  })
  if (error) return res.status(400).json({ error: error.message })
  if (!data.session) return res.status(200).json({ requiresEmailConfirmation: true })

  await client.from('profiles').upsert(
    { id: data.user.id, email, full_name, role: 'customer', is_active: true },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  const { data: profile } = await client.from('profiles').select(PROFILE_FIELDS).eq('id', data.user.id).single()
  res.status(201).json({
    user: profile || { id: data.user.id, email, full_name, role: 'customer', is_active: true },
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
})

router.post('/forgot-password', async (req, res) => {
  const { email, redirect_to } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Email is required.' })
  const client = supabaseAnonClient()
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: redirect_to || process.env.PASSWORD_RESET_REDIRECT_URL || undefined,
  })
  if (error) return res.status(400).json({ error: error.message })
  // Do not disclose whether an account exists.
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' })
})

router.post('/logout', requireAuth, async (req, res) => {
  await req.supabase.auth.signOut()
  res.json({ ok: true })
})

router.patch('/password', requireAuth, async (req, res) => {
  const { current_password, password } = req.body || {}
  if (!current_password) return res.status(400).json({ error: 'Enter your current password.' })
  if (!isPasswordValid(password)) return res.status(400).json({ error: PASSWORD_ERROR })
  if (current_password === password) return res.status(400).json({ error: 'Choose a new password that is different from your current password.' })

  const client = supabaseAnonClient()
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
    email: req.user.email,
    password: current_password,
  })
  if (signInError || signInData?.user?.id !== req.user.id) {
    return res.status(400).json({ error: 'Current password is incorrect.' })
  }

  const { error } = await client.auth.updateUser({ password })
  if (error) return res.status(400).json({ error: error.message })

  await writeAudit(req.supabase, req.user, 'account.password_changed', 'profile', req.user.id)
  const { data: sessionData } = await client.auth.getSession()
  res.json({
    ok: true,
    message: 'Password changed successfully.',
    access_token: sessionData?.session?.access_token || signInData.session?.access_token,
    refresh_token: sessionData?.session?.refresh_token || signInData.session?.refresh_token,
  })
})

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }))

export default router
