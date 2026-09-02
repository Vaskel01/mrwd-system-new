import { create } from 'zustand'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'

// Uploads a photo File directly to Supabase Storage (bucket:
// complaint-photos) using the signed-in user's own session, so
// Storage's Row Level Security policy — which only allows a user to
// write under a folder named after their own user id — is satisfied.
// Returns the public URL, or null if no photo was attached.
export async function uploadComplaintPhoto(file, userId, folder = '') {
  if (!file) return null

  const ext = file.name.split('.').pop()
  const nested = folder ? `${folder.replace(/^\/+|\/+$/g, '')}/` : ''
  const path = `${userId}/${nested}${Date.now()}.${ext}`

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
    const photo_url = await uploadComplaintPhoto(formData.photo, userId)

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

  // Customer: edit a pending complaint before it is assigned.
  editComplaint: async (complaintId, data) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    set(state => ({ complaints: state.complaints.map(item => item.id === complaintId ? complaint : item) }))
    return complaint
  },

  cancelComplaint: async (complaintId, reason = '') => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    })
    set(state => ({ complaints: state.complaints.map(item => item.id === complaintId ? complaint : item) }))
    return complaint
  },

  reopenComplaint: async (complaintId, reason) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/reopen`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    })
    set(state => ({ complaints: state.complaints.map(item => item.id === complaintId ? complaint : item) }))
    return complaint
  },


  // Assign complaint to maintenance (admin only). notes is optional —
  // instructions for Maintenance Personnel, shown on the task and timeline.
  assignComplaint: async (complaintId, staffId, notes, crewId = '', reasonCode = '') => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: staffId, notes: notes || undefined, crew_id: crewId || undefined, reason_code: reasonCode || undefined }),
    })
    set(s => ({
      complaints: s.complaints.map(c => (c.id === complaintId ? complaint : c)),
    }))
  },

  overridePriority: async (complaintId, { score, priority, reason, resetToAlgorithm = false }) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({
        score: resetToAlgorithm ? undefined : score,
        priority: resetToAlgorithm ? undefined : priority,
        reason,
        reset_to_algorithm: resetToAlgorithm,
      }),
    })
    set(state => ({ complaints: state.complaints.map(item => item.id === complaintId ? complaint : item) }))
    return complaint
  },

  // Update complaint status (admin or assigned maintenance staff).
  // Rejections require an admin-provided reason that is shown to the customer.
  updateStatus: async (complaintId, status, rejectionReason = '') => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejection_reason: rejectionReason || undefined }),
    })
    set(s => ({
      complaints: s.complaints.map(c => (c.id === complaintId ? complaint : c)),
    }))
    return complaint
  },

  // Fetch a single complaint for the shared details screen.
  fetchComplaint: async (complaintId) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}`)
    set(s => {
      const exists = s.complaints.some(c => c.id === complaintId)
      return { complaints: exists
        ? s.complaints.map(c => (c.id === complaintId ? complaint : c))
        : [complaint, ...s.complaints] }
    })
    return complaint
  },

  // Admin-only batch reclassification for complaints created before
  // the dataset-backed classifier was installed.
  reclassifyAllComplaints: async () => {
    const result = await apiFetch('/complaints/reclassify-all', { method: 'POST' })
    await get().fetchComplaints()
    return result
  },

  // Admin-only undo for a rejected complaint.
  restoreComplaint: async (complaintId) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/restore`, {
      method: 'PATCH',
    })
    set(s => ({
      complaints: s.complaints.map(c => (c.id === complaintId ? complaint : c)),
    }))
    return complaint
  },

  // Bulk-assign several complaints to one Maintenance Personnel account.
  bulkAssign: async (complaintIds, staffId, notes, crewId = '') => {
    const result = await apiFetch('/complaints/bulk-assign', {
      method: 'POST',
      body: JSON.stringify({ complaint_ids: complaintIds, assigned_to: staffId, notes: notes || undefined, crew_id: crewId || undefined }),
    })
    await get().fetchComplaints()
    return result
  },

  // Bulk status change across several complaints at once (admin only,
  // e.g. bulk-reject a batch of duplicate or invalid complaints)
  bulkStatus: async (complaintIds, status, rejectionReason = '') => {
    const result = await apiFetch('/complaints/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ complaint_ids: complaintIds, status, rejection_reason: rejectionReason || undefined }),
    })
    await get().fetchComplaints()
    return result
  },


  updateTaskPlan: async (complaintId, data) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/task/plan`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
    set(state => ({ complaints: state.complaints.map(item => item.id === complaintId ? complaint : item) }))
    return complaint
  },

  completeTask: async (complaintId, data, userId) => {
    const completion_photo_url = data.photo
      ? await uploadComplaintPhoto(data.photo, userId, 'completion')
      : null
    const { complaint } = await apiFetch(`/complaints/${complaintId}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({
        completion_notes: data.completion_notes,
        materials_used: data.materials_used || undefined,
        completion_photo_url: completion_photo_url || undefined,
      }),
    })
    set(state => ({ complaints: state.complaints.map(item => item.id === complaintId ? complaint : item) }))
    return complaint
  },

  reportTaskIssue: async (complaintId, kind, reason) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/task/issue`, {
      method: 'POST', body: JSON.stringify({ kind, reason }),
    })
    set(state => ({ complaints: state.complaints.map(item => item.id === complaintId ? complaint : item) }))
    return complaint
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

  // Fetch the timeline for a complaint — visible to the customer who
  // filed it, the assigned staff, or an admin
  fetchUpdates: async (complaintId) => {
    const { updates } = await apiFetch(`/complaints/${complaintId}/updates`)
    return updates
  },

  // Customer: submit a 1-5 star rating + optional comment, only once
  // the complaint is resolved
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
