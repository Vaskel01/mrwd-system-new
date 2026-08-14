import { Router } from 'express'
import { requireAuth, requireCapability, requireRole } from '../middleware/auth.js'
import { CAPABILITIES, hasCapability } from '../lib/accessControl.js'
import { priorityFromScore, scoreComplaint } from '../lib/priorityScoring.js'
import { fetchShapedComplaints, fetchShapedComplaintById, presentComplaintForRole } from '../lib/shapeComplaint.js'
import { getDepartmentAdminIds, notifyUsers, writeAudit } from '../lib/activity.js'
import { writeComplaintEvent } from '../lib/complaintEvents.js'

const router = Router()
const STATUS_VALUES = ['pending', 'forwarded', 'assigned', 'en_route', 'in_progress', 'blocked', 'awaiting_verification', 'resolved', 'rejected', 'cancelled']
const STATUS_LABEL = {
  pending: 'Pending Review', forwarded: 'Forwarded to ECMD', assigned: 'Assigned', en_route: 'In Progress', in_progress: 'In Progress',
  blocked: 'Needs Attention', awaiting_verification: 'Awaiting ECMD Verification', resolved: 'Resolved', completed: 'Resolved', rejected: 'Rejected', cancelled: 'Cancelled',
}

async function logTaskUpdate(supabase, taskId, userId, message) {
  if (!taskId || !message) return
  const { error } = await supabase.from('task_updates').insert({ task_id: taskId, updated_by: userId, message })
  if (error) console.warn('[timeline]', error.message)
}

