import { useSyncExternalStore } from 'react'

export type AuthStateSnapshot = {
  sessionUserId: string | null
  loading: boolean
}

let snap: AuthStateSnapshot = {
  sessionUserId: null,
  loading: true,
}

const listeners = new Set<() => void>()

export function setAuthState(next: Partial<AuthStateSnapshot>): void {
  snap = { ...snap, ...next }
  for (const listener of listeners) listener()
}

export function getAuthState(): AuthStateSnapshot {
  return snap
}

export function useAuthState(): AuthStateSnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snap,
    () => snap,
  )
}

