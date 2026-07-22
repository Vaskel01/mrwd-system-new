import { create } from 'zustand'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'

// Uploads a photo File directly to Supabase Storage (bucket:
// complaint-photos) using the signed-in user's own session, so
// Storage's Row Level Security policy — which only allows a user to
// write under a folder named after their own user id — is satisfied.
// Returns the public URL, or null if no photo was attached.
async function uploadPhoto(file, userId) {
  if (!file) return null

  const ext = file.name.split('.').pop()
  const path = `${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from('complaint-photos').upload(path, file)
  if (error) throw new Error(`Photo upload failed: ${error.message}`)

  const { data } = supabase.storage.from('complaint-photos').getPublicUrl(path)
  return data.publicUrl
}

export const useComplaintStore = create((set, get) => ({
  complaints: [],
  loading: false,
  error: null,

  // Fetch complaints visible to the signed-in user (RLS on the backend
  // already scopes this to "mine" for customers, "assigned to me" for
  // maintenance, and "everything" for admins).
  fetchComplaints: async () => {
    set({ loading: true, error: null })
    try {
      const { complaints } = await apiFetch('/complaints')
      set({ complaints, loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  // Get complaints for a specific customer (derived filter over
  // whatever fetchComplaints already loaded).
  getMyComplaints: (userId) =>
    get().complaints.filter(c => c.customer_id === userId),

  // Submit a new complaint. Uploads the photo (if any) to Supabase
  // Storage first, then sends the resulting URL to the backend, which
  // computes the authoritative priority score and stores the record.
  submitComplaint: async (formData, userId) => {
    const photo_url = await uploadPhoto(formData.photo, userId)

    const { complaint } = await apiFetch('/complaints', {
      method: 'POST',
      body: JSON.stringify({
        complaint_type: formData.complaint_type,
        description: formData.description,
        address: formData.address,
        gps: formData.gps || null,
        photo_url,
      }),
    })

    set(s => ({ complaints: [complaint, ...s.complaints] }))
    return complaint
  },

  // Assign complaint to maintenance (admin only). notes is optional —
  // instructions for the crew, shown on their task and logged to the timeline.
  assignComplaint: async (complaintId, staffId, notes) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: staffId, notes: notes || undefined }),
    })
    set(s => ({
      complaints: s.complaints.map(c => (c.id === complaintId ? complaint : c)),
    }))
  },

  // Update complaint status (admin or assigned maintenance staff).
  // Valid values: pending, assigned, en_route, in_progress, completed, rejected.
  updateStatus: async (complaintId, status) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    set(s => ({
      complaints: s.complaints.map(c => (c.id === complaintId ? complaint : c)),
    }))
  },

  // Bulk-assign several complaints to one crew member at once (admin only)
  bulkAssign: async (complaintIds, staffId, notes) => {
    const result = await apiFetch('/complaints/bulk-assign', {
      method: 'POST',
      body: JSON.stringify({ complaint_ids: complaintIds, assigned_to: staffId, notes: notes || undefined }),
    })
    await get().fetchComplaints()
    return result
  },

  // Bulk status change across several complaints at once (admin only,
  // e.g. bulk-reject a batch of duplicate/invalid reports)
  bulkStatus: async (complaintIds, status) => {
    const result = await apiFetch('/complaints/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ complaint_ids: complaintIds, status }),
    })
    await get().fetchComplaints()
    return result
  },

  // Post a free-text note to a task's timeline without changing status
  // (admin or the assigned maintenance staff)
  postComment: async (complaintId, message) => {
    const { update } = await apiFetch(`/complaints/${complaintId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
    return update
  },

  // Fetch the timeline for a complaint — visible to the resident who
  // filed it, the assigned staff, or an admin
  fetchUpdates: async (complaintId) => {
    const { updates } = await apiFetch(`/complaints/${complaintId}/updates`)
    return updates
  },

  // Customer: submit a 1-5 star rating + optional comment, only once
  // the complaint is completed
  submitFeedback: async (complaintId, rating, comment) => {
    const { feedback } = await apiFetch(`/complaints/${complaintId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment: comment || undefined }),
    })
    return feedback
  },

  // Fetch existing feedback for a complaint, if any
  fetchFeedback: async (complaintId) => {
    const { feedback } = await apiFetch(`/complaints/${complaintId}/feedback`)
    return feedback
  },
}))
