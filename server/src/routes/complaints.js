import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { scoreComplaint } from '../lib/priorityScoring.js'
import { fetchShapedComplaints, fetchShapedComplaintById } from '../lib/shapeComplaint.js'

const router = Router()

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
// rule_score comes from the complaint's category (complaint_categories.
// base_severity_score); sentiment_score comes from the keyword/urgency
// analysis of the free-text description. Both are computed here,
// server-side, and are always the authoritative values that get stored
// — the frontend's live preview uses the same keyword logic but only
// as a preview.
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
router.patch('/:id/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { assigned_to } = req.body || {}
  if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required.' })

  const { error } = await req.supabase
    .from('maintenance_tasks')
    .insert({
      complaint_id: req.params.id,
      assigned_staff_id: assigned_to,
      assigned_by: req.user.id,
      status: 'pending',
    })

  if (error) return res.status(400).json({ error: error.message })

  try {
    const complaint = await fetchShapedComplaintById(req.supabase, req.params.id)
    res.json({ complaint })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/complaints/:id/status — admin or the assigned maintenance staff
// Updates both the maintenance_tasks row (the audit trail) and the
// complaints row (what customers/admins see as the current status).
router.patch('/:id/status', requireAuth, requireRole('admin', 'maintenance'), async (req, res) => {
  const { status } = req.body || {}
  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, in_progress, or completed.' })
  }

  const taskUpdate = { status }
  if (status === 'completed') taskUpdate.completed_at = new Date().toISOString()

  let taskQuery = req.supabase.from('maintenance_tasks').update(taskUpdate).eq('complaint_id', req.params.id)
  if (req.user.role === 'maintenance') taskQuery = taskQuery.eq('assigned_staff_id', req.user.id)
  const { error: taskErr } = await taskQuery

  if (taskErr) return res.status(400).json({ error: taskErr.message })

  const { error: complaintErr } = await req.supabase
    .from('complaints')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)

  if (complaintErr) return res.status(400).json({ error: complaintErr.message })

  try {
    const complaint = await fetchShapedComplaintById(req.supabase, req.params.id)
    res.json({ complaint })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
