/** Opens `FetchProfileSheet` in Drops — listen in `HomeShellReelsPage`. */
export const FETCH_OPEN_PUBLIC_PROFILE = 'fetch-open-public-profile'

export type OpenPublicProfileDetail = {
  authorId: string
  sellerDisplay: string
  isSelf?: boolean
}

/** Survives tab switches when Reels is not mounted yet (Buy & Sell → View profile). */
const PENDING_MAX_AGE_MS = 120_000
type PendingOpen = OpenPublicProfileDetail & { storedAt: number }
let pendingOpenPublicProfile: PendingOpen | null = null

export function takePendingOpenPublicProfile(): OpenPublicProfileDetail | null {
  const p = pendingOpenPublicProfile
  pendingOpenPublicProfile = null
  if (!p || Date.now() - p.storedAt > PENDING_MAX_AGE_MS) return null
  const { storedAt: _t, ...detail } = p
  return detail
}

export function dispatchOpenPublicProfile(detail: OpenPublicProfileDetail): void {
  pendingOpenPublicProfile = { ...detail, storedAt: Date.now() }
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FETCH_OPEN_PUBLIC_PROFILE, { detail }))
}
