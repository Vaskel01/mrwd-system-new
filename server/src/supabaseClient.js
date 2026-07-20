import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabaseClient] SUPABASE_URL / SUPABASE_ANON_KEY are not set. ' +
    'Copy server/.env.example to server/.env and fill in your Supabase project values.'
  )
}

// Creates a fresh, unauthenticated client — used for login/signup,
// where there's no user session yet. A new instance per call (rather
// than one shared singleton reused across requests) avoids one
// request's sign-in/sign-up mutating another concurrent request's
// in-memory auth state on a shared client instance.
export function supabaseAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Creates a client scoped to a specific user's access token, so every
// query made with it is subject to that user's Row Level Security
// policies — the backend never needs a service-role key that bypasses
// RLS. This is the client route handlers should use for all reads/writes.
export function supabaseForToken(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
