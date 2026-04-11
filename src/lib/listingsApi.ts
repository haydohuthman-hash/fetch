import type { BookingPaymentIntent } from './assistant/types'
import { getFetchApiBaseUrl } from './fetchApiBase'
import { marketplaceActorHeaders } from './booking/marketplaceApiAuth'

/** Server-backed public demo furniture listings (`demo-marketplace-seed.js`). */
export const PUBLIC_DEMO_LISTING_ID_PREFIX = 'demo_pub_lst_'

export function isPublicDemoListingId(listingId: string): boolean {
  return typeof listingId === 'string' && listingId.startsWith(PUBLIC_DEMO_LISTING_ID_PREFIX)
}

export const DEMO_LISTING_CHECKOUT_DISABLED_MESSAGE =
  'This is a showcase listing — checkout is disabled. List your own item and connect Stripe to test buying and selling.'

/** Map common marketplace checkout API errors to buyer-friendly copy. */
export function formatListingCheckoutError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes('demo_listing_no_checkout')) {
    return DEMO_LISTING_CHECKOUT_DISABLED_MESSAGE
  }
  if (raw.includes('seller_not_connect_ready')) {
    return 'This seller has not connected payouts yet. Try messaging them or another listing.'
  }
  if (raw.includes('seller_onboarding_incomplete')) {
    return 'The seller still needs to finish payment setup. Message them or try again later.'
  }
  return raw
}

export type PeerListing = {
  id: string
  createdAt: number
  updatedAt: number
  sellerUserId: string | null
  sellerEmail: string | null
  /** Drops / Fetch public profile id (same as `DropCreatorProfile.id`) */
  profileAuthorId?: string | null
  /** Display name without @ — shown as public seller handle */
  profileDisplayName?: string | null
  /** Emoji or image URL */
  profileAvatar?: string | null
  title: string
  description: string
  priceCents: number
  /** Optional “was / retail” price in cents — must exceed priceCents when set */
  compareAtCents?: number
  category: string
  condition: string
  status: string
  images: { url: string; sort?: number }[]
  /** Comma / newline separated — matched by marketplace search */
  keywords?: string
  locationLabel?: string
  sku?: string | null
  acceptsOffers?: boolean
  fetchDelivery?: boolean
  /** Promo / logistics flag — shown as a badge when true */
  sameDayDelivery?: boolean
  /** `auction` = timed bidding; opening price is first-bid floor (reserve). */
  saleMode?: 'fixed' | 'auction'
  auctionEndsAt?: number | null
  reserveCents?: number
  minBidIncrementCents?: number
  auctionHighBidCents?: number
  auctionHighBidderKey?: string | null
  auctionClosed?: boolean
  bids?: { bidderKey: string; amountCents: number; createdAt: number; status?: string }[]
}

export type ListingOrder = {
  id: string
  listingId: string
  sellerKey: string
  buyerUserId?: string | null
  buyerEmail?: string | null
  priceCents: number
  platformFeeCents?: number
  sellerNetCents?: number
  status: string
  paymentIntentId?: string | null
}

async function listingsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getFetchApiBaseUrl()}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.method === 'GET' || init?.method === 'HEAD' ? {} : { 'Content-Type': 'application/json' }),
      ...marketplaceActorHeaders('customer'),
      ...(init?.headers ?? {}),
    },
  })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; detail?: string }
  if (!response.ok) {
    const error = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`
    const detail = typeof payload.detail === 'string' ? `: ${payload.detail}` : ''
    throw new Error(`${error}${detail}`)
  }
  return payload
}

export async function fetchPublishedListings(params?: {
  q?: string
  category?: string
  /** Drops public profile id — lists published peer listings tied to that profile */
  profileAuthorId?: string
  cursor?: string
  limit?: number
}): Promise<{ listings: PeerListing[]; nextCursor: string | null }> {
  const qs = new URLSearchParams()
  if (params?.q) qs.set('q', params.q)
  if (params?.category) qs.set('category', params.category)
  if (params?.profileAuthorId?.trim()) qs.set('profileAuthorId', params.profileAuthorId.trim())
  if (params?.cursor) qs.set('cursor', params.cursor)
  if (params?.limit != null && Number.isFinite(params.limit)) qs.set('limit', String(Math.floor(params.limit)))
  const suffix = qs.toString()
  const path = `/api/listings${suffix ? `?${suffix}` : ''}`
  const response = await fetch(`${getFetchApiBaseUrl()}${path}`, {
    credentials: 'include',
    headers: { ...marketplaceActorHeaders('customer') },
  })
  const payload = (await response.json().catch(() => ({}))) as {
    listings?: PeerListing[]
    nextCursor?: string | null
    error?: string
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`)
  }
  return { listings: payload.listings ?? [], nextCursor: payload.nextCursor ?? null }
}

