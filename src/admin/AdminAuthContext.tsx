import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { pingStoreAdmin } from '../lib/storeApi'

/** Session key for store admin — shared across all /admin/* routes. */
export const FETCH_STORE_ADMIN_SESSION_KEY = 'fetch_store_marketplace_admin_key'

function readStoredAdminKey(): string {
  if (typeof sessionStorage === 'undefined') return ''
  return sessionStorage.getItem(FETCH_STORE_ADMIN_SESSION_KEY)?.trim() ?? ''
}

type AdminAuthContextValue = {
  adminKey: string
  /** True when a key is stored and the user has unlocked this session (or restored from session). */
  unlocked: boolean
  authBusy: boolean
  authError: string | null
  adminKeyInput: string
  setAdminKeyInput: (v: string) => void
  /** Validate key with server and persist to sessionStorage. */
  unlock: () => Promise<void>
  /** Remove key from memory and sessionStorage. */
  lockAdmin: () => void
  clearAuthError: () => void
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [adminKey, setAdminKey] = useState(() => readStoredAdminKey())
  const [unlocked, setUnlocked] = useState(() => Boolean(readStoredAdminKey()))
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [adminKeyInput, setAdminKeyInput] = useState('')

  const unlock = useCallback(async () => {
    const k = adminKeyInput.trim()
    if (!k) return
    setAuthBusy(true)
    setAuthError(null)
    try {
      await pingStoreAdmin(k)
      sessionStorage.setItem(FETCH_STORE_ADMIN_SESSION_KEY, k)
      setAdminKey(k)
      setUnlocked(true)
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Invalid key')
    } finally {
      setAuthBusy(false)
    }
  }, [adminKeyInput])

  const lockAdmin = useCallback(() => {
    sessionStorage.removeItem(FETCH_STORE_ADMIN_SESSION_KEY)
    setAdminKey('')
    setUnlocked(false)
    setAdminKeyInput('')
    setAuthError(null)
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])

  const value = useMemo(
    () => ({
      adminKey,
      unlocked,
      authBusy,
      authError,
      adminKeyInput,
      setAdminKeyInput,
      unlock,
      lockAdmin,
      clearAuthError,
    }),
    [adminKey, unlocked, authBusy, authError, adminKeyInput, unlock, lockAdmin, clearAuthError],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}

type AdminUnlockPanelProps = {
  title: string
  description: string
}

/** Shared unlock form — uses session-persisted key after successful unlock. */
export function AdminUnlockPanel({ title, description }: AdminUnlockPanelProps) {
  const { adminKeyInput, setAdminKeyInput, unlock, authBusy, authError } = useAdminAuth()
  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-[14px] text-zinc-600">{description}</p>
      <input
        type="password"
        autoComplete="off"
        className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px]"
        placeholder="Admin key"
        value={adminKeyInput}
        onChange={(e) => setAdminKeyInput(e.target.value)}
      />
      {authError ? <p className="text-[14px] text-red-600">{authError}</p> : null}
      <button
        type="button"
        disabled={authBusy || !adminKeyInput.trim()}
        className="w-full rounded-xl bg-zinc-900 py-3 text-[15px] font-bold text-white disabled:opacity-40"
        onClick={() => void unlock()}
      >
        {authBusy ? 'Checking…' : 'Unlock'}
      </button>
    </div>
  )
}
