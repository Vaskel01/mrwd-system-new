import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 150, 1), 500)
  const { data, error } = await req.supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ logs: data || [] })
})

export default router
