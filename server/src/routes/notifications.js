import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const from = (page - 1) * limit
  const to = from + limit - 1
  const [listResult, countResult] = await Promise.all([
    req.supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(from, to),
    req.supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .is('read_at', null),
  ])

  if (listResult.error) return res.status(400).json({ error: listResult.error.message })
  if (countResult.error) return res.status(400).json({ error: countResult.error.message })
  res.json({
    notifications: listResult.data || [],
    unread_count: countResult.count || 0,
    total: listResult.count || 0,
    page,
    page_size: limit,
  })
})

router.patch('/read-all', requireAuth, async (req, res) => {
  const { error } = await req.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', req.user.id)
    .is('read_at', null)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true })
})

router.patch('/:id/read', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .maybeSingle()
  if (error) return res.status(400).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Notification not found.' })
  res.json({ notification: data })
})

router.delete('/:id', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('notifications')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id')
    .maybeSingle()
  if (error) return res.status(400).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Notification not found.' })
  res.json({ ok: true })
})

export default router
