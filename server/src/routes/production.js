import { Router } from 'express'
import { requireAuth, requireCapability, requireRole } from '../middleware/auth.js'
import { CAPABILITIES, departmentCodeFor, hasCapability, isSystemSupervisor } from '../lib/accessControl.js'
import { writeAudit, notifyUsers, getDepartmentAdminIds } from '../lib/activity.js'
import { writeComplaintEvent } from '../lib/complaintEvents.js'
import { fetchShapedComplaintById, fetchShapedComplaints } from '../lib/shapeComplaint.js'
import { supabaseAdminClient } from '../supabaseClient.js'
import { addDaysYmd, manilaDateYmd } from '../lib/date.js'

const router = Router()
const CLOSED = new Set(['resolved', 'completed', 'rejected', 'cancelled', 'merged'])

function text(value) { return String(value ?? '').trim() }
function uniqueIds(value) { return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))] }
function canOperate(user) {
  return hasCapability(user, CAPABILITIES.COMMERCIAL_COMPLAINTS)
    || hasCapability(user, CAPABILITIES.ECMD_DISPATCH)
    || hasCapability(user, CAPABILITIES.ECMD_OPERATIONS)
}
function requireOperational(req, res, next) {
  if (!canOperate(req.user)) return res.status(403).json({ error: 'Commercial Services or ECMD access is required.' })
  next()
}
function allowedReportTypesFor(user) {
  if (isSystemSupervisor(user) && hasCapability(user, CAPABILITIES.SYSTEM_AUDIT)) return new Set(['audit_summary'])
  if (hasCapability(user, CAPABILITIES.COMMERCIAL_REPORTS)) return new Set(['complaint_summary', 'complaint_export', 'customer_satisfaction'])
  if (hasCapability(user, CAPABILITIES.ECMD_REPORTS)) return new Set(['maintenance_workload'])
  return new Set()
}

function canScheduleReportType(user, reportType) {
  return allowedReportTypesFor(user).has(reportType)
}

function nextRun(cadence, from = new Date()) {
  const next = new Date(from)
  if (cadence === 'weekly') next.setDate(next.getDate() + 7)
  else next.setMonth(next.getMonth() + 1)
  // Store the next run for 08:00 Asia/Manila (00:00 UTC).
  next.setUTCHours(0, 0, 0, 0)
  return next.toISOString()
}

// ---------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------
router.get('/saved-views', requireAuth, async (req, res) => {
  let query = req.supabase.from('saved_views').select('*').eq('user_id', req.user.id).order('updated_at', { ascending: false })
  if (req.query.module) query = query.eq('module_key', req.query.module)
  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  res.json({ views: data || [] })
})

router.post('/saved-views', requireAuth, async (req, res) => {
  const name = text(req.body?.name)
  const moduleKey = text(req.body?.module_key)
  const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {}
  if (name.length < 2 || !moduleKey) return res.status(400).json({ error: 'View name and module are required.' })
  if (req.body?.is_default) {
    await req.supabase.from('saved_views').update({ is_default: false }).eq('user_id', req.user.id).eq('module_key', moduleKey)
  }
  const { data, error } = await req.supabase.from('saved_views').insert({
    user_id: req.user.id, module_key: moduleKey, name, filters, is_default: Boolean(req.body?.is_default),
  }).select().single()
  if (error) return res.status(400).json({ error: error.code === '23505' ? 'A saved view with that name already exists.' : error.message })
  await writeAudit(req.supabase, req.user, 'saved_view.created', 'saved_view', data.id, { module_key: moduleKey, name })
  res.status(201).json({ view: data })
})

router.patch('/saved-views/:id', requireAuth, async (req, res) => {
  const patch = { updated_at: new Date().toISOString() }
  if (req.body?.name !== undefined) patch.name = text(req.body.name)
  if (req.body?.filters !== undefined) patch.filters = req.body.filters || {}
  if (req.body?.is_default !== undefined) patch.is_default = Boolean(req.body.is_default)
  const { data: current } = await req.supabase.from('saved_views').select('module_key').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle()
  if (!current) return res.status(404).json({ error: 'Saved view not found.' })
  if (patch.is_default) await req.supabase.from('saved_views').update({ is_default: false }).eq('user_id', req.user.id).eq('module_key', current.module_key)
  const { data, error } = await req.supabase.from('saved_views').update(patch).eq('id', req.params.id).eq('user_id', req.user.id).select().single()
  if (error) return res.status(400).json({ error: error.message })
  res.json({ view: data })
})

