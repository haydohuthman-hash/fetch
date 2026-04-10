/**
 * Sync routing from the local session cache (populated only after `refreshSessionFromSupabase`).
 * Do not use this for navigation until profile fields are synced — prefer {@link handlePostAuthUser}.
 */

import { needsDropsCreatorOnboarding } from './drops/fetchDropsCreatorOnboarding'
import { loadSession } from './fetchUserSession'

/** Next in-app phase after auth when session cache is ready. */
export type PostAuthRoutePhase = 'auth' | 'home' | 'dropsSetup'

export function computePostAuthAppPhase(): PostAuthRoutePhase | null {
  console.log('[ROUTE] computePostAuthAppPhase start')
  const s = loadSession()
  if (!s?.email?.trim()) {
    console.log('[ROUTE] computePostAuthAppPhase → null (no email)')
    return null
  }
  /**
   * Do not block on `onboardingComplete === undefined` — that stranded users when profile fetch lagged
   * OAuth/PKCE or raced `refreshSessionFromSupabase`. `ensureUserProfile` + refresh correct the cache.
   */
  if (needsDropsCreatorOnboarding()) {
    console.log('[ROUTE] computePostAuthAppPhase → dropsSetup')
    return 'dropsSetup'
  }
  console.log('[ROUTE] computePostAuthAppPhase → home')
  return 'home'
}
