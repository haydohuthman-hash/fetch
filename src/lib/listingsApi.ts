import type { BookingPaymentIntent } from './assistant/types'
import { getFetchApiBaseUrl } from './fetchApiBase'
import { marketplaceActorHeaders } from './booking/marketplaceApiAuth'

export type PeerListing = {
  id: string
  createdAt: number
  updatedAt: number
  sellerUserId: string | null
  sellerEmail: string | null
  title: string
  description: string
  priceCents: number
  category: string
  condition: string
  status: string
  images: { url: string; sort?: number }[]
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
  cursor?: string
}): Promise<{ listings: PeerListing[]; nextCursor: string | null }> {
  const qs = new URLSearchParams()
  if (params?.q) qs.set('q', params.q)
  if (params?.category) qs.set('category', params.category)
  if (params?.cursor) qs.set('cursor', params.cursor)
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

export async function createListing(body: {
  title: string
  description?: string
  priceAud: number
  category?: string
  condition?: string
}): Promise<PeerListing> {
  const payload = await listingsJson<{ listing: PeerListing }>('/api/listings', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return payload.listing
}

export async function publishListing(id: string): Promise<PeerListing> {
  const payload = await listingsJson<{ listing: PeerListing }>(
    `/api/listings/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
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

export async function fetchSellerEarnings(): Promise<{
  ledger: unknown[]
  summary: { grossCents: number; feeCents: number; netCents: number; currency: string }
}> {
  return listingsJson('/api/sellers/me/earnings')
}

export function listingImageAbsoluteUrl(relativeOrAbsolute: string): string {
  if (relativeOrAbsolute.startsWith('http')) return relativeOrAbsolute
  return `${getFetchApiBaseUrl()}${relativeOrAbsolute.startsWith('/') ? '' : '/'}${relativeOrAbsolute}`
}
