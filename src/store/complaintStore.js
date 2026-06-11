import { create } from 'zustand'
import { MOCK_COMPLAINTS } from '../mock/data'
import { scorePriority } from '../lib/priorityScoring'

export const useComplaintStore = create((set, get) => ({
  complaints: [...MOCK_COMPLAINTS],

  // Get complaints for a specific customer
  getMyComplaints: (userId) =>
    get().complaints.filter(c => c.customer_id === userId),

  // Submit a new complaint
  // TODO: replace with → fetch('/api/complaints', { method: 'POST', body: ... })
  submitComplaint: async (formData, userId, userName) => {
    await new Promise(r => setTimeout(r, 1000))

    const { score, priority } = scorePriority({
      complaint_type: formData.complaint_type,
      description:    formData.description,
      has_photo:      !!formData.photo,
    })

    const newComplaint = {
      id:             'c' + Date.now(),
      customer_id:    userId,
      customer_name:  userName,
      complaint_type: formData.complaint_type,
      description:    formData.description,
      address:        formData.address,
      photo_url:      formData.photo ? URL.createObjectURL(formData.photo) : null,
      status:         'pending',
      priority,
      priority_score: score,
      assigned_to:    null,
      assigned_name:  null,
      created_at:     new Date().toISOString(),
    }

    set(s => ({ complaints: [newComplaint, ...s.complaints] }))
    return newComplaint
  },

  // Assign complaint to maintenance
  // TODO: replace with → fetch(`/api/complaints/${id}/assign`, { method: 'PATCH', body: ... })
  assignComplaint: (complaintId, staffId, staffName) => {
    set(s => ({
      complaints: s.complaints.map(c =>
        c.id === complaintId
          ? { ...c, assigned_to: staffId, assigned_name: staffName, status: 'in_progress' }
          : c
      )
    }))
  },

  // Update complaint status
  // TODO: replace with → fetch(`/api/complaints/${id}/status`, { method: 'PATCH', body: ... })
  updateStatus: (complaintId, status) => {
    set(s => ({
      complaints: s.complaints.map(c =>
        c.id === complaintId ? { ...c, status } : c
      )
    }))
  },
}))
