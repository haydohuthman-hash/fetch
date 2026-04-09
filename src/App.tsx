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
import {
  setDropsCreatorReturnTarget,
  needsDropsCreatorOnboarding,
} from './lib/drops/fetchDropsCreatorOnboarding'
import { computePostAuthAppPhase } from './lib/fetchPostAuthRouting'
import {
  consumeOnboardingReturnTarget,
  needsPlatformOnboarding,
  setOnboardingReturnTarget,
} from './lib/fetchPlatformIdentity'
import {
  loadSession,
  refreshSessionFromSupabase,
  seedSessionCacheFromSupabaseUser,
} from './lib/fetchUserSession'
import { isAutomaticDefaultUsername } from './lib/supabase/profiles'
import { getSupabaseBrowserClient } from './lib/supabase/client'
import { cleanupSupabaseOAuthUrl } from './lib/supabase/oauthSession'
import { setAuthState } from './lib/authState'
import { FetchVoiceProvider } from './voice/FetchVoiceContext'
import { FetchBootstrappingProvider } from './boot/FetchBootstrappingContext'
import { FetchBootstrapOverlay } from './components/FetchBootstrapOverlay'
import { FetchAppAuthDebugPanel } from './components/FetchAppAuthDebugPanel'
import { FetchAppErrorBoundary } from './components/FetchAppErrorBoundary'
import { FetchAppShellSuspenseFallback } from './components/FetchAppShellSuspenseFallback'
import SplashScreen from './views/SplashScreen'

const homeChunk = () => import('./views/HomeView')
const HomeView = lazy(homeChunk)

const authChunk = () => import('./views/AuthScreen')
const AuthScreen = lazy(authChunk)

const dropsProfileAccountChunk = () =>
  import('./components/UserScreens/DropsProfileAccountScreen').then((m) => ({
    default: m.DropsProfileAccountScreen,
  }))
const DropsProfileAccountScreen = lazy(dropsProfileAccountChunk)

const driverChunk = () => import('./views/DriverDashboardView')
const DriverDashboardView = lazy(driverChunk)

const onboardingChunk = () => import('./views/AccountOnboardingView')
const AccountOnboardingView = lazy(onboardingChunk)

const dropsCreatorSetupChunk = () => import('./views/DropsCreatorSetupView')
const DropsCreatorSetupView = lazy(dropsCreatorSetupChunk)

type AppPhase = 'boot' | 'splash' | 'home' | 'auth' | 'onboarding' | 'dropsSetup' | 'account' | 'driver'
type PostAuthTarget = 'auth' | 'home' | 'onboarding' | 'dropsSetup'
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
  if (typeof window === 'undefined') return 'boot'
  if (hasDriverQuery()) return 'driver'
  if (fetchAppSplashHandoffDone) return 'home'
  /** Hydrate auth before splash so logged-in users never see the splash animation. */
  return 'boot'
}

/** After splash, show bootstrap until map ready + min time, unless overlay already finished this load. */
function initialHomeBootstrapOpen(): boolean {
  if (typeof window === 'undefined') return false
  if (!fetchAppSplashHandoffDone) return false
  return !fetchAppBootstrapExitDone
}

const SPLASH_SESSION_WAIT_MS = 4500
/** Never block the boot screen on `getSession()` (offline / wedged client). */
const BOOT_GET_SESSION_TIMEOUT_MS = 10_000

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

function likelyPostAuthTargetFromHints(): PostAuthTarget {
  const s = loadSession()
  const u = s?.username?.trim()
  if (!u || isAutomaticDefaultUsername(u, s?.id)) return 'auth'
  if (needsPlatformOnboarding()) return 'onboarding'
  if (needsDropsCreatorOnboarding()) return 'dropsSetup'
  return 'home'
}

function applyPostAuthRouteIfNeeded(
  setDropsHome: () => void,
  setPhase: Dispatch<SetStateAction<AppPhase>>,
): void {
  const target = computePostAuthAppPhase()
  console.log('[AUTH] applyPostAuthRouteIfNeeded target:', target)
  // #region agent log
  fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'App.tsx:applyPostAuth',message:'applyPostAuth target',data:{target,hypothesisId:'H4'},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  if (!target) return
  if (target === 'dropsSetup') setDropsHome()
  setPhase((cur) => {
    if (cur === 'account' || cur === 'driver') return cur
    if (cur === 'onboarding' || cur === 'dropsSetup') return cur
    if (cur === 'boot' || cur === 'splash' || cur === 'home' || cur === 'auth') return target
    return cur
  })
}

