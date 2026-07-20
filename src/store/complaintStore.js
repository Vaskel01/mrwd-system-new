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

  // Assign complaint to maintenance (admin only)
  assignComplaint: async (complaintId, staffId) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: staffId }),
    })
    set(s => ({
      complaints: s.complaints.map(c => (c.id === complaintId ? complaint : c)),
    }))
  },

  // Update complaint status (admin or assigned maintenance staff)
  updateStatus: async (complaintId, status) => {
    const { complaint } = await apiFetch(`/complaints/${complaintId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    set(s => ({
      complaints: s.complaints.map(c => (c.id === complaintId ? complaint : c)),
    }))
  },
}))
