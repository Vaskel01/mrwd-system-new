import { Router } from 'express'
import { requireAuth, requireCapability, requireRole } from '../middleware/auth.js'
import { CAPABILITIES, hasCapability } from '../lib/accessControl.js'
import { fetchShapedComplaintById } from '../lib/shapeComplaint.js'
import { writeAudit } from '../lib/activity.js'

const router = Router()
const CLOSED_STATUSES = new Set(['resolved', 'completed', 'rejected', 'cancelled'])

router.get('/crews', requireAuth, requireRole('admin', 'maintenance_personnel'), (req, res, next) => {
  if (req.user.role === 'admin' && !hasCapability(req.user, CAPABILITIES.ECMD_OPERATIONS)) {
    return res.status(403).json({ error: 'Crew information is restricted to ECMD.' })
  }
  return next()
}, async (req, res) => {
  const { data, error } = await req.supabase
    .from('maintenance_crews')
    .select('id, name, department_id, team_leader_id, default_manpower, is_active')
    .eq('is_active', true)
    .order('name')
  if (error) return res.status(400).json({ error: error.message })
  return res.json({ crews: data || [] })
})

function trimmed(value) {
  return String(value ?? '').trim()
}

function numberValue(value, label, { min = 0, allowZero = true } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || (!allowZero && parsed === 0)) {
    throw new Error(`${label} must be a valid number${allowZero ? '' : ' greater than zero'}.`)
  }
  return parsed
}