router.delete('/saved-views/:id', requireAuth, async (req, res) => {
  const { error } = await req.supabase.from('saved_views').delete().eq('id', req.params.id).eq('user_id', req.user.id)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Watch list + recently viewed
// ---------------------------------------------------------------------------
router.get('/watched-complaints', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('complaint_watches').select('complaint_id, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  const ids = (data || []).map(row => row.complaint_id)
  if (!ids.length) return res.json({ complaints: [] })
  const complaints = await fetchShapedComplaints(req.supabase)
  res.json({ complaints: complaints.filter(item => ids.includes(item.id)).map(item => ({ ...item, watched_at: data.find(row => row.complaint_id === item.id)?.created_at })) })
})

router.put('/complaints/:id/watch', requireAuth, async (req, res) => {
  const complaint = await fetchShapedComplaintById(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
  const { error } = await req.supabase.from('complaint_watches').upsert({ user_id: req.user.id, complaint_id: req.params.id })
  if (error) return res.status(400).json({ error: error.message })
  res.json({ watched: true })
})

router.delete('/complaints/:id/watch', requireAuth, async (req, res) => {
  const { error } = await req.supabase.from('complaint_watches').delete().eq('user_id', req.user.id).eq('complaint_id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ watched: false })
})

router.post('/complaints/:id/recent', requireAuth, async (req, res) => {
  const complaint = await fetchShapedComplaintById(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
  const { error } = await req.supabase.from('recent_complaints').upsert({ user_id: req.user.id, complaint_id: req.params.id, viewed_at: new Date().toISOString() })
  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true })
})

router.get('/recent-complaints', requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20)
  const { data, error } = await req.supabase.from('recent_complaints').select('complaint_id, viewed_at').eq('user_id', req.user.id).order('viewed_at', { ascending: false }).limit(limit)
  if (error) return res.status(400).json({ error: error.message })
  const rows = data || []
  if (!rows.length) return res.json({ complaints: [] })
  const complaints = await fetchShapedComplaints(req.supabase)
  const map = new Map(complaints.map(item => [item.id, item]))
  res.json({ complaints: rows.map(row => map.get(row.complaint_id) ? { ...map.get(row.complaint_id), viewed_at: row.viewed_at } : null).filter(Boolean) })
})

// ---------------------------------------------------------------------------
// Global complaint search across the user's RLS-visible records
// ---------------------------------------------------------------------------
router.get('/search', requireAuth, async (req, res) => {
  const q = text(req.query.q).toLowerCase()
  if (q.length < 2) return res.json({ complaints: [], staff: [] })
  const complaints = await fetchShapedComplaints(req.supabase)
  const complaintResults = complaints.filter(item => [
    item.reference_number, item.complaint_type, item.customer_name, item.account_number,
    item.address, item.zone, item.status, item.priority, item.assigned_name,
  ].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0, 15)

  let staff = []
  if (isSystemSupervisor(req.user) || hasCapability(req.user, CAPABILITIES.ECMD_DISPATCH)) {
    let query = req.supabase.from('profiles').select('id, full_name, email, role, staff_position, department:departments(code, name)').neq('role', 'customer').limit(20)
    const { data } = await query
    staff = (data || []).filter(person => `${person.full_name} ${person.email} ${person.staff_position || ''}`.toLowerCase().includes(q)).slice(0, 8)
  }
  res.json({ complaints: complaintResults, staff })
})

// ---------------------------------------------------------------------------
// Complaint merge / assignment history / follow-up requests
// ---------------------------------------------------------------------------
router.post('/complaints/:id/merge', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_COMPLAINTS), async (req, res) => {
  const primaryId = text(req.body?.primary_complaint_id)
  const reason = text(req.body?.reason)
  const mergedId = req.params.id
  if (!primaryId || primaryId === mergedId) return res.status(400).json({ error: 'Choose a different primary complaint.' })
  if (reason.length < 3) return res.status(400).json({ error: 'Merge reason must contain at least 3 characters.' })

  const [merged, primary] = await Promise.all([
    fetchShapedComplaintById(req.supabase, mergedId),
    fetchShapedComplaintById(req.supabase, primaryId),
  ])
  if (!merged || !primary) return res.status(404).json({ error: 'One of the complaints could not be found.' })
  if (CLOSED.has(primary.status) || primary.status === 'merged') return res.status(400).json({ error: 'The primary complaint must remain active.' })
  if (merged.status === 'merged') return res.status(400).json({ error: 'This complaint has already been merged.' })
  if (!['pending', 'forwarded'].includes(merged.status)) {
    return res.status(400).json({ error: 'Only complaints that have not started field work can be merged.' })
  }

  const { data: activeTask, error: activeTaskError } = await req.supabase.from('maintenance_tasks')
    .select('id').eq('complaint_id', mergedId).eq('is_active', true).limit(1).maybeSingle()
  if (activeTaskError) return res.status(400).json({ error: activeTaskError.message })
  if (activeTask) return res.status(400).json({ error: 'This complaint already has an active maintenance assignment and cannot be merged.' })

  const now = new Date().toISOString()
  const { error } = await req.supabase.from('complaints').update({
    status: 'merged', merged_into_id: primaryId, merged_at: now, merged_by: req.user.id, merge_reason: reason, updated_at: now,
  }).eq('id', mergedId)
  if (error) return res.status(400).json({ error: error.message })
  const { data: record, error: recordError } = await req.supabase.from('complaint_merge_records').insert({
    primary_complaint_id: primaryId, merged_complaint_id: mergedId, merged_by: req.user.id, reason,
  }).select().single()
  if (recordError) return res.status(400).json({ error: recordError.message })
  await writeComplaintEvent(req.supabase, req.user, mergedId, { eventType: 'merged', title: 'Complaint merged', message: `Merged into ${primary.reference_number}. ${reason}`, customerVisible: true, metadata: { primary_complaint_id: primaryId } })
  await writeComplaintEvent(req.supabase, req.user, primaryId, { eventType: 'merge_received', title: 'Duplicate complaint consolidated', message: `${merged.reference_number} was merged into this complaint.`, customerVisible: false, metadata: { merged_complaint_id: mergedId } })
  await notifyUsers(req.supabase, req.user, [merged.customer_id || merged.resident_id], { title: 'Complaint consolidated', message: `Your report was linked to ${primary.reference_number} so MRWD can manage the same issue as one active complaint.`, type: 'status', complaintId: mergedId })
  await writeAudit(req.supabase, req.user, 'complaint.merged', 'complaint', mergedId, { primary_complaint_id: primaryId, reason })
  res.json({ merge: record })
})

