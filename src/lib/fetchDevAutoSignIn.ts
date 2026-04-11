import { FETCH_DEV_DEMO_DEFAULT_PASSWORD } from './fetchDevDemo'
import { getSupabaseBrowserClient } from './supabase/client'

/**
 * Dev-only: sign in with email/password from env when there is no session (localhost only).
 * Set `VITE_DEV_AUTO_SIGNIN_EMAIL` in `.env.local`. If `VITE_DEV_AUTO_SIGNIN_PASSWORD` is omitted,
 * uses {@link FETCH_DEV_DEMO_DEFAULT_PASSWORD} (`demo12345678`) for the demo user.
 * Use the same email as `VITE_DEV_DEMO_USER_EMAIL` (or `demo@fetch.local`) so marketplace + Drops dev mocks attach.
 */
export async function tryDevAutoSignIn(): Promise<boolean> {
  if (!import.meta.env.DEV) return false
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return false

  const email = import.meta.env.VITE_DEV_AUTO_SIGNIN_EMAIL?.trim()
  const password =
    import.meta.env.VITE_DEV_AUTO_SIGNIN_PASSWORD?.trim() || FETCH_DEV_DEMO_DEFAULT_PASSWORD
  if (!email) return false

  const sb = getSupabaseBrowserClient()
  if (!sb) return false

  const {
    data: { session },
  } = await sb.auth.getSession()
  if (session?.user) return false

  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) {
    console.warn('[AUTH] dev auto sign-in failed:', error.message)
    return false
  }
  console.log('[AUTH] dev auto sign-in ok')
  return true
}
