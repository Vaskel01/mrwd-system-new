import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlatformReadiness } from '../src/lib/platformReadiness.js'

test('platform checks stay disabled without a management token', async () => {
  const result = await getPlatformReadiness({ SUPABASE_URL: 'https://project.supabase.co' })
  assert.equal(result.configured, false)
  assert.equal(result.auth.status, 'not_checked')
  assert.equal(result.backups.status, 'not_checked')
})

test('platform readiness returns safe Auth and backup summaries', async () => {
  const requests = []
  const result = await getPlatformReadiness({
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_MANAGEMENT_TOKEN: 'management-secret',
  }, async (url, options) => {
    requests.push({ url, options })
    if (url.endsWith('/config/auth')) {
      return new Response(JSON.stringify({
        smtp_host: 'smtp.example.invalid', smtp_user: 'private-user', smtp_pass: 'must-not-return',
        password_hibp_enabled: true, password_min_length: 12,
      }), { status: 200 })
    }
    return new Response(JSON.stringify({
      pitr_enabled: true,
      backups: [
        { status: 'COMPLETED', inserted_at: '2026-09-07T01:00:00Z' },
        { status: 'COMPLETED', inserted_at: '2026-09-08T01:00:00Z' },
      ],
    }), { status: 200 })
  })

  assert.equal(requests.length, 2)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer management-secret')
  assert.deepEqual(result.auth, {
    status: 'online', custom_smtp: true, leaked_password_protection: true, minimum_password_length: 12,
  })
  assert.equal(result.backups.latest_completed_at, '2026-09-08T01:00:00Z')
  assert.equal(result.backups.pitr_enabled, true)
  assert.doesNotMatch(JSON.stringify(result), /must-not-return|private-user|management-secret/)
})

test('one failed management endpoint does not hide the other result', async () => {
  const result = await getPlatformReadiness({
    SUPABASE_PROJECT_REF: 'project', SUPABASE_MANAGEMENT_TOKEN: 'token',
  }, async url => url.endsWith('/config/auth')
    ? new Response('{}', { status: 403 })
    : new Response(JSON.stringify({ backups: [] }), { status: 200 }))

  assert.equal(result.auth.status, 'degraded')
  assert.equal(result.backups.status, 'online')
})
