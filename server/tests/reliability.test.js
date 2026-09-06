import test from 'node:test'
import assert from 'node:assert/strict'
import { isCalendarDate, validateAccountImportRows, validateBillingImportRows } from '../src/lib/importValidation.js'
import { readApiResponse } from '../../src/lib/apiResponse.js'

const registry = { from: () => ({ select: () => ({ in: async () => ({ data: [{ account_number: 'QA-001' }] }) }) }) }
const bill = { account_number: 'qa-001', billing_period: '2026-02', amount_due: '10', due_date: '2026-02-28' }
test('calendar dates reject overflow, ambiguous formats and non-leap February 29', () => {
  for (const value of ['2026-02-30', '2026-02-29', '2026-04-31', '2026-13-01', '09/06/2026', '2026-2-1', '0000-01-01', '']) assert.equal(isCalendarDate(value), false, value)
  for (const value of ['2024-02-29', '2026-09-06', ' 2026-02-28 ']) assert.equal(isCalendarDate(value), true, value)
})
test('billing preview blocks impossible dates before any writes', async () => {
  const result = await validateBillingImportRows(registry, [{ ...bill, due_date: '2026-02-30' }])
  assert.equal(result.can_import, false)
  assert.match(result.errors[0].error, /real calendar date/)
})
test('billing import normalizes date and payment status consistently with preview', async () => {
  const result = await validateBillingImportRows(registry, [{ ...bill, due_date: ' 2026-02-28 ', status: ' PAID ' }])
  assert.equal(result.can_import, true)
  assert.equal(result.validRows[0].due_date, '2026-02-28')
  assert.equal(result.validRows[0].status, 'paid')
})
test('billing rejects unknown accounts, duplicates and negative amounts', async () => {
  for (const rows of [[{ ...bill, account_number: 'UNKNOWN' }], [bill, bill], [{ ...bill, amount_due: -1 }]]) {
    assert.equal((await validateBillingImportRows(registry, rows)).can_import, false)
  }
})
test('account imports reject ambiguous active flags and preserve explicit false', async () => {
  const account = { account_number: 'qa-001', registered_name: 'QA ONLY' }
  assert.equal((await validateAccountImportRows(registry, [{ ...account, is_active: 'no' }])).can_import, false)
  assert.equal((await validateAccountImportRows(registry, [{ ...account, is_active: ' FALSE ' }])).validRows[0].is_active, false)
  assert.equal((await validateAccountImportRows(registry, [{ ...account, account_number: 'X'.repeat(81) }])).can_import, false)
})
test('imports reject malformed rows and oversized batches without truncation', async () => {
  await assert.rejects(validateBillingImportRows(registry, [null]), /Row 2/)
  await assert.rejects(validateAccountImportRows(registry, [[]]), /Row 2/)
  await assert.rejects(validateBillingImportRows(registry, Array(5001).fill(bill)), /5,000/)
  await assert.rejects(validateAccountImportRows(registry, Array(2001).fill({})), /2,000/)
})
test('unexpected HTTP 200 responses cannot report a successful save', async () => {
  for (const body of ['<html>Proxy error</html>', '', 'null', '[]']) {
    await assert.rejects(readApiResponse(new Response(body, { status: 200 })), /response/i)
  }
})
test('API responses preserve server validation errors and successful payloads', async () => {
  await assert.rejects(readApiResponse(new Response('{"error":"Photo is required"}', { status: 400 })), /Photo is required/)
  assert.deepEqual(await readApiResponse(new Response('{"complaint":{"id":"qa"}}')), { complaint: { id: 'qa' } })
})
