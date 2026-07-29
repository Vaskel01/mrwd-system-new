import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { fetchShapedComplaints } from '../lib/shapeComplaint.js'

const router = Router()

function countBy(items, keyFn) {
  return items.reduce((result, item) => {
    const key = keyFn(item) || 'Unknown'
    result[key] = (result[key] || 0) + 1
    return result
  }, {})
}

function parseRange(fromValue, toValue) {
  const from = fromValue ? new Date(`${fromValue}T00:00:00.000+08:00`) : null
  const to = toValue ? new Date(`${toValue}T23:59:59.999+08:00`) : null
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    throw new Error('Use valid report dates in YYYY-MM-DD format.')
  }
  if (from && to && from > to) throw new Error('The report start date must be before the end date.')
  return { from, to }
}

router.get('/summary', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { from, to } = parseRange(req.query.from, req.query.to)
    const allComplaints = await fetchShapedComplaints(req.supabase)
    const complaints = allComplaints.filter(item => {
      const filed = new Date(item.created_at)
      return (!from || filed >= from) && (!to || filed <= to)
    })
    const [{ data: feedback, error: feedbackError }, { data: staff, error: staffError }] = await Promise.all([
      req.supabase.from('feedback').select('complaint_id, rating, created_at'),
      req.supabase.from('profiles').select('id, full_name, role, is_active, availability_status').eq('role', 'maintenance_personnel'),
    ])
    if (feedbackError) throw feedbackError
    if (staffError) throw staffError

    const completed = complaints.filter(item => item.status === 'completed')
    const resolutionHours = completed
      .map(item => item.completed_at && item.created_at
        ? (new Date(item.completed_at) - new Date(item.created_at)) / 3600000
        : null)
      .filter(value => Number.isFinite(value) && value >= 0)

    const complaintIds = new Set(complaints.map(item => item.id))
    const ratings = (feedback || [])
      .filter(item => complaintIds.has(item.complaint_id))
      .map(item => Number(item.rating))
      .filter(Number.isFinite)
    const technicianWorkload = (staff || []).map(person => {
      const assigned = complaints.filter(item => item.assigned_to === person.id)
      const active = assigned.filter(item => ['assigned', 'en_route', 'in_progress', 'blocked'].includes(item.status)).length
      const done = assigned.filter(item => item.status === 'completed').length
      return {
        id: person.id,
        name: person.full_name,
        active,
        completed: done,
        total: assigned.length,
        completion_rate: active + done ? Math.round(done / (active + done) * 100) : 0,
        availability_status: person.availability_status,
        is_active: person.is_active,
      }
    })

    res.json({
      range: {
        from: req.query.from || null,
        to: req.query.to || null,
      },
      summary: {
        total: complaints.length,
        pending: complaints.filter(item => item.status === 'pending').length,
        active: complaints.filter(item => ['assigned', 'en_route', 'in_progress', 'blocked'].includes(item.status)).length,
        completed: completed.length,
        rejected: complaints.filter(item => item.status === 'rejected').length,
        cancelled: complaints.filter(item => item.status === 'cancelled').length,
        average_resolution_hours: resolutionHours.length
          ? Math.round((resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length) * 10) / 10
          : null,
        average_rating: ratings.length
          ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 100) / 100
          : null,
        feedback_count: ratings.length,
      },
      by_status: countBy(complaints, item => item.status === 'en_route' ? 'in_progress' : item.status),
      by_category: countBy(complaints, item => item.complaint_type),
      by_priority: countBy(complaints, item => item.priority),
      technician_workload: technicianWorkload,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
