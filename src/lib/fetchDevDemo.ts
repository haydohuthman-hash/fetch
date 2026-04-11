import { normalizeEmail, type FetchUserRecord, loadSession } from './fetchUserSession'
import { completeDropsCreatorOnboarding, needsDropsCreatorOnboarding } from './drops/fetchDropsCreatorOnboarding'
import { completePlatformOnboarding, needsPlatformOnboarding } from './fetchPlatformIdentity'

/** Password for the local Supabase demo user (pair with {@link getFetchDevDemoUserEmail}). */
export const FETCH_DEV_DEMO_DEFAULT_PASSWORD = 'demo12345678'

/** Prefill email sign-in password on localhost in dev (empty in production builds). */
export function getFetchDevDemoPasswordPrefill(): string {
  if (!import.meta.env.DEV) return ''
  if (typeof window === 'undefined') return ''
  const h = window.location.hostname
  if (h !== 'localhost' && h !== '127.0.0.1') return ''
  return FETCH_DEV_DEMO_DEFAULT_PASSWORD
}

/** Canonical demo mailbox for local Drops + marketplace mocks (override with env). */
export function getFetchDevDemoUserEmail(): string {
  const explicit = import.meta.env.VITE_DEV_DEMO_USER_EMAIL?.trim()
  const auto = import.meta.env.VITE_DEV_AUTO_SIGNIN_EMAIL?.trim()
  return normalizeEmail(explicit || auto || 'demo@fetch.local')
}

export function isFetchDevDemoSession(session: FetchUserRecord | null): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  const host = window.location.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return false
  if (!session?.email?.trim()) return false
  return normalizeEmail(session.email) === getFetchDevDemoUserEmail()
}

/**
 * When the signed-in user is the local demo account, mark platform + Drops creator
 * onboarding complete so Reels posting and marketplace seller flows are reachable.
 */
export function applyFetchDevDemoLocalBootstrap(): void {
  if (!isFetchDevDemoSession(loadSession())) return
  if (needsPlatformOnboarding()) {
    completePlatformOnboarding({
      role: 'fetcher',
      interests: ['buy_browse', 'sell', 'drops'],
    })
  }
  if (needsDropsCreatorOnboarding()) {
    completeDropsCreatorOnboarding()
  }
}
