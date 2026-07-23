export async function writeAudit(supabase, user, action, entityType, entityId = null, details = {}) {
  if (!supabase || !user?.id) return
  try {
    const { error } = await supabase.from('audit_logs').insert({
      actor_id: user.id,
      actor_name: user.full_name || user.email || 'Unknown user',
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || {},
    })
    if (error) throw error
  } catch (error) {
    console.warn('[audit]', error?.message || error)
  }
}

export async function notifyUsers(supabase, user, recipients, {
  title,
  message,
  type = 'info',
  complaintId = null,
} = {}) {
  const uniqueRecipients = [...new Set((recipients || []).filter(Boolean))]
  if (!supabase || !user?.id || !uniqueRecipients.length || !title || !message) return

  try {
    const rows = uniqueRecipients.map(userId => ({
      user_id: userId,
      created_by: user.id,
      title,
      message,
      notification_type: type,
      related_complaint_id: complaintId || null,
    }))
    const { error } = await supabase.from('notifications').insert(rows)
    if (error) throw error
  } catch (error) {
    console.warn('[notifications]', error?.message || error)
  }
}

export async function getAdminIds(supabase) {
  try {
    const { data, error } = await supabase.rpc('active_admin_ids')
    if (error) throw error
    return (data || []).map(row => row.id)
  } catch (error) {
    console.warn('[admin recipients]', error?.message || error)
    return []
  }
}
