import { supabaseForToken } from '../supabaseClient.js'
import { hasCapability } from '../lib/accessControl.js'

/** Verifies the Bearer token, loads the profile, and applies RLS as that user. */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) return res.status(401).json({ error: 'Missing Authorization header.' })

  const supabase = supabaseForToken(token)
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' })
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role, is_active, availability_status, availability_note, availability_until, department_id, staff_position, supervisor_id, account_validation_status, email_notifications_enabled, sms_notifications_enabled, department:departments(id, code, name)')
    .eq('id', userData.user.id)
    .single()

  if (profileErr || !profile) return res.status(403).json({ error: 'No profile found for this account.' })
  if (profile.is_active === false) {
    return res.status(403).json({ error: 'This account has been deactivated. Contact a System Supervisor.' })
  }

  req.user = profile
  req.supabase = supabase
  next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' })
    }
    next()
  }
}

export function requireCapability(...capabilities) {
  return (req, res, next) => {
    if (!req.user || !hasCapability(req.user, ...capabilities)) {
      return res.status(403).json({ error: 'This function is restricted to the responsible MRWD department.' })
    }
    next()
  }
}
