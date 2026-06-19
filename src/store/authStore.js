import { create } from 'zustand'
import { MOCK_USERS } from '../mock/data'

export const useAuthStore = create((set) => ({
  user: null,
  loading: false,

  // Mock sign in — checks against MOCK_USERS
  // TODO: replace with → fetch('/api/auth/login', { method: 'POST', body: ... })
  signIn: async (email, password) => {
    set({ loading: true })
    await new Promise(r => setTimeout(r, 800)) // simulate network delay

    const found = MOCK_USERS.find(
      u => u.email === email && u.password === password
    )

    set({ loading: false })

    if (!found) throw new Error('Incorrect email or password.')

    const { password: _, ...safeUser } = found
    set({ user: safeUser })
    return safeUser
  },

  signOut: () => set({ user: null }),
}))
