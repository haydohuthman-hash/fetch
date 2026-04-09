/**
 * Drops domain types. Client-side feed + profiles today; server should enforce
 * unique @handles, payments, geo/category targeting, and real view counts.
 */

export type DropCategoryId =
  | 'supplies'
  | 'local_pickup'
  | 'b2b'
  | 'promo'
  | 'community'
  | 'services'

export type DropRegionCode = 'SEQ' | 'NSW' | 'VIC' | 'AU_WIDE'

export type DropBoostTier = 0 | 1 | 2 | 3

/** Items pinned to a live stream / replay; each chip maps to a single commerce handoff. */
export type LiveShowcaseCommerceItem =
  | { kind: 'marketplace_product'; productId: string; label?: string }
  | { kind: 'buy_sell_listing'; listingId: string; label?: string }

export type DropsCommerceTarget =
  | { kind: 'marketplace_product'; productId: string }
  | { kind: 'buy_sell_listing'; listingId: string }
  | { kind: 'live_showcase'; items: LiveShowcaseCommerceItem[] }

/** Optional payload when confirming a drops commerce action (e.g. auction bid). */
export type DropsCommerceActionMeta = {
  bidAmountAud?: number
}

/** How the drop is sold when commerce is attached (Phase 6 auctions extend buy_now). */
export type DropsCommerceSaleMode = 'buy_now' | 'auction'

export type DropMediaKind = 'video' | 'images' | 'live_replay'

export type DropReel = {
  id: string
  /** Vertical video URL (omit when `imageUrls` is used for photo carousel). */
  videoUrl?: string
  /** One or more photos — mobile-first carousel when set. */
  imageUrls?: string[]
  /** Derived server-side; optional on client for live replays. */
  mediaKind?: DropMediaKind
  poster?: string
  title: string
  /** @handle style, e.g. @FetchSupply */
  seller: string
  /** Stable author key for profile resolution (e.g. fetch_official, acct_*) */
  authorId: string
  priceLabel: string
  blurb: string
  /** Seed like count shown in feed (likes + user engagement merged in UI). */
  likes: number
  /** Relative momentum for “growing” ranking (1 = baseline). */
  growthVelocityScore: number
  /** Total watch time seed (ms); merged with local watch telemetry. */
  watchTimeMsSeed: number
  /** Server-aggregated view ms (from engagement); merged in mapApiReel for ranking. */
  viewMsTotal?: number
  categories: DropCategoryId[]
  region: DropRegionCode
  commerce?: DropsCommerceTarget
  /** When auction, UI shows Place bid instead of Buy now (Phase 6). */
  commerceSaleMode?: DropsCommerceSaleMode
  /** Fetch team / paid placement — same boost rules as paid. */
  isOfficial?: boolean
  isSponsored?: boolean
}

export function dropIsPhotoCarousel(reel: DropReel): boolean {
  return Array.isArray(reel.imageUrls) && reel.imageUrls.length > 0
}

export function dropIsVideo(reel: DropReel): boolean {
  return !dropIsPhotoCarousel(reel) && Boolean(reel.videoUrl?.trim())
}

export type DropCreatorProfile = {
  id: string
  /** Unique display handle without @; stored lower trimmed for uniqueness. */
  displayName: string
  /** Emoji or short URL to image */
  avatar: string
  updatedAt: number
  /** When set, this creator row is the signed-in Fetch account’s public identity. */
  linkedEmail?: string
}
