import { create } from 'zustand'
import { MOCK_ANNOUNCEMENTS } from '../mock/data'

export const useAnnouncementStore = create((set, get) => ({
  announcements: [...MOCK_ANNOUNCEMENTS],

  // Admin: post a new announcement
  // TODO: replace with → fetch('/api/announcements', { method: 'POST', body: ... })
  postAnnouncement: async (data, adminName) => {
    await new Promise(r => setTimeout(r, 700))
    const newAnnouncement = {
      id:          'a' + Date.now(),
      title:       data.title,
      content:     data.content,
      category:    data.category,
      created_by:  adminName,
      created_at:  new Date().toISOString(),
    }
    set(s => ({ announcements: [newAnnouncement, ...s.announcements] }))
    return newAnnouncement
  },

  // Admin: delete an announcement
  // TODO: replace with → fetch(`/api/announcements/${id}`, { method: 'DELETE' })
  deleteAnnouncement: (id) => {
    set(s => ({ announcements: s.announcements.filter(a => a.id !== id) }))
  },
}))
