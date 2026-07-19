import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// GET /api/users/maintenance-staff — admin only, used by the Assign Task page
router.get('/maintenance-staff', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'maintenance')

  if (error) return res.status(400).json({ error: error.message })
  res.json({ staff: data })
})

export default router
