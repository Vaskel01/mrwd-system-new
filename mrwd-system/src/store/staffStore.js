import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export const useStaffStore = create((set, get) => ({
  staff: [],
  loading: false,
  error: null,

  fetchStaff: async () => {
    set({ loading: true, error: null })
    try {
      const { staff } = await apiFetch('/users/staff')
      set({ staff, loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  // Admin: create a new admin or maintenance account
  createStaff: async (data) => {
    const result = await apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    await get().fetchStaff()
    return result
  },

  setStaffActive: async (id, isActive) => {
    const { user } = await apiFetch(`/users/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    })
    set(state => ({ staff: state.staff.map(item => item.id === id ? { ...item, ...user } : item) }))
    return user
  },

  sendPasswordReset: async id => {
    return apiFetch(`/users/${id}/password-reset`, {
      method: 'POST',
      body: JSON.stringify({ redirect_to: `${window.location.origin}/reset-password` }),
    })
  },
}))
