import { departmentCodeFor } from './accessControl.js'

export async function writeComplaintEvent(supabase, user, complaintId, {
  eventType,
  title,
  message = null,
  customerVisible = true,
  metadata = {},
} = {}) {
  if (!complaintId || !eventType || !title || !user?.id) return null
  const payload = {
    complaint_id: complaintId,
    event_type: eventType,
    title,
    message: message || null,
    actor_id: user.id,
    actor_name: user.full_name || user.email || 'MRWD User',
    department_code: departmentCodeFor(user) || (user.role === 'maintenance_personnel' ? 'ECMD' : null),
    customer_visible: customerVisible !== false,
    metadata: metadata || {},
  }
  const { data, error } = await supabase.from('complaint_events').insert(payload).select('*').single()
  if (error) {
    // Compatibility while the operational migration has not been applied yet.
    if (['42P01', 'PGRST205'].includes(error.code)) return null
    console.warn('[complaint-event]', error.message)
    return null
  }
  return data
}
