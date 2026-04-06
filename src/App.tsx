import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { loadSession } from './lib/fetchUserSession'
import { FetchVoiceProvider } from './voice/FetchVoiceContext'
import { FetchBootstrappingProvider } from './boot/FetchBootstrappingContext'
import { FetchBootstrapOverlay } from './components/FetchBootstrapOverlay'
import SplashScreen from './views/SplashScreen'

const homeChunk = () => import('./views/HomeView')
const HomeView = lazy(homeChunk)

const authChunk = () => import('./views/AuthScreen')
const AuthScreen = lazy(authChunk)

const accountChunk = () => import('./components/UserScreens/AccountScreen').then((m) => ({
  default: m.AccountScreen,
}))
const AccountScreen = lazy(accountChunk)

const driverChunk = () => import('./views/DriverDashboardView')
const DriverDashboardView = lazy(driverChunk)

type AppPhase = 'splash' | 'home' | 'auth' | 'account' | 'driver'

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

function App() {
  const [phase, setPhase] = useState<AppPhase>(initialAppPhase)
  const [homeBootstrapOpen, setHomeBootstrapOpen] = useState(initialHomeBootstrapOpen)
  const [homeMapBootReady, setHomeMapBootReady] = useState(false)

  useEffect(() => {
    void homeChunk()
    void authChunk()
    void accountChunk()
    void driverChunk()
  }, [])

  useEffect(() => {
    if (import.meta.env.VITE_FETCH_AUTH_USERS_DB !== '1') return
    void (async () => {
      const { fetchAuthMe } = await import('./lib/fetchServerAuth')
      const { applyServerUserProfile } = await import('./lib/fetchUserSession')
      const me = await fetchAuthMe()
      if (me) applyServerUserProfile(me)
    })()
  }, [])

  const goAccountFromHome = useCallback(() => {
    setPhase(loadSession() ? 'account' : 'auth')
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

  const handleSplashComplete = useCallback(() => {
    if (!fetchAppSplashHandoffDone) {
      fetchAppSplashHandoffDone = true
      fetchAppBootstrapExitDone = false
      setHomeMapBootReady(false)
      setHomeBootstrapOpen(true)
    }
    // Always leave splash if we are still on it (guards Strict Mode / duplicate callbacks).
    setPhase((p) => (p === 'splash' ? 'home' : p))
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
                onSuccess={() => setPhase('account')}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<PhaseFallback />}>
              <AccountScreen
                onBack={() => setPhase('home')}
                onSignOut={() => setPhase('home')}
                onOpenDriver={openDriverDashboard}
              />
            </Suspense>
          )}
        </div>
      </div>
    </FetchVoiceProvider>
  )
}

export default App
