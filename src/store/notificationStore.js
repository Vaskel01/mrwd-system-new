import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export const useNotificationStore = create(set => ({
  notifications: [],
  unreadCount: 0,
  total: 0,
  page: 1,
  pageSize: 20,
  loading: false,
  error: null,

  fetchNotifications: async (page = 1) => {
    set({ loading: true, error: null })
    try {
      const result = await apiFetch(`/notifications?page=${page}&limit=20`)
      set({
        notifications: result.notifications || [],
        unreadCount: result.unread_count || 0,
        total: result.total || 0,
        page: result.page || page,
        pageSize: result.page_size || 20,
        loading: false,
      })
      return result.notifications || []
    } catch (error) {
      set({ loading: false, error: error.message })
      throw error
    }
  },

  fetchUnreadCount: async () => {
    try {
      const result = await apiFetch('/notifications?page=1&limit=1')
      set({ unreadCount: result.unread_count || 0 })
      return result.unread_count || 0
    } catch {
      // A failed background badge refresh must not disrupt the current page.
      return null
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

  dismiss: async id => {
    await apiFetch(`/notifications/${id}`, { method: 'DELETE' })
    set(state => {
      const removed = state.notifications.find(item => item.id === id)
      return {
        notifications: state.notifications.filter(item => item.id !== id),
        unreadCount: Math.max(0, state.unreadCount - (removed && !removed.read_at ? 1 : 0)),
        total: Math.max(0, state.total - 1),
      }
    })
  },

  clear: () => set({ notifications: [], unreadCount: 0, total: 0, page: 1, loading: false, error: null }),
}))
