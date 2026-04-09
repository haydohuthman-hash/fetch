import type { DropCategoryId, DropReel, DropRegionCode } from './types'

/** Verified Fetch Drops admin — used for official promos (mirrors paid boost slots). */
export const FETCH_DROPS_OFFICIAL_AUTHOR_ID = 'fetch_official'

export const FETCH_DROPS_OFFICIAL_HANDLE = '@Fetch'

export const DROP_CATEGORY_LABELS: Record<DropCategoryId, string> = {
  supplies: 'Supplies',
  local_pickup: 'Local pickup',
  b2b: 'Business',
  promo: 'Promo',
  community: 'Community',
  services: 'Services',
}

export const DROP_REGION_LABELS: Record<DropRegionCode, string> = {
  SEQ: 'South East QLD',
  NSW: 'New South Wales',
  VIC: 'Victoria',
  AU_WIDE: 'Australia',
}

/**
 * Placeholder MAU for smart-view estimates until real analytics exist.
 * `0` means estimates show as unavailable (no demo audience numbers).
 */
export const DROPS_ESTIMATED_MAU = 0

/** Client-side seed reels removed — feed is API + user posts only. */
export const CURATED_DROP_REELS: readonly DropReel[] = []

/** What to wire server-side next (payments, fraud, real MAU, geo). */
export const DROPS_BACKEND_NEXT_STEPS = [
  'Persist reels, watch time, and likes in Postgres with idempotent events.',
  'Enforce globally unique @handle via server + index; block reserved names (Fetch, admin).',
  'Stripe Checkout for boost SKUs; store boost_window_start/end and tier.',
  'Targeting: save advertiser regions + categories; match to viewer prefs / IP region.',
  'Smart views: blend impressions, completion rate, and cohort size for estimates.',
  'Moderation queue for boosted + official slots; rate limits per account.',
] as const
