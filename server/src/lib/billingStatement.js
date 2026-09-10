// Optional official statement values; never estimate missing charges.
export const statementTextFields = ['bill_number', 'registered_name', 'service_address', 'account_type', 'meter_number', 'meter_size', 'service_period']
export const statementMoneyFields = ['water_charge', 'arrears', 'other_charges', 'meter_maintenance', 'pay_immediately', 'penalty', 'amount_after_due']
export const statementFields = [...statementTextFields, ...statementMoneyFields, 'reading_date']
const text = value => String(value ?? '').trim()

export function statementFromRow(row) {
  const details = {}
  for (const field of statementFields) {
    if (text(row[field]) !== '') details[field] = statementMoneyFields.includes(field) ? Number(row[field]) : text(row[field])
  }
  return Object.keys(details).length ? details : null
}

export function statementForImport(row, existing) {
  // Expanded CSVs replace the snapshot: blank cells mean unavailable.
  if (statementFields.some(field => Object.hasOwn(row, field))) return statementFromRow(row)
  // Legacy status-only reimports retain details unless source values changed.
  const changed = existing && ['amount_due', 'previous_reading', 'current_reading', 'consumption'].some(field => Number(row[field] || 0) !== Number(existing[field]))
  return changed || (existing && row.due_date !== existing.due_date) ? null : existing?.statement_details ?? null
}
