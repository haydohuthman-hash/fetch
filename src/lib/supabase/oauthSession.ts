import { FETCH_APP_PATH } from '../fetchRoutes'

/** Strip OAuth redirect query/hash debris after Supabase exchanges the session. */
export function cleanupSupabaseOAuthUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  let changed = false
  for (const key of ['code', 'state', 'error', 'error_description', 'error_code']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }
  if (url.hash && (url.hash.includes('access_token') || url.hash.includes('error'))) {
    url.hash = ''
    changed = true
  }
  if (changed) {
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next)
  }
}

const LIVE_SITE = 'https://www.tryfetchit.app'
const LOCAL_DEV = 'http://localhost:5174'

/** OAuth must return into the SPA route that loads the shell (so PKCE + router agree). */
function oauthRedirectWithAppPath(base: string): string {
  const b = base.replace(/\/$/, '')
  if (b.endsWith(FETCH_APP_PATH)) return b
  return `${b}${FETCH_APP_PATH}`
}

/**
 * URL passed to `signInWithOAuth({ options: { redirectTo } })` for Google and Apple.
 *
 * Logic:
 * ```ts
 * const isLocalhost =
 *   window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
 * const redirectTo =
 *   import.meta.env.VITE_SITE_URL ||
 *   (isLocalhost ? 'http://localhost:5174' : 'https://www.tryfetchit.app')
 * ```
 *
 * **Production safety:** if the app is NOT opened on localhost but `VITE_SITE_URL` (or any
 * computed value) still points at `localhost` / `127.0.0.1` (e.g. bad deploy env), we
 * force `https://www.tryfetchit.app` so OAuth never returns to local ports on production.
 *
 * Does **not** use `window.location.origin`. Does **not** use `localhost:3000`.
 */
export function getOAuthRedirectTo(): string {
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  const redirectEnvRaw = import.meta.env.VITE_SUPABASE_REDIRECT_URL
  const redirectFromEnv =
    typeof redirectEnvRaw === 'string' && redirectEnvRaw.trim() ? redirectEnvRaw.trim() : ''
  const envRaw = import.meta.env.VITE_SITE_URL
  const fromEnv = typeof envRaw === 'string' ? envRaw.trim() : ''

  let redirectTo = redirectFromEnv || fromEnv || (isLocalhost ? LOCAL_DEV : LIVE_SITE)

  redirectTo = redirectTo.replace(/\/$/, '')

  if (!isLocalhost && /127\.0\.0\.1|localhost/i.test(redirectTo)) {
    redirectTo = LIVE_SITE.replace(/\/$/, '')
  }

  redirectTo = oauthRedirectWithAppPath(redirectTo)

  console.log('[AUTH] oauth redirectTo:', redirectTo)
  return redirectTo
}

/** @deprecated Use {@link getOAuthRedirectTo} — same implementation. */
export function oauthRedirectTo(): string {
  return getOAuthRedirectTo()
}
