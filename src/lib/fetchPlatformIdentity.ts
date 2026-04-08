/**
 * Client-side platform identity after sign-in (role + interests).
 * Not a security boundary — drives UX routing and personalization.
 */

const STORAGE_KEY = 'fetch.platformIdentity.v1'

export type PlatformRole = 'fetcher' | 'partner'

export type FetcherInterestId = 'buy_browse' | 'sell' | 'go_live' | 'drops'
export type PartnerInterestId = 'deliver' | 'moving' | 'cleaning' | 'general_help'

export type PlatformInterestId = FetcherInterestId | PartnerInterestId

export type PlatformIdentityV1 = {
  version: 1
  complete: boolean
  role: PlatformRole | null
  interests: PlatformInterestId[]
  completedAt: number | null
}

const emptyIdentity = (): PlatformIdentityV1 => ({
  version: 1,
  complete: false,
  role: null,
  interests: [],
  completedAt: null,
})

export function loadPlatformIdentity(): PlatformIdentityV1 {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyIdentity()
    const o = JSON.parse(raw) as Partial<PlatformIdentityV1>
    if (!o || typeof o !== 'object' || o.version !== 1) return emptyIdentity()
    return {
      version: 1,
      complete: Boolean(o.complete),
      role: o.role === 'fetcher' || o.role === 'partner' ? o.role : null,
      interests: Array.isArray(o.interests)
        ? (o.interests.filter((x) => typeof x === 'string') as PlatformInterestId[])
        : [],
      completedAt: typeof o.completedAt === 'number' ? o.completedAt : null,
    }
  } catch {
    return emptyIdentity()
  }
}

export function needsPlatformOnboarding(): boolean {
  const id = loadPlatformIdentity()
  return !id.complete || !id.role
}

export function savePlatformIdentity(next: PlatformIdentityV1) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function completePlatformOnboarding(input: {
  role: PlatformRole
  interests: PlatformInterestId[]
}) {
  savePlatformIdentity({
    version: 1,
    complete: true,
    role: input.role,
    interests: [...new Set(input.interests)],
    completedAt: Date.now(),
  })
}

export const FETCHER_INTEREST_OPTIONS: {
  id: FetcherInterestId
  label: string
}[] = [
  { id: 'buy_browse', label: 'Buy & browse' },
  { id: 'sell', label: 'Sell items' },
  { id: 'go_live', label: 'Go live' },
  { id: 'drops', label: 'Explore Drops' },
]

export const PARTNER_INTEREST_OPTIONS: {
  id: PartnerInterestId
  label: string
}[] = [
  { id: 'deliver', label: 'Deliver' },
  { id: 'moving', label: 'Moving jobs' },
  { id: 'cleaning', label: 'Cleaning jobs' },
  { id: 'general_help', label: 'General help' },
]

export function roleLabel(role: PlatformRole | null): string {
  if (role === 'partner') return 'Fetch Partner'
  if (role === 'fetcher') return 'Fetcher'
  return 'Not set'
}

const ONBOARDING_RETURN_SESSION_KEY = 'fetch.onboardingReturn'

export function setOnboardingReturnTarget(target: 'account' | null) {
  try {
    if (target === 'account') sessionStorage.setItem(ONBOARDING_RETURN_SESSION_KEY, 'account')
    else sessionStorage.removeItem(ONBOARDING_RETURN_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** Read and clear — call once when finishing onboarding. */
export function consumeOnboardingReturnTarget(): 'account' | null {
  try {
    const v = sessionStorage.getItem(ONBOARDING_RETURN_SESSION_KEY)
    sessionStorage.removeItem(ONBOARDING_RETURN_SESSION_KEY)
    return v === 'account' ? 'account' : null
  } catch {
    return null
  }
}
