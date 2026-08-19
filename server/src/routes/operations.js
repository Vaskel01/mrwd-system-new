import { Router } from 'express'
import { requireAuth, requireCapability, requireRole } from '../middleware/auth.js'
import { CAPABILITIES, hasCapability } from '../lib/accessControl.js'
import { fetchShapedComplaintById } from '../lib/shapeComplaint.js'
import { writeAudit } from '../lib/activity.js'
import { addDaysYmd, manilaDateYmd } from '../lib/date.js'

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

async function loadActiveEcmdMaintenanceStaff(supabase, staffId) {
  if (!staffId) return null
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, role, is_active, staff_position, department:departments(code)')
    .eq('id', staffId).maybeSingle()
  if (error) throw error
  if (!data || data.role !== 'maintenance_personnel' || !data.is_active || String(data.department?.code || '').toUpperCase() !== 'ECMD') {
    throw new Error('Choose an active ECMD Maintenance Personnel account.')
  }
  return data
}

async function requireEcmdDepartment(supabase, departmentId) {
  const { data, error } = await supabase.from('departments').select('id, code, is_active').eq('id', departmentId).maybeSingle()
  if (error) throw error
  if (!data || !data.is_active || String(data.code || '').toUpperCase() !== 'ECMD') throw new Error('Maintenance crews must belong to the active ECMD department.')
  return data
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
    const today = manilaDateYmd()
    const future = addDaysYmd(today, 14)
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
    const today = manilaDateYmd()
    const future = addDaysYmd(today, 14)
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
    await requireEcmdDepartment(req.supabase, departmentId)
    const teamLeaderId = req.body?.team_leader_id || null
    if (teamLeaderId) await loadActiveEcmdMaintenanceStaff(req.supabase, teamLeaderId)
    const manpower = numberValue(req.body?.default_manpower ?? 1, 'Default manpower', { min: 1, allowZero: false })
    const { data, error } = await req.supabase.from('maintenance_crews').insert({
      name,
      department_id: departmentId,
      team_leader_id: teamLeaderId,
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

router.patch('/crews/:id', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() }
    if (req.body?.name !== undefined) {
      patch.name = trimmed(req.body.name)
      if (!patch.name) throw new Error('Crew name is required.')
    }
    if (req.body?.team_leader_id !== undefined) {
      patch.team_leader_id = req.body.team_leader_id || null
      if (patch.team_leader_id) await loadActiveEcmdMaintenanceStaff(req.supabase, patch.team_leader_id)
    }
    if (req.body?.default_manpower !== undefined) patch.default_manpower = Math.round(numberValue(req.body.default_manpower, 'Default manpower', { min: 1, allowZero: false }))
    if (req.body?.contact_note !== undefined) patch.contact_note = trimmed(req.body.contact_note) || null
    if (req.body?.is_active !== undefined) patch.is_active = Boolean(req.body.is_active)
    const { data, error } = await req.supabase.from('maintenance_crews').update(patch).eq('id', req.params.id).select().single()
    if (error) throw error
    if (data.team_leader_id) await req.supabase.from('crew_members').upsert({ crew_id: data.id, staff_id: data.team_leader_id, crew_role: 'team_leader', is_active: true, left_at: null }, { onConflict: 'crew_id,staff_id' })
    await writeAudit(req.supabase, req.user, 'crew.updated', 'maintenance_crew', data.id, patch)
    res.json({ crew: data })
  } catch (error) { res.status(400).json({ error: error.message }) }
})