async function activeTaskForComplaint(supabase, complaintId) {
  const { data, error } = await supabase
    .from('maintenance_tasks')
    .select('*')
    .eq('complaint_id', complaintId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data
}

async function requireTaskAccess(req, complaintId) {
  const task = await activeTaskForComplaint(req.supabase, complaintId)
  if (!task) throw new Error('No active maintenance task was found for this complaint.')
  if (req.user.role !== 'admin' && task.assigned_staff_id !== req.user.id) {
    const error = new Error('You are not assigned to this maintenance task.')
    error.status = 403
    throw error
  }
  return task
}

function firstFailed(results) {
  return results.find(result => result.error)?.error || null
}

function requireEcmdOrAssignedMaintenance(req, res, next) {
  if (req.user?.role === 'maintenance_personnel' || hasCapability(req.user, CAPABILITIES.ECMD_OPERATIONS)) return next()
  return res.status(403).json({ error: 'Maintenance resources are restricted to ECMD and assigned Maintenance Personnel.' })
}

router.get('/commercial-bootstrap', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  try {
    const [accounts, batches] = await Promise.all([
      req.supabase.from('customer_account_registry').select('*').order('updated_at', { ascending: false }).limit(200),
      req.supabase.from('billing_import_batches').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    const error = firstFailed([accounts, batches])
    if (error) throw error
    res.json({ account_registry: accounts.data || [], billing_batches: batches.data || [], approvals: [], staff: [] })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/ecmd-bootstrap', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    const [departments, crews, members, schedules, inventory, staff] = await Promise.all([
      req.supabase.from('departments').select('*').eq('code', 'ECMD').limit(1),
      req.supabase.from('maintenance_crews').select('*').order('name'),
      req.supabase.from('crew_members').select('*').eq('is_active', true),
      req.supabase.from('staff_schedules').select('*').gte('shift_date', today).lte('shift_date', future).order('shift_date'),
      req.supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
      req.supabase.from('profiles').select('id, full_name, email, phone, role, is_active, department_id, staff_position, supervisor_id, availability_status').eq('role', 'maintenance_personnel').order('full_name'),
    ])
    const error = firstFailed([departments, crews, members, schedules, inventory, staff])
    if (error) throw error
    res.json({
      departments: departments.data || [], crews: crews.data || [], crew_members: members.data || [],
      schedules: schedules.data || [], inventory: inventory.data || [], staff: staff.data || [],
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/system-bootstrap', requireAuth, requireCapability(CAPABILITIES.SYSTEM_DEPARTMENTS), async (req, res) => {
  try {
    const [departments, approvals, archives, deliveries, staff] = await Promise.all([
      req.supabase.from('departments').select('*').order('name'),
      req.supabase.from('approval_requests').select('*').order('created_at', { ascending: false }).limit(50),
      req.supabase.from('archive_records').select('*').order('archived_at', { ascending: false }).limit(50),
      req.supabase.from('notification_deliveries').select('*').order('created_at', { ascending: false }).limit(50),
      req.supabase.from('profiles').select('id, full_name, email, phone, role, is_active, department_id, staff_position, supervisor_id, availability_status').in('role', ['admin', 'maintenance_personnel']).order('full_name'),
    ])
    const error = firstFailed([departments, approvals, archives, deliveries, staff])
    if (error) throw error
    res.json({ departments: departments.data || [], approvals: approvals.data || [], archives: archives.data || [], notification_deliveries: deliveries.data || [], staff: staff.data || [], inventory: [] })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/bootstrap', requireAuth, requireCapability(CAPABILITIES.SYSTEM_DEPARTMENTS), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    const [
      departmentsResult, crewsResult, membersResult, schedulesResult, approvalsResult,
      accountsResult, batchesResult, inventoryResult, archivesResult, deliveriesResult, staffResult,
    ] = await Promise.all([
      req.supabase.from('departments').select('*').order('name'),
      req.supabase.from('maintenance_crews').select('*').order('name'),
      req.supabase.from('crew_members').select('*').eq('is_active', true),
      req.supabase.from('staff_schedules').select('*').gte('shift_date', today).lte('shift_date', future).order('shift_date'),
      req.supabase.from('approval_requests').select('*').order('created_at', { ascending: false }).limit(50),
      req.supabase.from('customer_account_registry').select('*').order('updated_at', { ascending: false }).limit(200),
      req.supabase.from('billing_import_batches').select('*').order('created_at', { ascending: false }).limit(20),
      req.supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
      req.supabase.from('archive_records').select('*').order('archived_at', { ascending: false }).limit(50),
      req.supabase.from('notification_deliveries').select('*').order('created_at', { ascending: false }).limit(50),
      req.supabase.from('profiles').select('id, full_name, email, phone, role, is_active, department_id, staff_position, supervisor_id, availability_status').in('role', ['admin', 'maintenance_personnel']).order('full_name'),
    ])
    const results = [departmentsResult, crewsResult, membersResult, schedulesResult, approvalsResult, accountsResult, batchesResult, inventoryResult, archivesResult, deliveriesResult, staffResult]
    const failed = results.find(result => result.error)
    if (failed?.error) throw failed.error

    res.json({
      departments: departmentsResult.data || [],
      crews: crewsResult.data || [],
      crew_members: membersResult.data || [],
      schedules: schedulesResult.data || [],
      approvals: approvalsResult.data || [],
      account_registry: accountsResult.data || [],
      billing_batches: batchesResult.data || [],
      inventory: inventoryResult.data || [],
      archives: archivesResult.data || [],
      notification_deliveries: deliveriesResult.data || [],
      staff: staffResult.data || [],
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/departments', requireAuth, requireCapability(CAPABILITIES.SYSTEM_DEPARTMENTS), async (req, res) => {
  const code = trimmed(req.body?.code).toUpperCase()
  const name = trimmed(req.body?.name)
  if (!code || !name) return res.status(400).json({ error: 'Department code and name are required.' })
  const { data, error } = await req.supabase.from('departments').upsert({
    code, name, responsibilities: trimmed(req.body?.responsibilities) || null, is_active: req.body?.is_active !== false, updated_at: new Date().toISOString(),
  }, { onConflict: 'code' }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'department.saved', 'department', data.id, { code, name })
  res.status(201).json({ department: data })
})

router.post('/crews', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const name = trimmed(req.body?.name)
  const departmentId = req.body?.department_id
  if (!name || !departmentId) return res.status(400).json({ error: 'Crew name and department are required.' })
  try {
    const manpower = numberValue(req.body?.default_manpower ?? 1, 'Default manpower', { min: 1, allowZero: false })
    const { data, error } = await req.supabase.from('maintenance_crews').insert({
      name,
      department_id: departmentId,
      team_leader_id: req.body?.team_leader_id || null,
      default_manpower: Math.round(manpower),
      contact_note: trimmed(req.body?.contact_note) || null,
      created_by: req.user.id,
    }).select().single()
    if (error) throw error
    if (data.team_leader_id) {
      await req.supabase.from('crew_members').upsert({ crew_id: data.id, staff_id: data.team_leader_id, crew_role: 'team_leader', is_active: true }, { onConflict: 'crew_id,staff_id' })
    }
    await writeAudit(req.supabase, req.user, 'crew.created', 'maintenance_crew', data.id, { name, default_manpower: manpower })
    res.status(201).json({ crew: data })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/crew-members', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const { crew_id, staff_id } = req.body || {}
  if (!crew_id || !staff_id) return res.status(400).json({ error: 'Crew and staff member are required.' })
  try {
    const manpowerUnits = numberValue(req.body?.manpower_units ?? 1, 'Manpower units', { min: 0.01, allowZero: false })
    const { data, error } = await req.supabase.from('crew_members').upsert({
      crew_id, staff_id, crew_role: req.body?.crew_role || 'crew_member', manpower_units: manpowerUnits, is_active: true, left_at: null,
    }, { onConflict: 'crew_id,staff_id' }).select().single()
    if (error) throw error
    await writeAudit(req.supabase, req.user, 'crew.member_saved', 'maintenance_crew', crew_id, { staff_id, role: data.crew_role })
    res.status(201).json({ member: data })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/staff-assignment', requireAuth, requireCapability(CAPABILITIES.SYSTEM_DEPARTMENTS), async (req, res) => {
  const { staff_id, department_id, staff_position, supervisor_id } = req.body || {}
  if (!staff_id) return res.status(400).json({ error: 'Staff member is required.' })
  const position = trimmed(staff_position).toLowerCase()
  const allowedPositions = new Set(['manager', 'supervisor', 'team_leader', 'crew_member', 'commercial_staff', 'department_staff'])
  if (!allowedPositions.has(position)) return res.status(400).json({ error: 'Select a valid access designation.' })
  if (supervisor_id && supervisor_id === staff_id) return res.status(400).json({ error: 'A staff account cannot supervise itself.' })

  const [{ data: staff, error: staffError }, departmentResult] = await Promise.all([
    req.supabase.from('profiles').select('id, role').eq('id', staff_id).single(),
    department_id
      ? req.supabase.from('departments').select('id, code').eq('id', department_id).single()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (staffError) return res.status(400).json({ error: staffError.message })
  if (departmentResult.error) return res.status(400).json({ error: departmentResult.error.message })
  const departmentCode = String(departmentResult.data?.code || '').toUpperCase()

  const isSystemSupervisor = ['manager', 'supervisor'].includes(position)
  const isCommercialStaff = position === 'commercial_staff'
  const isEcmdStaff = position === 'department_staff'
  const isMaintenancePosition = ['team_leader', 'crew_member'].includes(position)
  if (isSystemSupervisor && (staff.role !== 'admin' || department_id)) {
    return res.status(400).json({ error: 'System Supervisors must use a Department Staff account without a department assignment.' })
  }
  if (isCommercialStaff && (staff.role !== 'admin' || departmentCode !== 'COMMERCIAL')) {
    return res.status(400).json({ error: 'Commercial Department Staff must use a Department Staff account assigned to the Commercial Department.' })
  }
  if (isEcmdStaff && (staff.role !== 'admin' || departmentCode !== 'ECMD')) {
    return res.status(400).json({ error: 'ECMD Staff must use a Department Staff account assigned to ECMD.' })
  }
  if (isMaintenancePosition && (staff.role !== 'maintenance_personnel' || departmentCode !== 'ECMD')) {
    return res.status(400).json({ error: 'Team Leaders and Maintenance Crew Members must use a Maintenance Personnel account assigned to ECMD.' })
  }

  const { data, error } = await req.supabase.rpc('admin_update_staff_assignment', {
    p_staff_id: staff_id,
    p_department_id: department_id || null,
    p_staff_position: position,
    p_supervisor_id: supervisor_id || null,
  })
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'staff.operational_assignment_updated', 'profile', staff_id, { department_id, staff_position, supervisor_id })
  res.json({ user: data })
})

router.post('/schedules', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const { staff_id, shift_date, starts_at, ends_at } = req.body || {}
  if (!staff_id || !shift_date || !starts_at || !ends_at) return res.status(400).json({ error: 'Staff, shift date, start, and end time are required.' })
  const { data, error } = await req.supabase.from('staff_schedules').upsert({
    staff_id, shift_date, starts_at, ends_at, shift_status: req.body?.shift_status || 'scheduled', notes: trimmed(req.body?.notes) || null, created_by: req.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'staff_id,shift_date,starts_at' }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'staff.schedule_saved', 'profile', staff_id, { shift_date, starts_at, ends_at })
  res.status(201).json({ schedule: data })
})


router.post('/approvals', requireAuth, requireCapability(CAPABILITIES.SYSTEM_APPROVALS), async (req, res) => {
  const reason = trimmed(req.body?.reason)
  if (!reason) return res.status(400).json({ error: 'Approval reason is required.' })
  const { data, error } = await req.supabase.from('approval_requests').insert({
    request_type: req.body?.request_type || 'other', entity_type: req.body?.entity_type || 'system', entity_id: req.body?.entity_id || null, requested_by: req.user.id, reason,
  }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'approval.requested', data.entity_type, data.entity_id, { request_type: data.request_type, approval_id: data.id })
  res.status(201).json({ approval: data })
})

router.patch('/approvals/:id', requireAuth, requireCapability(CAPABILITIES.SYSTEM_APPROVALS), async (req, res) => {
  const decision = req.body?.decision
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be approved or rejected.' })
  const { data: current, error: currentError } = await req.supabase.from('approval_requests').select('*').eq('id', req.params.id).single()
  if (currentError) return res.status(404).json({ error: 'Approval request not found.' })
  if (current.requested_by === req.user.id) return res.status(400).json({ error: 'A different System Supervisor must review this request.' })
  if (current.status !== 'pending') return res.status(400).json({ error: 'This approval request has already been reviewed.' })
  const { data, error } = await req.supabase.from('approval_requests').update({
    status: decision, reviewed_by: req.user.id, review_notes: trimmed(req.body?.review_notes) || null, reviewed_at: new Date().toISOString(),
  }).eq('id', req.params.id).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, `approval.${decision}`, data.entity_type, data.entity_id, { approval_id: data.id })
  res.json({ approval: data })
})

router.post('/accounts/import', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 2000) : []
  if (!rows.length) return res.status(400).json({ error: 'Provide at least one customer account row.' })
  const valid = rows.map((row, index) => ({
    account_number: trimmed(row.account_number).toUpperCase(),
    registered_name: trimmed(row.registered_name),
    service_address: trimmed(row.service_address) || null,
    barangay: trimmed(row.barangay) || null,
    meter_number: trimmed(row.meter_number) || null,
    is_active: String(row.is_active ?? 'true').toLowerCase() !== 'false',
    updated_at: new Date().toISOString(),
    row: index + 1,
  })).filter(row => row.account_number && row.registered_name)
  if (!valid.length) return res.status(400).json({ error: 'No valid rows contained both account_number and registered_name.' })
  const payload = valid.map(({ row, ...item }) => item)
  const { data, error } = await req.supabase.from('customer_account_registry').upsert(payload, { onConflict: 'account_number' }).select()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'customer_accounts.imported', 'customer_account_registry', null, { received: rows.length, imported: data?.length || 0 })
  res.json({ imported: data?.length || 0, skipped: rows.length - valid.length })
})

router.post('/billing/import', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : []
  const filename = trimmed(req.body?.filename) || 'billing-import.csv'
  if (!rows.length) return res.status(400).json({ error: 'Provide at least one billing row.' })
  const { data: batch, error: batchError } = await req.supabase.from('billing_import_batches').insert({
    filename, row_count: rows.length, imported_by: req.user.id,
  }).select().single()
  if (batchError) return res.status(400).json({ error: batchError.message })

  let imported = 0
  const failures = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    try {
      const accountNumber = trimmed(row.account_number).toUpperCase()
      const billingPeriod = trimmed(row.billing_period)
      if (!accountNumber || !billingPeriod) throw new Error('account_number and billing_period are required')
      const { data: customer, error: customerError } = await req.supabase.from('profiles')
        .select('id').eq('role', 'customer').ilike('account_number', accountNumber).maybeSingle()
      if (customerError) throw customerError
      if (!customer) throw new Error('account number is not linked to a customer profile')
      const bill = {
        customer_id: customer.id,
        account_number: accountNumber,
        billing_period: billingPeriod,
        previous_reading: numberValue(row.previous_reading ?? 0, 'previous_reading'),
        current_reading: numberValue(row.current_reading ?? 0, 'current_reading'),
        consumption: numberValue(row.consumption ?? 0, 'consumption'),
        amount_due: numberValue(row.amount_due, 'amount_due'),
        due_date: row.due_date,
        status: String(row.status || 'unpaid').toLowerCase() === 'paid' ? 'paid' : 'unpaid',
        source_batch_id: batch.id,
        import_row_number: index + 2,
      }
      if (!bill.due_date) throw new Error('due_date is required')
      const { data: existing, error: existingError } = await req.supabase.from('bills').select('id')
        .eq('customer_id', customer.id).eq('billing_period', billingPeriod).maybeSingle()
      if (existingError) throw existingError
      const result = existing
        ? await req.supabase.from('bills').update(bill).eq('id', existing.id)
        : await req.supabase.from('bills').insert(bill)
      if (result.error) throw result.error
      imported += 1
    } catch (error) {
      failures.push({ row: index + 2, account_number: row?.account_number || null, error: error.message })
    }
  }
  const status = failures.length ? (imported ? 'completed_with_errors' : 'failed') : 'completed'
  await req.supabase.from('billing_import_batches').update({
    imported_count: imported, failed_count: failures.length, status, error_summary: failures, completed_at: new Date().toISOString(),
  }).eq('id', batch.id)
  await writeAudit(req.supabase, req.user, 'billing.bulk_imported', 'billing_import_batch', batch.id, { imported, failed: failures.length, filename })
  res.json({ batch_id: batch.id, imported, failed: failures.length, errors: failures })
})

