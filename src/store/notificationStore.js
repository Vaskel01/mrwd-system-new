import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  fetchNotifications: async () => {
    set({ loading: true, error: null })
    try {
      const result = await apiFetch('/notifications')
      set({ notifications: result.notifications || [], unreadCount: result.unread_count || 0, loading: false })
      return result.notifications || []
    } catch (error) {
      set({ loading: false, error: error.message })
      throw error
    }
  },

  markRead: async id => {
    const { notification } = await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' })
    set(state => ({
      notifications: state.notifications.map(item => item.id === id ? notification : item),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(item => item.id === id)?.read_at ? 0 : 1)),
    }))
    return notification
  },

  markAllRead: async () => {
    await apiFetch('/notifications/read-all', { method: 'PATCH' })
    const now = new Date().toISOString()
    set(state => ({ notifications: state.notifications.map(item => ({ ...item, read_at: item.read_at || now })), unreadCount: 0 }))
  },

  clear: () => set({ notifications: [], unreadCount: 0, loading: false, error: null }),
}))
