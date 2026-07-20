import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export const useStaffStore = create((set) => ({
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
    await useStaffStore.getState().fetchStaff()
    return result
  },
}))