export async function fetchListing(id: string): Promise<PeerListing> {
  const payload = await listingsJson<{ listing: PeerListing }>(`/api/listings/${encodeURIComponent(id)}`)
  return payload.listing
}

export async function fetchMyListings(): Promise<PeerListing[]> {
  const payload = await listingsJson<{ listings: PeerListing[] }>('/api/listings/mine')
  return payload.listings
}

export type ListingPhotoAiFill = {
  title: string
  description: string
  category: string
  condition: string
  keywords: string
  widthCm: number | null
  heightCm: number | null
  depthCm: number | null
  measurementsSummary: string | null
  suggestedPriceAud: number | null
  suggestedCompareAtAud: number | null
  sku: string | null
  confidence: number | null
}

/** Vision + LLM: suggest listing fields from seller photos (Buy & sell). */
export async function analyzeListingPhotosForSell(files: File[]): Promise<ListingPhotoAiFill> {
  const fd = new FormData()
  for (const f of files.slice(0, 8)) {
    fd.append('images', f)
  }
  const response = await fetch(`${getFetchApiBaseUrl()}/api/listings/ai-fill-from-photos`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...marketplaceActorHeaders('customer') },
    body: fd,
  })
  const payload = (await response.json().catch(() => ({}))) as ListingPhotoAiFill & {
    error?: string
    detail?: string
  }
  if (!response.ok) {
    const msg =
      typeof payload.error === 'string'
        ? payload.error
        : `AI listing scan failed (${response.status})`
    const detail = typeof payload.detail === 'string' ? `: ${payload.detail}` : ''
    throw new Error(`${msg}${detail}`)
  }
  return payload
}

/** Normalized JSON body for POST /api/listings — `priceAud` is always a finite number ≥ 0. */
export type ValidatedCreateListingBody = {
  title: string
  description: string
  priceAud: number
  category: string
  condition: string
  keywords: string
  locationLabel: string
  sku?: string
  acceptsOffers: boolean
  fetchDelivery: boolean
  sameDayDelivery: boolean
  compareAtPriceAud?: number
  profileAuthorId: string
  profileDisplayName: string
  profileAvatar?: string
  /** Pre-uploaded `/listing-uploads/...` from `uploadListingImagesForCreate` */
  images?: { url: string; sort: number }[]
  saleMode?: 'fixed' | 'auction'
  /** Epoch ms when the auction ends (required when `saleMode` is `auction`). */
  auctionEndsAt?: number
  /** Minimum raise between bids in whole cents (≥ 50). */
  minBidIncrementCents?: number
}

export type CreateListingDraftInput = {
  title: string
  description?: string
  /** Parsed number or numeric string — must be finite and ≥ 0 after normalization */
  priceAud: number | string
  category?: string
  condition?: string
  keywords?: string
  locationLabel?: string
  /** Used when `locationLabel` is empty (server also merges suburb) */
  suburb?: string
  sku?: string
  acceptsOffers?: boolean
  fetchDelivery?: boolean
  sameDayDelivery?: boolean
  compareAtPriceAud?: number
  profileAuthorId: string
  profileDisplayName: string
  profileAvatar?: string
  images?: { url: string; sort?: number }[]
  saleMode?: 'fixed' | 'auction'
  auctionEndsAt?: number
  minBidIncrementAud?: number
}

/**
 * Client-side guard before POST /api/listings: required title, finite priceAud ≥ 0, string fields normalized.
 * Images are optional; when present, coerces `{ url, sort }` so JSON never sends string prices.
 */
