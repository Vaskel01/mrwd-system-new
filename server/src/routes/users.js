import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { supabaseAnonClient } from '../supabaseClient.js'
import { writeAudit } from '../lib/activity.js'

const router = Router()
const PROFILE_FIELDS = 'id, full_name, email, role, created_at, updated_at, is_active, availability_status, availability_note, availability_until'

router.get('/me', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('profiles').select(PROFILE_FIELDS).eq('id', req.user.id).single()
  if (error) return res.status(400).json({ error: error.message })
  res.json({ user: data })
})

router.patch('/me', requireAuth, async (req, res) => {
  const { full_name, availability_status, availability_note, availability_until } = req.body || {}
  if (!full_name || full_name.trim().length < 2) return res.status(400).json({ error: 'Full name must contain at least 2 characters.' })

  const { data, error } = await req.supabase.rpc('update_my_profile', {
    p_full_name: full_name.trim(),
    p_availability_status: availability_status || null,
    p_availability_note: availability_note || null,
    p_availability_until: availability_until || null,
  })
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'profile.updated', 'profile', req.user.id, {
    availability_status: availability_status || undefined,
  })
  res.json({ user: data })
})

router.get('/maintenance-staff', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select('id, full_name, email, is_active, availability_status, availability_note, availability_until')
    .eq('role', 'maintenance_personnel')
    .order('full_name')

  if (error) return res.status(400).json({ error: error.message })
  res.json({ staff: data || [] })
})

router.get('/staff', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .in('role', ['admin', 'maintenance_personnel'])
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json({ staff: data || [] })
})

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, password, full_name, role } = req.body || {}
  if (!email || !password || !full_name || !['admin', 'maintenance_personnel'].includes(role)) {
    return res.status(400).json({ error: 'full_name, email, password, and a valid staff role are required.' })
  }
  if (password.length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters.' })

  const client = supabaseAnonClient()
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { full_name: full_name.trim() } },
  })
  if (error) return res.status(400).json({ error: error.message })
  if (!data?.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
    return res.status(400).json({ error: 'That email is already registered. Use password reset or choose another email.' })
  }

  const { data: promoted, error: promoteError } = await req.supabase.rpc('admin_promote_staff', {
    p_user_id: data.user.id,
    p_email: email.trim().toLowerCase(),
    p_full_name: full_name.trim(),
    p_role: role,
  })
  if (promoteError) return res.status(400).json({ error: promoteError.message })

  await writeAudit(req.supabase, req.user, 'staff.created', 'profile', data.user.id, { role, email: email.trim().toLowerCase() })
  res.status(201).json({ user: promoted, requiresEmailConfirmation: !data.session })
})

router.patch('/:id/active', requireAuth, requireRole('admin'), async (req, res) => {
  const { is_active } = req.body || {}
  if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be true or false.' })

  const { data, error } = await req.supabase.rpc('admin_set_staff_active', {
    p_user_id: req.params.id,
    p_is_active: is_active,
  })
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, is_active ? 'staff.activated' : 'staff.deactivated', 'profile', req.params.id)
  res.json({ user: data })
})

router.post('/:id/password-reset', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: profile, error: profileError } = await req.supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', req.params.id)
    .in('role', ['admin', 'maintenance_personnel'])
    .single()
  if (profileError || !profile) return res.status(404).json({ error: 'Staff account not found.' })

  const client = supabaseAnonClient()
  const { error } = await client.auth.resetPasswordForEmail(profile.email, {
    redirectTo: req.body?.redirect_to || process.env.PASSWORD_RESET_REDIRECT_URL || undefined,
  })
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'staff.password_reset_requested', 'profile', profile.id, { email: profile.email })
  res.json({ ok: true, message: `Password reset email sent to ${profile.email}.` })
})

export default router
