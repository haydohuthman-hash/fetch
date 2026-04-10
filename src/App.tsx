import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  setDropsCreatorReturnTarget,
  needsDropsCreatorOnboarding,
} from './lib/drops/fetchDropsCreatorOnboarding'
import { computePostAuthAppPhase } from './lib/fetchPostAuthRouting'
import { handlePostAuthUser } from './lib/fetchHandlePostAuth'
import {
  FETCH_APP_PATH,
  FETCH_AUTH_PATH,
  FETCH_MARKETPLACE_LIST_PATH,
  FETCH_PROFILE_EDIT_PATH,
  FETCH_PROFILE_PATH,
  FETCH_WALLET_ADD_CREDITS_PATH,
  FETCH_WALLET_CASH_OUT_PATH,
} from './lib/fetchRoutes'
import { tryDevAutoSignIn } from './lib/fetchDevAutoSignIn'
import { applyFetchDevDemoLocalBootstrap, isFetchDevDemoSession } from './lib/fetchDevDemo'
import {
  loadSession,
  refreshSessionFromSupabase,
  seedSessionCacheFromSupabaseUser,
} from './lib/fetchUserSession'
import { getSupabaseBrowserClient } from './lib/supabase/client'
import { cleanupSupabaseOAuthUrl } from './lib/supabase/oauthSession'
import { setAuthState } from './lib/authState'
import { FetchVoiceProvider } from './voice/FetchVoiceContext'
import { FetchBootstrappingProvider } from './boot/FetchBootstrappingContext'
import { FetchBootstrapOverlay } from './components/FetchBootstrapOverlay'
import { FetchAppShellSuspenseFallback } from './components/FetchAppShellSuspenseFallback'
import SplashScreen from './views/SplashScreen'

const homeChunk = () => import('./views/HomeView')
const HomeView = lazy(homeChunk)

const authChunk = () => import('./views/AuthScreen')
const AuthScreen = lazy(authChunk)

const driverChunk = () => import('./views/DriverDashboardView')
const DriverDashboardView = lazy(driverChunk)

const dropsCreatorSetupChunk = () => import('./views/DropsCreatorSetupView')
const DropsCreatorSetupView = lazy(dropsCreatorSetupChunk)

const fetchProfilePageChunk = () => import('./views/FetchProfilePage')
const FetchProfilePage = lazy(fetchProfilePageChunk)
const fetchProfileEditChunk = () => import('./views/FetchProfileEditView')
const FetchProfileEditView = lazy(fetchProfileEditChunk)
const fetchMarketplaceListingCreateChunk = () => import('./views/FetchMarketplaceListingCreateView')
const FetchMarketplaceListingCreateView = lazy(fetchMarketplaceListingCreateChunk)
const fetchWalletPlaceholderChunk = () => import('./views/FetchWalletPlaceholderView')
const FetchWalletPlaceholderView = lazy(fetchWalletPlaceholderChunk)

type AppPhase = 'splash' | 'home' | 'auth' | 'dropsSetup' | 'driver'
type PostAuthTarget = 'auth' | 'home' | 'dropsSetup'
type PostAuthTrace = {
  source: 'auth-success' | 'auth-event'
  startedAtMs: number
  sequence: AppPhase[]
  finalizeTimer: number | null
}

/**
 * Page-load–scoped handoff flags (not sessionStorage): they survive React 18 Strict Mode
 * remounts in dev so we don’t snap back to splash mid-handoff, but reset on a full refresh
 * so splash + skeleton run again every time you reload the tab.
 */
let fetchAppSplashHandoffDone = false
let fetchAppBootstrapExitDone = false

function hasDriverQuery() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('driver')
}

function initialAppPhase(): AppPhase {
  if (typeof window === 'undefined') return 'splash'
  if (hasDriverQuery()) return 'driver'
  if (fetchAppSplashHandoffDone) return 'home'
  /** Guests see the short splash; authed users jump to home as soon as `getSession` resolves. */
  return 'splash'
}