function App() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''

  const [phase, setPhase] = useState<AppPhase>(initialAppPhase)
  /** First `getSession` + `refreshSessionFromSupabase` pass completed (non-blocking; used for routing + logs). */
  const [shellHydrateDone, setShellHydrateDone] = useState(false)
  const [authSessionUserId, setAuthSessionUserId] = useState<string | null>(null)
  const [profileSyncPending, setProfileSyncPending] = useState(false)
  const [homeBootstrapOpen, setHomeBootstrapOpen] = useState(initialHomeBootstrapOpen)
  const [homeMapBootReady, setHomeMapBootReady] = useState(false)
  const [onboardingAllowDismiss, setOnboardingAllowDismiss] = useState(false)
  /**
   * When false, ignore post-auth phase jumps from onAuthStateChange so splash can finish and session cache can hydrate.
   * Seed from module splash flag so React Strict Mode remounts after handoff don’t stay “locked” on home.
   */
  const postAuthRouteUnlockedRef = useRef(fetchAppSplashHandoffDone)
  const shellHydrateDoneRef = useRef(false)
  const phaseRef = useRef<AppPhase>(phase)
  const postAuthTraceRef = useRef<PostAuthTrace | null>(null)

  console.log('[AUTH] app render start', {
    phase,
    pathname,
    shellHydrateDone,
    authSessionUserId,
    profileLoaded: Boolean(loadSession()?.email?.trim()),
  })
  if (authSessionUserId) {
    console.log('[AUTH] rendering authenticated shell', { phase })
  } else if (phase !== 'boot' && phase !== 'splash') {
    console.log('[AUTH] rendering unauthenticated shell', { phase })
  }

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

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
      authToHomeToOnboarding: seq === 'auth -> home -> onboarding',
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
    const done = phase === 'home' || phase === 'onboarding' || phase === 'dropsSetup'
    if (done && t.sequence.length >= 2) finalizePostAuthTrace('terminal')
  }, [phase, finalizePostAuthTrace])

  useEffect(() => {
    void homeChunk()
    void authChunk()
    void dropsProfileAccountChunk()
    void driverChunk()
    void onboardingChunk()
    void dropsCreatorSetupChunk()
  }, [])

  /** Warm home chunk while user is on sign-in so post-auth transition feels instant. */
  useEffect(() => {
    if (phase === 'auth') void homeChunk()
    if (phase === 'auth') {
      const hinted = likelyPostAuthTargetFromHints()
      if (hinted === 'onboarding') void onboardingChunk()
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

  // Absolute guard: never remain on boot forever.
  useEffect(() => {
    if (phase !== 'boot') return
    const t = window.setTimeout(() => {
      if (phaseRef.current !== 'boot') return
      console.warn('[AUTH] boot hard-timeout guard triggered; forcing splash')
      shellHydrateDoneRef.current = true
      setShellHydrateDone(true)
      setPhase((p) => (p === 'boot' ? 'splash' : p))
    }, 2200)
    return () => window.clearTimeout(t)
  }, [phase])

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) {
      setAuthState({ loading: false, sessionUserId: null })
      shellHydrateDoneRef.current = true
      setShellHydrateDone(true)
      setPhase((p) => (p === 'boot' ? 'splash' : p))
      return
    }
    void (async () => {
      const sessionResult = await Promise.race([
        sb.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          window.setTimeout(() => {
            console.warn('[AUTH] getSession timeout — leaving boot without session', {
              ms: BOOT_GET_SESSION_TIMEOUT_MS,
            })
            resolve({ data: { session: null } })
          }, BOOT_GET_SESSION_TIMEOUT_MS),
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
      if (authedUser) seedSessionCacheFromSupabaseUser(authedUser)
      setAuthState({ sessionUserId: authedUser?.id ?? null, loading: false })
      setProfileSyncPending(
        Boolean(authedUser?.id) && !Boolean(loadSession()?.username?.trim()),
      )
      shellHydrateDoneRef.current = true
      setShellHydrateDone(true)

      if (authedUser) {
        console.log('[AUTH] boot: leaving boot → authenticated shell (before profile refresh)')
        console.log('[AUTH] splash removed — authenticated cold start → main shell')
        console.log('[AUTH] skip splash: authenticated session on cold start')
        if (!fetchAppSplashHandoffDone) {
          fetchAppSplashHandoffDone = true
          fetchAppBootstrapExitDone = false
          setHomeMapBootReady(false)
          setHomeBootstrapOpen(true)
        }
        postAuthRouteUnlockedRef.current = true
        console.log('[AUTH] computePostAuthAppPhase start (cold start)')
        const postAuth = computePostAuthAppPhase()
        console.log('[AUTH] computePostAuthAppPhase result (cold start target):', postAuth)
        if (postAuth === 'dropsSetup') setDropsCreatorReturnTarget('home')
        setPhase((p) => (p === 'boot' || p === 'splash' ? (postAuth ?? 'home') : p))

        const reconcile = () => {
          void refreshSessionFromSupabase().then(() => {
            applyPostAuthRouteIfNeeded(() => setDropsCreatorReturnTarget('home'), setPhase)
          })
        }
        console.log('[AUTH] profile fetch start (background cold start)')
        void refreshSessionFromSupabase()
          .then(() => {
            const prof = loadSession()?.username?.trim()
            if (prof) console.log('[AUTH] profile fetch success (session cache)')
            else
              console.log(
                '[AUTH] profile fetch missing (session cache username empty — may still be valid)',
              )
            setProfileSyncPending(
              Boolean(authedUser.id) && !Boolean(loadSession()?.username?.trim()),
            )
          })
          .catch((e) => console.warn('[AUTH] profile refresh failed (cold start)', e))
        reconcile()
        window.setTimeout(reconcile, 700)
        window.setTimeout(reconcile, 2200)
      } else {
        console.log('[AUTH] boot: leaving boot → splash (guest / no session)')
        console.log('[AUTH] guest cold start: show splash after boot')
        setPhase((p) => (p === 'boot' ? 'splash' : p))
        console.log('[AUTH] profile fetch start (background guest cold start)')
        void refreshSessionFromSupabase().catch((e) =>
          console.warn('[AUTH] profile refresh skipped or failed (guest cold start)', e),
        )
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
      console.log('[AUTH] route pathname:', typeof window !== 'undefined' ? window.location.pathname : '')
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'App.tsx:onAuthStateChange',message:'auth event',data:{event,hasUser:Boolean(session?.user),unlocked:postAuthRouteUnlockedRef.current,hypothesisId:'H3'},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      setAuthSessionUserId(session?.user?.id ?? null)
      setAuthState({ sessionUserId: session?.user?.id ?? null })
      if (session?.user) {
        seedSessionCacheFromSupabaseUser(session.user)
        if (event === 'SIGNED_IN') {
          startPostAuthTrace('auth-event')
          postAuthRouteUnlockedRef.current = true
          const hinted = likelyPostAuthTargetFromHints()
          console.log('[AUTH] post-auth hint before refresh', { hinted })
          if (shellHydrateDoneRef.current) {
            if (hinted === 'home') {
              console.log('[AUTH] post-auth fast route (pre-refresh)', { event, hinted })
              applyPostAuthRouteIfNeeded(() => setDropsCreatorReturnTarget('home'), setPhase)
            } else {
              console.log('[AUTH] post-auth direct setup route (pre-refresh)', { event, hinted })
              if (hinted === 'dropsSetup') setDropsCreatorReturnTarget('home')
              setPhase(hinted)
            }
          }
        }
        await refreshSessionFromSupabase()
        setProfileSyncPending(!Boolean(loadSession()?.username?.trim()))
        cleanupSupabaseOAuthUrl()
        setAuthState({ loading: false })
      } else if (event === 'SIGNED_OUT') {
        await refreshSessionFromSupabase()
        setProfileSyncPending(false)
        cleanupSupabaseOAuthUrl()
        setAuthState({ loading: false, sessionUserId: null })
        setPhase((cur) => (cur === 'auth' || cur === 'splash' || cur === 'boot' ? cur : 'home'))
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (!shellHydrateDoneRef.current) {
          console.log('[AUTH] protected route waiting for hydration')
        } else if (session?.user && postAuthRouteUnlockedRef.current) {
          console.log('[AUTH] redirect allowed: post-auth route', event, session.user.id)
          applyPostAuthRouteIfNeeded(() => setDropsCreatorReturnTarget('home'), setPhase)
        } else {
          console.log('[AUTH] redirect blocked:', {
            hasUser: Boolean(session?.user),
            unlocked: postAuthRouteUnlockedRef.current,
          })
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!authSessionUserId || !profileSyncPending) return
    console.log('[AUTH] profile fallback render')
    let cancelled = false
    let attempt = 0
    const tick = () => {
      if (cancelled) return
      attempt += 1
      console.log('[AUTH] profile fetch start')
      void refreshSessionFromSupabase()
        .then(() => {
          const hasProfile = Boolean(loadSession()?.username?.trim())
          if (hasProfile) {
            console.log('[AUTH] profile fetch success')
            setProfileSyncPending(false)
            return
          }
          console.log('[AUTH] profile fetch missing')
          if (attempt < 5) window.setTimeout(tick, 1200)
        })
        .catch(() => {
          console.log('[AUTH] profile fetch missing')
          if (attempt < 5) window.setTimeout(tick, 1200)
        })
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [authSessionUserId, profileSyncPending])

  const goAccountFromHome = useCallback(() => {
    if (!loadSession()) {
      console.log('[AUTH] redirect blocked: no cached session, opening auth')
      setPhase('auth')
      return
    }
    if (needsPlatformOnboarding()) {
      setOnboardingAllowDismiss(false)
      setPhase('onboarding')
      return
    }
    if (needsDropsCreatorOnboarding()) {
      setDropsCreatorReturnTarget('account')
      setPhase('dropsSetup')
      return
    }
    setPhase('account')
  }, [])

  const leaveDriverDashboard = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('driver')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    setPhase('home')
  }, [])

  const openDriverDashboard = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('driver', '1')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    setPhase('driver')
  }, [])

  const finishOnboarding = useCallback(
    (picked: 'fetcher' | 'partner') => {
      const ret = consumeOnboardingReturnTarget()
      setOnboardingAllowDismiss(false)
      if (ret === 'account') {
        if (picked === 'fetcher' && needsDropsCreatorOnboarding()) {
          setDropsCreatorReturnTarget('account')
          setPhase('dropsSetup')
        } else {
          setPhase('account')
        }
        return
      }
      if (picked === 'partner') {
        openDriverDashboard()
      } else if (needsDropsCreatorOnboarding()) {
        setDropsCreatorReturnTarget('home')
        setPhase('dropsSetup')
      } else {
        setPhase('home')
      }
    },
    [openDriverDashboard],
  )

  const openOnboardingFromAccount = useCallback(() => {
    setOnboardingReturnTarget('account')
    setOnboardingAllowDismiss(true)
    setPhase('onboarding')
  }, [])

  const dismissOnboardingToAccount = useCallback(() => {
    setOnboardingReturnTarget(null)
    setOnboardingAllowDismiss(false)
    setPhase('account')
  }, [])

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
      const postAuth = computePostAuthAppPhase()
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'App.tsx:splashComplete',message:'splash handoff postAuth',data:{postAuth,fallbackHome:!postAuth,hypothesisId:'H4'},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      if (postAuth === 'dropsSetup') setDropsCreatorReturnTarget('home')
      setPhase((p) => (p === 'splash' || p === 'boot' ? (postAuth ?? 'home') : p))

      const reconcile = () => {
        void refreshSessionFromSupabase().then(() => {
          applyPostAuthRouteIfNeeded(() => setDropsCreatorReturnTarget('home'), setPhase)
        })
      }
      reconcile()
      window.setTimeout(reconcile, 700)
      window.setTimeout(reconcile, 2200)
    })()
  }, [])

  useEffect(() => {
    if (phase !== 'home') {
      setHomeBootstrapOpen(false)
      setHomeMapBootReady(false)
    }
  }, [phase])

  const handleHomeMapsBootReady = useCallback((ready: boolean) => {
    if (ready) setHomeMapBootReady(true)
  }, [])

  const handleBootstrapExitComplete = useCallback(() => {
    fetchAppBootstrapExitDone = true
    setHomeBootstrapOpen(false)
  }, [])

  const onAuthSuccess = useCallback(() => {
    console.log('[AUTH] redirect landed')
    startPostAuthTrace('auth-success')
    postAuthRouteUnlockedRef.current = true
    setOnboardingAllowDismiss(false)
    console.log('[AUTH] computePostAuthAppPhase start (onSuccess)')
    const target = computePostAuthAppPhase()
    console.log('[AUTH] computePostAuthAppPhase result (onSuccess):', target)
    if (!target) {
      console.log('[AUTH] rendering authenticated shell (onSuccess: no route target → home)')
      setPhase('home')
      return
    }
    if (target === 'dropsSetup') {
      setDropsCreatorReturnTarget('home')
      setPhase('dropsSetup')
      return
    }
    if (target === 'onboarding') {
      setPhase('onboarding')
      return
    }
    console.log('[AUTH] rendering authenticated shell → home')
    setPhase('home')
  }, [])

  const profileLoaded = Boolean(loadSession()?.username?.trim())
  const phaseBody = (() => {
    if (phase === 'boot') {
      return (
        <FetchAppShellSuspenseFallback
          title="Starting Fetch…"
          subtitle="Hang tight — this usually takes just a moment."
        />
      )
    }
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
          <AuthScreen initialTab="signup" onBack={() => setPhase('home')} onSuccess={onAuthSuccess} />
        </Suspense>
      )
    }
    if (phase === 'onboarding') {
      return (
        <Suspense
          fallback={
            <FetchAppShellSuspenseFallback
              title="Setting up your profile…"
              subtitle="A few quick choices to personalize Fetch."
            />
          }
        >
          <AccountOnboardingView
            onDoneFetcher={() => finishOnboarding('fetcher')}
            onDonePartner={() => finishOnboarding('partner')}
            allowDismissToAccount={onboardingAllowDismiss}
            onDismissToAccount={dismissOnboardingToAccount}
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
            onDone={(dest) => setPhase(dest === 'account' ? 'account' : 'home')}
          />
        </Suspense>
      )
    }
    if (phase === 'account') {
      return (
        <Suspense
          fallback={
            <FetchAppShellSuspenseFallback
              title="Opening your account…"
              subtitle="Loading preferences and profile."
            />
          }
        >
          <DropsProfileAccountScreen
            onBack={() => setPhase('home')}
            onSignOut={() => setPhase('home')}
            onOpenDriver={openDriverDashboard}
            onOpenOnboarding={openOnboardingFromAccount}
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
      <FetchAppErrorBoundary>
        <div className="fetch-app-shell-bg relative flex min-h-dvh min-h-[100dvh] w-full justify-center">
          <div className="fetch-app-shell-inner relative z-[1] mx-auto min-h-dvh min-h-[100dvh] w-full max-w-[1024px] overflow-x-clip overflow-y-visible">
            <FetchAppAuthDebugPanel
              phase={phase}
              pathname={pathname}
              authLoading={!shellHydrateDone}
              sessionUserId={authSessionUserId}
              profileLoaded={profileLoaded}
              fallbackActive={phase === 'boot'}
            />
            {profileSyncPending ? (
              <div
                className="pointer-events-none absolute left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] z-[120] -translate-x-1/2 rounded-full border border-white/12 bg-black/72 px-3 py-1.5 text-[11px] font-medium text-white/92 shadow-lg shadow-black/25 ring-1 ring-white/10 backdrop-blur-md transition-opacity duration-200 motion-reduce:transition-none"
                role="status"
                aria-live="polite"
              >
                Finishing your profile…
              </div>
            ) : null}
            {phaseBody}
          </div>
        </div>
      </FetchAppErrorBoundary>
    </FetchVoiceProvider>
  )
}

export default App
