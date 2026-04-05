import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  THEME_PREFERENCE_KEY,
  type ResolvedFetchTheme,
  type ThemePreference,
} from '../lib/fetchThemeStorage'

type FetchThemeContextValue = {
  preference: ThemePreference
  resolved: ResolvedFetchTheme
  setPreference: (next: ThemePreference) => void
}

const FetchThemeContext = createContext<FetchThemeContextValue | null>(null)

function applyDomTheme(resolved: ResolvedFetchTheme) {
  document.documentElement.dataset.fetchTheme = resolved
}

export function FetchThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window !== 'undefined' ? loadThemePreference() : 'system',
  )
  const [tick, setTick] = useState(0)

  const resolved = useMemo(() => resolveTheme(preference, new Date(tick)), [preference, tick])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    saveThemePreference(next)
  }, [])

  useEffect(() => {
    applyDomTheme(resolved)
  }, [resolved])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_PREFERENCE_KEY && e.newValue) {
        const v = e.newValue.trim()
        if (v === 'light' || v === 'dark' || v === 'system') {
          setPreferenceState(v)
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (preference !== 'system') return
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000)
    const onVis = () => setTick((n) => n + 1)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [preference])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <FetchThemeContext.Provider value={value}>{children}</FetchThemeContext.Provider>
}

export function useFetchTheme(): FetchThemeContextValue {
  const ctx = useContext(FetchThemeContext)
  if (!ctx) {
    throw new Error('useFetchTheme must be used within FetchThemeProvider')
  }
  return ctx
}
