import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { scoreComplaint } from '../lib/priorityScoring.js'
import { fetchShapedComplaints, fetchShapedComplaintById, presentComplaintForRole } from '../lib/shapeComplaint.js'
import { getAdminIds, notifyUsers, writeAudit } from '../lib/activity.js'

const router = Router()
const STATUS_VALUES = ['pending', 'assigned', 'en_route', 'in_progress', 'completed', 'rejected', 'cancelled', 'blocked']
const STATUS_LABEL = {
  pending: 'Pending', assigned: 'Assigned', en_route: 'En Route', in_progress: 'On Site',
  completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled', blocked: 'Needs Attention',
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
    .select('id, resident_id, category_id, description, address_text, status, submitted_at')
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
    return res.status(statusCode).json({ complaint: presentComplaintForRole(complaint, req.user.role) })
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
}

async function assignOne(req, complaintId, assignedTo, notes) {
  const previous = await getTaskForComplaint(req.supabase, complaintId)
  const complaintRow = await getComplaintRow(req.supabase, complaintId)
  if (!complaintRow) throw new Error('Complaint not found.')
  if (['completed', 'cancelled', 'rejected'].includes(complaintRow.status)) {
    throw new Error('A completed, cancelled, or rejected complaint cannot be assigned until it is reopened or restored.')
  }

  const { data: task, error } = await req.supabase.rpc('assign_complaint_task', {
    p_complaint_id: complaintId,
    p_staff_id: assignedTo,
    p_notes: notes || null,
  })
  if (error) throw error

  const technician = await getProfile(req.supabase, assignedTo)
  const isReassignment = Boolean(previous?.assigned_staff_id && previous.assigned_staff_id !== assignedTo)
  await logTaskUpdate(
    req.supabase,
    task.id,
    req.user.id,
    `${isReassignment ? 'Reassigned' : 'Assigned'} to ${technician?.full_name || 'maintenance personnel'}${notes ? `. Instructions: ${notes}` : '.'}`
  )

  await notifyUsers(req.supabase, req.user, [assignedTo], {
    title: isReassignment ? 'Task reassigned to you' : 'New maintenance task',
    message: `${technician?.full_name || 'Technician'}, you have been assigned a ${complaintRow.status === 'blocked' ? 'blocked ' : ''}complaint. Open the task for details.`,
    type: 'assignment', complaintId,
  })
  await notifyUsers(req.supabase, req.user, [complaintRow.resident_id], {
    title: isReassignment ? 'Your technician was changed' : 'Technician assigned',
    message: `${technician?.full_name || 'A maintenance technician'} is now assigned to your complaint.`,
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
    notes: notes || null,
  })
  return task
}