router.post('/inventory', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  try {
    const sku = trimmed(req.body?.sku).toUpperCase()
    const name = trimmed(req.body?.name)
    if (!sku || !name) throw new Error('SKU and item name are required.')
    const quantity = numberValue(req.body?.quantity_on_hand ?? 0, 'Quantity on hand')
    const reorder = numberValue(req.body?.reorder_level ?? 0, 'Reorder level')
    const { data, error } = await req.supabase.from('inventory_items').upsert({
      sku, name, category: trimmed(req.body?.category) || 'material', unit: trimmed(req.body?.unit) || 'piece', quantity_on_hand: quantity, reorder_level: reorder, location: trimmed(req.body?.location) || null, created_by: req.user.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'sku' }).select().single()
    if (error) throw error
    await writeAudit(req.supabase, req.user, 'inventory.item_saved', 'inventory_item', data.id, { sku, quantity })
    res.status(201).json({ item: data })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/inventory/:id/adjust', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  try {
    const delta = numberValue(req.body?.quantity_delta, 'Adjustment quantity', { min: -1000000 })
    if (delta === 0) throw new Error('Adjustment quantity cannot be zero.')
    const reason = trimmed(req.body?.reason)
    if (!reason) throw new Error('Adjustment reason is required.')
    const { data, error } = await req.supabase.rpc('adjust_inventory_stock', {
      p_inventory_item_id: req.params.id,
      p_quantity_delta: delta,
      p_reason: reason,
    })
    if (error) throw error
    await writeAudit(req.supabase, req.user, 'inventory.adjusted', 'inventory_item', data.id, { delta, balance: data.quantity_on_hand, reason })
    res.json({ item: data })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/tasks/:complaintId/manpower', requireAuth, requireRole('admin', 'maintenance_personnel'), requireEcmdOrAssignedMaintenance, async (req, res) => {
  try {
    const task = await requireTaskAccess(req, req.params.complaintId)
    const personnelCount = Math.round(numberValue(req.body?.personnel_count, 'Personnel count', { min: 1, allowZero: false }))
    const hoursWorked = numberValue(req.body?.hours_worked ?? 0, 'Hours worked')
    const { data, error } = await req.supabase.from('task_manpower_records').insert({
      maintenance_task_id: task.id,
      crew_id: req.body?.crew_id || task.assigned_crew_id || null,
      personnel_count: personnelCount,
      hours_worked: hoursWorked,
      work_date: req.body?.work_date || new Date().toISOString().slice(0, 10),
      notes: trimmed(req.body?.notes) || null,
      recorded_by: req.user.id,
    }).select().single()
    if (error) throw error
    await writeAudit(req.supabase, req.user, 'task.manpower_recorded', 'complaint', req.params.complaintId, { personnel_count: personnelCount, hours_worked: hoursWorked })
    res.status(201).json({ manpower: data })
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message })
  }
})

