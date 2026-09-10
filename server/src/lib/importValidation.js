import { statementMoneyFields, statementTextFields } from './billingStatement.js'
const trimmed = value => String(value ?? '').trim()

export function isCalendarDate(value) {
  const text = trimmed(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text && !text.startsWith('0000-')
}

function requireObjects(rows) {
  const badIndex = rows.findIndex(row => !row || typeof row !== 'object' || Array.isArray(row))
  if (badIndex !== -1) throw new Error(`Row ${badIndex + 2} must contain named columns. No rows were imported.`)
}

async function existingAccountRegistry(supabase, accountNumbers = []) {
  const unique = [...new Set(accountNumbers.filter(Boolean))]
  const existing = new Set()
  for (let index = 0; index < unique.length; index += 250) {
    const chunk = unique.slice(index, index + 250)
    const { data, error } = await supabase.from('customer_account_registry').select('account_number').in('account_number', chunk)
    if (error) throw error
    for (const row of data || []) existing.add(String(row.account_number || '').toUpperCase())
  }
  return existing
}

export async function validateAccountImportRows(supabase, inputRows) {
  requireObjects(inputRows)
  if (inputRows.length > 2000) throw new Error('Split the account file into batches of at most 2,000 rows. No rows were imported.')
  const rows = inputRows
  const normalized = rows.map((row, index) => ({
    row: index + 2,
    account_number: trimmed(row.account_number).toUpperCase(),
    registered_name: trimmed(row.registered_name),
    service_address: trimmed(row.service_address),
    barangay: trimmed(row.barangay),
    meter_number: trimmed(row.meter_number),
    is_active: trimmed(row.is_active ?? 'true').toLowerCase(),
  }))
  const occurrences = new Map()
  for (const row of normalized) if (row.account_number) occurrences.set(row.account_number, (occurrences.get(row.account_number) || 0) + 1)
  const existing = await existingAccountRegistry(supabase, normalized.map(row => row.account_number))
  const errors = []
  const validRows = []
  for (const row of normalized) {
    const rowErrors = []
    if (!row.account_number) rowErrors.push('account_number is required')
    if (row.account_number.length > 80) rowErrors.push('account_number must be at most 80 characters')
    if (!['true', 'false'].includes(row.is_active)) rowErrors.push('is_active must be true or false')
    if (!row.registered_name) rowErrors.push('registered_name is required')
    if (row.account_number && occurrences.get(row.account_number) > 1) rowErrors.push('duplicate account_number in this file')
    if (rowErrors.length) errors.push({ row: row.row, account_number: row.account_number || null, error: rowErrors.join('; ') })
    else validRows.push({ ...row, is_active: row.is_active === 'true' })
  }
  const newCount = validRows.filter(row => !existing.has(row.account_number)).length
  return {
    kind: 'accounts', total: rows.length, valid_count: validRows.length, invalid_count: errors.length,
    new_count: newCount, update_count: validRows.length - newCount, errors, validRows,
    can_import: validRows.length > 0 && errors.length === 0,
  }
}

export async function validateBillingImportRows(supabase, inputRows) {
  requireObjects(inputRows)
  if (inputRows.length > 5000) throw new Error('Split the billing file into batches of at most 5,000 rows. No rows were imported.')
  const rows = inputRows
  const normalized = rows.map((row, index) => ({ ...row, row: index + 2, account_number: trimmed(row.account_number).toUpperCase(), billing_period: trimmed(row.billing_period), due_date: trimmed(row.due_date), status: trimmed(row.status || 'unpaid').toLowerCase() }))
  const keys = new Map()
  for (const row of normalized) {
    const key = `${row.account_number}|${row.billing_period}`
    if (row.account_number && row.billing_period) keys.set(key, (keys.get(key) || 0) + 1)
  }
  const linked = await existingAccountRegistry(supabase, normalized.map(row => row.account_number))
  const errors = []
  const validRows = []
  for (const row of normalized) {
    const rowErrors = []
    const key = `${row.account_number}|${row.billing_period}`
    if (!row.account_number) rowErrors.push('account_number is required')
    if (!row.billing_period) rowErrors.push('billing_period is required')
    if (row.account_number && !linked.has(row.account_number)) rowErrors.push('import this account into the official customer account list first; a customer login is not required')
    if (row.account_number && row.billing_period && keys.get(key) > 1) rowErrors.push('duplicate account_number + billing_period in this file')
    for (const field of ['previous_reading','current_reading','consumption','amount_due']) {
      const value = row[field]
      if (field === 'amount_due' && trimmed(value) === '') rowErrors.push('amount_due is required')
      else if (trimmed(value) !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) rowErrors.push(`${field} must be a non-negative number`)
    }
    if (!trimmed(row.due_date)) rowErrors.push('due_date is required')
    else if (!isCalendarDate(row.due_date)) rowErrors.push('due_date must be a real calendar date in YYYY-MM-DD format')
    for (const field of ['amount_due', ...statementMoneyFields]) {
      if (trimmed(row[field]) && !/^\d+(\.\d{1,2})?$/.test(trimmed(row[field]))) rowErrors.push(`${field} must be a non-negative amount with at most two decimal places (no commas or currency symbols)`)
      else if (trimmed(row[field]) && Number(row[field]) > 999999999) rowErrors.push(`${field} is too large`)
    }
    for (const field of statementTextFields) {
      if (trimmed(row[field]).length > 300) rowErrors.push(`${field} must be at most 300 characters`)
    }
    if (trimmed(row.reading_date) && !isCalendarDate(row.reading_date)) rowErrors.push('reading_date must be a real calendar date in YYYY-MM-DD format')
    const charges = ['water_charge', 'arrears', 'other_charges', 'meter_maintenance']
    const cents = value => Math.round(Number(value) * 100)
    if (charges.every(field => trimmed(row[field]) !== '') && charges.reduce((sum, field) => sum + cents(row[field]), 0) !== cents(row.amount_due)) rowErrors.push('charge breakdown must equal amount_due (on or before the due date)')
    if (trimmed(row.penalty) && trimmed(row.amount_after_due) && cents(row.amount_due) + cents(row.penalty) !== cents(row.amount_after_due)) rowErrors.push('amount_after_due must equal amount_due plus penalty')
    if (trimmed(row.amount_after_due) && Number(row.amount_after_due) < Number(row.amount_due)) rowErrors.push('amount_after_due cannot be less than amount_due')
    const status = String(row.status || 'unpaid').toLowerCase()
    if (!['paid','unpaid'].includes(status)) rowErrors.push('status must be paid or unpaid')
    if (rowErrors.length) errors.push({ row: row.row, account_number: row.account_number || null, billing_period: row.billing_period || null, error: rowErrors.join('; ') })
    else validRows.push(row)
  }
  return { kind: 'billing', total: rows.length, valid_count: validRows.length, invalid_count: errors.length, errors, validRows, can_import: validRows.length > 0 && errors.length === 0 }
}
