import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { loadSession } from './lib/fetchUserSession'
import { FetchVoiceProvider } from './voice/FetchVoiceContext'
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

function hasDriverQuery() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('driver')
}

/** Short splash; home chunk prefetches in parallel so Suspense resolves quickly. */
const SPLASH_MS = 220

function PhaseFallback() {
  return <div className="fetch-app-shell-bg min-h-dvh" aria-hidden />
}

function App() {
  const [phase, setPhase] = useState<AppPhase>(() => (hasDriverQuery() ? 'driver' : 'splash'))

  useEffect(() => {
    void homeChunk()
    void authChunk()
    void accountChunk()
    void driverChunk()
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

  useEffect(() => {
    if (phase !== 'splash') return
    const readyTimer = window.setTimeout(() => setPhase('home'), SPLASH_MS)
    return () => {
      window.clearTimeout(readyTimer)
    }
  }, [phase])

  return (
    <FetchVoiceProvider>
      <div className="fetch-app-shell-bg flex min-h-dvh min-h-[100dvh] w-full justify-center">
        <div className="fetch-app-shell-inner relative mx-auto min-h-dvh min-h-[100dvh] w-full max-w-[1024px] overflow-x-clip overflow-y-visible">
          {phase === 'splash' ? (
            <SplashScreen />
          ) : phase === 'driver' ? (
            <Suspense fallback={<PhaseFallback />}>
              <DriverDashboardView onBack={leaveDriverDashboard} />
            </Suspense>
          ) : phase === 'home' ? (
            <Suspense fallback={<PhaseFallback />}>
              <HomeView onAccountNavigate={goAccountFromHome} />
            </Suspense>
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