router.post('/tasks/:complaintId/inventory-usage', requireAuth, requireRole('admin', 'maintenance_personnel'), requireEcmdOrAssignedMaintenance, async (req, res) => {
  try {
    const task = await requireTaskAccess(req, req.params.complaintId)
    const quantity = numberValue(req.body?.quantity, 'Quantity', { min: 0.01, allowZero: false })
    const { data, error } = await req.supabase.rpc('record_task_inventory_usage', {
      p_task_id: task.id,
      p_inventory_item_id: req.body?.inventory_item_id,
      p_quantity: quantity,
      p_notes: trimmed(req.body?.notes) || null,
    })
    if (error) throw error
    await writeAudit(req.supabase, req.user, 'task.inventory_used', 'complaint', req.params.complaintId, { inventory_item_id: req.body?.inventory_item_id, quantity })
    res.status(201).json({ usage: data })
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message })
  }
})

router.get('/tasks/:complaintId/resources', requireAuth, requireRole('admin', 'maintenance_personnel'), requireEcmdOrAssignedMaintenance, async (req, res) => {
  try {
    const task = await requireTaskAccess(req, req.params.complaintId)
    const [inventoryResult, usageResult, manpowerResult, crewResult] = await Promise.all([
      req.supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
      req.supabase.from('task_inventory_usage').select('*').eq('maintenance_task_id', task.id).order('recorded_at', { ascending: false }),
      req.supabase.from('task_manpower_records').select('*').eq('maintenance_task_id', task.id).order('work_date', { ascending: false }),
      task.assigned_crew_id ? req.supabase.from('maintenance_crews').select('*').eq('id', task.assigned_crew_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])
    const error = [inventoryResult, usageResult, manpowerResult, crewResult].find(item => item.error)?.error
    if (error) throw error
    res.json({ task, crew: crewResult.data, inventory: inventoryResult.data || [], usage: usageResult.data || [], manpower: manpowerResult.data || [] })
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message })
  }
})