router.get('/complaints/:id/assignment-history', requireAuth, requireOperational, async (req, res) => {
  const { data, error } = await req.supabase.from('maintenance_tasks')
    .select('id, complaint_id, assigned_staff_id, assigned_by, assigned_crew_id, status, notes, created_at, completed_at, superseded_at, assignee:profiles!maintenance_tasks_assigned_staff_id_fkey(id, full_name), assigner:profiles!maintenance_tasks_assigned_by_fkey(id, full_name), crew:maintenance_crews(id, name)')
    .eq('complaint_id', req.params.id).order('created_at', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  res.json({ assignments: data || [] })
})

router.get('/complaints/:id/follow-ups', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('complaint_followup_requests')
    .select('*, requester:profiles!complaint_followup_requests_requested_by_fkey(id, full_name), responder:profiles!complaint_followup_requests_responded_by_fkey(id, full_name)')
    .eq('complaint_id', req.params.id).order('requested_at', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  res.json({ follow_ups: data || [] })
})

router.post('/complaints/:id/follow-ups', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_COMPLAINTS), async (req, res) => {
  const prompt = text(req.body?.prompt)
  if (prompt.length < 3) return res.status(400).json({ error: 'Enter the information you need from the customer.' })
  const { data: complaint, error: complaintError } = await req.supabase.from('complaints').select('id, resident_id, reference_number, status, archived_at').eq('id', req.params.id).maybeSingle()
  if (complaintError) return res.status(400).json({ error: complaintError.message })
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
  if (complaint.archived_at || ['resolved', 'completed', 'rejected', 'cancelled', 'merged'].includes(complaint.status)) {
    return res.status(400).json({ error: 'Additional information can only be requested while a complaint is active.' })
  }
  const { data: openRequest, error: openError } = await req.supabase.from('complaint_followup_requests')
    .select('id').eq('complaint_id', req.params.id).eq('status', 'open').limit(1).maybeSingle()
  if (openError) return res.status(400).json({ error: openError.message })
  if (openRequest) return res.status(409).json({ error: 'This complaint already has an open information request. Wait for the customer response before sending another.' })
  const { data, error } = await req.supabase.from('complaint_followup_requests').insert({ complaint_id: req.params.id, requested_by: req.user.id, prompt }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await notifyUsers(req.supabase, req.user, [complaint.resident_id], { title: 'MRWD needs more information', message: prompt, type: 'info', complaintId: complaint.id })
  await writeComplaintEvent(req.supabase, req.user, complaint.id, { eventType: 'information_requested', title: 'Additional information requested', message: prompt, customerVisible: true })
  await writeAudit(req.supabase, req.user, 'complaint.followup_requested', 'complaint', complaint.id, { followup_id: data.id })
  res.status(201).json({ follow_up: data })
})

router.post('/follow-ups/:id/respond', requireAuth, requireRole('customer'), async (req, res) => {
  const responseText = text(req.body?.response_text)
  if (responseText.length < 2) return res.status(400).json({ error: 'Enter your response.' })
  const { data: item, error: readError } = await req.supabase.from('complaint_followup_requests').select('*, complaint:complaints(id, resident_id, reference_number)').eq('id', req.params.id).maybeSingle()
  if (readError || !item) return res.status(404).json({ error: 'Information request not found.' })
  if (item.complaint?.resident_id !== req.user.id) return res.status(403).json({ error: 'This request belongs to another customer.' })
  if (item.status !== 'open') return res.status(400).json({ error: 'This information request is no longer open.' })
  const { data, error } = await req.supabase.from('complaint_followup_requests').update({ status: 'responded', response_text: responseText, responded_at: new Date().toISOString(), responded_by: req.user.id }).eq('id', req.params.id).select().single()
  if (error) return res.status(400).json({ error: error.message })
  const commercial = await getDepartmentAdminIds(req.supabase, 'COMMERCIAL')
  await notifyUsers(req.supabase, req.user, commercial, { title: 'Customer supplied requested information', message: `${item.complaint.reference_number}: ${responseText}`, type: 'info', complaintId: item.complaint.id })
  await writeComplaintEvent(req.supabase, req.user, item.complaint.id, { eventType: 'information_received', title: 'Customer supplied additional information', message: responseText, customerVisible: true })
  res.json({ follow_up: data })
})

// Multi-action bulk workflow. Assignment continues to use /complaints/bulk-assign.
router.post('/complaints/bulk-action', requireAuth, requireOperational, async (req, res) => {
  const ids = uniqueIds(req.body?.complaint_ids)
  const action = text(req.body?.action)
  if (!ids.length) return res.status(400).json({ error: 'Select at least one complaint.' })
  const results = []

  for (const id of ids) {
    try {
      if (action === 'forward_to_ecmd') {
        if (!hasCapability(req.user, CAPABILITIES.COMMERCIAL_COMPLAINTS)) throw new Error('Commercial Services access required')
        const handoff = text(req.body?.handoff_note)
        const now = new Date().toISOString()
        const { data: forwarded, error } = await req.supabase.from('complaints').update({ status: 'forwarded', forwarded_to_ecmd_at: now, forwarded_to_ecmd_by: req.user.id, commercial_handoff_note: handoff || null, updated_at: now }).eq('id', id).eq('status', 'pending').select('id').maybeSingle()
        if (error) throw error
        if (!forwarded) throw new Error('Complaint is no longer pending and was not forwarded')
        await writeComplaintEvent(req.supabase, req.user, id, { eventType: 'forwarded_to_ecmd', title: 'Forwarded to ECMD', message: handoff || 'Commercial review completed.', customerVisible: true })
      } else if (action === 'priority') {
        if (!(hasCapability(req.user, CAPABILITIES.COMMERCIAL_COMPLAINTS) || hasCapability(req.user, CAPABILITIES.ECMD_OPERATIONS))) throw new Error('Priority update access required')
        const priority = text(req.body?.priority)
        const reason = text(req.body?.reason)
        if (!['low','medium','high'].includes(priority) || reason.length < 3) throw new Error('Choose a priority and provide a reason')
        const score = priority === 'high' ? 80 : priority === 'medium' ? 50 : 20
        const { error } = await req.supabase.from('complaints').update({ priority, priority_score: score, priority_override_reason: reason, priority_overridden_by: req.user.id, priority_overridden_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
        await writeComplaintEvent(req.supabase, req.user, id, { eventType: 'priority_changed', title: `Priority changed to ${priority}`, message: reason, customerVisible: false })
      } else if (action === 'watch') {
        const { error } = await req.supabase.from('complaint_watches').upsert({ user_id: req.user.id, complaint_id: id })
        if (error) throw error
      } else if (action === 'request_archive') {
        if (!hasCapability(req.user, CAPABILITIES.COMMERCIAL_ARCHIVE_REQUEST)) throw new Error('Commercial Services archive-request access required')
        const reason = text(req.body?.reason)
        if (reason.length < 3) throw new Error('Archive reason is required')
        const { data: complaint, error: complaintError } = await req.supabase.from('complaints').select('id, status, archived_at').eq('id', id).maybeSingle()
        if (complaintError) throw complaintError
        if (!complaint || !CLOSED.has(complaint.status) || complaint.status === 'merged') throw new Error('Only resolved, completed, rejected, or cancelled complaints can be requested for archival')
        if (complaint.archived_at) throw new Error('Complaint is already archived')
        const { data: existingRequest, error: requestError } = await req.supabase.from('approval_requests').select('id').eq('request_type', 'archive_complaint').eq('entity_id', id).eq('status', 'pending').limit(1).maybeSingle()
        if (requestError) throw requestError
        if (existingRequest) throw new Error('An archive request is already pending for this complaint')
        const { error } = await req.supabase.from('approval_requests').insert({ request_type: 'archive_complaint', entity_type: 'complaint', entity_id: id, requested_by: req.user.id, reason })
        if (error) throw error
      } else throw new Error('Unsupported bulk action')
      results.push({ id, ok: true })
    } catch (error) { results.push({ id, ok: false, error: error.message }) }
  }
  await writeAudit(req.supabase, req.user, `complaint.bulk_${action}`, 'complaint', null, { complaint_ids: ids, action })
  res.status(207).json({ results })
})

// ---------------------------------------------------------------------------
// Crew directory, substitutions, availability calendar, note templates
// ---------------------------------------------------------------------------
router.get('/crew-directory', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const [crews, members, substitutions] = await Promise.all([
    req.supabase.from('maintenance_crews').select('*, leader:profiles!maintenance_crews_team_leader_id_fkey(id, full_name, availability_status)').order('name'),
    req.supabase.from('crew_members').select('*, staff:profiles(id, full_name, email, availability_status, staff_position)').eq('is_active', true),
    req.supabase.from('crew_substitutions').select('*, replaced:profiles!crew_substitutions_replaced_staff_id_fkey(id, full_name), substitute:profiles!crew_substitutions_substitute_staff_id_fkey(id, full_name)').eq('is_active', true).order('starts_on', { ascending: false }),
  ])
  const error = crews.error || members.error || substitutions.error
  if (error) return res.status(400).json({ error: error.message })
  res.json({ crews: (crews.data || []).map(crew => ({ ...crew, members: (members.data || []).filter(m => m.crew_id === crew.id), substitutions: (substitutions.data || []).filter(s => s.crew_id === crew.id) })) })
})

router.post('/crew-substitutions', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const payload = {
    crew_id: req.body?.crew_id,
    replaced_staff_id: req.body?.replaced_staff_id,
    substitute_staff_id: req.body?.substitute_staff_id,
    starts_on: req.body?.starts_on || manilaDateYmd(),
    ends_on: req.body?.ends_on || null,
    reason: text(req.body?.reason),
    created_by: req.user.id,
  }
  if (!payload.crew_id || !payload.replaced_staff_id || !payload.substitute_staff_id || payload.reason.length < 3) return res.status(400).json({ error: 'Crew, both Maintenance Personnel accounts, and a reason are required.' })
  if (payload.replaced_staff_id === payload.substitute_staff_id) return res.status(400).json({ error: 'The substitute must be a different Maintenance Personnel account.' })

  const [crewResult, memberResult, substituteResult, overlapResult] = await Promise.all([
    req.supabase.from('maintenance_crews').select('id, is_active').eq('id', payload.crew_id).maybeSingle(),
    req.supabase.from('crew_members').select('id').eq('crew_id', payload.crew_id).eq('staff_id', payload.replaced_staff_id).eq('is_active', true).limit(1).maybeSingle(),
    req.supabase.from('profiles').select('id, role, is_active, department:departments(code)').eq('id', payload.substitute_staff_id).maybeSingle(),
    req.supabase.from('crew_substitutions').select('id').eq('crew_id', payload.crew_id).eq('replaced_staff_id', payload.replaced_staff_id).eq('is_active', true).limit(1).maybeSingle(),
  ])
  const readError = crewResult.error || memberResult.error || substituteResult.error || overlapResult.error
  if (readError) return res.status(400).json({ error: readError.message })
  if (!crewResult.data?.is_active) return res.status(400).json({ error: 'Choose an active maintenance crew.' })
  if (!memberResult.data) return res.status(400).json({ error: 'The Maintenance Personnel account being replaced is not an active member of this crew.' })
  if (!substituteResult.data || substituteResult.data.role !== 'maintenance_personnel' || !substituteResult.data.is_active || String(substituteResult.data.department?.code || '').toUpperCase() !== 'ECMD') {
    return res.status(400).json({ error: 'The substitute must be an active ECMD Maintenance Personnel account.' })
  }
  if (overlapResult.data) return res.status(409).json({ error: 'This crew member already has an active substitution.' })
  if (payload.ends_on && payload.ends_on < payload.starts_on) return res.status(400).json({ error: 'Substitution end date cannot be earlier than the start date.' })

  const { data, error } = await req.supabase.from('crew_substitutions').insert(payload).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'crew.substitution_started', 'maintenance_crew', payload.crew_id, payload)
  res.status(201).json({ substitution: data })
})

