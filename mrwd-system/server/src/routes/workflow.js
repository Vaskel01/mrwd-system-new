import { Router } from 'express'
import { requireAuth, requireCapability } from '../middleware/auth.js'
import { CAPABILITIES, departmentCodeFor, hasCapability } from '../lib/accessControl.js'
import { writeAudit } from '../lib/activity.js'
import { writeComplaintEvent } from '../lib/complaintEvents.js'

const router = Router()

function operational(req) {
  return hasCapability(req.user, CAPABILITIES.COMMERCIAL_COMPLAINTS)
    || hasCapability(req.user, CAPABILITIES.ECMD_DISPATCH)
    || hasCapability(req.user, CAPABILITIES.ECMD_OPERATIONS)
}

function requireOperational(req, res, next) {
  if (!operational(req)) return res.status(403).json({ error: 'This function is restricted to Commercial Services or ECMD.' })
  next()
}

async function complaintExists(supabase, id) {
  const { data } = await supabase.from('complaints').select('id, resident_id, reference_number, category_id, address_text, status').eq('id', id).maybeSingle()
  return data
}

router.get('/reason-codes', requireAuth, requireOperational, async (req, res) => {
  const { data, error } = await req.supabase.from('complaint_reason_codes').select('*').eq('is_active', true).order('action_type').order('sort_order')
  if (error) return res.status(400).json({ error: error.message })
  res.json({ reason_codes: data || [] })
})

router.get('/complaints/:id/context', requireAuth, requireOperational, async (req, res) => {
  const complaint = await complaintExists(req.supabase, req.params.id)
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' })

  const [notes, contacts, relationsLeft, relationsRight, memberships] = await Promise.all([
    req.supabase.from('complaint_internal_notes').select('*, author:profiles!complaint_internal_notes_author_id_fkey(id, full_name)').eq('complaint_id', complaint.id).order('created_at', { ascending: false }),
    req.supabase.from('customer_contact_log').select('*, staff:profiles!customer_contact_log_staff_id_fkey(id, full_name)').eq('complaint_id', complaint.id).order('created_at', { ascending: false }),
    req.supabase.from('complaint_relations').select('*').eq('complaint_id', complaint.id),
    req.supabase.from('complaint_relations').select('*').eq('related_complaint_id', complaint.id),
    req.supabase.from('complaint_incident_members').select('incident_id, incident:complaint_incidents(*)').eq('complaint_id', complaint.id),
  ])
  const error = notes.error || contacts.error || relationsLeft.error || relationsRight.error || memberships.error
  if (error) return res.status(400).json({ error: error.message })

  const relations = [...(relationsLeft.data || []), ...(relationsRight.data || [])]
  const relatedIds = [...new Set(relations.map(r => r.complaint_id === complaint.id ? r.related_complaint_id : r.complaint_id))]
  let related = []
  if (relatedIds.length) {
    const { data } = await req.supabase.from('complaints').select('id, reference_number, description, address_text, status, priority, submitted_at').in('id', relatedIds)
    related = data || []
  }
  res.json({
    notes: notes.data || [],
    contacts: contacts.data || [],
    relations,
    related,
    incidents: (memberships.data || []).map(item => item.incident).filter(Boolean),
  })
})

router.post('/complaints/:id/notes', requireAuth, requireOperational, async (req, res) => {
  const note = String(req.body?.note || '').trim()
  if (note.length < 2) return res.status(400).json({ error: 'Internal note is required.' })
  const departmentCode = departmentCodeFor(req.user)
  if (!['COMMERCIAL', 'ECMD'].includes(departmentCode)) return res.status(403).json({ error: 'A department account is required.' })
  const { data, error } = await req.supabase.from('complaint_internal_notes').insert({
    complaint_id: req.params.id, author_id: req.user.id, department_code: departmentCode, note,
  }).select('*').single()
  if (error) return res.status(400).json({ error: error.message })
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'internal_note', title: 'Internal note added', message: note, customerVisible: false })
  await writeAudit(req.supabase, req.user, 'complaint.internal_note_added', 'complaint', req.params.id)
  res.status(201).json({ note: data })
})

router.post('/complaints/:id/contact-log', requireAuth, requireOperational, async (req, res) => {
  const channel = String(req.body?.channel || '').trim()
  const contactType = String(req.body?.contact_type || '').trim()
  const summary = String(req.body?.summary || '').trim()
  if (!['phone','sms','email','in_system','in_person','other'].includes(channel)) return res.status(400).json({ error: 'Choose a valid communication channel.' })
  if (!['outbound','inbound','status_update','information_request','follow_up'].includes(contactType)) return res.status(400).json({ error: 'Choose a valid contact type.' })
  if (summary.length < 2) return res.status(400).json({ error: 'Communication summary is required.' })
  const departmentCode = departmentCodeFor(req.user)
  const { data, error } = await req.supabase.from('customer_contact_log').insert({
    complaint_id: req.params.id, staff_id: req.user.id, department_code: departmentCode, channel, contact_type: contactType, summary,
  }).select('*').single()
  if (error) return res.status(400).json({ error: error.message })
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'customer_contact', title: 'Customer communication recorded', message: summary, customerVisible: false, metadata: { channel, contact_type: contactType } })
  await writeAudit(req.supabase, req.user, 'complaint.customer_contact_logged', 'complaint', req.params.id, { channel, contact_type: contactType })
  res.status(201).json({ contact: data })
})

