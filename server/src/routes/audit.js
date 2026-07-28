import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'

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

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 150, 1), 500)
  const { data, error } = await req.supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

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

  res.json({ logs: data || [], profiles })
})

export default router
