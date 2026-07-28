import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { writeAudit } from '../lib/activity.js'

const router = Router()

// GET /api/announcements — any authenticated user
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('announcements')
    .select('*')
    .order('is_important', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json({ announcements: data })
})

// POST /api/announcements — admin only
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, content, category, is_important = false } = req.body || {}
  if (!title || !content || !category) {
    return res.status(400).json({ error: 'title, content, and category are required.' })
  }

  const { data, error } = await req.supabase
    .from('announcements')
    .insert({
      title,
      content,
      category,
      is_important: Boolean(is_important),
      created_by: req.user.id,
      created_by_name: req.user.full_name,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'announcement.created', 'announcement', data.id, {
    title: data.title,
    is_important: data.is_important,
  })
  res.status(201).json({ announcement: data })
})

// PATCH /api/announcements/:id/importance — admin only
router.patch('/:id/importance', requireAuth, requireRole('admin'), async (req, res) => {
  if (typeof req.body?.is_important !== 'boolean') {
    return res.status(400).json({ error: 'is_important must be true or false.' })
  }

  const { data, error } = await req.supabase
    .from('announcements')
    .update({ is_important: req.body.is_important })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(
    req.supabase,
    req.user,
    data.is_important ? 'announcement.marked_important' : 'announcement.unmarked_important',
    'announcement',
    data.id,
    { title: data.title }
  )
  res.json({ announcement: data })
})

// DELETE /api/announcements/:id — admin only
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { error } = await req.supabase
    .from('announcements')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'announcement.deleted', 'announcement', req.params.id)
  res.json({ ok: true })
})

export default router
