import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /api/billing
// RLS scopes this automatically: customers see only their own bills,
// admins see everyone's.
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('bills')
    .select('*')
    .order('issued_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json({ bills: data })
})

export default router
