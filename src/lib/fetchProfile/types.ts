export type FetchPublicProfileKind = 'fetcher' | 'store' | 'partner'

export type FetchProfileBadge = 'verified' | 'top_seller' | 'top_partner'

/** Unified view-model for TikTok-style + trust profile surfaces. */
export type FetchPublicProfileVm = {
  authorId: string
  displayName: string
  handle: string
  avatar: string
  kind: FetchPublicProfileKind
  locationLabel: string
  rating: number
  completedJobs: number
  salesCount: number
  /** Social graph (device-local demo); seeded floors for curated merchants. */
  followersCount: number
  followingCount: number
  badges: FetchProfileBadge[]
  isLive: boolean
  livePlaybackUrl?: string
  responseTimeLabel?: string
}

export type FetchProfileTabId = 'drops' | 'items' | 'services' | 'reviews'