export function buildValidatedCreateListingBody(
  input: CreateListingDraftInput,
):
  | { ok: true; body: Omit<ValidatedCreateListingBody, 'images'> }
  | { ok: false; error: string } {
  const title = String(input.title ?? '').trim()
  if (!title) return { ok: false, error: 'Add a product title.' }

  const rawPrice = input.priceAud
  const priceNum =
    typeof rawPrice === 'string'
      ? Number.parseFloat(String(rawPrice).replace(/,/g, ''))
      : Number(rawPrice)
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return { ok: false, error: 'Enter a valid price in AUD (0 or more).' }
  }

  const description =
    typeof input.description === 'string' ? input.description.trim().slice(0, 8000) : ''
  const category =
    typeof input.category === 'string' && input.category.trim()
      ? input.category.trim().slice(0, 64)
      : 'general'
  const condition =
    typeof input.condition === 'string' && input.condition.trim()
      ? input.condition.trim().slice(0, 32)
      : 'used'
  const keywords =
    typeof input.keywords === 'string' ? input.keywords.trim().slice(0, 2000) : ''
  const loc =
    (typeof input.locationLabel === 'string' ? input.locationLabel.trim() : '') ||
    (typeof input.suburb === 'string' ? input.suburb.trim() : '')
  const locationLabel = loc.slice(0, 200)

  const profileAuthorId = String(input.profileAuthorId ?? '').trim()
  const profileDisplayName = String(input.profileDisplayName ?? '').trim()
  if (!profileAuthorId) {
    return { ok: false, error: 'Link your Fetch public profile before listing.' }
  }
  if (!profileDisplayName) {
    return { ok: false, error: 'Profile display name is required.' }
  }

  const skuRaw = input.sku != null ? String(input.sku).trim().slice(0, 64) : ''
  const body: Omit<ValidatedCreateListingBody, 'images'> = {
    title,
    description,
    priceAud: priceNum,
    category,
    condition,
    keywords,
    locationLabel,
    acceptsOffers: Boolean(input.acceptsOffers),
    fetchDelivery: Boolean(input.fetchDelivery),
    sameDayDelivery: Boolean(input.sameDayDelivery),
    profileAuthorId,
    profileDisplayName,
    profileAvatar: input.profileAvatar != null && String(input.profileAvatar).trim()
      ? String(input.profileAvatar).trim().slice(0, 120)
      : undefined,
  }
  if (skuRaw) body.sku = skuRaw
  if (input.compareAtPriceAud != null && Number.isFinite(Number(input.compareAtPriceAud))) {
    const c = Number(input.compareAtPriceAud)
    if (c > 0) body.compareAtPriceAud = c
  }

  const mode = input.saleMode === 'auction' ? 'auction' : 'fixed'
  if (mode === 'auction') {
    const ends = Number(input.auctionEndsAt)
    if (!Number.isFinite(ends) || ends <= Date.now() + 120_000) {
      return { ok: false, error: 'Choose an auction end time at least 2 minutes from now.' }
    }
    const minAud = input.minBidIncrementAud != null ? Number(input.minBidIncrementAud) : 1
    const minCents = Number.isFinite(minAud) && minAud > 0 ? Math.round(minAud * 100) : 100
    const bodyAuction: ValidatedCreateListingBody = {
      ...body,
      saleMode: 'auction',
      auctionEndsAt: Math.round(ends),
      minBidIncrementCents: Math.max(50, minCents),
    }
    return { ok: true, body: bodyAuction }
  }

  return { ok: true, body }
}

/** Attach pre-uploaded images (each `{ url, sort }`) after `uploadListingImagesForCreate` succeeds. */
export function withListingImages(
  body: Omit<ValidatedCreateListingBody, 'images'>,
  images: { url: string; sort: number }[] | undefined,
): ValidatedCreateListingBody {
  if (!images?.length) return { ...body }
  const safe = images
    .filter((x) => x && typeof x.url === 'string' && x.url.includes('/listing-uploads/'))
    .map((x, i) => ({
      url: x.url.trim().slice(0, 2048),
      sort: Number.isFinite(Number(x.sort)) ? Math.floor(Number(x.sort)) : i,
    }))
    .slice(0, 12)
  return safe.length ? { ...body, images: safe } : { ...body }
}

export async function createListing(body: ValidatedCreateListingBody): Promise<PeerListing> {
  try {
    const payload = await listingsJson<{ listing: PeerListing }>('/api/listings', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return payload.listing
  } catch (e) {
    console.error('POST ERROR', e)
    throw e
  }
}

/** Upload images before creating a listing — avoids orphan drafts if create fails. */
export async function uploadListingImagesForCreate(files: File[]): Promise<string[]> {
  if (!files.length) return []
  const fd = new FormData()
  for (const f of files.slice(0, 12)) {
    fd.append('files', f)
  }
  const response = await fetch(`${getFetchApiBaseUrl()}/api/listings/uploads`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...marketplaceActorHeaders('customer') },
    body: fd,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    urls?: string[]
    error?: string
    detail?: string
  }
  if (!response.ok) {
    const error = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`
    const detail = typeof payload.detail === 'string' ? `: ${payload.detail}` : ''
    console.error('POST ERROR', error + detail)
    throw new Error(`${error}${detail}`)
  }
  return Array.isArray(payload.urls) ? payload.urls : []
}

export async function publishListing(id: string): Promise<PeerListing> {
  const payload = await listingsJson<{ listing: PeerListing }>(
    `/api/listings/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  )
  return payload.listing
}

