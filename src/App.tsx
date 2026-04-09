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
import { loadSession, refreshSessionFromSupabase } from './lib/fetchUserSession'
import { getSupabaseBrowserClient } from './lib/supabase/client'
import { cleanupSupabaseOAuthUrl } from './lib/supabase/oauthSession'
import { FetchVoiceProvider } from './voice/FetchVoiceContext'
import { FetchBootstrappingProvider } from './boot/FetchBootstrappingContext'
import { FetchBootstrapOverlay } from './components/FetchBootstrapOverlay'
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

type AppPhase = 'splash' | 'home' | 'auth' | 'onboarding' | 'dropsSetup' | 'account' | 'driver'

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
  return 'splash'
}

/** After splash, show bootstrap until map ready + min time, unless overlay already finished this load. */
function initialHomeBootstrapOpen(): boolean {
  if (typeof window === 'undefined') return false
  if (!fetchAppSplashHandoffDone) return false
  return !fetchAppBootstrapExitDone
}

function PhaseFallback() {
  return <div className="fetch-app-phase-fallback fetch-app-shell-bg min-h-dvh" aria-hidden />
}

const SPLASH_SESSION_WAIT_MS = 4500

function applyPostAuthRouteIfNeeded(
  setDropsHome: () => void,
  setPhase: Dispatch<SetStateAction<AppPhase>>,
): void {
  const target = computePostAuthAppPhase()
  // #region agent log
  fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'App.tsx:applyPostAuth',message:'applyPostAuth target',data:{target,hypothesisId:'H4'},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  if (!target) return
  if (target === 'dropsSetup') setDropsHome()
  setPhase((cur) => {
    if (cur === 'account' || cur === 'driver') return cur
    if (cur === 'auth' || cur === 'onboarding' || cur === 'dropsSetup') return cur
    if (cur === 'splash' || cur === 'home') return target
    return cur
  })
}

function App() {
  const [phase, setPhase] = useState<AppPhase>(initialAppPhase)
  const [homeBootstrapOpen, setHomeBootstrapOpen] = useState(initialHomeBootstrapOpen)
  const [homeMapBootReady, setHomeMapBootReady] = useState(false)
  const [onboardingAllowDismiss, setOnboardingAllowDismiss] = useState(false)
  /**
   * When false, ignore post-auth phase jumps from onAuthStateChange so splash can finish and session cache can hydrate.
   * Seed from module splash flag so React Strict Mode remounts after handoff don’t stay “locked” on home.
   */
  const postAuthRouteUnlockedRef = useRef(fetchAppSplashHandoffDone)

  useEffect(() => {
    void homeChunk()
    void authChunk()
    void dropsProfileAccountChunk()
    void driverChunk()
    void onboardingChunk()
    void dropsCreatorSetupChunk()
  }, [])

  useEffect(() => {
    void refreshSessionFromSupabase()
  }, [])

  useEffect(() => {
    const sb = getSupabaseBrowserClient()
    if (!sb) return
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(async (event, session) => {
      console.log('AUTH CHANGE:', event, session?.user?.id)
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'App.tsx:onAuthStateChange',message:'auth event',data:{event,hasUser:Boolean(session?.user),unlocked:postAuthRouteUnlockedRef.current,hypothesisId:'H3'},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      if (session?.user) {
        await refreshSessionFromSupabase()
        cleanupSupabaseOAuthUrl()
      } else if (event === 'SIGNED_OUT') {
        await refreshSessionFromSupabase()
        cleanupSupabaseOAuthUrl()
        setPhase((cur) => (cur === 'auth' || cur === 'splash' ? cur : 'home'))
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (session?.user && postAuthRouteUnlockedRef.current) {
          applyPostAuthRouteIfNeeded(() => setDropsCreatorReturnTarget('home'), setPhase)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const goAccountFromHome = useCallback(() => {
    if (!loadSession()) {
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
      setPhase((p) => (p === 'splash' ? (postAuth ?? 'home') : p))

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

  return (
    <FetchVoiceProvider>
      <div className="fetch-app-shell-bg relative flex min-h-dvh min-h-[100dvh] w-full justify-center">
        <div className="fetch-app-shell-inner relative z-[1] mx-auto min-h-dvh min-h-[100dvh] w-full max-w-[1024px] overflow-x-clip overflow-y-visible">
          {phase === 'splash' ? (
            <SplashScreen onComplete={handleSplashComplete} />
          ) : phase === 'driver' ? (
            <Suspense fallback={<PhaseFallback />}>
              <DriverDashboardView onBack={leaveDriverDashboard} />
            </Suspense>
          ) : phase === 'home' ? (
            <FetchBootstrappingProvider value={homeBootstrapOpen}>
              <Suspense fallback={<PhaseFallback />}>
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
          ) : phase === 'auth' ? (
            <Suspense fallback={<PhaseFallback />}>
              <AuthScreen
                initialTab="signup"
                onBack={() => setPhase('home')}
                onSuccess={() => {
                  setOnboardingAllowDismiss(false)
                  if (needsPlatformOnboarding()) {
                    setPhase('onboarding')
                  } else if (needsDropsCreatorOnboarding()) {
                    setDropsCreatorReturnTarget('home')
                    setPhase('dropsSetup')
                  } else {
                    setPhase('account')
                  }
                }}
              />
            </Suspense>
          ) : phase === 'onboarding' ? (
            <Suspense fallback={<PhaseFallback />}>
              <AccountOnboardingView
                onDoneFetcher={() => finishOnboarding('fetcher')}
                onDonePartner={() => finishOnboarding('partner')}
                allowDismissToAccount={onboardingAllowDismiss}
                onDismissToAccount={dismissOnboardingToAccount}
              />
            </Suspense>
          ) : phase === 'dropsSetup' ? (
            <Suspense fallback={<PhaseFallback />}>
              <DropsCreatorSetupView
                onDone={(dest) => setPhase(dest === 'account' ? 'account' : 'home')}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<PhaseFallback />}>
              <DropsProfileAccountScreen
                onBack={() => setPhase('home')}
                onSignOut={() => setPhase('home')}
                onOpenDriver={openDriverDashboard}
                onOpenOnboarding={openOnboardingFromAccount}
              />
            </Suspense>
          )}
        </div>
      </div>
    </FetchVoiceProvider>
  )
}

export default App