async function getTaskForComplaint(supabase, complaintId, { current = true } = {}) {
  let query = supabase
    .from('maintenance_tasks')
    .select('*')
    .eq('complaint_id', complaintId)
  if (current) query = query.eq('is_active', true)
  const { data } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

async function getComplaintRow(supabase, id) {
  const { data } = await supabase
    .from('complaints')
    .select('id, reference_number, resident_id, category_id, description, address_text, zone, lat, lng, status, priority, priority_score, algorithm_priority_score, priority_overridden_at, submitted_at, forwarded_to_ecmd_at, forwarded_to_ecmd_by, verified_at, verified_by, resolution_code, resolution_notes')
    .eq('id', id)
    .maybeSingle()
  return data
}

async function getProfile(supabase, id) {
  if (!id) return null
  const { data } = await supabase.from('profiles').select('id, full_name, email, role, is_active').eq('id', id).maybeSingle()
  return data
}

async function respondWithComplaint(req, res, id, statusCode = 200) {
  try {
    const complaint = await fetchShapedComplaintById(req.supabase, id)
    if (!complaint) return res.status(404).json({ error: 'Complaint not found or you do not have access to it.' })
    return res.status(statusCode).json({ complaint: presentComplaintForRole(complaint, req.user.role, {
      canViewClassifier: hasCapability(req.user, CAPABILITIES.COMMERCIAL_COMPLAINTS),
    }) })
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
}

async function assignOne(req, complaintId, assignedTo, notes, crewId = null, reasonCode = null) {
  const previous = await getTaskForComplaint(req.supabase, complaintId)
  const complaintRow = await getComplaintRow(req.supabase, complaintId)
  if (!complaintRow) throw new Error('Complaint not found.')
  if (['resolved', 'completed', 'cancelled', 'rejected', 'awaiting_verification'].includes(complaintRow.status)) {
    throw new Error('This complaint cannot be assigned in its current status. Reopen or return it to field work first.')
  }
  if (!['forwarded', 'assigned', 'in_progress', 'blocked'].includes(complaintRow.status)) {
    throw new Error('The complaint must be forwarded to ECMD before dispatch.')
  }

  const isReassignment = Boolean(previous?.assigned_staff_id && previous.assigned_staff_id !== assignedTo)
  let reassignmentReason = null
  if (isReassignment) {
    if (!reasonCode) throw new Error('Choose a reassignment reason before changing Maintenance Personnel.')
    const { data: reasonRow, error: reasonError } = await req.supabase
      .from('complaint_reason_codes')
      .select('code, label')
      .eq('code', reasonCode)
      .eq('action_type', 'reassignment')
      .eq('is_active', true)
      .maybeSingle()
    if (reasonError) throw reasonError
    if (!reasonRow) throw new Error('Choose a valid reassignment reason.')
    reassignmentReason = reasonRow
  }
  const effectiveNotes = [reassignmentReason ? `Reason: ${reassignmentReason.label}` : '', String(notes || '').trim()].filter(Boolean).join('. ')

  // Validate the optional crew before changing the active assignment so a bad
  // crew selection cannot leave a complaint partially assigned.
  let crew = null
  if (crewId) {
    const { data: crewData, error: crewError } = await req.supabase
      .from('maintenance_crews')
      .select('id, name, is_active')
      .eq('id', crewId)
      .eq('is_active', true)
      .maybeSingle()
    if (crewError) throw crewError
    if (!crewData) throw new Error('The selected maintenance crew is unavailable.')
    crew = crewData
  }

  const { data: task, error } = await req.supabase.rpc('assign_complaint_task', {
    p_complaint_id: complaintId,
    p_staff_id: assignedTo,
    p_notes: effectiveNotes || null,
  })
  if (error) throw error

  if (crew) {
    const { error: taskError } = await req.supabase
      .from('maintenance_tasks')
      .update({ assigned_crew_id: crew.id })
      .eq('id', task.id)
    if (taskError) throw taskError
  }

  // No SLA/response-time target is created on assignment.
  const maintenancePerson = await getProfile(req.supabase, assignedTo)
  await logTaskUpdate(
    req.supabase,
    task.id,
    req.user.id,
    `${isReassignment ? 'Reassigned' : 'Assigned'} to ${maintenancePerson?.full_name || 'Maintenance Personnel'}${crew ? ` with ${crew.name}` : ''}${effectiveNotes ? `. ${effectiveNotes}` : '.'}`
  )
  await writeComplaintEvent(req.supabase, req.user, complaintId, {
    eventType: isReassignment ? 'reassigned' : 'assigned',
    title: isReassignment ? 'Maintenance assignment changed' : 'Maintenance Personnel assigned',
    message: `${maintenancePerson?.full_name || 'Maintenance Personnel'}${crew ? ` · ${crew.name}` : ''}${effectiveNotes ? ` · ${effectiveNotes}` : ''}`,
    customerVisible: true,
    metadata: { assigned_to: assignedTo, previous_assignee: previous?.assigned_staff_id || null, crew_id: crew?.id || null, reassignment_reason_code: reassignmentReason?.code || null },
  })

  await notifyUsers(req.supabase, req.user, [assignedTo], {
    title: isReassignment ? 'Task reassigned to you' : 'New maintenance task',
    message: `${maintenancePerson?.full_name || 'Maintenance Personnel'}, you have been assigned a ${complaintRow.status === 'blocked' ? 'blocked ' : ''}complaint. Open the task for details.`,
    type: 'assignment', complaintId,
  })
  await notifyUsers(req.supabase, req.user, [complaintRow.resident_id], {
    title: isReassignment ? 'Your assigned personnel changed' : 'Maintenance Personnel assigned',
    message: `${maintenancePerson?.full_name || 'Maintenance Personnel'} is now assigned to your complaint.`,
    type: 'status', complaintId,
  })
  if (isReassignment) {
    await notifyUsers(req.supabase, req.user, [previous.assigned_staff_id], {
      title: 'Task reassigned',
      message: 'This complaint has been reassigned and is no longer in your active task list.',
      type: 'assignment', complaintId,
    })
  }
  await writeAudit(req.supabase, req.user, isReassignment ? 'complaint.reassigned' : 'complaint.assigned', 'complaint', complaintId, {
    assigned_to: assignedTo,
    previous_assignee: previous?.assigned_staff_id || null,
    notes: effectiveNotes || null,
    reassignment_reason_code: reassignmentReason?.code || null,
    assigned_crew_id: crew?.id || null,
    assigned_crew_name: crew?.name || null,
  })
  return task
}

// GET /api/complaints
router.get('/', requireAuth, async (req, res) => {
  try {
    const complaints = await fetchShapedComplaints(req.supabase)
    res.json({ complaints: complaints.map(item => presentComplaintForRole(item, req.user.role, {
      canViewClassifier: hasCapability(req.user, CAPABILITIES.COMMERCIAL_COMPLAINTS),
    })) })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// POST /api/complaints/reclassify-all — admin only
router.post('/reclassify-all', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_COMPLAINTS), async (req, res) => {
  try {
    const [{ data: complaints, error: complaintsError }, { data: categories, error: categoriesError }] = await Promise.all([
      req.supabase.from('complaints').select('id, category_id, description, photo_urls, priority_overridden_at'),
      req.supabase.from('complaint_categories').select('id, name, base_severity_score'),
    ])
    if (complaintsError) throw complaintsError
    if (categoriesError) throw categoriesError

    const categoryMap = Object.fromEntries((categories || []).map(category => [category.id, category]))
    const failures = []
    let updated = 0
    for (const row of complaints || []) {
      const category = categoryMap[row.category_id]
      if (!category) { failures.push({ id: row.id, error: 'Complaint category not found.' }); continue }
      const result = scoreComplaint({
        complaint_type: category.name,
        description: row.description,
        has_photo: Array.isArray(row.photo_urls) && row.photo_urls.length > 0,
        base_severity_score: category.base_severity_score,
      })
      const update = {
        algorithm_priority_score: result.priority_score,
        rule_score: result.rule_score,
        sentiment_score: result.sentiment_score,
        classified_category: result.predicted_category,
        classification_confidence: result.category_confidence,
        classification_sentiment: result.classification_sentiment,
        classification_mismatch: result.classification_mismatch,
        classification_basis: result.classification_basis,
        classification_keywords: result.matched_keywords,
        classification_negated_keywords: result.negated_keywords,
        classification_reasons: result.reasons,
        classifier_version: result.classifier_version,
        classification_method: result.classification_method,
        updated_at: new Date().toISOString(),
      }
      if (!row.priority_overridden_at) {
        update.priority = result.priority
        update.priority_score = result.priority_score
      }
      const { error } = await req.supabase.from('complaints').update(update).eq('id', row.id)
      if (error) failures.push({ id: row.id, error: error.message })
      else updated += 1
    }
    await writeAudit(req.supabase, req.user, 'classifier.reclassified_all', 'complaint', null, { updated, failed: failures.length })
    res.json({ updated, failed: failures.length, failures })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// POST /api/complaints/bulk-assign — admin only
router.post('/bulk-assign', requireAuth, requireCapability(CAPABILITIES.ECMD_DISPATCH), async (req, res) => {
  const { complaint_ids, assigned_to, notes, crew_id } = req.body || {}
  if (!Array.isArray(complaint_ids) || complaint_ids.length === 0 || !assigned_to) {
    return res.status(400).json({ error: 'complaint_ids (array) and assigned_to are required.' })
  }
  const results = []
  for (const id of [...new Set(complaint_ids)]) {
    try {
      await assignOne(req, id, assigned_to, notes?.trim(), crew_id || null)
      results.push({ id, ok: true })
    } catch (error) {
      results.push({ id, ok: false, error: error.message })
    }
  }
  res.status(207).json({ results })
})

// POST /api/complaints/bulk-status — admin only
router.post('/bulk-status', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_COMPLAINTS), async (req, res) => {
  const { complaint_ids, status, rejection_reason } = req.body || {}
  if (!Array.isArray(complaint_ids) || complaint_ids.length === 0 || status !== 'rejected') {
    return res.status(400).json({ error: 'Bulk status changes are limited to complaint rejection.' })
  }
  if (status === 'rejected' && (!rejection_reason || rejection_reason.trim().length < 3)) {
    return res.status(400).json({ error: 'A rejection reason of at least 3 characters is required.' })
  }

  const results = []
  for (const id of [...new Set(complaint_ids)]) {
    const complaint = await getComplaintRow(req.supabase, id)
    if (!complaint) { results.push({ id, ok: false, error: 'Complaint not found.' }); continue }
    const now = new Date().toISOString()
    const { error } = await req.supabase.from('complaints').update({
      status,
      rejection_reason: status === 'rejected' ? rejection_reason.trim() : null,
      rejected_at: status === 'rejected' ? now : null,
      updated_at: now,
    }).eq('id', id)
    if (error) { results.push({ id, ok: false, error: error.message }); continue }
    const task = await getTaskForComplaint(req.supabase, id)
    await logTaskUpdate(req.supabase, task?.id, req.user.id,
      status === 'rejected' ? `Complaint rejected. Reason: ${rejection_reason.trim()}` : `Status changed to ${STATUS_LABEL[status] || status}.`)
    await notifyUsers(req.supabase, req.user, [complaint.resident_id], {
      title: status === 'rejected' ? 'Complaint rejected' : 'Complaint status updated',
      message: status === 'rejected' ? rejection_reason.trim() : `Your complaint is now ${STATUS_LABEL[status] || status}.`,
      type: status === 'rejected' ? 'warning' : 'status', complaintId: id,
    })
    results.push({ id, ok: true })
  }
  await writeAudit(req.supabase, req.user, 'complaint.bulk_status', 'complaint', null, { complaint_ids, status })
  res.status(207).json({ results })
})

// GET one complaint
router.get('/:id', requireAuth, async (req, res) => respondWithComplaint(req, res, req.params.id))

// POST complaint — customer only
router.post('/', requireAuth, requireRole('customer'), async (req, res) => {
  const { complaint_type, description, address, gps, photo_url } = req.body || {}
  if (!complaint_type || !description || !address) {
    return res.status(400).json({ error: 'complaint_type, description, and address are required.' })
  }

  const { data: category, error: categoryError } = await req.supabase
    .from('complaint_categories')
    .select('id, base_severity_score')
    .eq('name', complaint_type)
    .single()
  if (categoryError || !category) return res.status(400).json({ error: `Unknown complaint category "${complaint_type}".` })

  const result = scoreComplaint({
    complaint_type,
    description,
    has_photo: Boolean(photo_url),
    base_severity_score: category.base_severity_score,
  })
  const { data: inserted, error } = await req.supabase.from('complaints').insert({
    resident_id: req.user.id,
    category_id: category.id,
    description: description.trim(),
    address_text: address.trim(),
    lat: gps?.lat ?? null,
    lng: gps?.lng ?? null,
    photo_urls: photo_url ? [photo_url] : [],
    status: 'pending',
    priority: result.priority,
    priority_score: result.priority_score,
    algorithm_priority_score: result.priority_score,
    rule_score: result.rule_score,
    sentiment_score: result.sentiment_score,
    classified_category: result.predicted_category,
    classification_confidence: result.category_confidence,
    classification_sentiment: result.classification_sentiment,
    classification_mismatch: result.classification_mismatch,
    classification_basis: result.classification_basis,
    classification_keywords: result.matched_keywords,
    classification_negated_keywords: result.negated_keywords,
    classification_reasons: result.reasons,
    classifier_version: result.classifier_version,
    classification_method: result.classification_method,
  }).select().single()
  if (error) return res.status(400).json({ error: error.message })

  const admins = await getDepartmentAdminIds(req.supabase, 'COMMERCIAL')
  await notifyUsers(req.supabase, req.user, admins, {
    title: 'New complaint filed', message: `${req.user.full_name} submitted a ${complaint_type} complaint.`, type: 'new', complaintId: inserted.id,
  })
  await writeComplaintEvent(req.supabase, req.user, inserted.id, { eventType: 'submitted', title: 'Complaint submitted', message: `${complaint_type} complaint received by MRWD.`, customerVisible: true })
  await writeAudit(req.supabase, req.user, 'complaint.created', 'complaint', inserted.id, { complaint_type })
  return respondWithComplaint(req, res, inserted.id, 201)
})

// Customer edit while pending. Re-runs the classifier when text/category changes.
router.patch('/:id', requireAuth, requireRole('customer'), async (req, res) => {
  const row = await getComplaintRow(req.supabase, req.params.id)
  if (!row || row.resident_id !== req.user.id) return res.status(404).json({ error: 'Complaint not found.' })
  if (row.status !== 'pending') return res.status(400).json({ error: 'Only a pending complaint can be edited.' })

  const { complaint_type, description, address } = req.body || {}
  if (!complaint_type || !description?.trim() || !address?.trim()) {
    return res.status(400).json({ error: 'Complaint type, description, and address are required.' })
  }
  const { data: category, error: categoryError } = await req.supabase
    .from('complaint_categories').select('id, base_severity_score').eq('name', complaint_type).single()
  if (categoryError || !category) return res.status(400).json({ error: 'Invalid complaint type.' })

  const current = await fetchShapedComplaintById(req.supabase, req.params.id)
  const result = scoreComplaint({
    complaint_type,
    description: description.trim(),
    has_photo: Boolean(current?.photo_urls?.length),
    base_severity_score: category.base_severity_score,
  })
  const { error } = await req.supabase.from('complaints').update({
    category_id: category.id,
    description: description.trim(),
    address_text: address.trim(),
    priority: result.priority,
    priority_score: result.priority_score,
    algorithm_priority_score: result.priority_score,
    priority_override_reason: null,
    priority_overridden_by: null,
    priority_overridden_at: null,
    rule_score: result.rule_score,
    sentiment_score: result.sentiment_score,
    classified_category: result.predicted_category,
    classification_confidence: result.category_confidence,
    classification_sentiment: result.classification_sentiment,
    classification_mismatch: result.classification_mismatch,
    classification_basis: result.classification_basis,
    classification_keywords: result.matched_keywords,
    classification_negated_keywords: result.negated_keywords,
    classification_reasons: result.reasons,
    classifier_version: result.classifier_version,
    classification_method: result.classification_method,
    updated_at: new Date().toISOString(),
  }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'complaint.edited', 'complaint', req.params.id)
  return respondWithComplaint(req, res, req.params.id)
})

router.patch('/:id/cancel', requireAuth, requireRole('customer'), async (req, res) => {
  const row = await getComplaintRow(req.supabase, req.params.id)
  if (!row || row.resident_id !== req.user.id) return res.status(404).json({ error: 'Complaint not found.' })
  if (row.status !== 'pending') return res.status(400).json({ error: 'Only a pending complaint can be cancelled.' })
  const reason = String(req.body?.reason || '').trim()
  const { error } = await req.supabase.from('complaints').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason || null, updated_at: new Date().toISOString(),
  }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })
  const admins = await getDepartmentAdminIds(req.supabase, 'COMMERCIAL')
  await notifyUsers(req.supabase, req.user, admins, {
    title: 'Complaint cancelled by customer', message: `${req.user.full_name} cancelled a pending complaint.`, type: 'warning', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, 'complaint.cancelled', 'complaint', req.params.id, { reason: reason || null })
  return respondWithComplaint(req, res, req.params.id)
})

router.patch('/:id/reopen', requireAuth, requireRole('customer'), async (req, res) => {
  const row = await getComplaintRow(req.supabase, req.params.id)
  if (!row || row.resident_id !== req.user.id) return res.status(404).json({ error: 'Complaint not found.' })
  if (!['resolved', 'completed'].includes(row.status)) return res.status(400).json({ error: 'Only a resolved complaint can be reopened.' })
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5) return res.status(400).json({ error: 'Please explain why the issue is not resolved.' })

  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (task) {
    await req.supabase.from('maintenance_tasks').update({ is_active: false, status: 'reopened', superseded_at: new Date().toISOString() }).eq('id', task.id)
    await logTaskUpdate(req.supabase, task.id, req.user.id, `Customer reopened the complaint. Reason: ${reason}`)
  }
  const { error } = await req.supabase.from('complaints').update({
    status: 'pending',
    reopened_at: new Date().toISOString(),
    reopen_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })

  const admins = await getDepartmentAdminIds(req.supabase, 'COMMERCIAL')
  await notifyUsers(req.supabase, req.user, admins, {
    title: 'Completed complaint reopened', message: `${req.user.full_name}: ${reason}`, type: 'warning', complaintId: req.params.id,
  })
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'reopened', title: 'Complaint reopened', message: reason, customerVisible: true })
  await writeAudit(req.supabase, req.user, 'complaint.reopened', 'complaint', req.params.id, { reason })
  return respondWithComplaint(req, res, req.params.id)
})

// Commercial Services: explicit handoff to ECMD after review.
router.patch('/:id/forward-to-ecmd', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_COMPLAINTS), async (req, res) => {
  const complaint = await getComplaintRow(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
  if (!['pending', 'rejected'].includes(complaint.status)) return res.status(400).json({ error: 'Only a complaint under Commercial review can be forwarded to ECMD.' })
  const note = String(req.body?.note || '').trim()
  const now = new Date().toISOString()
  const { error } = await req.supabase.from('complaints').update({
    status: 'forwarded', forwarded_to_ecmd_at: now, forwarded_to_ecmd_by: req.user.id,
    rejection_reason: null, rejected_at: null, updated_at: now,
  }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })
  const ecmd = await getDepartmentAdminIds(req.supabase, 'ECMD')
  await notifyUsers(req.supabase, req.user, ecmd, { title: 'Complaint forwarded by Commercial', message: `${complaint.reference_number} is ready for ECMD dispatch.`, type: 'assignment', complaintId: req.params.id })
  await notifyUsers(req.supabase, req.user, [complaint.resident_id], { title: 'Complaint forwarded to ECMD', message: 'Commercial Services completed its review and forwarded your complaint for field handling.', type: 'status', complaintId: req.params.id })
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'forwarded_to_ecmd', title: 'Forwarded to ECMD', message: note || 'Commercial Services completed complaint review.', customerVisible: true })
  await writeAudit(req.supabase, req.user, 'complaint.forwarded_to_ecmd', 'complaint', req.params.id, { note: note || null })
  return respondWithComplaint(req, res, req.params.id)
})