export async function patchListing(
  id: string,
  body: {
    title?: string
    description?: string
    priceAud?: number
    category?: string
    condition?: string
    keywords?: string
    locationLabel?: string
    sku?: string | null
    acceptsOffers?: boolean
    fetchDelivery?: boolean
    sameDayDelivery?: boolean
    compareAtPriceAud?: number
    compareAtCents?: number
    profileAuthorId?: string | null
    profileDisplayName?: string | null
    profileAvatar?: string | null
  },
): Promise<PeerListing> {
  const payload = await listingsJson<{ listing: PeerListing }>(
    `/api/listings/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  return payload.listing
}

export async function uploadListingImage(listingId: string, file: File): Promise<PeerListing> {
  const fd = new FormData()
  fd.append('file', file)
  const response = await fetch(
    `${getFetchApiBaseUrl()}/api/listings/${encodeURIComponent(listingId)}/images`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { ...marketplaceActorHeaders('customer') },
      body: fd,
    },
  )
  const payload = (await response.json().catch(() => ({}))) as { listing?: PeerListing; error?: string }
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Upload failed (${response.status})`)
  }
  if (!payload.listing) throw new Error('listing_missing')
  return payload.listing
}

export async function checkoutListing(listingId: string): Promise<{
  listingOrder: ListingOrder
  paymentIntent: BookingPaymentIntent
}> {
  return listingsJson(`/api/listings/${encodeURIComponent(listingId)}/checkout`, { method: 'POST' })
}

export async function placeListingBid(
  listingId: string,
  amountAud: number,
): Promise<{
  listing: PeerListing
  paymentIntent: { clientSecret: string; id: string } | null
}> {
  return listingsJson(`/api/listings/${encodeURIComponent(listingId)}/bid`, {
    method: 'POST',
    body: JSON.stringify({ amountAud }),
  })
}

export async function repostAuctionListing(
  listingId: string,
  body: { auctionEndsAt: number; priceAud?: number; minBidIncrementCents?: number },
): Promise<PeerListing> {
  const payload = await listingsJson<{ listing: PeerListing }>(
    `/api/listings/${encodeURIComponent(listingId)}/repost-auction`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return payload.listing
}

export async function startSellerConnect(): Promise<{ url: string; stripeAccountId: string }> {
  return listingsJson('/api/sellers/connect/start', { method: 'POST' })
}

export async function refreshSellerConnectStatus(): Promise<{ stripeAccountId: string; onboardingComplete: boolean }> {
  return listingsJson('/api/sellers/connect/refresh-status', { method: 'POST' })
}

export async function registerDevSellerStripe(stripeAccountId: string): Promise<void> {
  await listingsJson('/api/sellers/connect/register-dev', {
    method: 'POST',
    body: JSON.stringify({ stripeAccountId }),
  })
}

export async function fetchSellerMe(): Promise<{ seller: { stripeAccountId?: string; onboardingComplete?: boolean } | null }> {
  return listingsJson('/api/sellers/me')
}

export async function fetchSellerEarnings(params?: {
  /** Inclusive range on ledger `createdAt` (ms), server-side filter. */
  from?: number
  to?: number
}): Promise<{
  ledger: unknown[]
  summary: { grossCents: number; feeCents: number; netCents: number; currency: string }
}> {
  const qs = new URLSearchParams()
  if (params?.from != null && Number.isFinite(params.from)) qs.set('from', String(Math.floor(params.from)))
  if (params?.to != null && Number.isFinite(params.to)) qs.set('to', String(Math.floor(params.to)))
  const suffix = qs.toString()
  return listingsJson(`/api/sellers/me/earnings${suffix ? `?${suffix}` : ''}`)
}

export function listingImageAbsoluteUrl(relativeOrAbsolute: string): string {
  if (relativeOrAbsolute.startsWith('http')) return relativeOrAbsolute
  return `${getFetchApiBaseUrl()}${relativeOrAbsolute.startsWith('/') ? '' : '/'}${relativeOrAbsolute}`
}
