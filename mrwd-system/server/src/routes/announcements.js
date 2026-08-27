import { Router } from 'express'
import { requireAuth, requireCapability } from '../middleware/auth.js'
import { CAPABILITIES, hasCapability, isSystemSupervisor } from '../lib/accessControl.js'
import { writeAudit } from '../lib/activity.js'

const router = Router()

// GET /api/announcements — any authenticated user
router.get('/', requireAuth, async (req, res) => {
  const includeExpired = (hasCapability(req.user, CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS) || isSystemSupervisor(req.user)) && req.query.include_expired === 'true'
  let query = req.supabase
    .from('announcements')
    .select('*')
    .order('is_important', { ascending: false })
    .order('created_at', { ascending: false })

  if (!includeExpired) {
    query = query.or(`active_until.is.null,active_until.gt.${new Date().toISOString()}`)
  }

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  res.json({
    announcements: (data || []).map(item => ({
      ...item,
      is_expired: Boolean(item.active_until && new Date(item.active_until) <= new Date()),
    })),
  })
})

// POST /api/announcements — admin only
router.post('/', requireAuth, async (req, res) => {
  const commercial = hasCapability(req.user, CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS)
  const system = isSystemSupervisor(req.user)
  if (!commercial && !system) return res.status(403).json({ error: 'Announcement management is restricted to Commercial Services or the System Supervisor.' })
  const { title, content, category, is_important = false, active_until = null } = req.body || {}
  const audience = system ? String(req.body?.audience || 'all_staff') : 'customer'
  const isInternal = system ? audience !== 'customer' && audience !== 'all' : false
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
      active_until: active_until || null,
      created_by: req.user.id,
      created_by_name: req.user.full_name,
      audience,
      is_internal: isInternal,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'announcement.created', 'announcement', data.id, {
    title: data.title,
    is_important: data.is_important,
    active_until: data.active_until,
  })
  res.status(201).json({ announcement: data })
})

// PATCH /api/announcements/:id — admin only
router.patch('/:id', requireAuth, async (req, res) => {
  const commercial = hasCapability(req.user, CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS)
  const system = isSystemSupervisor(req.user)
  if (!commercial && !system) return res.status(403).json({ error: 'Announcement management is restricted to Commercial Services or the System Supervisor.' })
  const { title, content, category, is_important = false, active_until = null } = req.body || {}
  const audience = system ? String(req.body?.audience || 'all_staff') : 'customer'
  const isInternal = system ? audience !== 'customer' && audience !== 'all' : false
  if (!title || !content || !category) {
    return res.status(400).json({ error: 'title, content, and category are required.' })
  }

  const { data, error } = await req.supabase
    .from('announcements')
    .update({
      title: String(title).trim(),
      content: String(content).trim(),
      category,
      is_important: Boolean(is_important),
      active_until: active_until || null,
      audience,
      is_internal: isInternal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'announcement.updated', 'announcement', data.id, {
    title: data.title,
    category: data.category,
    is_important: data.is_important,
    active_until: data.active_until,
  })
  res.json({ announcement: { ...data, is_expired: Boolean(data.active_until && new Date(data.active_until) <= new Date()) } })
})

// PATCH /api/announcements/:id/importance — admin only
router.patch('/:id/importance', requireAuth, async (req, res) => {
  if (!hasCapability(req.user, CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS) && !isSystemSupervisor(req.user)) return res.status(403).json({ error: 'Announcement management is restricted.' })
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
router.delete('/:id', requireAuth, async (req, res) => {
  if (!hasCapability(req.user, CAPABILITIES.COMMERCIAL_ANNOUNCEMENTS) && !isSystemSupervisor(req.user)) return res.status(403).json({ error: 'Announcement management is restricted.' })
  const { error } = await req.supabase
    .from('announcements')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'announcement.deleted', 'announcement', req.params.id)
  res.json({ ok: true })
})

export default router
