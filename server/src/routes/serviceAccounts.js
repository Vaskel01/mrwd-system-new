import { Router } from 'express'
import { requireAuth, requireRole, requireCapability } from '../middleware/auth.js'
import { CAPABILITIES } from '../lib/accessControl.js'

const router = Router()
router.use(requireAuth)

router.get('/directory', requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 80).replace(/[%_\\]/g, '\\$&')
  let query = req.supabase.from('customer_account_registry').select('id,account_number,registered_name,service_address,meter_number,is_active,linked_profile_id').order('account_number').limit(50)
  if (search) query = query.ilike('account_number', `%${search}%`)
  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  res.json({ accounts: data })
})

router.get('/:id/history', requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const { data: account, error } = await req.supabase.from('customer_account_registry').select('account_number').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: 'Service account not found.' })
  const [bills, complaints] = await Promise.all([
    req.supabase.from('bills').select('id,billing_period,amount_due,status,due_date').eq('account_number', account.account_number).order('due_date', { ascending: false }).limit(50),
    req.supabase.from('complaints').select('id,reference_number,status,submitted_at').eq('service_account_id', req.params.id).order('submitted_at', { ascending: false }).limit(50),
  ])
  if (bills.error || complaints.error) return res.status(400).json({ error: (bills.error || complaints.error).message })
  res.json({ bills: bills.data, complaints: complaints.data })
})

router.get('/', requireRole('customer'), async (req, res) => {
  const [accounts, requests] = await Promise.all([
    req.supabase.from('customer_account_registry').select('id,account_number,registered_name,service_address,barangay,meter_number,updated_at').eq('linked_profile_id', req.user.id).eq('is_active', true).order('account_number'),
    req.supabase.from('service_account_requests').select('*').eq('customer_id', req.user.id).order('created_at', { ascending: false }),
  ])
  const error = accounts.error || requests.error
  if (error) return res.status(400).json({ error: error.message })
  res.json({ accounts: accounts.data, requests: requests.data })
})

router.post('/requests', requireRole('customer'), async (req, res) => {
  const { data, error } = await req.supabase.rpc('request_service_account', {
    p_account_number: String(req.body?.account_number || ''), p_note: String(req.body?.note || ''),
  })
  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ id: data })
})

router.get('/review', requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  const { data, error } = await req.supabase.from('service_account_requests')
    .select('*,customer:profiles!service_account_requests_customer_id_fkey(full_name,email,phone)')
    .eq('status', 'pending').order('created_at')
  if (error) return res.status(400).json({ error: error.message })
  res.json({ requests: data })
})

router.post('/requests/:id/review', requireCapability(CAPABILITIES.COMMERCIAL_BILLING), async (req, res) => {
  if (typeof req.body?.approve !== 'boolean') return res.status(400).json({ error: 'Choose approve or reject.' })
  const { error } = await req.supabase.rpc('review_service_account', {
    p_request_id: req.params.id, p_approve: req.body.approve, p_note: String(req.body.note || ''),
  })
  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true })
})

export default router
