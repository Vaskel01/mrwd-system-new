import { Router } from 'express'
import { requireAuth, requireCapability } from '../middleware/auth.js'
import { CAPABILITIES } from '../lib/accessControl.js'

const router = Router()
const PROFILE_DETAIL_KEYS = new Set([
  'assigned_to',
  'previous_assignee',
  'assigned_staff_id',
  'staff_id',
  'user_id',
])

function normalizeDetails(details) {
  if (!details) return {}
  if (typeof details === 'object' && !Array.isArray(details)) return details
  if (typeof details !== 'string') return {}

  try {
    const parsed = JSON.parse(details)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

router.get('/', requireAuth, requireCapability(CAPABILITIES.SYSTEM_AUDIT), async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
  const offset = (page - 1) * limit
  const fromDate = req.query.from ? new Date(`${req.query.from}T00:00:00.000+08:00`) : null
  const toDate = req.query.to ? new Date(`${req.query.to}T23:59:59.999+08:00`) : null
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
    return res.status(400).json({ error: 'Use valid audit dates in YYYY-MM-DD format.' })
  }
  if (fromDate && toDate && fromDate > toDate) {
    return res.status(400).json({ error: 'The audit start date must be before the end date.' })
  }

  let query = req.supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (fromDate) query = query.gte('created_at', fromDate.toISOString())
  if (toDate) query = query.lte('created_at', toDate.toISOString())
  const actor = String(req.query.actor || '').trim()
  const action = String(req.query.action || '').trim()
  const entityType = String(req.query.entity_type || '').trim()
  if (actor) query = query.ilike('actor_name', `%${actor.replaceAll('%', '\%').replaceAll('_', '\_')}%`)
  if (action) query = query.ilike('action', `%${action.replaceAll('%', '\%').replaceAll('_', '\_')}%`)
  if (entityType) query = query.eq('entity_type', entityType)

  const { data, error, count } = await query

  if (error) return res.status(400).json({ error: error.message })

  const profileIds = new Set()
  for (const log of data || []) {
    const details = normalizeDetails(log.details)
    for (const [key, value] of Object.entries(details)) {
      if (PROFILE_DETAIL_KEYS.has(key) && typeof value === 'string') profileIds.add(value)
    }
  }

  let profiles = {}
  if (profileIds.size > 0) {
    const { data: profileRows, error: profileError } = await req.supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', [...profileIds])

    if (!profileError) {
      profiles = Object.fromEntries((profileRows || []).map(profile => [profile.id, profile]))
    }
  }

  res.json({
    logs: data || [],
    profiles,
    pagination: {
      page,
      page_size: limit,
      total: count || 0,
      total_pages: Math.max(1, Math.ceil((count || 0) / limit)),
    },
  })
})

export default router