router.patch('/crew-substitutions/:id/end', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const { data, error } = await req.supabase.from('crew_substitutions').update({ is_active: false, ended_at: new Date().toISOString(), ends_on: req.body?.ends_on || manilaDateYmd() }).eq('id', req.params.id).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'crew.substitution_ended', 'maintenance_crew', data.crew_id, { substitution_id: data.id })
  res.json({ substitution: data })
})

router.get('/availability-calendar', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const from = req.query.from || manilaDateYmd()
  const to = addDaysYmd(from, Math.min(Math.max(Number(req.query.days) || 14, 1), 60) - 1)
  const [staffResult, scheduleResult] = await Promise.all([
    req.supabase.from('profiles').select('id, full_name, availability_status, availability_note, staff_position').eq('role','maintenance_personnel').eq('is_active', true).order('full_name'),
    req.supabase.from('staff_schedules').select('*').gte('shift_date', from).lte('shift_date', to).order('shift_date').order('starts_at'),
  ])
  const error = staffResult.error || scheduleResult.error
  if (error) return res.status(400).json({ error: error.message })
  res.json({ from, to, staff: staffResult.data || [], schedules: scheduleResult.data || [] })
})

router.get('/maintenance-note-templates', requireAuth, requireRole('admin','maintenance_personnel'), async (req, res) => {
  if (req.user.role === 'admin' && !hasCapability(req.user, CAPABILITIES.ECMD_OPERATIONS)) return res.status(403).json({ error: 'ECMD access required.' })
  const { data, error } = await req.supabase.from('maintenance_note_templates').select('*').eq('is_active', true).order('label')
  if (error) return res.status(400).json({ error: error.message })
  res.json({ templates: data || [] })
})