// Assignment / reassignment
router.patch('/:id/assign', requireAuth, requireCapability(CAPABILITIES.ECMD_DISPATCH), async (req, res) => {
  const { assigned_to, notes, crew_id, reason_code } = req.body || {}
  if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required.' })
  try {
    await assignOne(req, req.params.id, assigned_to, String(notes || '').trim(), crew_id || null, reason_code || null)
    return respondWithComplaint(req, res, req.params.id)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

// Admin: override or restore the classifier-generated operational priority.
router.patch('/:id/priority', requireAuth, requireRole('admin'), async (req, res, next) => {
  const allowed = hasCapability(req.user, CAPABILITIES.COMMERCIAL_COMPLAINTS) || hasCapability(req.user, CAPABILITIES.ECMD_OPERATIONS)
  if (!allowed) return res.status(403).json({ error: 'Priority changes are restricted to Commercial Services or ECMD.' })
  return next()
}, async (req, res) => {
  const complaint = await getComplaintRow(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })

  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5) {
    return res.status(400).json({ error: 'A reason of at least 5 characters is required for the audit trail.' })
  }

  const isCommercial = hasCapability(req.user, CAPABILITIES.COMMERCIAL_COMPLAINTS)
  const resetToAlgorithm = req.body?.reset_to_algorithm === true
  const requestedPriority = String(req.body?.priority || '').trim().toLowerCase()
  const numericScore = Number(req.body?.score)

  if (!isCommercial && !['forwarded', 'assigned', 'en_route', 'in_progress', 'blocked', 'awaiting_verification'].includes(complaint.status)) {
    return res.status(400).json({ error: 'ECMD can change operational priority only after a complaint has been forwarded for field handling.' })
  }
  if (!isCommercial && resetToAlgorithm) {
    return res.status(403).json({ error: 'Restoring the classifier recommendation is restricted to Commercial Services.' })
  }
  if (isCommercial && !resetToAlgorithm && (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 100)) {
    return res.status(400).json({ error: 'Priority score must be a whole number from 0 to 100.' })
  }
  if (!isCommercial && !['low', 'medium', 'high'].includes(requestedPriority)) {
    return res.status(400).json({ error: 'ECMD must choose Low, Medium, or High operational priority.' })
  }

  const algorithmScore = Number(complaint.algorithm_priority_score ?? complaint.priority_score)
  const nextScore = isCommercial ? (resetToAlgorithm ? algorithmScore : numericScore) : Number(complaint.priority_score)
  const nextPriority = isCommercial ? priorityFromScore(nextScore) : requestedPriority
  const previous = {
    score: complaint.priority_score,
    priority: complaint.priority,
    was_overridden: Boolean(complaint.priority_overridden_at),
  }
  const now = new Date().toISOString()
  const update = resetToAlgorithm
    ? {
        priority_score: nextScore,
        priority: nextPriority,
        priority_override_reason: null,
        priority_overridden_by: null,
        priority_overridden_at: null,
        updated_at: now,
      }
    : {
        ...(isCommercial ? { priority_score: nextScore } : {}),
        priority: nextPriority,
        priority_override_reason: reason,
        priority_overridden_by: req.user.id,
        priority_overridden_at: now,
        updated_at: now,
      }

  const { error } = await req.supabase.from('complaints').update(update).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })

  const task = await getTaskForComplaint(req.supabase, req.params.id)
  const actionLabel = resetToAlgorithm ? 'Priority restored to the classifier recommendation' : 'Priority manually overridden'
  await logTaskUpdate(
    req.supabase,
    task?.id,
    req.user.id,
    `${actionLabel}: ${nextScore}/100 (${nextPriority}). Reason: ${reason}`
  )
  if (task?.assigned_staff_id) {
    await notifyUsers(req.supabase, req.user, [task.assigned_staff_id], {
      title: 'Complaint priority updated',
      message: `The operational priority is now ${nextPriority.toUpperCase()}.`,
      type: 'status',
      complaintId: req.params.id,
    })
  }
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: resetToAlgorithm ? 'priority_restored' : 'priority_overridden', title: resetToAlgorithm ? 'Priority restored to classifier recommendation' : 'Priority manually changed', message: reason, customerVisible: false, metadata: { new_priority: nextPriority, new_score: nextScore } })
  await writeAudit(
    req.supabase,
    req.user,
    resetToAlgorithm ? 'complaint.priority_override_removed' : 'complaint.priority_overridden',
    'complaint',
    req.params.id,
    {
      previous_score: previous.score,
      previous_priority: previous.priority,
      previous_was_overridden: previous.was_overridden,
      algorithm_score: algorithmScore,
      new_score: nextScore,
      new_priority: nextPriority,
      reason,
    }
  )
  return respondWithComplaint(req, res, req.params.id)
})

