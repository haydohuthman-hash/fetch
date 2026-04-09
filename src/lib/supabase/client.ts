import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

/**
 * Browser Supabase client for the Vite SPA.
 *
 * Env (in `.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (use the project’s
 * anon / publishable public key from the Supabase dashboard — never the service_role key).
 *
 * Session refresh: there is no Next.js middleware in this app. After sign-in, the client
 * refreshes tokens automatically; optionally subscribe with
 * `client.auth.onAuthStateChange(...)` near the app root if you need global auth UI updates.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    cached = null
    return null
  }
  cached = createClient(url, key)
  return cached
}

export function requireSupabaseBrowserClient(): SupabaseClient {
  const c = getSupabaseBrowserClient()
  if (!c) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.',
    )
  }
  return c
}