router.post('/maintenance-note-templates', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const label = text(req.body?.label), content = text(req.body?.content)
  if (label.length < 2 || content.length < 3) return res.status(400).json({ error: 'Template label and content are required.' })
  const { data, error } = await req.supabase.from('maintenance_note_templates').insert({ label, content, category: text(req.body?.category) || null, created_by: req.user.id }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ template: data })
})

router.patch('/maintenance-note-templates/:id', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const patch = { updated_at: new Date().toISOString() }
  if (req.body?.label !== undefined) patch.label = text(req.body.label)
  if (req.body?.content !== undefined) patch.content = text(req.body.content)
  if (req.body?.category !== undefined) patch.category = text(req.body.category) || null
  if (req.body?.is_active !== undefined) patch.is_active = Boolean(req.body.is_active)
  if (patch.label !== undefined && patch.label.length < 2) return res.status(400).json({ error: 'Template label must contain at least 2 characters.' })
  if (patch.content !== undefined && patch.content.length < 3) return res.status(400).json({ error: 'Template content must contain at least 3 characters.' })
  const { data, error } = await req.supabase.from('maintenance_note_templates').update(patch).eq('id', req.params.id).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'maintenance_template.updated', 'maintenance_note_template', data.id, { is_active: data.is_active })
  res.json({ template: data })
})