// General status progression. Completion uses /complete; ECMD verification uses /verify.
router.patch('/:id/status', requireAuth, requireRole('admin', 'maintenance_personnel'), async (req, res, next) => {
  if (req.user.role === 'admin') {
    const requestedStatus = req.body?.status === 'en_route' ? 'in_progress' : req.body?.status
    const requiredCapability = requestedStatus === 'rejected'
      ? CAPABILITIES.COMMERCIAL_COMPLAINTS
      : CAPABILITIES.ECMD_OPERATIONS
    if (!hasCapability(req.user, requiredCapability)) {
      return res.status(403).json({
        error: requestedStatus === 'rejected'
          ? 'Complaint rejection is restricted to the Commercial Department.'
          : 'Complaint field-status changes are restricted to ECMD.',
      })
    }
  }
  return next()
}, async (req, res) => {
  const { status: requestedStatus, rejection_reason } = req.body || {}
  if (!STATUS_VALUES.includes(requestedStatus)) return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(', ')}.` })
  // Legacy clients may still send en_route. New activity is stored as the
  // unified in_progress state while existing en_route rows remain readable.
  const status = requestedStatus === 'en_route' ? 'in_progress' : requestedStatus
  if (['awaiting_verification','resolved'].includes(status)) return res.status(400).json({ error: 'Use the completion and ECMD verification actions for these workflow states.' })
  if (req.user.role === 'admin' && status !== 'rejected') {
    return res.status(400).json({ error: 'Department Staff must use the designated review, dispatch, restoration, or completion actions instead of forcing a workflow status.' })
  }
  if (status === 'rejected' && req.user.role !== 'admin') return res.status(403).json({ error: 'Only authorized Commercial Department Staff can reject a complaint.' })
  if (status === 'rejected' && String(rejection_reason || '').trim().length < 3) {
    return res.status(400).json({ error: 'A rejection reason of at least 3 characters is required.' })
  }

  const complaint = await getComplaintRow(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
  if (status === 'rejected' && complaint.status !== 'pending') {
    return res.status(400).json({ error: 'Commercial Services can reject a complaint only while it is pending review.' })
  }
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (req.user.role === 'maintenance_personnel' && (!task || task.assigned_staff_id !== req.user.id)) {
    return res.status(403).json({ error: 'This complaint is not assigned to you.' })
  }
  if (req.user.role === 'maintenance_personnel') {
    const allowedTransitions = { assigned: ['in_progress'], en_route: ['in_progress'], in_progress: [], blocked: [] }
    if (!allowedTransitions[complaint.status]?.includes(status)) {
      return res.status(400).json({ error: `Invalid task transition from ${STATUS_LABEL[complaint.status] || complaint.status} to ${STATUS_LABEL[status] || status}.` })
    }
  }

  if (task && status !== 'rejected') {
    const { error: taskError } = await req.supabase.from('maintenance_tasks').update({ status }).eq('id', task.id)
    if (taskError) return res.status(400).json({ error: taskError.message })
  }
  const now = new Date().toISOString()
  const { error } = await req.supabase.from('complaints').update({
    status,
    rejection_reason: status === 'rejected' ? rejection_reason.trim() : null,
    rejected_at: status === 'rejected' ? now : null,
    updated_at: now,
  }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })

  const message = status === 'rejected'
    ? `Complaint rejected. Reason: ${rejection_reason.trim()}`
    : `Status changed to ${STATUS_LABEL[status] || status}.`
  await logTaskUpdate(req.supabase, task?.id, req.user.id, message)
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: status === 'rejected' ? 'rejected' : 'status_changed', title: status === 'rejected' ? 'Complaint rejected' : `Status changed to ${STATUS_LABEL[status] || status}`, message: status === 'rejected' ? rejection_reason.trim() : null, customerVisible: true, metadata: { status } })
  await notifyUsers(req.supabase, req.user, [complaint.resident_id], {
    title: status === 'rejected' ? 'Complaint rejected' : 'Complaint progress updated',
    message: status === 'rejected' ? rejection_reason.trim() : `Your complaint is now ${STATUS_LABEL[status] || status}.`,
    type: status === 'rejected' ? 'warning' : 'status', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, `complaint.status.${status}`, 'complaint', req.params.id, {
    rejection_reason: status === 'rejected' ? rejection_reason.trim() : undefined,
  })
  return respondWithComplaint(req, res, req.params.id)
})

router.patch('/:id/restore', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_COMPLAINTS), async (req, res) => {
  const row = await getComplaintRow(req.supabase, req.params.id)
  if (!row) return res.status(404).json({ error: 'Complaint not found.' })
  if (row.status !== 'rejected') return res.status(400).json({ error: 'Only rejected complaints can be restored.' })
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  const restoredStatus = task?.assigned_staff_id ? 'assigned' : 'pending'
  if (task) await req.supabase.from('maintenance_tasks').update({ status: 'assigned', completed_at: null }).eq('id', task.id)
  const { error } = await req.supabase.from('complaints').update({
    status: restoredStatus, rejection_reason: null, rejected_at: null, updated_at: new Date().toISOString(),
  }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })
  await logTaskUpdate(req.supabase, task?.id, req.user.id, `Rejection undone. Complaint restored to ${STATUS_LABEL[restoredStatus]}.`)
  await notifyUsers(req.supabase, req.user, [row.resident_id], {
    title: 'Complaint restored', message: `Your complaint was restored to ${STATUS_LABEL[restoredStatus]}.`, type: 'status', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, 'complaint.restored', 'complaint', req.params.id)
  return respondWithComplaint(req, res, req.params.id)
})

// Maintenance: update materials/work-plan notes without any acknowledgement or response-time step.
router.patch('/:id/task/plan', requireAuth, requireRole('maintenance_personnel'), async (req, res) => {
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task || task.assigned_staff_id !== req.user.id) return res.status(403).json({ error: 'This task is not assigned to you.' })
  const { materials_used } = req.body || {}
  const { error } = await req.supabase.from('maintenance_tasks').update({
    materials_used: String(materials_used || '').trim() || null,
  }).eq('id', task.id)
  if (error) return res.status(400).json({ error: error.message })
  await logTaskUpdate(req.supabase, task.id, req.user.id, 'Work plan / materials updated.')
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'work_plan_updated', title: 'Work plan updated', message: String(materials_used || '').trim() || null, customerVisible: false })
  await writeAudit(req.supabase, req.user, 'task.plan_updated', 'complaint', req.params.id)
  return respondWithComplaint(req, res, req.params.id)
})

// Maintenance: completion report with resolution notes. No acceptance step or proof photo is required.
router.patch('/:id/complete', requireAuth, requireRole('maintenance_personnel'), async (req, res) => {
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task) return res.status(400).json({ error: 'This complaint has no current maintenance task.' })
  if (req.user.role === 'maintenance_personnel' && task.assigned_staff_id !== req.user.id) {
    return res.status(403).json({ error: 'This task is not assigned to you.' })
  }
  const completionNotes = String(req.body?.completion_notes || '').trim()
  if (completionNotes.length < 5) return res.status(400).json({ error: 'Resolution notes of at least 5 characters are required.' })
  const now = new Date().toISOString()
  const { error: taskError } = await req.supabase.from('maintenance_tasks').update({
    status: 'completed',
    completed_at: now,
    completion_notes: completionNotes,
    materials_used: String(req.body?.materials_used || task.materials_used || '').trim() || null,
    unable_reason: null,
    reassignment_requested_at: null,
    reassignment_reason: null,
    assistance_requested_at: null,
    assistance_reason: null,
  }).eq('id', task.id)
  if (taskError) return res.status(400).json({ error: taskError.message })
  const { error } = await req.supabase.from('complaints').update({ status: 'awaiting_verification', updated_at: now }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })

  const complaint = await getComplaintRow(req.supabase, req.params.id)
  await logTaskUpdate(req.supabase, task.id, req.user.id, `Task completed. Resolution: ${completionNotes}`)
  const ecmd = await getDepartmentAdminIds(req.supabase, 'ECMD')
  await notifyUsers(req.supabase, req.user, ecmd, { title: 'Maintenance work ready for verification', message: `${complaint?.reference_number || 'Complaint'} was marked complete by Maintenance Personnel.`, type: 'completed', complaintId: req.params.id })
  await notifyUsers(req.supabase, req.user, [complaint?.resident_id], { title: 'Field work completed', message: 'Maintenance Personnel completed the field work. ECMD is reviewing the resolution before closure.', type: 'status', complaintId: req.params.id })
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'maintenance_completed', title: 'Field work completed', message: completionNotes, customerVisible: true })
  await writeAudit(req.supabase, req.user, 'task.completed', 'complaint', req.params.id, { materials_used: req.body?.materials_used || null })
  return respondWithComplaint(req, res, req.params.id)
})

// ECMD: verify Maintenance completion before the complaint is resolved/closed.
router.patch('/:id/verify', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const complaint = await getComplaintRow(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
  if (complaint.status !== 'awaiting_verification') return res.status(400).json({ error: 'This complaint is not awaiting ECMD verification.' })
  const resolutionCode = String(req.body?.resolution_code || 'resolved').trim()
  const notes = String(req.body?.resolution_notes || '').trim()
  const returnToField = req.body?.return_to_field === true
  const now = new Date().toISOString()
  const task = await getTaskForComplaint(req.supabase, req.params.id)

  if (returnToField) {
    if (notes.length < 5) return res.status(400).json({ error: 'Explain what additional field work is required.' })
    if (task) await req.supabase.from('maintenance_tasks').update({ status: 'in_progress', completed_at: null }).eq('id', task.id)
    const { error } = await req.supabase.from('complaints').update({ status: 'in_progress', verified_at: null, verified_by: null, resolution_code: null, resolution_notes: notes || null, updated_at: now }).eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    if (task?.assigned_staff_id) await notifyUsers(req.supabase, req.user, [task.assigned_staff_id], { title: 'Complaint returned for additional work', message: notes || 'ECMD requested additional field work.', type: 'warning', complaintId: req.params.id })
    await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'verification_returned', title: 'Returned for additional field work', message: notes || null, customerVisible: true })
    await writeAudit(req.supabase, req.user, 'complaint.verification_returned', 'complaint', req.params.id, { notes: notes || null })
    return respondWithComplaint(req, res, req.params.id)
  }

  const { data: reasonCode } = await req.supabase
    .from('complaint_reason_codes')
    .select('code')
    .eq('code', resolutionCode)
    .eq('action_type', 'resolution')
    .eq('is_active', true)
    .maybeSingle()
  if (!reasonCode) return res.status(400).json({ error: 'Choose a valid resolution code.' })

  const { error } = await req.supabase.from('complaints').update({ status: 'resolved', verified_at: now, verified_by: req.user.id, resolution_code: resolutionCode, resolution_notes: notes || null, updated_at: now }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })
  await notifyUsers(req.supabase, req.user, [complaint.resident_id], { title: 'Complaint resolved', message: notes || 'ECMD verified the completed field work and closed the complaint as resolved.', type: 'completed', complaintId: req.params.id })
  const commercial = await getDepartmentAdminIds(req.supabase, 'COMMERCIAL')
  await notifyUsers(req.supabase, req.user, commercial, { title: 'Complaint resolved by ECMD', message: `${complaint.reference_number} has been verified and resolved.`, type: 'completed', complaintId: req.params.id })
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'verified_resolved', title: 'ECMD verified resolution', message: notes || null, customerVisible: true, metadata: { resolution_code: resolutionCode } })
  await writeAudit(req.supabase, req.user, 'complaint.verified_resolved', 'complaint', req.params.id, { resolution_code: resolutionCode, notes: notes || null })
  return respondWithComplaint(req, res, req.params.id)
})

// Maintenance: report inability, request reassignment, or request assistance.
router.post('/:id/task/issue', requireAuth, requireRole('maintenance_personnel'), async (req, res) => {
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task || task.assigned_staff_id !== req.user.id) return res.status(403).json({ error: 'This task is not assigned to you.' })
  const kind = req.body?.kind
  const reason = String(req.body?.reason || '').trim()
  if (!['cannot_complete', 'reassignment', 'assistance'].includes(kind)) return res.status(400).json({ error: 'Invalid issue type.' })
  if (reason.length < 5) return res.status(400).json({ error: 'Please provide a clear reason.' })
  const now = new Date().toISOString()
  const update = kind === 'assistance'
    ? { assistance_requested_at: now, assistance_reason: reason }
    : {
        status: 'blocked',
        unable_reason: kind === 'cannot_complete' ? reason : null,
        reassignment_requested_at: kind === 'reassignment' ? now : null,
        reassignment_reason: kind === 'reassignment' ? reason : null,
      }
  const { error } = await req.supabase.from('maintenance_tasks').update(update).eq('id', task.id)
  if (error) return res.status(400).json({ error: error.message })
  if (kind !== 'assistance') {
    await req.supabase.from('complaints').update({ status: 'blocked', updated_at: now }).eq('id', req.params.id)
  }
  const label = kind === 'assistance' ? 'Additional assistance requested' : kind === 'reassignment' ? 'Reassignment requested' : 'Task cannot be completed'
  await logTaskUpdate(req.supabase, task.id, req.user.id, `${label}. Reason: ${reason}`)
  const admins = await getDepartmentAdminIds(req.supabase, 'ECMD')
  await notifyUsers(req.supabase, req.user, admins, {
    title: label, message: `${req.user.full_name}: ${reason}`, type: 'warning', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, `task.issue.${kind}`, 'complaint', req.params.id, { reason })
  return respondWithComplaint(req, res, req.params.id)
})

router.post('/:id/comment', requireAuth, requireRole('admin', 'maintenance_personnel'), async (req, res, next) => {
  if (req.user.role === 'admin' && !hasCapability(req.user, CAPABILITIES.ECMD_OPERATIONS)) {
    return res.status(403).json({ error: 'Maintenance work notes are restricted to ECMD.' })
  }
  return next()
}, async (req, res) => {
  const message = String(req.body?.message || '').trim()
  if (!message) return res.status(400).json({ error: 'message is required.' })
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task) return res.status(400).json({ error: 'This complaint has no current maintenance task.' })
  if (req.user.role === 'maintenance_personnel' && task.assigned_staff_id !== req.user.id) return res.status(403).json({ error: 'This task is not assigned to you.' })
  const { data, error } = await req.supabase.from('task_updates').insert({ task_id: task.id, updated_by: req.user.id, message }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'field_update', title: 'Field update posted', message, customerVisible: true })
  await writeAudit(req.supabase, req.user, 'task.comment_added', 'complaint', req.params.id)
  res.status(201).json({ update: data })
})

// Complete complaint timeline across Commercial, ECMD, Maintenance, and customer actions.
router.get('/:id/updates', requireAuth, async (req, res) => {
  const { data: events, error: eventError } = await req.supabase
    .from('complaint_events')
    .select('*')
    .eq('complaint_id', req.params.id)
    .order('created_at', { ascending: true })

  if (!eventError) {
    return res.json({ updates: (events || []).map(event => ({
      id: event.id,
      message: event.message ? `${event.title}: ${event.message}` : event.title,
      updated_by: event.actor_id,
      author_name: event.actor_name || 'MRWD',
      created_at: event.created_at,
      event_type: event.event_type,
      department_code: event.department_code,
    })) })
  }

  // Compatibility fallback if the operational migration has not been applied.
  const { data: tasks, error: taskError } = await req.supabase.from('maintenance_tasks').select('id').eq('complaint_id', req.params.id)
  if (taskError) return res.status(400).json({ error: taskError.message })
  if (!tasks?.length) return res.json({ updates: [] })
  const { data: updates, error } = await req.supabase.from('task_updates').select('*').in('task_id', tasks.map(task => task.id)).order('created_at', { ascending: true })
  if (error) return res.status(400).json({ error: error.message })
  const authorIds = [...new Set((updates || []).map(item => item.updated_by).filter(Boolean))]
  const { data: profiles } = authorIds.length ? await req.supabase.from('profiles').select('id, full_name').in('id', authorIds) : { data: [] }
  const nameMap = Object.fromEntries((profiles || []).map(profile => [profile.id, profile.full_name]))
  res.json({ updates: (updates || []).map(item => ({ ...item, author_name: nameMap[item.updated_by] || 'Unknown' })) })
})

router.post('/:id/feedback', requireAuth, requireRole('customer'), async (req, res) => {
  const rating = Number(req.body?.rating)
  const comment = String(req.body?.comment || '').trim()
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be a number from 1 to 5.' })
  const complaint = await getComplaintRow(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
  if (complaint.resident_id !== req.user.id) return res.status(403).json({ error: 'Not your complaint.' })
  if (!['resolved', 'completed'].includes(complaint.status)) return res.status(400).json({ error: 'Feedback can only be left once the complaint is resolved.' })

  const { data, error } = await req.supabase.from('feedback').insert({
    complaint_id: req.params.id, resident_id: req.user.id, rating, comment: comment || null,
  }).select().single()
  if (error) {
    if (error.message.includes('duplicate key')) return res.status(400).json({ error: "You've already left feedback for this complaint." })
    return res.status(400).json({ error: error.message })
  }
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  const admins = await getDepartmentAdminIds(req.supabase, 'COMMERCIAL')
  await notifyUsers(req.supabase, req.user, [...admins, task?.assigned_staff_id], {
    title: 'Customer feedback received', message: `${req.user.full_name} submitted a ${rating}-star rating.`, type: 'feedback', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, 'feedback.submitted', 'complaint', req.params.id, { rating })
  res.status(201).json({ feedback: data })
})

router.get('/:id/feedback', requireAuth, async (req, res) => {
  try {
    const complaint = await fetchShapedComplaintById(req.supabase, req.params.id)
    if (!complaint) return res.status(404).json({ error: 'Complaint not found or you do not have access to it.' })
    const { data, error } = await req.supabase.from('feedback').select('*').eq('complaint_id', req.params.id).maybeSingle()
    if (error) return res.status(400).json({ error: error.message })
    res.json({ feedback: data || null })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
