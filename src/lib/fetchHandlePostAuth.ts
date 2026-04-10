import type { SupabaseClient, User } from '@supabase/supabase-js'
import { needsDropsCreatorOnboarding } from './drops/fetchDropsCreatorOnboarding'
import { FETCH_APP_PATH, FETCH_PROFILE_PATH } from './fetchRoutes'
import { refreshSessionFromSupabase, seedSessionCacheFromSupabaseUser } from './fetchUserSession'
import { getSupabaseBrowserClient } from './supabase/client'
import { ensureUserProfile } from './supabase/profiles'

const HYDRATION_POLL_MS = 120
const HYDRATION_MAX_MS = 12_000

async function waitForSessionHydration(sb: SupabaseClient, expectedUserId: string): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < HYDRATION_MAX_MS) {
    const { data, error } = await sb.auth.getSession()
    const u = data.session?.user
    if (!error && u?.id === expectedUserId && data.session?.access_token) {
      console.log('[AUTH] session hydration ok', { userId: expectedUserId })
      return true
    }
    await new Promise((r) => window.setTimeout(r, HYDRATION_POLL_MS))
  }
  console.warn('[AUTH] session hydration timed out', { userId: expectedUserId, ms: HYDRATION_MAX_MS })
  return false
}

export type HandlePostAuthContext = {
  navigate: (path: string, opts?: { replace?: boolean }) => void
  /** Last applied route key — prevents duplicate navigations from rapid auth events. */
  lastRouteKeyRef: { current: string | null }
  /** Keeps the in-app phase aligned with the URL after navigation. */
  setAppPhase: (phase: 'home' | 'dropsSetup') => void
}

/**
 * Central post-auth pipeline: navigate immediately from seeded cache, then hydrate session →
 * ensure DB profile → refresh local cache in the background (no blocking UI).
 */
export async function handlePostAuthUser(authUser: User, ctx: HandlePostAuthContext): Promise<void> {
  console.log('[AUTH] handlePostAuthUser start', { userId: authUser.id })
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    console.warn('[AUTH] handlePostAuthUser aborted: no Supabase client')
    return
  }

  seedSessionCacheFromSupabaseUser(authUser)

  const drops = needsDropsCreatorOnboarding()
  const path: string = drops ? FETCH_APP_PATH : FETCH_PROFILE_PATH

  const routeKey = `${authUser.id}|${path}|${drops ? 'drops' : 'main'}`
  if (ctx.lastRouteKeyRef.current !== routeKey) {
    ctx.lastRouteKeyRef.current = routeKey
    console.log('[ROUTE] handlePostAuthUser apply', { path, drops })
    if (drops) ctx.setAppPhase('dropsSetup')
    else ctx.setAppPhase('home')
    ctx.navigate(path, { replace: true })
  } else {
    console.log('[ROUTE] handlePostAuthUser skip (already applied)', routeKey)
  }

  void (async () => {
    console.log('[PROFILE] handlePostAuthUser: ensureUserProfile (background)')
    await ensureUserProfile(authUser).catch((e) =>
      console.warn('[PROFILE] ensureUserProfile failed (background)', e),
    )
    await waitForSessionHydration(sb, authUser.id)
    seedSessionCacheFromSupabaseUser(authUser)
    console.log('[AUTH] handlePostAuthUser: refreshSessionFromSupabase (background)')
    await refreshSessionFromSupabase()
  })().catch((e) => console.warn('[AUTH] handlePostAuthUser background failed', e))
}
