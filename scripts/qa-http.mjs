// Live authentication/read/preview checks only. Does not submit complaints,
// import bills, or execute a permitted workflow mutation.
import assert from 'node:assert/strict'
const base = process.env.QA_API_URL || 'http://localhost:4010/api'
const password = process.env.QA_DEMO_PASSWORD
if (!password) throw new Error('Set QA_DEMO_PASSWORD')
assert.equal((await fetch(`${base}/complaints`)).status, 401)
for (const [role, email] of [['customer','customer@demo.com'],['commercial','commercial1@mrwd.test'],['ecmd','ecmd1@mrwd.test'],['maintenance','maintenance@demo.com']]) {
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  assert.equal(login.status, 200, `${role} login`)
  const session = await login.json()
  assert.ok(session.access_token, `${role} session`)
  const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
  assert.equal((await fetch(`${base}/complaints`, { headers })).status, 200, `${role} allowed complaint list`)
  const forbidden = role === 'commercial' ? '/service-accounts' : '/service-accounts/directory'
  assert.equal((await fetch(`${base}${forbidden}`, { headers })).status, 403, `${role} forbidden service-account endpoint`)
  if (role === 'commercial') {
    const preview = await fetch(`${base}/operations/billing/validate-import`, { method: 'POST', headers, body: JSON.stringify({ rows: [{ account_number: 'QA-NOT-IMPORTED', billing_period: '2026-02', amount_due: 10, due_date: '2026-02-30' }] }) })
    assert.equal(preview.status, 200)
    const data = await preview.json()
    assert.equal(data.can_import, false)
    assert.match(data.errors[0].error, /real calendar date/)
  }
  console.log(`PASS: ${role} authenticated read and forbidden endpoint${role === 'commercial' ? '; invalid-date import preview rejected' : ''}`)
}
console.log('PASS: anonymous read denied. No operational records written; login audit/session metadata may update normally.')