router.post('/crew-members', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const { crew_id, staff_id } = req.body || {}
  if (!crew_id || !staff_id) return res.status(400).json({ error: 'Crew and staff member are required.' })
  try {
    const { data: crew, error: crewError } = await req.supabase.from('maintenance_crews').select('id, department_id, is_active').eq('id', crew_id).maybeSingle()
    if (crewError) throw crewError
    if (!crew?.is_active) throw new Error('Choose an active maintenance crew.')
    await requireEcmdDepartment(req.supabase, crew.department_id)
    await loadActiveEcmdMaintenanceStaff(req.supabase, staff_id)
    const role = trimmed(req.body?.crew_role || 'crew_member')
    if (!['team_leader', 'crew_member'].includes(role)) throw new Error('Crew role must be Team Leader or Maintenance Crew Member.')
    const manpowerUnits = numberValue(req.body?.manpower_units ?? 1, 'Manpower units', { min: 0.01, allowZero: false })
    const { data, error } = await req.supabase.from('crew_members').upsert({
      crew_id, staff_id, crew_role: role, manpower_units: manpowerUnits, is_active: true, left_at: null,
    }, { onConflict: 'crew_id,staff_id' }).select().single()
    if (error) throw error
    await writeAudit(req.supabase, req.user, 'crew.member_saved', 'maintenance_crew', crew_id, { staff_id, role: data.crew_role })
    res.status(201).json({ member: data })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.patch('/crew-members/:id', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  try {
    const patch = {}
    if (req.body?.crew_role !== undefined) {
      patch.crew_role = trimmed(req.body.crew_role) || 'crew_member'
      if (!['team_leader', 'crew_member'].includes(patch.crew_role)) throw new Error('Crew role must be Team Leader or Maintenance Crew Member.')
    }
    if (req.body?.manpower_units !== undefined) patch.manpower_units = numberValue(req.body.manpower_units, 'Manpower units', { min: 0.01, allowZero: false })
    if (req.body?.is_active !== undefined) {
      patch.is_active = Boolean(req.body.is_active)
      patch.left_at = patch.is_active ? null : new Date().toISOString()
    }
    const { data, error } = await req.supabase.from('crew_members').update(patch).eq('id', req.params.id).select().single()
    if (error) throw error
    await writeAudit(req.supabase, req.user, patch.is_active === false ? 'crew.member_removed' : 'crew.member_updated', 'maintenance_crew', data.crew_id, { staff_id: data.staff_id, crew_role: data.crew_role })
    res.json({ member: data })
  } catch (error) { res.status(400).json({ error: error.message }) }
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
    return res.status(400).json({ error: 'System Supervisors must use a staff account without a department assignment.' })
  }
  if (isCommercialStaff && (staff.role !== 'admin' || departmentCode !== 'COMMERCIAL')) {
    return res.status(400).json({ error: 'Commercial Services Staff must use a staff account assigned to the Commercial Services Department.' })
  }
  if (isEcmdStaff && (staff.role !== 'admin' || departmentCode !== 'ECMD')) {
    return res.status(400).json({ error: 'ECMD Staff must use a staff account assigned to ECMD.' })
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

async function linkedCustomerAccounts(supabase, accountNumbers = []) {
  const unique = [...new Set(accountNumbers.filter(Boolean))]
  const linked = new Set()
  for (let index = 0; index < unique.length; index += 250) {
    const chunk = unique.slice(index, index + 250)
    const { data, error } = await supabase.from('profiles').select('account_number').eq('role', 'customer').in('account_number', chunk)
    if (error) throw error
    for (const row of data || []) linked.add(String(row.account_number || '').toUpperCase())
  }
  return linked
}

async function validateAccountImportRows(supabase, inputRows) {
  const rows = inputRows.slice(0, 2000)
  const normalized = rows.map((row, index) => ({
    row: index + 2,
    account_number: trimmed(row.account_number).toUpperCase(),
    registered_name: trimmed(row.registered_name),
    service_address: trimmed(row.service_address),
    barangay: trimmed(row.barangay),
    meter_number: trimmed(row.meter_number),
    is_active: String(row.is_active ?? 'true').toLowerCase() !== 'false',
  }))
  const occurrences = new Map()
  for (const row of normalized) if (row.account_number) occurrences.set(row.account_number, (occurrences.get(row.account_number) || 0) + 1)
  const existing = await existingAccountRegistry(supabase, normalized.map(row => row.account_number))
  const errors = []
  const validRows = []
  for (const row of normalized) {
    const rowErrors = []
    if (!row.account_number) rowErrors.push('account_number is required')
    if (!row.registered_name) rowErrors.push('registered_name is required')
    if (row.account_number && occurrences.get(row.account_number) > 1) rowErrors.push('duplicate account_number in this file')
    if (rowErrors.length) errors.push({ row: row.row, account_number: row.account_number || null, error: rowErrors.join('; ') })
    else validRows.push(row)
  }
  const newCount = validRows.filter(row => !existing.has(row.account_number)).length
  return {
    kind: 'accounts', total: rows.length, valid_count: validRows.length, invalid_count: errors.length,
    new_count: newCount, update_count: validRows.length - newCount, errors, validRows,
    can_import: validRows.length > 0 && errors.length === 0,
  }
}

async function validateBillingImportRows(supabase, inputRows) {
  const rows = inputRows.slice(0, 5000)
  const normalized = rows.map((row, index) => ({ ...row, row: index + 2, account_number: trimmed(row.account_number).toUpperCase(), billing_period: trimmed(row.billing_period) }))
  const keys = new Map()
  for (const row of normalized) {
    const key = `${row.account_number}|${row.billing_period}`
    if (row.account_number && row.billing_period) keys.set(key, (keys.get(key) || 0) + 1)
  }
  const linked = await linkedCustomerAccounts(supabase, normalized.map(row => row.account_number))
  const errors = []
  const validRows = []
  for (const row of normalized) {
    const rowErrors = []
    const key = `${row.account_number}|${row.billing_period}`
    if (!row.account_number) rowErrors.push('account_number is required')
    if (!row.billing_period) rowErrors.push('billing_period is required')
    if (row.account_number && !linked.has(row.account_number)) rowErrors.push('account number is not linked to a customer profile')
    if (row.account_number && row.billing_period && keys.get(key) > 1) rowErrors.push('duplicate account_number + billing_period in this file')
    for (const field of ['previous_reading','current_reading','consumption','amount_due']) {
      const value = row[field]
      if (field === 'amount_due' && trimmed(value) === '') rowErrors.push('amount_due is required')
      else if (trimmed(value) !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) rowErrors.push(`${field} must be a non-negative number`)
    }
    if (!trimmed(row.due_date)) rowErrors.push('due_date is required')
    else if (Number.isNaN(new Date(`${trimmed(row.due_date)}T00:00:00`).getTime())) rowErrors.push('due_date is invalid')
    const status = String(row.status || 'unpaid').toLowerCase()
    if (!['paid','unpaid'].includes(status)) rowErrors.push('status must be paid or unpaid')
    if (rowErrors.length) errors.push({ row: row.row, account_number: row.account_number || null, billing_period: row.billing_period || null, error: rowErrors.join('; ') })
    else validRows.push(row)
  }
  return { kind: 'billing', total: rows.length, valid_count: validRows.length, invalid_count: errors.length, errors, validRows, can_import: validRows.length > 0 && errors.length === 0 }
}

router.post('/accounts/validate-import', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ error: 'Provide at least one customer account row.' })
  try {
    const { validRows, ...result } = await validateAccountImportRows(req.supabase, rows)
    res.json(result)
  } catch (error) { res.status(400).json({ error: error.message }) }
})

