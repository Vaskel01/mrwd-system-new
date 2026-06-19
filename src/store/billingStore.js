import { create } from 'zustand'
import { MOCK_BILLING } from '../mock/data'

export const useBillingStore = create((set, get) => ({
  bills: [...MOCK_BILLING],

  // Get bills for a specific customer
  getMyBills: (userId) =>
    get().bills
      .filter(b => b.customer_id === userId)
      .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at)),

  // Get all bills (admin view)
  getAllBills: () => get().bills,
}))
