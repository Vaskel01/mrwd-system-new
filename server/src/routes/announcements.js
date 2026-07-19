import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// GET /api/announcements — any authenticated user
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json({ announcements: data })
})

// POST /api/announcements — admin only
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, content, category } = req.body || {}
  if (!title || !content || !category) {
    return res.status(400).json({ error: 'title, content, and category are required.' })
  }

  const { data, error } = await req.supabase
    .from('announcements')
    .insert({
      title,
      content,
      category,
      created_by: req.user.id,
      created_by_name: req.user.full_name,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ announcement: data })
})

// DELETE /api/announcements/:id — admin only
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { error } = await req.supabase
    .from('announcements')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true })
})

export default router
