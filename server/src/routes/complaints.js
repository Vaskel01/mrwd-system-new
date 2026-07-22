import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { scoreComplaint } from '../lib/priorityScoring.js'
import { fetchShapedComplaints, fetchShapedComplaintById } from '../lib/shapeComplaint.js'

const router = Router()

const STATUS_VALUES = ['pending', 'assigned', 'en_route', 'in_progress', 'completed', 'rejected']

// Logs an entry to the task's timeline. Safe no-op if there's no task
// yet (e.g. a status somehow changing before assignment).
async function logTaskUpdate(supabase, taskId, userId, message) {
  if (!taskId) return
  await supabase.from('task_updates').insert({ task_id: taskId, updated_by: userId, message })
}

// Looks up the maintenance_tasks row for a complaint — most of the
// new endpoints below need this to know which task to log against.
async function getTaskForComplaint(supabase, complaintId) {
  const { data } = await supabase
    .from('maintenance_tasks')
    .select('*')
    .eq('complaint_id', complaintId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

// GET /api/complaints
// RLS on the complaints table scopes the result set:
//   customer → only their own (resident_id = auth.uid())
//   maintenance → only complaints with a maintenance_tasks row assigned to them
//   admin → everything
// We then join in category name, resident name, and the latest
// maintenance_tasks row so the response matches what the frontend expects.
router.get('/', requireAuth, async (req, res) => {
  try {
    const complaints = await fetchShapedComplaints(req.supabase)
    res.json({ complaints })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/complaints — customers only
router.post('/', requireAuth, requireRole('customer'), async (req, res) => {
  const { complaint_type, description, address, gps, photo_url } = req.body || {}

  if (!complaint_type || !description || !address) {
    return res.status(400).json({ error: 'complaint_type, description, and address are required.' })
  }

  const { data: category, error: categoryErr } = await req.supabase
    .from('complaint_categories')
    .select('id, base_severity_score')
    .eq('name', complaint_type)
    .single()

  if (categoryErr || !category) {
    return res.status(400).json({
      error: `Unknown complaint category "${complaint_type}". It needs to exist in complaint_categories with that exact name.`,
    })
  }

  const { rule_score, sentiment_score, priority_score, priority, reasons } = scoreComplaint({
    description,
    has_photo: !!photo_url,
    base_severity_score: category.base_severity_score,
  })

  const { data: inserted, error } = await req.supabase
    .from('complaints')
    .insert({
      resident_id: req.user.id,
      category_id: category.id,
      description,
      address_text: address,
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
      photo_urls: photo_url ? [photo_url] : [],
      status: 'pending',
      priority,
      priority_score,
      rule_score,
      sentiment_score,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  const complaint = await fetchShapedComplaintById(req.supabase, inserted.id)
  res.status(201).json({ complaint, reasons })
})

// PATCH /api/complaints/:id/assign — admin only
// Assignment lives in maintenance_tasks, not a column on complaints.
// Accepts an optional `notes` field — instructions for the crew,
// visible to them on their Tasks page.
router.patch('/:id/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { assigned_to, notes } = req.body || {}
  if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required.' })

  const { data: task, error } = await req.supabase
    .from('maintenance_tasks')
    .insert({
      complaint_id: req.params.id,
      assigned_staff_id: assigned_to,
      assigned_by: req.user.id,
      status: 'assigned',
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  await req.supabase.from('complaints')
    .update({ status: 'assigned', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)

  await logTaskUpdate(
    req.supabase, task.id, req.user.id,
    notes ? `Assigned to crew. Note: ${notes}` : 'Assigned to crew.'
  )

  try {
    const complaint = await fetchShapedComplaintById(req.supabase, req.params.id)
    res.json({ complaint })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/complaints/:id/status — admin or the assigned maintenance staff
// Updates both the maintenance_tasks row (the audit trail) and the
// complaints row (what customers/admins see as the current status),
// and logs the transition to the task's timeline.
router.patch('/:id/status', requireAuth, requireRole('admin', 'maintenance_personnel'), async (req, res) => {
  const { status } = req.body || {}
  if (!STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(', ')}.` })
  }

  const taskUpdate = { status: status === 'rejected' ? 'pending' : status }
  if (status === 'completed') taskUpdate.completed_at = new Date().toISOString()

  let taskQuery = req.supabase.from('maintenance_tasks').update(taskUpdate).eq('complaint_id', req.params.id)
  if (req.user.role === 'maintenance_personnel') taskQuery = taskQuery.eq('assigned_staff_id', req.user.id)
  const { data: updatedTasks, error: taskErr } = await taskQuery.select()

  if (taskErr) return res.status(400).json({ error: taskErr.message })

  const { error: complaintErr } = await req.supabase
    .from('complaints')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)

  if (complaintErr) return res.status(400).json({ error: complaintErr.message })

  const task = updatedTasks?.[0]
  const STATUS_LABEL = { pending: 'Pending', assigned: 'Assigned', en_route: 'En Route', in_progress: 'On Site', completed: 'Completed', rejected: 'Rejected' }
  await logTaskUpdate(req.supabase, task?.id, req.user.id, `Status changed to ${STATUS_LABEL[status] || status}.`)

  try {
    const complaint = await fetchShapedComplaintById(req.supabase, req.params.id)
    res.json({ complaint })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/complaints/:id/comment — admin or assigned maintenance staff.
// A free-text note on the task's timeline that doesn't change status —
// e.g. "Waiting on a replacement part" or "Resident wasn't home".
router.post('/:id/comment', requireAuth, requireRole('admin', 'maintenance_personnel'), async (req, res) => {
  const { message } = req.body || {}
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required.' })
  }

  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task) return res.status(400).json({ error: 'This complaint has no maintenance task yet.' })

  const { data, error } = await req.supabase
    .from('task_updates')
    .insert({ task_id: task.id, updated_by: req.user.id, message: message.trim() })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ update: data })
})

// GET /api/complaints/:id/updates — the timeline for a complaint.
// Visible to: the resident who filed it, the assigned staff, or an admin.
router.get('/:id/updates', requireAuth, async (req, res) => {
  const task = await getTaskForComplaint(req.supabase, req.params.id)
  if (!task) return res.json({ updates: [] })

  const { data: updates, error } = await req.supabase
    .from('task_updates')
    .select('*')
    .eq('task_id', task.id)
    .order('created_at', { ascending: true })

  if (error) return res.status(400).json({ error: error.message })

  const authorIds = [...new Set((updates || []).map(u => u.updated_by).filter(Boolean))]
  const { data: profiles } = authorIds.length
    ? await req.supabase.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] }
  const nameMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))

  res.json({
    updates: (updates || []).map(u => ({ ...u, author_name: nameMap[u.updated_by] || 'Unknown' })),
  })
})

// POST /api/complaints/:id/feedback — customer only, own complaint,
// must already be completed. One submission per complaint (enforced
// by a unique constraint in the DB too).
router.post('/:id/feedback', requireAuth, requireRole('customer'), async (req, res) => {
  const { rating, comment } = req.body || {}
  const ratingNum = Number(rating)
  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'rating must be a number from 1 to 5.' })
  }

  const { data: complaint, error: complaintErr } = await req.supabase
    .from('complaints')
    .select('id, resident_id, status')
    .eq('id', req.params.id)
    .single()

  if (complaintErr || !complaint) return res.status(404).json({ error: 'Complaint not found.' })
  if (complaint.resident_id !== req.user.id) return res.status(403).json({ error: 'Not your complaint.' })
  if (complaint.status !== 'completed') {
    return res.status(400).json({ error: 'Feedback can only be left once the complaint is completed.' })
  }

  const { data, error } = await req.supabase
    .from('feedback')
    .insert({ complaint_id: req.params.id, resident_id: req.user.id, rating: ratingNum, comment: comment || null })
    .select()
    .single()

  if (error) {
    if (error.message.includes('duplicate key') || error.message.includes('feedback_complaint_id_key')) {
      return res.status(400).json({ error: "You've already left feedback for this complaint." })
    }
    return res.status(400).json({ error: error.message })
  }

  res.status(201).json({ feedback: data })
})

// GET /api/complaints/:id/feedback — fetch existing feedback, if any
// (so the frontend knows whether to show the form or the submitted rating)
router.get('/:id/feedback', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('feedback')
    .select('*')
    .eq('complaint_id', req.params.id)
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  res.json({ feedback: data || null })
})

// POST /api/complaints/bulk-assign — admin only
router.post('/bulk-assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { complaint_ids, assigned_to, notes } = req.body || {}
  if (!Array.isArray(complaint_ids) || complaint_ids.length === 0 || !assigned_to) {
    return res.status(400).json({ error: 'complaint_ids (array) and assigned_to are required.' })
  }

  const results = []
  for (const id of complaint_ids) {
    const { data: task, error } = await req.supabase
      .from('maintenance_tasks')
      .insert({ complaint_id: id, assigned_staff_id: assigned_to, assigned_by: req.user.id, status: 'assigned', notes: notes || null })
      .select()
      .single()

    if (error) { results.push({ id, ok: false, error: error.message }); continue }

    await req.supabase.from('complaints').update({ status: 'assigned', updated_at: new Date().toISOString() }).eq('id', id)
    await logTaskUpdate(req.supabase, task.id, req.user.id, notes ? `Assigned to crew. Note: ${notes}` : 'Assigned to crew.')
    results.push({ id, ok: true })
  }

  res.status(207).json({ results })
})

// POST /api/complaints/bulk-status — admin only (e.g. bulk-reject)
router.post('/bulk-status', requireAuth, requireRole('admin'), async (req, res) => {
  const { complaint_ids, status } = req.body || {}
  if (!Array.isArray(complaint_ids) || complaint_ids.length === 0 || !STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: `complaint_ids (array) and a valid status are required.` })
  }

  const { error } = await req.supabase
    .from('complaints')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', complaint_ids)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true, count: complaint_ids.length })
})

export default router
