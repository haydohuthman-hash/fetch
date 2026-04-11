import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyFetchAccentToRoot,
  FETCH_ACCENT_DEFAULT_HEX,
  hexToRgb,
  loadFetchAccentHex,
  saveFetchAccentHex,
} from '../lib/fetchAccentPreference'

export type FetchAccentRgb = { r: number; g: number; b: number }

type FetchAccentContextValue = {
  accentHex: string
  accentRgb: FetchAccentRgb
  setAccentHex: (hex: string) => void
}

const FetchAccentContext = createContext<FetchAccentContextValue | null>(null)

export function FetchAccentProvider({ children }: { children: ReactNode }) {
  const [accentHex, setAccentHexState] = useState(() =>
    typeof window !== 'undefined' ? loadFetchAccentHex() : FETCH_ACCENT_DEFAULT_HEX,
  )

  useLayoutEffect(() => {
    applyFetchAccentToRoot(accentHex)
  }, [accentHex])

  const setAccentHex = useCallback((hex: string) => {
    const saved = saveFetchAccentHex(hex)
    setAccentHexState(saved)
    applyFetchAccentToRoot(saved)
  }, [])

  const accentRgb = useMemo(() => hexToRgb(accentHex), [accentHex])

  const value = useMemo(
    () => ({ accentHex, accentRgb, setAccentHex }),
    [accentHex, accentRgb, setAccentHex],
  )

  return <FetchAccentContext.Provider value={value}>{children}</FetchAccentContext.Provider>
}

export function useFetchAccent(): FetchAccentContextValue {
  const ctx = useContext(FetchAccentContext)
  if (!ctx) {
    return {
      accentHex: FETCH_ACCENT_DEFAULT_HEX,
      accentRgb: hexToRgb(FETCH_ACCENT_DEFAULT_HEX),
      setAccentHex: () => {},
    }
  }
  return ctx
}