router.post('/complaints/:id/relations', requireAuth, requireOperational, async (req, res) => {
  const relatedId = String(req.body?.related_complaint_id || '')
  const relationType = String(req.body?.relation_type || 'related')
  const reason = String(req.body?.reason || '').trim()
  if (!relatedId || relatedId === req.params.id) return res.status(400).json({ error: 'Choose a different related complaint.' })
  if (!['possible_duplicate','duplicate','related','same_incident'].includes(relationType)) return res.status(400).json({ error: 'Invalid relationship type.' })
  const { data, error } = await req.supabase.from('complaint_relations').insert({
    complaint_id: req.params.id, related_complaint_id: relatedId, relation_type: relationType, reason: reason || null, created_by: req.user.id,
  }).select('*').single()
  if (error) return res.status(400).json({ error: error.code === '23505' ? 'These complaints are already linked with that relationship.' : error.message })
  await writeComplaintEvent(req.supabase, req.user, req.params.id, { eventType: 'complaint_linked', title: relationType === 'duplicate' ? 'Duplicate complaint linked' : 'Related complaint linked', message: reason || null, customerVisible: false, metadata: { related_complaint_id: relatedId, relation_type: relationType } })
  await writeAudit(req.supabase, req.user, 'complaint.related', 'complaint', req.params.id, { related_complaint_id: relatedId, relation_type: relationType })
  res.status(201).json({ relation: data })
})

router.get('/incidents', requireAuth, requireOperational, async (req, res) => {
  const { data, error } = await req.supabase.from('complaint_incidents').select('*, members:complaint_incident_members(complaint_id)').order('created_at', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  res.json({ incidents: data || [] })
})

router.post('/incidents', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const title = String(req.body?.title || '').trim()
  const complaintIds = Array.isArray(req.body?.complaint_ids) ? [...new Set(req.body.complaint_ids.filter(Boolean))] : []
  if (title.length < 3) return res.status(400).json({ error: 'Incident title must contain at least 3 characters.' })
  const { data: incident, error } = await req.supabase.from('complaint_incidents').insert({
    title,
    description: String(req.body?.description || '').trim() || null,
    location_text: String(req.body?.location_text || '').trim() || null,
    category_id: req.body?.category_id || null,
    created_by: req.user.id,
  }).select('*').single()
  if (error) return res.status(400).json({ error: error.message })
  if (complaintIds.length) {
    const { error: memberError } = await req.supabase.from('complaint_incident_members').insert(complaintIds.map(complaintId => ({ incident_id: incident.id, complaint_id: complaintId, added_by: req.user.id })))
    if (memberError) return res.status(400).json({ error: memberError.message })
    for (const complaintId of complaintIds) {
      await writeComplaintEvent(req.supabase, req.user, complaintId, { eventType: 'incident_grouped', title: 'Complaint grouped into operational incident', message: title, customerVisible: true, metadata: { incident_id: incident.id } })
    }
  }
  await writeAudit(req.supabase, req.user, 'incident.created', 'complaint_incident', incident.id, { complaint_ids: complaintIds })
  res.status(201).json({ incident })
})

router.post('/incidents/:id/members', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const complaintId = String(req.body?.complaint_id || '')
  if (!complaintId) return res.status(400).json({ error: 'complaint_id is required.' })
  const { error } = await req.supabase.from('complaint_incident_members').insert({ incident_id: req.params.id, complaint_id: complaintId, added_by: req.user.id })
  if (error) return res.status(400).json({ error: error.code === '23505' ? 'Complaint is already part of this incident.' : error.message })
  const { data: incident } = await req.supabase.from('complaint_incidents').select('title').eq('id', req.params.id).maybeSingle()
  await writeComplaintEvent(req.supabase, req.user, complaintId, { eventType: 'incident_grouped', title: 'Complaint grouped into operational incident', message: incident?.title || null, customerVisible: true, metadata: { incident_id: req.params.id } })
  res.status(201).json({ ok: true })
})

router.patch('/incidents/:id', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const status = String(req.body?.status || '')
  if (!['active','monitoring','resolved'].includes(status)) return res.status(400).json({ error: 'Invalid incident status.' })
  const update = { status, updated_at: new Date().toISOString() }
  if (status === 'resolved') Object.assign(update, { resolved_at: new Date().toISOString(), resolved_by: req.user.id })
  const { data, error } = await req.supabase.from('complaint_incidents').update(update).eq('id', req.params.id).select('*').single()
  if (error) return res.status(400).json({ error: error.message })
  await writeAudit(req.supabase, req.user, 'incident.status_changed', 'complaint_incident', req.params.id, { status })
  res.json({ incident: data })
})

router.get('/ecmd/workload', requireAuth, requireCapability(CAPABILITIES.ECMD_OPERATIONS), async (req, res) => {
  const [staffResult, tasksResult] = await Promise.all([
    req.supabase.from('profiles').select('id, full_name, availability_status, availability_note, is_active, staff_position').eq('role', 'maintenance_personnel').eq('is_active', true).order('full_name'),
    req.supabase.from('maintenance_tasks').select('id, assigned_staff_id, complaint_id, status, created_at, completed_at').eq('is_active', true),
  ])
  const error = staffResult.error || tasksResult.error
  if (error) return res.status(400).json({ error: error.message })
  const activeStatuses = new Set(['assigned','en_route','in_progress','blocked'])
  const workload = (staffResult.data || []).map(person => {
    const tasks = (tasksResult.data || []).filter(task => task.assigned_staff_id === person.id)
    return {
      ...person,
      active_tasks: tasks.filter(task => activeStatuses.has(task.status)).length,
      blocked_tasks: tasks.filter(task => task.status === 'blocked').length,
      current_complaint_ids: tasks.filter(task => activeStatuses.has(task.status)).map(task => task.complaint_id),
    }
  })
  res.json({ workload })
})

export default router
