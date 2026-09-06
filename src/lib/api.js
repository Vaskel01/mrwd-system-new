// Thin fetch wrapper for the Express backend (server/). Attaches the
// signed-in user's Supabase access token so the backend can identify
// them and enforce Row Level Security on their behalf.

import { readApiResponse } from './apiResponse.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const TOKEN_KEY = 'mrwd_access_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  let res
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Connection interrupted. Your change may not have been saved. Check your connection and refresh to confirm before trying again.', { cause: error })
  }
  return readApiResponse(res)
}
