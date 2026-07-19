import { Router } from 'express'
import { supabaseAnon } from '../supabaseClient.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password })

  if (error || !data?.session) {
    return res.status(401).json({ error: 'Incorrect email or password.' })
  }

  const { data: profile, error: profileErr } = await supabaseAnon
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
