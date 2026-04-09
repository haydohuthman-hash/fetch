/**
 * Supabase client that runs queries as the signed-in end user (RLS sees auth.uid()).
 * Use the publishable anon key + the user's access_token from the browser session.
 *
 * Env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (same value as VITE_SUPABASE_ANON_KEY).
 * Do not use SUPABASE_SERVICE_ROLE_KEY here — that bypasses RLS and breaks policies that expect auth.uid().
 */
import { createClient } from '@supabase/supabase-js'

function supabaseUrlFromEnv() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
}

function supabaseAnonKeyFromEnv() {
  return (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
}

/**
 * @param {string} accessToken Supabase Auth access_token (JWT)
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
/** @param {{ headers?: { authorization?: string } }} req */
export function parseBearerAccessToken(req) {
  const h = req.headers?.authorization
  if (!h || typeof h !== 'string') return ''
  const m = /^Bearer\s+(\S+)/i.exec(h.trim())
  return m ? m[1] : ''
}

export function getSupabaseClientForUserAccessToken(accessToken) {
  const url = supabaseUrlFromEnv()
  const anonKey = supabaseAnonKeyFromEnv()
  const token = String(accessToken || '').trim()
  if (!url || !anonKey || !token) return null
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
