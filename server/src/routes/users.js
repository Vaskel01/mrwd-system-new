import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { supabaseAnonClient } from '../supabaseClient.js'

const router = Router()

// GET /api/users/maintenance-staff — admin only, used by the Assign Task page
router.get('/maintenance-staff', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'maintenance_personnel')

  if (error) return res.status(400).json({ error: error.message })
  res.json({ staff: data })
})

// GET /api/users/staff — admin only, every admin + maintenance account,
// for the "Staff Accounts" management page
router.get('/staff', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .in('role', ['admin', 'maintenance_personnel'])
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json({ staff: data })
})

// POST /api/users — admin only, creates a new admin or maintenance account.
// Uses a fresh, throwaway Supabase client to sign the new account up —
// this briefly creates a session for the *new* user on that client, not
// the calling admin's own session (req.supabase, untouched), so the
// admin stays signed in as themselves throughout.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, password, full_name, role } = req.body || {}

  if (!email || !password || !full_name || !['admin', 'maintenance_personnel'].includes(role)) {
    return res.status(400).json({
      error: 'full_name, email, password, and a role of "admin" or "maintenance_personnel" are required.',
    })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  const client = supabaseAnonClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name, role } },
  })

  if (error) return res.status(400).json({ error: error.message })

  if (data.session) {
    await client.from('profiles').upsert(
      { id: data.user.id, email, full_name, role },
      { onConflict: 'id', ignoreDuplicates: true }
    )
  }

  res.status(201).json({
    user: { id: data.user.id, email, full_name, role },
    requiresEmailConfirmation: !data.session,
  })
})

export default router