router.post('/archive-requests', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_ARCHIVE_REQUEST), async (req, res) => {
  const complaintId = req.body?.complaint_id
  const reason = trimmed(req.body?.reason)
  if (!complaintId || !reason) return res.status(400).json({ error: 'Complaint and archival reason are required.' })
  const complaint = await fetchShapedComplaintById(req.supabase, complaintId)
  if (!complaint || !CLOSED_STATUSES.has(complaint.status)) return res.status(400).json({ error: 'Only resolved, rejected, or cancelled complaints can be submitted for archival.' })
  const { data, error } = await req.supabase.from('approval_requests').insert({
    request_type: 'archive_complaint', entity_type: 'complaint', entity_id: complaintId, requested_by: req.user.id, reason,
  }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'complaint.archive_requested', 'complaint', complaintId, { approval_id: data.id, reason })
  res.status(201).json({ approval: data })
})

router.post('/archive/:complaintId', requireAuth, requireCapability(CAPABILITIES.SYSTEM_APPROVALS), async (req, res) => {
  const { data, error } = await req.supabase.rpc('archive_complaint_with_approval', {
    p_complaint_id: req.params.complaintId,
    p_approval_request_id: req.body?.approval_id,
  })
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'complaint.archived', 'complaint', req.params.complaintId, { approval_id: req.body?.approval_id })
  res.json({ complaint: data })
})

