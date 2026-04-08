import { FETCH_DROPS_OFFICIAL_AUTHOR_ID } from '../drops/constants'
import {
  accountAuthorIdFromEmail,
  formatDropHandle,
  getMyDropProfile,
  isFetchOfficialAuthor,
} from '../drops/profileStore'
import type { DropCreatorProfile } from '../drops/types'
import { loadPlatformIdentity } from '../fetchPlatformIdentity'
import { loadSession } from '../fetchUserSession'
import {
  getFollowersCountForAuthor,
  getFollowingCountForAuthor,
} from './followGraphStore'
import type { FetchProfileBadge, FetchPublicProfileKind, FetchPublicProfileVm } from './types'

const STORE_AUTHORS = new Set([
  'demo_fetch_supply',
  'demo_brisbane_basics',
  'demo_office_nosh',
  FETCH_DROPS_OFFICIAL_AUTHOR_ID,
])

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function stripHandle(s: string): string {
  return s.trim().replace(/^@+/, '')
}

function readLiveHint(authorId: string): { live: boolean; url?: string } {
  try {
    const raw = localStorage.getItem(`fetch.profile.live.${authorId}`)?.trim()
    if (!raw) return { live: false }
    return { live: true, url: raw.startsWith('http') ? raw : undefined }
  } catch {
    return { live: false }
  }
}

/**
 * Build a trust-forward profile card for any Drops author (curated, local, or API).
 */
export function resolvePublicProfile(
  authorId: string,
  sellerDisplay: string,
  ctx?: {
    dropProfile?: DropCreatorProfile | null
    /** When resolving “me” from Account without a Drops profile id yet */
    forceSessionName?: string
  },
): FetchPublicProfileVm {
  if (authorId === '__self__') {
    return resolvePublicProfileForAccountSelf(getMyDropProfile())
  }
  const prof = ctx?.dropProfile && ctx.dropProfile.id === authorId ? ctx.dropProfile : null
  const session = loadSession()
  const identity = loadPlatformIdentity()
  const handleFromSeller = stripHandle(sellerDisplay) || 'creator'
  const displayName =
    prof?.displayName ??
    (ctx?.forceSessionName?.trim() ?? session?.displayName?.trim() ?? handleFromSeller)
  const handle = displayName.startsWith('@') ? displayName : `@${stripHandle(displayName)}`
  const avatar = prof?.avatar ?? (isFetchOfficialAuthor(authorId) ? '✓' : defaultAvatarEmoji(authorId))

  const me = getMyDropProfile()
  const isSelfPartner =
    identity.role === 'partner' && identity.complete && Boolean(me && me.id === authorId)
  const kind: FetchPublicProfileKind = isSelfPartner
    ? 'partner'
    : STORE_AUTHORS.has(authorId)
      ? 'store'
      : 'fetcher'

  const seed = hashSeed(authorId)
  const km = 2 + (seed % 8)
  const region = ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Sydney', 'Melbourne'][seed % 5] ?? 'Brisbane'

  let rating = 4.6 + (seed % 35) / 100
  let completedJobs = 12 + (seed % 180)
  let salesCount = seed % 900
  const badges: FetchProfileBadge[] = []

  if (isFetchOfficialAuthor(authorId)) {
    rating = 4.95
    completedJobs = 2400
    salesCount = 12800
    badges.push('verified', 'top_seller')
  } else if (kind === 'store') {
    rating = 4.75 + (seed % 20) / 100
    salesCount = 200 + (seed % 4000)
    completedJobs = 80 + (seed % 400)
    if (seed % 3 === 0) badges.push('top_seller')
    if (seed % 5 === 0) badges.push('verified')
  } else if (kind === 'partner') {
    rating = 4.82 + (seed % 15) / 100
    completedJobs = 340 + (seed % 800)
    salesCount = Math.min(salesCount, 40)
    badges.push('verified', 'top_partner')
  } else {
    completedJobs = 4 + (seed % 60)
    salesCount = seed % 80
    if (seed % 7 === 0) badges.push('verified')
  }

  const live = readLiveHint(authorId)

  let followersCount = getFollowersCountForAuthor(authorId)
  let followingCount = getFollowingCountForAuthor(authorId)
  if (isFetchOfficialAuthor(authorId)) {
    followersCount = Math.max(followersCount, 128_400)
    followingCount = Math.max(followingCount, 24)
  } else if (STORE_AUTHORS.has(authorId)) {
    followersCount = Math.max(followersCount, 620 + (seed % 4000))
    followingCount = Math.max(followingCount, 8 + (seed % 40))
  } else if (kind === 'partner') {
    followersCount = Math.max(followersCount, 40 + (seed % 200))
    followingCount = Math.max(followingCount, 12 + (seed % 30))
  } else {
    followersCount = Math.max(followersCount, seed % 12)
    followingCount = Math.max(followingCount, seed % 20)
  }

  return {
    authorId,
    displayName: stripHandle(displayName),
    handle,
    avatar,
    kind,
    locationLabel: `${region} · ${km}km`,
    rating: Math.round(rating * 10) / 10,
    completedJobs,
    salesCount,
    followersCount,
    followingCount,
    badges: [...new Set(badges)],
    isLive: live.live,
    livePlaybackUrl: live.url,
    responseTimeLabel: kind === 'partner' ? `${8 + (seed % 20)} min avg` : undefined,
  }
}

function defaultAvatarEmoji(authorId: string): string {
  const emojis = ['🏪', '🛍️', '📦', '⭐', '🔥', '💼', '🌿', '🎯']
  return emojis[hashSeed(authorId) % emojis.length]!
}

/** Account tab: merge session + optional Drops creator profile. */
export function resolvePublicProfileForAccountSelf(dropProfile: DropCreatorProfile | null): FetchPublicProfileVm {
  const session = loadSession()
  if (dropProfile) {
    return resolvePublicProfile(dropProfile.id, formatDropHandle(dropProfile.displayName), { dropProfile })
  }
  const id = session?.email ? accountAuthorIdFromEmail(session.email) : 'acct_guest'
  const seller = session?.displayName?.trim()
    ? formatDropHandle(session.displayName)
    : '@you'
  return resolvePublicProfile(id, seller, { forceSessionName: session?.displayName })
}