router.post('/billing/validate-import', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ error: 'Provide at least one billing row.' })
  try {
    const { validRows, ...result } = await validateBillingImportRows(req.supabase, rows)
    res.json(result)
  } catch (error) { res.status(400).json({ error: error.message }) }
})

router.post('/accounts/import', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ error: 'Provide at least one customer account row.' })
  try {
    const validation = await validateAccountImportRows(req.supabase, rows)
    if (!validation.can_import) return res.status(400).json({ error: 'Import blocked because the file did not pass validation.', validation: { ...validation, validRows: undefined } })
    const payload = validation.validRows.map(({ row, ...item }) => ({ ...item, service_address: item.service_address || null, barangay: item.barangay || null, meter_number: item.meter_number || null, updated_at: new Date().toISOString() }))
    const { data, error } = await req.supabase.from('customer_account_registry').upsert(payload, { onConflict: 'account_number' }).select()
    if (error) throw error
    await writeAudit(req.supabase, req.user, 'customer_accounts.imported', 'customer_account_registry', null, { received: rows.length, imported: data?.length || 0, validation_passed: true })
    res.json({ imported: data?.length || 0, skipped: 0 })
  } catch (error) { res.status(400).json({ error: error.message }) }
})

router.post('/billing/import', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  const filename = trimmed(req.body?.filename) || 'billing-import.csv'
  if (!rows.length) return res.status(400).json({ error: 'Provide at least one billing row.' })
  try {
    const validation = await validateBillingImportRows(req.supabase, rows)
    if (!validation.can_import) return res.status(400).json({ error: 'Import blocked because the file did not pass validation.', validation: { ...validation, validRows: undefined } })

    const { data: batch, error: batchError } = await req.supabase.from('billing_import_batches').insert({
      filename, row_count: validation.validRows.length, imported_by: req.user.id,
    }).select().single()
    if (batchError) throw batchError

    let imported = 0
    const failures = []
    for (const row of validation.validRows) {
      try {
        const { data: customer, error: customerError } = await req.supabase.from('profiles')
          .select('id').eq('role', 'customer').ilike('account_number', row.account_number).maybeSingle()
        if (customerError) throw customerError
        if (!customer) throw new Error('account number is not linked to a customer profile')
        const bill = {
          customer_id: customer.id,
          account_number: row.account_number,
          billing_period: row.billing_period,
          previous_reading: numberValue(row.previous_reading ?? 0, 'previous_reading'),
          current_reading: numberValue(row.current_reading ?? 0, 'current_reading'),
          consumption: numberValue(row.consumption ?? 0, 'consumption'),
          amount_due: numberValue(row.amount_due, 'amount_due'),
          due_date: row.due_date,
          status: String(row.status || 'unpaid').toLowerCase(),
          source_batch_id: batch.id,
          import_row_number: row.row,
        }
        const { data: existing, error: existingError } = await req.supabase.from('bills').select('id')
          .eq('customer_id', customer.id).eq('billing_period', row.billing_period).maybeSingle()
        if (existingError) throw existingError
        const result = existing ? await req.supabase.from('bills').update(bill).eq('id', existing.id) : await req.supabase.from('bills').insert(bill)
        if (result.error) throw result.error
        imported += 1
      } catch (error) {
        failures.push({ row: row.row, account_number: row.account_number || null, error: error.message })
      }
    }
    const status = failures.length ? (imported ? 'completed_with_errors' : 'failed') : 'completed'
    await req.supabase.from('billing_import_batches').update({
      imported_count: imported, failed_count: failures.length, status, error_summary: failures, completed_at: new Date().toISOString(),
    }).eq('id', batch.id)
    await writeAudit(req.supabase, req.user, 'billing.bulk_imported', 'billing_import_batch', batch.id, { imported, failed: failures.length, filename, validation_passed: true })
    res.json({ batch_id: batch.id, imported, failed: failures.length, errors: failures })
  } catch (error) { res.status(400).json({ error: error.message }) }
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
      work_date: req.body?.work_date || manilaDateYmd(),
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
