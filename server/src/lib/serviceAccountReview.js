import { hasCapability, CAPABILITIES } from './accessControl.js'

// This explicit server-side projection is limited to pending requests already
// selected through the reviewer's RLS-scoped client. It is not a profile search.
export async function attachRequesterContacts({ user, requests, admin }) {
  if (!hasCapability(user, CAPABILITIES.COMMERCIAL_BILLING)) throw new Error('Commercial billing access required.')
  const pending = requests.filter(request => request.status === 'pending')
  const ids = [...new Set(pending.map(request => request.customer_id).filter(Boolean))]
  if (!ids.length) return []
  if (!admin) throw new Error('Account requester lookup is temporarily unavailable.')
  const { data, error } = await admin.from('profiles').select('id,full_name,email,phone').in('id', ids).eq('role', 'customer')
  if (error) throw new Error('Account requester lookup is temporarily unavailable.')
  const contacts = new Map((data || []).map(profile => [profile.id, {
    full_name: profile.full_name, email: profile.email, phone: profile.phone,
  }]))
  return pending.map(request => ({ ...request, customer: contacts.get(request.customer_id) || null }))
}
