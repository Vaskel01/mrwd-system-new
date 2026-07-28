import { create } from 'zustand'
import { apiFetch, setToken, getToken } from '../lib/api'
import { supabase } from '../lib/supabase'

const USER_KEY = 'mrwd_user'
const REFRESH_KEY = 'mrwd_refresh_token'

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// On a page refresh, re-establish the session on the local supabase-js
// client (used directly, only for Storage photo uploads) from whatever
// tokens we had saved. Fire-and-forget: the Express API calls already
// work immediately via the access token in localStorage regardless of
// this resolving, so this only needs to be ready before the customer
// tries to attach a photo.
const storedAccessToken = getToken()
const storedRefreshToken = localStorage.getItem(REFRESH_KEY)
if (storedAccessToken && storedRefreshToken) {
  supabase.auth.setSession({
    access_token: storedAccessToken,
    refresh_token: storedRefreshToken,
  })
}

async function applySession(set, user, access_token, refresh_token) {
  // Keep the local supabase-js client's session in sync so direct
  // Storage uploads (photo attachments) are authenticated as this
  // user too, not just calls to the Express API.
  await supabase.auth.setSession({ access_token, refresh_token })

  setToken(access_token)
  localStorage.setItem(REFRESH_KEY, refresh_token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  set({ user, loading: false })
}

export const useAuthStore = create((set) => ({
  // Restored synchronously so a page refresh doesn't bounce a signed-in
  // user back to /login before the app has a chance to render.
  user: storedAccessToken ? loadStoredUser() : null,
  loading: false,

  signIn: async (email, password) => {
    set({ loading: true })
    try {
      const { user, access_token, refresh_token } = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      await applySession(set, user, access_token, refresh_token)
      return user
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  // Customer self-registration. Returns { user } and signs the person
  // in immediately if the Supabase project doesn't require email
  // confirmation, or { requiresEmailConfirmation: true } if it does.
  signUp: async (fullName, email, password) => {
    set({ loading: true })
    try {
      const result = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ full_name: fullName, email, password }),
      })

      if (result.requiresEmailConfirmation) {
        set({ loading: false })
        return result
      }

      await applySession(set, result.user, result.access_token, result.refresh_token)
      return result
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  requestPasswordReset: async email => {
    return apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        email,
        redirect_to: `${window.location.origin}/reset-password`,
      }),
    })
  },

  updatePassword: async password => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    return true
  },

  updateStoredUser: user => {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ user })
  },

  signOut: () => {
    supabase.auth.signOut()
    setToken(null)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    set({ user: null })
  },
}))



// Keep the API bearer token synchronized when Supabase refreshes an
// authenticated session in the background. Without this, API calls would
// begin failing after the original access token expires.
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.access_token) {
    setToken(session.access_token)
    if (session.refresh_token) localStorage.setItem(REFRESH_KEY, session.refresh_token)
    return
  }
  if (event === 'SIGNED_OUT') {
    setToken(null)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    useAuthStore.setState({ user: null, loading: false })
  }
})
