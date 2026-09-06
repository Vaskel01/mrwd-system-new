import { create } from 'zustand'
import { apiFetch } from '../lib/api'
import { useAuthStore } from './authStore'

export const useBillingStore = create((set, get) => ({
  bills: [],
  ownerId: null,
  loading: false,
  error: null,

  // RLS scopes this to "my bills" for customers, "everyone's" for admins.
  fetchBills: async () => {
    const ownerId = useAuthStore.getState().user?.id
    set({ loading: true, error: null, bills: [], ownerId })
    try {
      const { bills } = await apiFetch('/billing')
      if (useAuthStore.getState().user?.id !== ownerId) return
      set({ bills, loading: false })
    } catch (err) {
      if (useAuthStore.getState().user?.id !== ownerId) return
      set({ loading: false, error: err.message })
    }
  },

  getMyBills: (userId) =>
    (get().ownerId === userId ? get().bills : [])
      .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at)),

  getAllBills: () => get().bills,
}))
