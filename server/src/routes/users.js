import { Router } from 'express'
import { requireAuth, requireCapability } from '../middleware/auth.js'
import { CAPABILITIES } from '../lib/accessControl.js'
import { supabaseAnonClient } from '../supabaseClient.js'
import { writeAudit } from '../lib/activity.js'
import { customerProfileMatches, normalizeCustomerProfileInput } from '../lib/profileUpdate.js'

const router = Router()
const PROFILE_FIELDS = 'id, full_name, email, role, created_at, updated_at, is_active, account_number, phone, service_address, barangay, availability_status, availability_note, availability_until, department_id, staff_position, supervisor_id, account_validation_status, account_validated_at, email_notifications_enabled, sms_notifications_enabled, department:departments(id, code, name)'

router.get('/me', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('profiles').select(PROFILE_FIELDS).eq('id', req.user.id).single()
  if (error) return res.status(400).json({ error: error.message })
  res.json({ user: data })
})

router.patch('/me', requireAuth, async (req, res) => {
  const {
    full_name,
    account_number,
    phone,
    service_address,
    barangay,
    availability_status,
    availability_note,
    availability_until,
  } = req.body || {}
  if (!full_name || full_name.trim().length < 2) return res.status(400).json({ error: 'Full name must contain at least 2 characters.' })

  let expectedCustomerProfile = null
  let rpcName = 'update_my_profile'
  let rpcArguments = {
    p_full_name: full_name.trim(),
    p_availability_status: availability_status || null,
    p_availability_note: availability_note || null,
    p_availability_until: availability_until || null,
  }

  if (req.user.role === 'customer') {
    try {
      expectedCustomerProfile = normalizeCustomerProfileInput({
        account_number,
        phone,
        service_address,
        barangay,
      })
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message })
    }
    rpcName = 'update_my_customer_profile'
    rpcArguments = {
      p_full_name: full_name.trim(),
      p_account_number: expectedCustomerProfile.account_number,
      p_phone: expectedCustomerProfile.phone,
      p_service_address: expectedCustomerProfile.service_address,
      p_barangay: expectedCustomerProfile.barangay,
    }

    const { data: validation, error: validationError } = await req.supabase.rpc('validate_my_customer_account', {
      p_account_number: expectedCustomerProfile.account_number,
    })
    if (validationError) return res.status(400).json({ error: validationError.message })
    if (validation?.status === 'mismatch') {
      return res.status(400).json({ error: validation.message, account_validation: validation })
    }
  }

  const { error } = await req.supabase.rpc(rpcName, rpcArguments)
  if (error) {
    const message = error.code === '23505'
      ? 'That account number is already assigned to another customer.'
      : error.message
    return res.status(400).json({ error: message })
  }

  const { data: storedUser, error: readError } = await req.supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', req.user.id)
    .single()
  if (readError || !storedUser) {
    return res.status(500).json({ error: readError?.message || 'The saved profile could not be verified.' })
  }
  if (expectedCustomerProfile && !customerProfileMatches(storedUser, expectedCustomerProfile)) {
    return res.status(500).json({ error: 'The customer information was not saved completely. Please try again.' })
  }

  await writeAudit(req.supabase, req.user, 'profile.updated', 'profile', req.user.id, {
    customer_contact_updated: req.user.role === 'customer',
    availability_status: availability_status || undefined,
  })
  res.json({ user: storedUser })
})

router.patch('/me/notification-preferences', requireAuth, async (req, res) => {
  const { email_enabled, sms_enabled } = req.body || {}
  if (typeof email_enabled !== 'boolean' || typeof sms_enabled !== 'boolean') {
    return res.status(400).json({ error: 'Email and SMS preferences must be true or false.' })
  }
  if (sms_enabled && !req.user.phone) {
    return res.status(400).json({ error: 'Add a phone number before enabling SMS notifications.' })
  }
  const { data, error } = await req.supabase.rpc('update_my_notification_preferences', {
    p_email: email_enabled,
    p_sms: sms_enabled,
  })
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'profile.notification_preferences_updated', 'profile', req.user.id, { email_enabled, sms_enabled })
  res.json({ user: data })
})

router.get('/maintenance-staff', requireAuth, requireCapability(CAPABILITIES.ECMD_DISPATCH), async (req, res) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [staffResult, scheduleResult] = await Promise.all([
    req.supabase
      .from('profiles')
      .select('id, full_name, email, is_active, availability_status, availability_note, availability_until, department_id, staff_position, supervisor_id')
      .eq('role', 'maintenance_personnel')
      .order('full_name'),
    req.supabase.from('staff_schedules').select('staff_id, starts_at, ends_at, shift_status, notes').eq('shift_date', today),
  ])

  const error = staffResult.error || scheduleResult.error
  if (error) return res.status(400).json({ error: error.message })
  const scheduleMap = Object.fromEntries((scheduleResult.data || []).map(item => [item.staff_id, item]))
  const staff = (staffResult.data || []).map(person => {
    const schedule = scheduleMap[person.id] || null
    const scheduledStatus = schedule?.shift_status === 'scheduled' ? 'available' : schedule?.shift_status
    const effectiveStatus = person.availability_status && person.availability_status !== 'available'
      ? person.availability_status
      : scheduledStatus || person.availability_status || 'available'
    return { ...person, schedule, availability_status: effectiveStatus }
  })
  res.json({ staff })
})

router.get('/staff', requireAuth, requireCapability(CAPABILITIES.SYSTEM_STAFF), async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .in('role', ['admin', 'maintenance_personnel'])
    .order('created_at', { ascending: false })

  if (error) return res.status(400).json({ error: error.message })
  res.json({ staff: data || [] })
})

router.post('/', requireAuth, requireCapability(CAPABILITIES.SYSTEM_STAFF), async (req, res) => {
  const { email, password, full_name, role, department_id, staff_position, supervisor_id } = req.body || {}
  if (!email || !password || !full_name || !['admin', 'maintenance_personnel'].includes(role)) {
    return res.status(400).json({ error: 'full_name, email, password, and a valid staff role are required.' })
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ error: 'Temporary password must use at least 8 characters with at least one letter and one number.' })
  }

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

  if (department_id || staff_position || supervisor_id) {
    const { error: assignmentError } = await req.supabase.rpc('admin_update_staff_assignment', {
      p_staff_id: data.user.id,
      p_department_id: department_id || null,
      p_staff_position: staff_position || null,
      p_supervisor_id: supervisor_id || null,
    })
    if (assignmentError) return res.status(400).json({ error: assignmentError.message })
  }

  await writeAudit(req.supabase, req.user, 'staff.created', 'profile', data.user.id, { role, email: email.trim().toLowerCase() })
  const { data: finalProfile } = await req.supabase.from('profiles').select(PROFILE_FIELDS).eq('id', data.user.id).single()
  res.status(201).json({ user: finalProfile || promoted, requiresEmailConfirmation: !data.session })
})

router.patch('/:id/active', requireAuth, requireCapability(CAPABILITIES.SYSTEM_STAFF), async (req, res) => {
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

router.post('/:id/password-reset', requireAuth, requireCapability(CAPABILITIES.SYSTEM_STAFF), async (req, res) => {
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
