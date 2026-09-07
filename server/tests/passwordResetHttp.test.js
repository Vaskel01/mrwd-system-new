import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

test('password-reset request returns the same generic response for every email', async () => {
  const providerRequests = []
  const provider = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      providerRequests.push({ path: req.url, body: body ? JSON.parse(body) : null })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{}')
    })
  })
  provider.listen(0, '127.0.0.1')
  await new Promise(resolve => provider.once('listening', resolve))

  process.env.SUPABASE_URL = `http://127.0.0.1:${provider.address().port}`
  process.env.SUPABASE_ANON_KEY = 'qa-test-placeholder-not-a-real-key'
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const { default: app } = await import('../app.js')
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))

  const requestReset = email => fetch(`http://127.0.0.1:${server.address().port}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirect_to: 'http://localhost:5173/reset-password' }),
    signal: AbortSignal.timeout(10000),
  })

  try {
    const [first, second] = await Promise.all([
      requestReset('existing@example.invalid'),
      requestReset('absent@example.invalid'),
    ])
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.deepEqual(await first.json(), await second.json())
    assert.deepEqual(await requestReset('').then(async response => ({
      status: response.status, body: await response.json(),
    })), { status: 400, body: { error: 'Email is required.' } })

    const recoveries = providerRequests.filter(request => request.path.startsWith('/auth/v1/recover'))
    assert.equal(recoveries.length, 2)
    assert.deepEqual(recoveries.map(request => request.body.email).sort(), [
      'absent@example.invalid',
      'existing@example.invalid',
    ])
  } finally {
    server.closeAllConnections()
    provider.closeAllConnections()
    await Promise.all([
      new Promise(resolve => server.close(resolve)),
      new Promise(resolve => provider.close(resolve)),
    ])
  }
})
