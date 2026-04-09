/**
 * Optional server-side Supabase client with service role (bypasses RLS).
 * Use only in trusted server code — never expose SUPABASE_SERVICE_ROLE_KEY to the client.
 *
 * Env: SUPABASE_URL (or same value as VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js'

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function getSupabaseAdminClient() {
  const url = (process.env.SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
