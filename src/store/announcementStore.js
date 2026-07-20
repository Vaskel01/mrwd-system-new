import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export const useAnnouncementStore = create((set) => ({
  announcements: [],
  loading: false,
  error: null,

  fetchAnnouncements: async () => {
    set({ loading: true, error: null })
    try {
      const { announcements } = await apiFetch('/announcements')
      set({ announcements, loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  // Admin: post a new announcement
  postAnnouncement: async (data) => {
    const { announcement } = await apiFetch('/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    set(s => ({ announcements: [announcement, ...s.announcements] }))
    return announcement
  },

  // Admin: delete an announcement
  deleteAnnouncement: async (id) => {
    await apiFetch(`/announcements/${id}`, { method: 'DELETE' })
    set(s => ({ announcements: s.announcements.filter(a => a.id !== id) }))
  },
}))
