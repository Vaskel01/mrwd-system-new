import { Router } from 'express'
import { requireAuth, requireCapability } from '../middleware/auth.js'
import { CAPABILITIES } from '../lib/accessControl.js'
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

function monthKey(value) {
  if (!value) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' })
    .format(new Date(value))
}

router.get('/summary', requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_REPORTS), async (req, res) => {
  try {
    const { from, to } = parseRange(req.query.from, req.query.to)
    const allComplaints = await fetchShapedComplaints(req.supabase)
    const complaints = allComplaints.filter(item => {
      const filed = new Date(item.created_at)
      return (!from || filed >= from) && (!to || filed <= to)
    })
    const { data: feedback, error: feedbackError } = await req.supabase
      .from('feedback')
      .select('complaint_id, rating, created_at')
    if (feedbackError) throw feedbackError

    const completed = complaints.filter(item => ['resolved', 'completed'].includes(item.status))
    const monthlyMap = new Map()
    const ensureMonth = key => {
      if (!monthlyMap.has(key)) monthlyMap.set(key, { month: key, filed: 0, completed: 0 })
      return monthlyMap.get(key)
    }
    for (const item of allComplaints) {
      const filedAt = new Date(item.created_at)
      if ((!from || filedAt >= from) && (!to || filedAt <= to)) ensureMonth(monthKey(item.created_at)).filed += 1
      if (item.completed_at) {
        const completedAt = new Date(item.completed_at)
        if ((!from || completedAt >= from) && (!to || completedAt <= to)) ensureMonth(monthKey(item.completed_at)).completed += 1
      }
    }

    const complaintIds = new Set(complaints.map(item => item.id))
    const ratings = (feedback || [])
      .filter(item => complaintIds.has(item.complaint_id))
      .map(item => Number(item.rating))
      .filter(Number.isFinite)
    res.json({
      range: {
        from: req.query.from || null,
        to: req.query.to || null,
      },
      summary: {
        total: complaints.length,
        pending: complaints.filter(item => item.status === 'pending').length,
        active: complaints.filter(item => ['forwarded', 'assigned', 'en_route', 'in_progress', 'blocked'].includes(item.status)).length,
        resolved: completed.length,
        completed: completed.length,
        rejected: complaints.filter(item => item.status === 'rejected').length,
        cancelled: complaints.filter(item => item.status === 'cancelled').length,
        average_rating: ratings.length
          ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 100) / 100
          : null,
        feedback_count: ratings.length,
      },
      by_status: countBy(complaints, item => item.status === 'en_route' ? 'in_progress' : item.status),
      by_category: countBy(complaints, item => item.complaint_type),
      by_priority: countBy(complaints, item => item.priority),
      monthly_summary: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
