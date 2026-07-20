import { Router } from 'express'
import { supabaseAnonClient } from '../supabaseClient.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  const client = supabaseAnonClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error || !data?.session) {
    return res.status(401).json({ error: 'Incorrect email or password.' })
  }

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', data.user.id)
    .single()

  if (profileErr || !profile) {
    return res.status(403).json({ error: 'No profile found for this account. Contact the district office.' })
  }

  res.json({
    user: profile,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
})

// POST /api/auth/signup — public customer self-registration only.
// Role is always hard-coded to 'customer' here, regardless of what's
// sent in the request body — this endpoint has no auth check, so
// trusting a client-supplied role would let anyone register as admin.
// Staff accounts (admin/maintenance) are created separately, by an
// already-signed-in admin — see POST /api/users.
router.post('/signup', async (req, res) => {
  const { email, password, full_name } = req.body || {}
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  const client = supabaseAnonClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name, role: 'customer' } },
  })

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  // If your Supabase project requires email confirmation, signUp
  // succeeds but returns no session yet — there's no token to act
  // with, so we rely entirely on the database trigger (see
  // supabase/enable-signup.sql) to create the profile row once the
  // account exists. The frontend should show a "check your email" state.
  if (!data.session) {
    return res.status(200).json({ requiresEmailConfirmation: true })
  }

  // Auto-confirm is enabled on this project, so we already have a
  // session for the brand-new user. Make sure their profile row
  // exists — belt-and-suspenders alongside the DB trigger, in case
  // that trigger isn't set up.
  await client.from('profiles').upsert(
    { id: data.user.id, email, full_name, role: 'customer' },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  const { data: profile } = await client
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', data.user.id)
    .single()

  res.status(201).json({
    user: profile || { id: data.user.id, email, full_name, role: 'customer' },
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
})

// POST /api/auth/logout — best-effort; the frontend also just discards its token
router.post('/logout', requireAuth, async (req, res) => {
  await req.supabase.auth.signOut()
  res.json({ ok: true })
})

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

export default router
