import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

test('login HTTP endpoint returns service-unavailable when the auth provider is down', async () => {
  const provider = http.createServer((req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'QA simulated provider outage' }))
  })
  provider.listen(0, '127.0.0.1')
  await new Promise(resolve => provider.once('listening', resolve))
  process.env.SUPABASE_URL = `http://127.0.0.1:${provider.address().port}`
  process.env.SUPABASE_ANON_KEY = 'qa-test-placeholder-not-a-real-key'
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const { default: app } = await import('../app.js')
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'qa@example.invalid', password: 'QA-only-password1' }),
      signal: AbortSignal.timeout(10000),
    })
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'Sign-in service is temporarily unavailable. Please try again shortly.' })
  } finally {
    server.closeAllConnections(); provider.closeAllConnections()
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => provider.close(resolve))])
  }
})
