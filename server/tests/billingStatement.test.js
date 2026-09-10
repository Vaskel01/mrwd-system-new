import test from 'node:test'
import assert from 'node:assert/strict'
import { validateBillingImportRows } from '../src/lib/importValidation.js'
import { statementFromRow, statementForImport } from '../src/lib/billingStatement.js'
import { formatPeso, isOverdue, billDate } from '../../src/lib/billingDisplay.js'

const registry = { from: () => ({ select: () => ({ in: async () => ({ data: [{ account_number: 'QA-001' }] }) }) }) }
const base = { account_number: 'QA-001', billing_period: '2026-09', amount_due: '262', due_date: '2026-09-15', previous_reading: '621', current_reading: '628', consumption: '7' }
const detailed = { ...base, water_charge: '252.00', arrears: '0', other_charges: '0', meter_maintenance: '10.00', penalty: '25.20', amount_after_due: '287.20', reading_date: '2026-09-05', bill_number: ' QA-ONLY ' }

test('official statement breakdown passes validation and normalizes optional fields', async () => {
  assert.equal((await validateBillingImportRows(registry, [detailed])).can_import, true)
  assert.equal(statementFromRow(detailed).bill_number, 'QA-ONLY')
  assert.equal(statementFromRow(detailed).arrears, 0)
  assert.equal(statementFromRow(detailed).amount_after_due, 287.2)
})
test('missing statement amounts stay unknown, distinct from zero', () => {
  assert.equal(statementFromRow(base), null)
  assert.deepEqual(statementFromRow({ penalty: '0', arrears: '', water_charge: null }), { penalty: 0 })
  assert.equal(formatPeso(null), 'Not provided')
  assert.equal(formatPeso(undefined), 'Not provided')
  assert.equal(formatPeso(0), '₱0.00')
})
test('statement amounts reject malformed, negative, imprecise and huge values', async () => {
  for (const value of ['-1', 'Infinity', 'NaN', '1,000', '₱20', '1.001', '1000000000', {}, true]) {
    assert.equal((await validateBillingImportRows(registry, [{ ...base, penalty: value }])).can_import, false, String(value))
    assert.equal((await validateBillingImportRows(registry, [{ ...base, amount_due: value }])).can_import, false, String(value))
  }
})
test('statement validation blocks inconsistent totals but allows partial details', async () => {
  for (const row of [{ ...detailed, water_charge: '250' }, { ...detailed, amount_after_due: '280' }, { ...base, amount_after_due: '200' }]) {
    assert.equal((await validateBillingImportRows(registry, [row])).can_import, false)
  }
  assert.equal((await validateBillingImportRows(registry, [{ ...base, penalty: '0' }])).can_import, true)
})
test('statement date and metadata validation are bounded', async () => {
  for (const row of [{ ...base, reading_date: '2026-02-30' }, { ...base, bill_number: 'X'.repeat(301) }]) {
    assert.equal((await validateBillingImportRows(registry, [row])).can_import, false)
  }
})
test('legacy payment status reimports preserve the unchanged statement snapshot', () => {
  const existing = { ...base, statement_details: statementFromRow(detailed) }
  assert.deepEqual(statementForImport({ ...base, status: 'paid' }, existing), existing.statement_details)
  assert.equal(statementForImport({ ...base, amount_due: '0' }, existing), null)
  assert.equal(statementForImport({ ...base, due_date: '2026-09-16' }, existing), null)
  assert.equal(statementForImport({ ...base, current_reading: '629' }, existing), null)
})
test('expanded reimports replace optional snapshot without accepting unknown keys', () => {
  const existing = { ...base, statement_details: statementFromRow(detailed) }
  assert.deepEqual(statementForImport({ ...base, penalty: '0', internal_secret: 'ignored' }, existing), { penalty: 0 })
  assert.equal(statementForImport({ ...base, penalty: '' }, existing), null)
})
test('past-due status starts after the due date in Manila, never during that day', () => {
  assert.equal(isOverdue('2026-09-15', 'unpaid', new Date('2026-09-15T15:59:59Z')), false)
  assert.equal(isOverdue('2026-09-15', 'unpaid', new Date('2026-09-15T16:00:00Z')), true)
  assert.equal(isOverdue('2026-09-15', 'paid', new Date('2026-09-16T00:00:00Z')), false)
  assert.equal(billDate(null), 'Not provided')
  assert.match(billDate('2026-09-15'), /15/)
})