// GET /api/complaints
router.get('/', requireAuth, async (req, res) => {
  try {
    const complaints = await fetchShapedComplaints(req.supabase)
    res.json({ complaints: complaints.map(item => presentComplaintForRole(item, req.user.role)) })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// POST /api/complaints/reclassify-all — admin only
router.post('/reclassify-all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [{ data: complaints, error: complaintsError }, { data: categories, error: categoriesError }] = await Promise.all([
      req.supabase.from('complaints').select('id, category_id, description, photo_urls'),
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
      const { error } = await req.supabase.from('complaints').update({
        priority: result.priority,
        priority_score: result.priority_score,
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
      }).eq('id', row.id)
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
router.post('/bulk-assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { complaint_ids, assigned_to, notes } = req.body || {}
  if (!Array.isArray(complaint_ids) || complaint_ids.length === 0 || !assigned_to) {
    return res.status(400).json({ error: 'complaint_ids (array) and assigned_to are required.' })
  }
  const results = []
  for (const id of [...new Set(complaint_ids)]) {
    try {
      await assignOne(req, id, assigned_to, notes?.trim())
      results.push({ id, ok: true })
    } catch (error) {
      results.push({ id, ok: false, error: error.message })
    }
  }
  res.status(207).json({ results })
})

// POST /api/complaints/bulk-status — admin only
router.post('/bulk-status', requireAuth, requireRole('admin'), async (req, res) => {
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

  const admins = await getAdminIds(req.supabase)
  await notifyUsers(req.supabase, req.user, admins, {
    title: 'New complaint filed', message: `${req.user.full_name} submitted a ${complaint_type} report.`, type: 'new', complaintId: inserted.id,
  })
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
  const admins = await getAdminIds(req.supabase)
  await notifyUsers(req.supabase, req.user, admins, {
    title: 'Complaint cancelled by customer', message: `${req.user.full_name} cancelled a pending complaint.`, type: 'warning', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, 'complaint.cancelled', 'complaint', req.params.id, { reason: reason || null })
  return respondWithComplaint(req, res, req.params.id)
})

router.patch('/:id/reopen', requireAuth, requireRole('customer'), async (req, res) => {
  const row = await getComplaintRow(req.supabase, req.params.id)
  if (!row || row.resident_id !== req.user.id) return res.status(404).json({ error: 'Complaint not found.' })
  if (row.status !== 'completed') return res.status(400).json({ error: 'Only a completed complaint can be reopened.' })
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5) return res.status(400).json({ error: 'Please explain why the issue is not resolved.' })

  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (task) {
    await req.supabase.from('maintenance_tasks').update({ is_active: false, status: 'reopened', superseded_at: new Date().toISOString() }).eq('id', task.id)
    await logTaskUpdate(req.supabase, task.id, req.user.id, `Customer reopened the complaint. Reason: ${reason}`)
  }
  const { error } = await req.supabase.from('complaints').update({
    status: 'pending', reopened_at: new Date().toISOString(), reopen_reason: reason, updated_at: new Date().toISOString(),
  }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })

  const admins = await getAdminIds(req.supabase)
  await notifyUsers(req.supabase, req.user, admins, {
    title: 'Completed complaint reopened', message: `${req.user.full_name}: ${reason}`, type: 'warning', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, 'complaint.reopened', 'complaint', req.params.id, { reason })
  return respondWithComplaint(req, res, req.params.id)
})

// Assignment / reassignment
router.patch('/:id/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { assigned_to, notes } = req.body || {}
  if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required.' })
  try {
    await assignOne(req, req.params.id, assigned_to, String(notes || '').trim())
    return respondWithComplaint(req, res, req.params.id)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

// General status progression. Completion uses /complete so proof is captured.
router.patch('/:id/status', requireAuth, requireRole('admin', 'maintenance_personnel'), async (req, res) => {
  const { status, rejection_reason } = req.body || {}
  if (!STATUS_VALUES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(', ')}.` })
  if (status === 'completed') return res.status(400).json({ error: 'Use the completion report to mark this task completed.' })
  if (req.user.role === 'admin' && status !== 'rejected') {
    return res.status(400).json({ error: 'Admins must use assignment, restoration, or completion actions instead of manually forcing a workflow status.' })
  }
  if (status === 'rejected' && req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can reject a complaint.' })
  if (status === 'rejected' && String(rejection_reason || '').trim().length < 3) {
    return res.status(400).json({ error: 'A rejection reason of at least 3 characters is required.' })
  }

  const complaint = await getComplaintRow(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (req.user.role === 'maintenance_personnel' && (!task || task.assigned_staff_id !== req.user.id)) {
    return res.status(403).json({ error: 'This complaint is not assigned to you.' })
  }
  if (req.user.role === 'maintenance_personnel') {
    const allowedTransitions = { assigned: ['en_route'], en_route: ['in_progress'], in_progress: [], blocked: [] }
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

router.patch('/:id/restore', requireAuth, requireRole('admin'), async (req, res) => {
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

// Maintenance: acknowledge receipt of an assignment.
router.patch('/:id/task/acknowledge', requireAuth, requireRole('maintenance_personnel'), async (req, res) => {
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task || task.assigned_staff_id !== req.user.id) return res.status(403).json({ error: 'This task is not assigned to you.' })
  if (task.acknowledged_at) return respondWithComplaint(req, res, req.params.id)
  const now = new Date().toISOString()
  const { error } = await req.supabase.from('maintenance_tasks').update({ acknowledged_at: now }).eq('id', task.id)
  if (error) return res.status(400).json({ error: error.message })
  await logTaskUpdate(req.supabase, task.id, req.user.id, 'Technician acknowledged the assignment.')
  await writeAudit(req.supabase, req.user, 'task.acknowledged', 'complaint', req.params.id)
  return respondWithComplaint(req, res, req.params.id)
})

// Maintenance: save ETA, materials, or work-plan notes without completing.
router.patch('/:id/task/plan', requireAuth, requireRole('maintenance_personnel'), async (req, res) => {
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task || task.assigned_staff_id !== req.user.id) return res.status(403).json({ error: 'This task is not assigned to you.' })
  const { estimated_completion_at, materials_used } = req.body || {}
  const { error } = await req.supabase.from('maintenance_tasks').update({
    estimated_completion_at: estimated_completion_at || null,
    materials_used: String(materials_used || '').trim() || null,
  }).eq('id', task.id)
  if (error) return res.status(400).json({ error: error.message })
  await logTaskUpdate(req.supabase, task.id, req.user.id,
    `Work plan updated${estimated_completion_at ? `; estimated completion ${new Date(estimated_completion_at).toLocaleString('en-PH')}` : ''}.`)
  await writeAudit(req.supabase, req.user, 'task.plan_updated', 'complaint', req.params.id)
  return respondWithComplaint(req, res, req.params.id)
})

// Maintenance: completion report with required resolution notes and proof photo; materials are optional.
router.patch('/:id/complete', requireAuth, requireRole('admin', 'maintenance_personnel'), async (req, res) => {
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task) return res.status(400).json({ error: 'This complaint has no current maintenance task.' })
  if (req.user.role === 'maintenance_personnel' && task.assigned_staff_id !== req.user.id) {
    return res.status(403).json({ error: 'This task is not assigned to you.' })
  }
  const completionNotes = String(req.body?.completion_notes || '').trim()
  const completionPhotoUrl = String(req.body?.completion_photo_url || '').trim()
  if (completionNotes.length < 5) return res.status(400).json({ error: 'Resolution notes of at least 5 characters are required.' })
  if (!completionPhotoUrl) return res.status(400).json({ error: 'A completion proof photo is required.' })
  const now = new Date().toISOString()
  const { error: taskError } = await req.supabase.from('maintenance_tasks').update({
    status: 'completed',
    completed_at: now,
    completion_notes: completionNotes,
    completion_photo_url: completionPhotoUrl,
    materials_used: String(req.body?.materials_used || task.materials_used || '').trim() || null,
    unable_reason: null,
    reassignment_requested_at: null,
    reassignment_reason: null,
    assistance_requested_at: null,
    assistance_reason: null,
  }).eq('id', task.id)
  if (taskError) return res.status(400).json({ error: taskError.message })
  const { error } = await req.supabase.from('complaints').update({ status: 'completed', updated_at: now }).eq('id', req.params.id)
  if (error) return res.status(400).json({ error: error.message })

  const complaint = await getComplaintRow(req.supabase, req.params.id)
  await logTaskUpdate(req.supabase, task.id, req.user.id, `Task completed. Resolution: ${completionNotes}`)
  await notifyUsers(req.supabase, req.user, [complaint?.resident_id], {
    title: 'Complaint resolved', message: 'The assigned technician submitted a completion report. You may now review the resolution and leave feedback.', type: 'completed', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, 'task.completed', 'complaint', req.params.id, {
    has_photo: true,
    materials_used: req.body?.materials_used || null,
  })
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
  const admins = await getAdminIds(req.supabase)
  await notifyUsers(req.supabase, req.user, admins, {
    title: label, message: `${req.user.full_name}: ${reason}`, type: 'warning', complaintId: req.params.id,
  })
  await writeAudit(req.supabase, req.user, `task.issue.${kind}`, 'complaint', req.params.id, { reason })
  return respondWithComplaint(req, res, req.params.id)
})

router.post('/:id/comment', requireAuth, requireRole('admin', 'maintenance_personnel'), async (req, res) => {
  const message = String(req.body?.message || '').trim()
  if (!message) return res.status(400).json({ error: 'message is required.' })
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task) return res.status(400).json({ error: 'This complaint has no current maintenance task.' })
  if (req.user.role === 'maintenance_personnel' && task.assigned_staff_id !== req.user.id) return res.status(403).json({ error: 'This task is not assigned to you.' })
  const { data, error } = await req.supabase.from('task_updates').insert({ task_id: task.id, updated_by: req.user.id, message }).select().single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'task.comment_added', 'complaint', req.params.id)
  res.status(201).json({ update: data })
})

// Full timeline across every historical assignment.
router.get('/:id/updates', requireAuth, async (req, res) => {
  const { data: tasks, error: taskError } = await req.supabase
    .from('maintenance_tasks')
    .select('id, assigned_staff_id, created_at, is_active')
    .eq('complaint_id', req.params.id)
    .order('created_at', { ascending: true })
  if (taskError) return res.status(400).json({ error: taskError.message })
  if (!tasks?.length) return res.json({ updates: [] })

  const { data: updates, error } = await req.supabase
    .from('task_updates')
    .select('*')
    .in('task_id', tasks.map(task => task.id))
    .order('created_at', { ascending: true })
  if (error) return res.status(400).json({ error: error.message })

  const authorIds = [...new Set((updates || []).map(item => item.updated_by).filter(Boolean))]
  const { data: profiles } = authorIds.length
    ? await req.supabase.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] }
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
  if (complaint.status !== 'completed') return res.status(400).json({ error: 'Feedback can only be left once the complaint is completed.' })

  const { data, error } = await req.supabase.from('feedback').insert({
    complaint_id: req.params.id, resident_id: req.user.id, rating, comment: comment || null,
  }).select().single()
  if (error) {
    if (error.message.includes('duplicate key')) return res.status(400).json({ error: "You've already left feedback for this complaint." })
    return res.status(400).json({ error: error.message })
  }
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  const admins = await getAdminIds(req.supabase)
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
