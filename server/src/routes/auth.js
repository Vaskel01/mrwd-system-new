import { Router } from 'express'
import { supabaseAnonClient } from '../supabaseClient.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const PROFILE_FIELDS = 'id, email, full_name, role, is_active, availability_status, availability_note, availability_until'

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' })

  const client = supabaseAnonClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data?.session) return res.status(401).json({ error: 'Incorrect email or password.' })

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', data.user.id)
    .single()

  if (profileErr || !profile) return res.status(403).json({ error: 'No profile found for this account. Contact the district office.' })
  if (profile.is_active === false) {
    await client.auth.signOut()
    return res.status(403).json({ error: 'This account has been deactivated. Contact an administrator.' })
  }

  res.json({ user: profile, access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})

router.post('/signup', async (req, res) => {
  const { email, password, full_name } = req.body || {}
  if (!email || !password || !full_name) return res.status(400).json({ error: 'Full name, email, and password are required.' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' })

  const client = supabaseAnonClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  })
  if (error) return res.status(400).json({ error: error.message })
  if (!data.session) return res.status(200).json({ requiresEmailConfirmation: true })

  await client.from('profiles').upsert(
    { id: data.user.id, email, full_name, role: 'customer', is_active: true },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  const { data: profile } = await client.from('profiles').select(PROFILE_FIELDS).eq('id', data.user.id).single()
  res.status(201).json({
    user: profile || { id: data.user.id, email, full_name, role: 'customer', is_active: true },
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
})

router.post('/forgot-password', async (req, res) => {
  const { email, redirect_to } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Email is required.' })
  const client = supabaseAnonClient()
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: redirect_to || process.env.PASSWORD_RESET_REDIRECT_URL || undefined,
  })
  if (error) return res.status(400).json({ error: error.message })
  // Do not disclose whether an account exists.
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' })
})

router.post('/logout', requireAuth, async (req, res) => {
  await req.supabase.auth.signOut()
  res.json({ ok: true })
})

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }))

export default router