// ---------------------------------------------------------------------------
// Export auditing
// ---------------------------------------------------------------------------
router.post('/exports/log', requireAuth, async (req, res) => {
  const exportType = text(req.body?.export_type) || 'complaint_export'
  const allowed = hasCapability(req.user, CAPABILITIES.COMMERCIAL_REPORTS) || hasCapability(req.user, CAPABILITIES.ECMD_REPORTS) || hasCapability(req.user, CAPABILITIES.SYSTEM_AUDIT)
  if (!allowed) return res.status(403).json({ error: 'Export access is not available to this account.' })
  await writeAudit(req.supabase, req.user, 'data.exported', exportType, null, { row_count: Number(req.body?.row_count) || 0, filters: req.body?.filters || {}, format: text(req.body?.format) || 'csv' })
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Report schedules and run archive
// ---------------------------------------------------------------------------
router.get('/report-schedules', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('report_schedules').select('*').eq('owner_id', req.user.id).order('created_at', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  res.json({ schedules: data || [] })
})

router.post('/report-schedules', requireAuth, async (req, res) => {
  const name = text(req.body?.name), reportType = text(req.body?.report_type), cadence = text(req.body?.cadence)
  const allowedTypes = allowedReportTypesFor(req.user)
  if (!allowedTypes.size) return res.status(403).json({ error: 'Report scheduling is not available to this account.' })
  if (!name || !allowedTypes.has(reportType) || !['weekly','monthly'].includes(cadence)) return res.status(400).json({ error: 'Choose a report type available to this department and a weekly/monthly cadence.' })
  const departmentCode = isSystemSupervisor(req.user) ? 'SYSTEM' : departmentCodeFor(req.user)
  const { data, error } = await req.supabase.from('report_schedules').insert({ owner_id: req.user.id, department_code: departmentCode, name, report_type: reportType, cadence, filters: req.body?.filters || {}, next_run_at: nextRun(cadence) }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'report_schedule.created', 'report_schedule', data.id, { report_type: reportType, cadence })
  res.status(201).json({ schedule: data })
})

router.patch('/report-schedules/:id', requireAuth, async (req, res) => {
  const patch = { updated_at: new Date().toISOString() }
  for (const key of ['name','report_type','cadence','filters','is_active']) if (req.body?.[key] !== undefined) patch[key] = req.body[key]
  if (patch.report_type !== undefined && !canScheduleReportType(req.user, text(patch.report_type))) {
    return res.status(403).json({ error: 'That report type is not available to this department.' })
  }
  if (patch.cadence !== undefined && !['weekly','monthly'].includes(text(patch.cadence))) return res.status(400).json({ error: 'Cadence must be weekly or monthly.' })
  if (patch.name !== undefined && text(patch.name).length < 2) return res.status(400).json({ error: 'Report schedule name is required.' })
  if (patch.cadence) patch.next_run_at = nextRun(text(patch.cadence))
  const { data, error } = await req.supabase.from('report_schedules').update(patch).eq('id', req.params.id).eq('owner_id', req.user.id).select().single()
  if (error) return res.status(400).json({ error: error.message })
  res.json({ schedule: data })
})

router.delete('/report-schedules/:id', requireAuth, async (req, res) => {
  const { error } = await req.supabase.from('report_schedules').delete().eq('id', req.params.id).eq('owner_id', req.user.id)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true })
})