router.get('/maintenance-report/:complaintId', requireAuth, requireRole('admin', 'maintenance_personnel'), requireEcmdOrAssignedMaintenance, async (req, res) => {
  try {
    const complaint = await fetchShapedComplaintById(req.supabase, req.params.complaintId)
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
    const task = await requireTaskAccess(req, req.params.complaintId)
    const [manpowerResult, usageResult, inventoryResult, crewResult, membersResult] = await Promise.all([
      req.supabase.from('task_manpower_records').select('*').eq('maintenance_task_id', task.id).order('work_date'),
      req.supabase.from('task_inventory_usage').select('*').eq('maintenance_task_id', task.id).order('recorded_at'),
      req.supabase.from('inventory_items').select('id, sku, name, unit'),
      task.assigned_crew_id ? req.supabase.from('maintenance_crews').select('*').eq('id', task.assigned_crew_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      task.assigned_crew_id ? req.supabase.from('crew_members').select('*').eq('crew_id', task.assigned_crew_id).eq('is_active', true) : Promise.resolve({ data: [], error: null }),
    ])
    const error = [manpowerResult, usageResult, inventoryResult, crewResult, membersResult].find(item => item.error)?.error
    if (error) throw error
    const inventoryMap = Object.fromEntries((inventoryResult.data || []).map(item => [item.id, item]))
    const usage = (usageResult.data || []).map(item => ({ ...item, item: inventoryMap[item.inventory_item_id] || null }))
    res.json({
      report_number: `MR-${complaint.reference_number}`,
      generated_at: new Date().toISOString(),
      complaint,
      task,
      crew: crewResult.data,
      crew_members: membersResult.data || [],
      manpower: manpowerResult.data || [],
      inventory_usage: usage,
      prepared_by: { id: req.user.id, name: req.user.full_name, role: req.user.role },
    })
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message })
  }
})

export default router
