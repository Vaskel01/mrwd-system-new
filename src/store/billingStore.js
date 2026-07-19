import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export const useBillingStore = create((set, get) => ({
  bills: [],
  loading: false,

  // RLS scopes this to "my bills" for customers, "everyone's" for admins.
  fetchBills: async () => {
    set({ loading: true })
    try {
      const { bills } = await apiFetch('/billing')
      set({ bills, loading: false })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  getMyBills: (userId) =>
    get().bills
      .filter(b => b.customer_id === userId)
      .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at)),

  getAllBills: () => get().bills,
}))