/** After splash, show bootstrap until map ready + min time, unless overlay already finished this load. */
function initialHomeBootstrapOpen(): boolean {
  if (typeof window === 'undefined') return false
  if (!fetchAppSplashHandoffDone) return false
  return !fetchAppBootstrapExitDone
}

const SPLASH_SESSION_WAIT_MS = 4500
/** Do not block forever on `getSession()` (offline / wedged client). */
const GET_SESSION_TIMEOUT_MS = 10_000

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

function likelyPostAuthTargetFromHints(): PostAuthTarget {
  const s = loadSession()
  if (!s?.email?.trim()) return 'auth'
  if (needsDropsCreatorOnboarding()) return 'dropsSetup'
  return 'home'
}

function applyPostAuthRouteIfNeeded(
  navigate: (path: string, opts?: { replace?: boolean }) => void,
  setDropsHome: () => void,
  setPhase: Dispatch<SetStateAction<AppPhase>>,
): void {
  const target = computePostAuthAppPhase()
  console.log('[ROUTE] applyPostAuthRouteIfNeeded target:', target)
  if (!target) return
  if (target === 'dropsSetup') setDropsHome()
  if (target === 'dropsSetup') {
    navigate(FETCH_APP_PATH, { replace: true })
  } else if (target === 'home') {
    navigate(FETCH_PROFILE_PATH, { replace: true })
  }
  setPhase((cur) => {
    if (cur === 'driver') return cur
    if (cur === 'dropsSetup') return cur
    if (cur === 'splash' || cur === 'home' || cur === 'auth') return target
    return cur
  })
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname

  const [phase, setPhase] = useState<AppPhase>(initialAppPhase)
  /** First `getSession` + `refreshSessionFromSupabase` pass completed (non-blocking; used for routing + logs). */
  const [shellHydrateDone, setShellHydrateDone] = useState(false)
  const [authSessionUserId, setAuthSessionUserId] = useState<string | null>(null)
  const [homeBootstrapOpen, setHomeBootstrapOpen] = useState(initialHomeBootstrapOpen)
  const [homeMapBootReady, setHomeMapBootReady] = useState(false)
  /**
   * When false, ignore post-auth phase jumps from onAuthStateChange so splash can finish and session cache can hydrate.
   * Seed from module splash flag so React Strict Mode remounts after handoff don’t stay “locked” on home.
   */
  const postAuthRouteUnlockedRef = useRef(fetchAppSplashHandoffDone)
  const shellHydrateDoneRef = useRef(false)
  const phaseRef = useRef<AppPhase>(phase)
  const postAuthTraceRef = useRef<PostAuthTrace | null>(null)
  const lastPostAuthRouteRef = useRef<string | null>(null)

  const runPostAuth = useCallback(
    async (user: import('@supabase/supabase-js').User) => {
      await handlePostAuthUser(user, {
        navigate,
        lastRouteKeyRef: lastPostAuthRouteRef,
        setAppPhase: (p) => setPhase(p),
      })
    },
    [navigate],
  )

  console.log('[AUTH] app render start', {
    phase,
    pathname,
    shellHydrateDone,
    authSessionUserId,
    profileLoaded: Boolean(loadSession()?.email?.trim()),
  })
  if (authSessionUserId) {
    console.log('[AUTH] rendering authenticated shell', { phase })
  } else if (phase !== 'splash') {
    console.log('[AUTH] rendering unauthenticated shell', { phase })
  }

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!authSessionUserId) return
    const s = loadSession()
    if (!isFetchDevDemoSession(s)) return
    applyFetchDevDemoLocalBootstrap()
  }, [authSessionUserId])

  /** Require auth for profile / sell / wallet surfaces. */
  useEffect(() => {
    if (!shellHydrateDone) return
    const gated =
      pathname === FETCH_PROFILE_PATH ||
      pathname === FETCH_PROFILE_EDIT_PATH ||
      pathname === FETCH_MARKETPLACE_LIST_PATH ||
      pathname === FETCH_WALLET_CASH_OUT_PATH ||
      pathname === FETCH_WALLET_ADD_CREDITS_PATH
    if (gated && !authSessionUserId) {
      navigate(FETCH_AUTH_PATH, { replace: true })
      queueMicrotask(() => setPhase('auth'))
    }
  }, [
    shellHydrateDone,
    authSessionUserId,
    pathname,
    navigate,
  ])

  const finalizePostAuthTrace = useCallback((reason: string) => {
    const t = postAuthTraceRef.current
    if (!t) return
    if (t.finalizeTimer != null) window.clearTimeout(t.finalizeTimer)
    const seq = t.sequence.join(' -> ')
    const elapsedMs = Math.round(nowMs() - t.startedAtMs)
    console.log('[AUTH] post-auth route sequence', {
      source: t.source,
      reason,
      sequence: seq,
      elapsedMs,
      authToHome: seq === 'auth -> home',
      authToHomeToDropsSetup: seq === 'auth -> home -> dropsSetup',
    })
    postAuthTraceRef.current = null
  }, [])

  const startPostAuthTrace = useCallback((source: PostAuthTrace['source']) => {
    const prev = postAuthTraceRef.current
    if (prev?.finalizeTimer != null) window.clearTimeout(prev.finalizeTimer)
    const startedAtMs = nowMs()
    const current = phaseRef.current
    const finalizeTimer = window.setTimeout(() => {
      finalizePostAuthTrace('timer')
    }, 2400)
    postAuthTraceRef.current = {
      source,
      startedAtMs,
      sequence: [current],
      finalizeTimer,
    }
    console.log('[AUTH] post-auth trace start', { source, phase: current })
  }, [finalizePostAuthTrace])

  useEffect(() => {
    const t = postAuthTraceRef.current
    if (!t) return
    const last = t.sequence[t.sequence.length - 1]
    if (last === phase) return
    t.sequence.push(phase)
    console.log('[AUTH] post-auth route step', {
      source: t.source,
      phase,
      elapsedMs: Math.round(nowMs() - t.startedAtMs),
    })
    const done = phase === 'home' || phase === 'dropsSetup'
    if (done && t.sequence.length >= 2) finalizePostAuthTrace('terminal')
  }, [phase, finalizePostAuthTrace])

  useEffect(() => {
    void homeChunk()
    void authChunk()
    void driverChunk()
    void dropsCreatorSetupChunk()
  }, [])

  /** Warm home chunk while user is on sign-in so post-auth transition feels instant. */
  useEffect(() => {
    if (phase === 'auth') void homeChunk()
    if (phase === 'auth') {
      const hinted = likelyPostAuthTargetFromHints()
      if (hinted === 'dropsSetup') void dropsCreatorSetupChunk()
    }
  }, [phase])

  useEffect(
    () => () => {
      const t = postAuthTraceRef.current
      if (t?.finalizeTimer != null) window.clearTimeout(t.finalizeTimer)
    },
    [],
  )

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) {
      queueMicrotask(() => {
        setAuthState({ loading: false, sessionUserId: null })
        shellHydrateDoneRef.current = true
        setShellHydrateDone(true)
      })
      return
    }
    void (async () => {
      const sessionResult = await Promise.race([
        sb.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          window.setTimeout(() => {
            console.warn('[AUTH] getSession timeout — continuing without session', {
              ms: GET_SESSION_TIMEOUT_MS,
            })
            resolve({ data: { session: null } })
          }, GET_SESSION_TIMEOUT_MS),
        ),
      ])
      const { data, error } = sessionResult as Awaited<ReturnType<typeof sb.auth.getSession>>
      console.log('[AUTH] initial session:', data, error)
      console.log('[AUTH] auth state snapshot', {
        pathname: typeof window !== 'undefined' ? window.location.pathname : '',
        sessionUserId: data.session?.user?.id ?? null,
        hasSession: Boolean(data.session?.user),
      })
      if (data.session?.user) console.log('[AUTH] session present:', data.session.user.id)

      const authedUser = data.session?.user ?? null
      setAuthSessionUserId(authedUser?.id ?? null)
      if (authedUser) {
        seedSessionCacheFromSupabaseUser(authedUser)
        if (import.meta.env.DEV) {
          const s = loadSession()
          if (isFetchDevDemoSession(s)) applyFetchDevDemoLocalBootstrap()
        }
      }
      queueMicrotask(() => {
        setAuthState({ sessionUserId: authedUser?.id ?? null, loading: false })
        shellHydrateDoneRef.current = true
        setShellHydrateDone(true)
      })

      if (authedUser) {
        console.log('[AUTH] authenticated cold start → runPostAuth')
        if (!fetchAppSplashHandoffDone) {
          fetchAppSplashHandoffDone = true
          fetchAppBootstrapExitDone = false
          queueMicrotask(() => {
            setHomeMapBootReady(false)
            setHomeBootstrapOpen(true)
          })
        }
        postAuthRouteUnlockedRef.current = true
        void runPostAuth(authedUser).catch((e) =>
          console.warn('[AUTH] runPostAuth failed (cold start)', e),
        )

        const reconcile = () => {
          void refreshSessionFromSupabase().then(() => {
            applyPostAuthRouteIfNeeded(navigate, () => setDropsCreatorReturnTarget('home'), setPhase)
          })
        }
        console.log('[AUTH] profile reconcile (cold start follow-up)')
        void refreshSessionFromSupabase().catch((e) =>
          console.warn('[AUTH] profile refresh failed (cold start)', e),
        )
        reconcile()
        window.setTimeout(reconcile, 700)
        window.setTimeout(reconcile, 2200)
      } else {
        console.log('[AUTH] guest cold start: splash until handoff')
        console.log('[AUTH] profile fetch start (background guest cold start)')
        void refreshSessionFromSupabase().catch((e) =>
          console.warn('[AUTH] profile refresh skipped or failed (guest cold start)', e),
        )
        void tryDevAutoSignIn().catch((e) => console.warn('[AUTH] dev auto sign-in error', e))
      }
    })()
  }, [])

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) return
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(async (event, session) => {
      console.log('[AUTH] auth state changed:', event, session?.user?.id)
      console.log('[ROUTE] pathname:', pathname)
      setAuthSessionUserId(session?.user?.id ?? null)
      setAuthState({ sessionUserId: session?.user?.id ?? null })
      if (session?.user) {
        seedSessionCacheFromSupabaseUser(session.user)
        if (import.meta.env.DEV) {
          const s = loadSession()
          if (isFetchDevDemoSession(s)) applyFetchDevDemoLocalBootstrap()
        }
        /**
         * OAuth/PKCE often delivers the first session as `INITIAL_SESSION`, not `SIGNED_IN`.
         * Only running `runPostAuth` on `SIGNED_IN` left some returns stuck until a full refresh.
         */
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          postAuthRouteUnlockedRef.current = true
          if (event === 'SIGNED_IN') {
            startPostAuthTrace('auth-event')
            console.log('[AUTH] SIGNED_IN → handlePostAuthUser')
          } else {
            console.log('[AUTH] INITIAL_SESSION → handlePostAuthUser')
          }
          try {
            await runPostAuth(session.user)
          } catch (e) {
            console.warn('[AUTH] runPostAuth failed', e)
          }
        } else {
          await refreshSessionFromSupabase()
        }
        cleanupSupabaseOAuthUrl()
        setAuthState({ loading: false })
      } else if (event === 'SIGNED_OUT') {
        lastPostAuthRouteRef.current = null
        await refreshSessionFromSupabase()
        cleanupSupabaseOAuthUrl()
        setAuthState({ loading: false, sessionUserId: null })
        navigate(FETCH_APP_PATH, { replace: true })
        setPhase((cur) => (cur === 'auth' || cur === 'splash' ? cur : 'home'))
      }

      if (event === 'TOKEN_REFRESHED' && session?.user && shellHydrateDoneRef.current) {
        void refreshSessionFromSupabase().then(() => {
          applyPostAuthRouteIfNeeded(navigate, () => setDropsCreatorReturnTarget('home'), setPhase)
        })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate, pathname, runPostAuth, startPostAuthTrace])

  const goAccountFromHome = useCallback(() => {
    if (!loadSession()?.email?.trim()) {
      console.log('[ROUTE] open auth (no session cache)')
      navigate(FETCH_AUTH_PATH, { replace: true })
      setPhase('auth')
      return
    }
    if (needsDropsCreatorOnboarding()) {
      setDropsCreatorReturnTarget('account')
      navigate(FETCH_APP_PATH, { replace: true })
      setPhase('dropsSetup')
      return
    }
    navigate(FETCH_PROFILE_PATH, { replace: true })
    setPhase('home')
  }, [navigate])

  const leaveDriverDashboard = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('driver')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    navigate(FETCH_APP_PATH, { replace: true })
    setPhase('home')
  }, [navigate])

  const handleSplashComplete = useCallback(() => {
    void (async () => {
      if (!fetchAppSplashHandoffDone) {
        fetchAppSplashHandoffDone = true
        fetchAppBootstrapExitDone = false
        setHomeMapBootReady(false)
        setHomeBootstrapOpen(true)
      }
      try {
        await Promise.race([
          refreshSessionFromSupabase(),
          new Promise<void>((resolve) => window.setTimeout(resolve, SPLASH_SESSION_WAIT_MS)),
        ])
      } catch {
        /* session refresh must not trap the app on splash */
      }
      postAuthRouteUnlockedRef.current = true
      const sb = getSupabaseBrowserClient()
      const {
        data: { session },
      } = (await sb?.auth.getSession()) ?? { data: { session: null } }
      if (session?.user) {
        console.log('[AUTH] splash handoff → runPostAuth')
        try {
          await runPostAuth(session.user)
        } catch (e) {
          console.warn('[AUTH] runPostAuth failed (splash)', e)
        }
      } else {
        const postAuth = computePostAuthAppPhase()
        console.log('[ROUTE] splash guest handoff', { postAuth })
        if (postAuth === 'dropsSetup') setDropsCreatorReturnTarget('home')
        navigate(FETCH_APP_PATH, { replace: true })
        setPhase((p) => (p === 'splash' ? (postAuth ?? 'home') : p))
      }

      const reconcile = () => {
        void refreshSessionFromSupabase().then(() => {
          applyPostAuthRouteIfNeeded(navigate, () => setDropsCreatorReturnTarget('home'), setPhase)
        })
      }
      reconcile()
      window.setTimeout(reconcile, 700)
      window.setTimeout(reconcile, 2200)
    })()
  }, [navigate, runPostAuth])

  const prevPhaseForBootstrapRef = useRef<AppPhase | null>(null)
  useEffect(() => {
    const prev = prevPhaseForBootstrapRef.current
    prevPhaseForBootstrapRef.current = phase
    if (prev === 'home' && phase !== 'home') {
      queueMicrotask(() => {
        setHomeBootstrapOpen(false)
        setHomeMapBootReady(false)
      })
    }
  }, [phase])

  const handleHomeMapsBootReady = useCallback((ready: boolean) => {
    if (ready) setHomeMapBootReady(true)
  }, [])

  const handleBootstrapExitComplete = useCallback(() => {
    fetchAppBootstrapExitDone = true
    setHomeBootstrapOpen(false)
  }, [])

  const onSignedIn = useCallback(
    async (user: import('@supabase/supabase-js').User) => {
      console.log('[AUTH] email/OAuth sign-in completed → handlePostAuthUser')
      startPostAuthTrace('auth-success')
      postAuthRouteUnlockedRef.current = true
      await runPostAuth(user)
    },
    [runPostAuth, startPostAuthTrace],
  )

  const phaseBody = (() => {
    if (phase === 'splash') {
      return <SplashScreen onComplete={handleSplashComplete} />
    }
    if (phase === 'driver') {
      return (
        <Suspense
          fallback={
            <FetchAppShellSuspenseFallback
              title="Opening driver mode…"
              subtitle="Getting your dashboard ready."
            />
          }
        >
          <DriverDashboardView onBack={leaveDriverDashboard} />
        </Suspense>
      )
    }
    if (phase === 'home') {
      const isProfileSurface =
        Boolean(authSessionUserId) &&
        (pathname === FETCH_PROFILE_PATH ||
          pathname === FETCH_PROFILE_EDIT_PATH ||
          pathname === FETCH_MARKETPLACE_LIST_PATH ||
          pathname === FETCH_WALLET_CASH_OUT_PATH ||
          pathname === FETCH_WALLET_ADD_CREDITS_PATH)

      if (isProfileSurface) {
        return (
          <Suspense
            fallback={
              <FetchAppShellSuspenseFallback title="Loading…" subtitle="Preparing your marketplace profile." />
            }
          >
            {pathname === FETCH_PROFILE_PATH ? (
              <FetchProfilePage
                onOpenApp={() => navigate(FETCH_APP_PATH)}
                onEditProfile={() => navigate(FETCH_PROFILE_EDIT_PATH)}
                onListItem={() => navigate(FETCH_MARKETPLACE_LIST_PATH)}
                onEditListing={(listingId) =>
                  navigate(`${FETCH_MARKETPLACE_LIST_PATH}?edit=${encodeURIComponent(listingId)}`)
                }
                onCashOut={() => navigate(FETCH_WALLET_CASH_OUT_PATH)}
                onAddCredits={() => navigate(FETCH_WALLET_ADD_CREDITS_PATH)}
              />
            ) : pathname === FETCH_PROFILE_EDIT_PATH ? (
              <FetchProfileEditView onDone={() => navigate(FETCH_PROFILE_PATH)} />
            ) : pathname === FETCH_MARKETPLACE_LIST_PATH ? (
              <FetchMarketplaceListingCreateView onDone={() => navigate(FETCH_PROFILE_PATH)} />
            ) : (
              <FetchWalletPlaceholderView
                variant={pathname === FETCH_WALLET_CASH_OUT_PATH ? 'cashOut' : 'credits'}
                onBack={() => navigate(FETCH_PROFILE_PATH)}
              />
            )}
          </Suspense>
        )
      }

      return (
        <FetchBootstrappingProvider value={homeBootstrapOpen}>
          <Suspense
            fallback={
              <FetchAppShellSuspenseFallback
                title="Opening your home…"
                subtitle="Almost there — loading your map and shortcuts."
              />
            }
          >
            <HomeView
              onAccountNavigate={goAccountFromHome}
              onMapsBootReady={handleHomeMapsBootReady}
            />
          </Suspense>
          <FetchBootstrapOverlay
            open={homeBootstrapOpen}
            mapReady={homeMapBootReady}
            onExitComplete={handleBootstrapExitComplete}
          />
        </FetchBootstrappingProvider>
      )
    }
    if (phase === 'auth') {
      return (
        <Suspense
          fallback={
            <FetchAppShellSuspenseFallback
              title="Opening sign in…"
              subtitle="Securely loading your account options."
            />
          }
        >
          <AuthScreen
            initialTab="signup"
            onBack={() => {
              navigate(FETCH_APP_PATH, { replace: true })
              setPhase('home')
            }}
            onSignedIn={onSignedIn}
          />
        </Suspense>
      )
    }
    if (phase === 'dropsSetup') {
      return (
        <Suspense
          fallback={
            <FetchAppShellSuspenseFallback
              title="Opening creator setup…"
              subtitle="Preparing your public profile tools."
            />
          }
        >
          <DropsCreatorSetupView
            onDone={() => {
              navigate(FETCH_PROFILE_PATH, { replace: true })
              setPhase('home')
            }}
          />
        </Suspense>
      )
    }
    console.log('[AUTH] blank-screen guard triggered', { phase })
    return (
      <FetchAppShellSuspenseFallback
        title="Recovering…"
        subtitle="Something looked off in navigation. If this stays here, try refreshing the page."
      />
    )
  })()

  return (
    <FetchVoiceProvider>
      <div className="fetch-app-shell-bg relative flex min-h-dvh min-h-[100dvh] w-full justify-center">
        <div className="fetch-app-shell-inner relative z-[1] mx-auto min-h-dvh min-h-[100dvh] w-full max-w-[1024px] overflow-x-clip overflow-y-visible">
          {phaseBody}
        </div>
      </div>
    </FetchVoiceProvider>
  )
}

export default App