function filterReportComplaints(complaints, filters = {}) {
  const q = text(filters.q).toLowerCase()
  const from = filters.from ? new Date(`${filters.from}T00:00:00+08:00`) : null
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999+08:00`) : null
  return complaints.filter(item => {
    const submitted = new Date(item.created_at || item.submitted_at)
    if (from && submitted < from) return false
    if (to && submitted > to) return false
    if (filters.status && filters.status !== 'all' && item.status !== filters.status) return false
    if (filters.priority && filters.priority !== 'all' && item.priority !== filters.priority) return false
    if (q && ![item.reference_number, item.complaint_type, item.customer_name, item.address, item.zone].some(value => String(value || '').toLowerCase().includes(q))) return false
    return true
  })
}

async function generateReportRunWithClient(client, schedule, generatedBy) {
  let rowCount = 0
  const summary = {}
  if (schedule.report_type === 'audit_summary') {
    const { count, error } = await client.from('audit_logs').select('*', { count: 'exact', head: true })
    if (error) throw error
    rowCount = count || 0
    summary.audit_events = rowCount
  } else if (schedule.report_type === 'maintenance_workload') {
    const { data, error } = await client.from('maintenance_tasks').select('id, status, assigned_staff_id').eq('is_active', true)
    if (error) throw error
    rowCount = data?.length || 0
    summary.active_tasks = rowCount
    summary.assigned_personnel = new Set((data || []).map(row => row.assigned_staff_id).filter(Boolean)).size
  } else if (schedule.report_type === 'customer_satisfaction') {
    const { data, error } = await client.from('feedback').select('rating')
    if (error) throw error
    rowCount = data?.length || 0
    summary.average_rating = rowCount ? Number((data.reduce((total, item) => total + Number(item.rating || 0), 0) / rowCount).toFixed(2)) : null
  } else {
    const complaints = filterReportComplaints(await fetchShapedComplaints(client), schedule.filters || {})
    rowCount = complaints.length
    summary.total_complaints = rowCount
    summary.active = complaints.filter(item => !CLOSED.has(item.status)).length
    summary.resolved = complaints.filter(item => ['resolved', 'completed'].includes(item.status)).length
    summary.high_priority = complaints.filter(item => item.priority === 'high').length
  }

  const { data: run, error } = await client.from('report_runs').insert({
    schedule_id: schedule.id,
    generated_by: generatedBy,
    report_type: schedule.report_type,
    filters: schedule.filters || {},
    row_count: rowCount,
    summary,
    status: 'ready',
  }).select().single()
  if (error) throw error

  const now = new Date()
  const { error: updateError } = await client.from('report_schedules').update({
    last_run_at: now.toISOString(), next_run_at: nextRun(schedule.cadence, now), updated_at: now.toISOString(),
  }).eq('id', schedule.id)
  if (updateError) throw updateError
  return run
}

async function generateReportRun(req, schedule) {
  return generateReportRunWithClient(req.supabase, schedule, req.user.id)
}

router.post('/report-schedules/:id/run', requireAuth, async (req, res) => {
  const { data: schedule, error } = await req.supabase.from('report_schedules').select('*').eq('id', req.params.id).eq('owner_id', req.user.id).maybeSingle()
  if (error || !schedule) return res.status(404).json({ error: 'Report schedule not found.' })
  try { const run = await generateReportRun(req, schedule); res.status(201).json({ run }) }
  catch (err) { res.status(400).json({ error: err.message }) }
})

router.get('/report-runs', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('report_runs').select('*, schedule:report_schedules(name, cadence)').eq('generated_by', req.user.id).order('generated_at', { ascending: false }).limit(50)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ runs: data || [] })
})

// ---------------------------------------------------------------------------
// Scheduled report runner (designed for a daily Vercel Cron invocation)
// ---------------------------------------------------------------------------
router.get('/cron/run-reports', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized scheduled-report runner.' })
  const admin = supabaseAdminClient()
  if (!admin) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required for scheduled report execution.' })

  const now = new Date()
  const { data: schedules, error } = await admin.from('report_schedules').select('*').eq('is_active', true).lte('next_run_at', now.toISOString()).order('next_run_at').limit(50)
  if (error) return res.status(500).json({ error: error.message })

  const results = []
  for (const schedule of schedules || []) {
    try {
      const run = await generateReportRunWithClient(admin, schedule, schedule.owner_id)
      await admin.from('audit_logs').insert({ actor_id: null, actor_name: 'Scheduled Report Service', action: 'report_schedule.automatic_run', entity_type: 'report_schedule', entity_id: schedule.id, details: { report_type: schedule.report_type, run_id: run.id } })
      await admin.from('notifications').insert({ user_id: schedule.owner_id, created_by: schedule.owner_id, title: 'Scheduled report generated', message: `${schedule.name} is ready in the generated report archive.`, notification_type: 'info' })
      results.push({ schedule_id: schedule.id, run_id: run.id, status: 'ready' })
    } catch (runError) {
      const next = nextRun(schedule.cadence, now)
      await admin.from('report_runs').insert({ schedule_id: schedule.id, generated_by: schedule.owner_id, report_type: schedule.report_type, filters: schedule.filters || {}, row_count: 0, status: 'failed', summary: { error: String(runError?.message || runError) } })
      await admin.from('report_schedules').update({ last_run_at: now.toISOString(), next_run_at: next, updated_at: now.toISOString() }).eq('id', schedule.id)
      results.push({ schedule_id: schedule.id, status: 'failed', error: String(runError?.message || runError) })
    }
  }
  res.json({ checked_at: now.toISOString(), due: schedules?.length || 0, results })
})

// ---------------------------------------------------------------------------
// System health / backup verification / security event visibility
// ---------------------------------------------------------------------------
router.get('/system-health', requireAuth, requireCapability(CAPABILITIES.SUPERVISOR_DASHBOARD), async (req, res) => {
  const started = Date.now()
  const admin = supabaseAdminClient()
  const storagePromise = admin ? admin.storage.listBuckets() : Promise.resolve({ data: null, error: null })
  const [dbPing, lastAudit, lastBackup, pendingImports, staffCount, securityEvents, storageCheck] = await Promise.all([
    req.supabase.from('departments').select('id', { count: 'exact', head: true }),
    req.supabase.from('audit_logs').select('created_at, action, actor_name').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    req.supabase.from('system_backup_checks').select('*').order('checked_at', { ascending: false }).limit(1).maybeSingle(),
    req.supabase.from('billing_import_batches').select('id', { count: 'exact', head: true }).in('status', ['processing','failed','completed_with_errors']),
    req.supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('role','customer'),
    req.supabase.from('security_events').select('*').order('created_at', { ascending: false }).limit(8),
    storagePromise,
  ])
  const dbError = dbPing.error
  res.json({
    api: { status: 'online', uptime_seconds: Math.round(process.uptime()), node: process.version },
    database: { status: dbError ? 'degraded' : 'online', latency_ms: Date.now() - started, error: dbError?.message || null },
    auth_admin: { configured: Boolean(admin) },
    storage: { status: !admin ? 'not_checked' : storageCheck.error ? 'degraded' : 'online', bucket_count: storageCheck.data?.length || 0, error: storageCheck.error?.message || null },
    scheduled_reports: { configured: Boolean(admin && process.env.CRON_SECRET), cron_path: '/api/production/cron/run-reports' },
    counts: { staff: staffCount.count || 0, import_attention: pendingImports.count || 0 },
    last_audit: lastAudit.data || null,
    last_backup_check: lastBackup.data || null,
    recent_security_events: securityEvents.data || [],
  })
})

router.get('/backup-checks', requireAuth, requireCapability(CAPABILITIES.SUPERVISOR_DASHBOARD), async (req, res) => {
  const { data, error } = await req.supabase.from('system_backup_checks').select('*, recorder:profiles!system_backup_checks_recorded_by_fkey(id, full_name)').order('checked_at', { ascending: false }).limit(30)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ checks: data || [] })
})

router.post('/backup-checks', requireAuth, requireCapability(CAPABILITIES.SUPERVISOR_DASHBOARD), async (req, res) => {
  const backupType = text(req.body?.backup_type), status = text(req.body?.status)
  if (!['supabase_managed','logical_export','restore_test','other'].includes(backupType) || !['verified','warning','failed'].includes(status)) return res.status(400).json({ error: 'Choose a valid backup type and status.' })
  const { data, error } = await req.supabase.from('system_backup_checks').insert({ backup_type: backupType, status, notes: text(req.body?.notes) || null, recorded_by: req.user.id }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'backup_check.recorded', 'system_backup_check', data.id, { backup_type: backupType, status })
  res.status(201).json({ check: data })
})

router.get('/security-events', requireAuth, requireCapability(CAPABILITIES.SYSTEM_AUDIT), async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
  const offset = (page - 1) * limit
  let query = req.supabase.from('security_events').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  const eventType = text(req.query.event_type)
  const success = text(req.query.success)
  const actor = text(req.query.actor)
  const fromDate = req.query.from ? new Date(`${req.query.from}T00:00:00.000+08:00`) : null
  const toDate = req.query.to ? new Date(`${req.query.to}T23:59:59.999+08:00`) : null
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) return res.status(400).json({ error: 'Use valid security-event dates.' })
  if (fromDate) query = query.gte('created_at', fromDate.toISOString())
  if (toDate) query = query.lte('created_at', toDate.toISOString())
  if (eventType) query = query.ilike('event_type', `%${eventType.replaceAll('%', '\%').replaceAll('_', '\_')}%`)
  if (success === 'true' || success === 'false') query = query.eq('success', success === 'true')
  if (actor) query = query.ilike('actor_email', `%${actor.replaceAll('%', '\%').replaceAll('_', '\_')}%`)
  const { data, error, count } = await query
  if (error) return res.status(400).json({ error: error.message })
  res.json({ events: data || [], pagination: { page, page_size: limit, total: count || 0, total_pages: Math.max(1, Math.ceil((count || 0) / limit)) } })
})

router.get('/archives', requireAuth, requireCapability(CAPABILITIES.SYSTEM_APPROVALS), async (req, res) => {
  const { data, error } = await req.supabase.from('complaints').select('id, reference_number, status, archived_at, archive_reason, archived_by, description').not('archived_at','is',null).order('archived_at', { ascending: false }).limit(100)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ archives: data || [] })
})

router.post('/archive/:id/restore', requireAuth, requireCapability(CAPABILITIES.SYSTEM_APPROVALS), async (req, res) => {
  const reason = text(req.body?.reason)
  if (reason.length < 3) return res.status(400).json({ error: 'Restore reason is required.' })
  const { data, error } = await req.supabase.from('complaints').update({ archived_at: null, archived_by: null, archive_reason: null, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('id, reference_number').single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'complaint.archive_restored', 'complaint', data.id, { reason })
  res.json({ complaint: data })
})

export default router
