import type {
  BookingCustomerRating,
  BookingDriver,
  BookingLifecycleStatus,
  BookingPaymentIntent,
} from '../assistant'
import type {
  BookingMediaRecord,
  BookingNotificationRecord,
  BookingRecord,
  FetchAiBookingDraft,
  FetchAiReviewResponse,
  MarketplaceOffer,
  MarketplaceOfferStatus,
} from './types'

import { getFetchApiBaseUrl } from '../fetchApiBase'
import { marketplaceActorHeaders, type MarketplaceApiAuthRole } from './marketplaceApiAuth'

const API_ROOT = getFetchApiBaseUrl()

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  marketplaceAuth: MarketplaceApiAuthRole = 'none',
): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.method === 'GET' || init?.method === 'HEAD' ? {} : { 'Content-Type': 'application/json' }),
      ...marketplaceActorHeaders(marketplaceAuth),
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

export async function reviewBookingDraft(draft: FetchAiBookingDraft): Promise<FetchAiReviewResponse> {
  return requestJson<FetchAiReviewResponse>('/api/fetch-ai/review', {
    method: 'POST',
    body: JSON.stringify({ draft }),
  })
}

/** Card snapshot for demo confirm — never log or persist CVV server-side. */
export type PaymentCardConfirmPayload = {
  number: string
  cvc: string
  expMonth: number
  expYear: number
  brand: string
}

export type PaymentIntentMetadata =
  | { type: 'hardware'; sku: string; qty?: number }
  | Record<string, unknown>

export async function createPaymentIntent(params: {
  bookingId?: string | null
  amount: number
  currency?: 'AUD'
  metadata?: PaymentIntentMetadata | null
}): Promise<BookingPaymentIntent> {
  const payload = await requestJson<{ paymentIntent: BookingPaymentIntent }>('/api/payments/intents', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return payload.paymentIntent
}

export async function confirmPaymentIntent(
  paymentIntentId: string,
  paymentMethodId: string,
  card: PaymentCardConfirmPayload,
): Promise<BookingPaymentIntent> {
  const payload = await requestJson<{ paymentIntent: BookingPaymentIntent }>(
    `/api/payments/intents/${paymentIntentId}/confirm`,
    {
      method: 'POST',
      body: JSON.stringify({
        paymentMethodId,
        card: {
          number: card.number,
          cvc: card.cvc,
          expMonth: card.expMonth,
          expYear: card.expYear,
          brand: card.brand,
        },
      }),
    },
  )
  return payload.paymentIntent
}

export async function getPaymentIntentRecord(paymentIntentId: string): Promise<BookingPaymentIntent> {
  const payload = await requestJson<{ paymentIntent: BookingPaymentIntent }>(
    `/api/payments/intents/${encodeURIComponent(paymentIntentId)}`,
    { method: 'GET' },
    'none',
  )
  return payload.paymentIntent
}

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Poll until demo confirm or Stripe webhook updates server state. */
export async function waitForPaymentIntentServerConfirmed(
  paymentIntentId: string,
  options?: { timeoutMs?: number },
): Promise<BookingPaymentIntent> {
  const timeoutMs = options?.timeoutMs ?? 90_000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const pi = await getPaymentIntentRecord(paymentIntentId)
    if (pi.status === 'succeeded') {
      if (pi.provider !== 'stripe' || pi.webhookConfirmedAt != null) {
        return pi
      }
    }
    if (pi.status === 'failed') {
      throw new Error(pi.lastError || 'Payment failed')
    }
    await sleepMs(450)
  }
  throw new Error(
    'Timed out waiting for the server to confirm payment. For Stripe, forward webhooks to /api/payments/webhook (e.g. stripe listen).',
  )
}

export async function upsertBooking(record: Partial<BookingRecord> & { id: string }): Promise<BookingRecord> {
  const payload = await requestJson<{ booking: BookingRecord }>(
    '/api/marketplace/bookings',
    {
      method: 'POST',
      body: JSON.stringify(record),
    },
    'customer',
  )
  return payload.booking
}

export type DispatchBookingOptions = {
  matchingMode?: 'pool' | 'sequential'
}

export async function dispatchBooking(
  bookingId: string,
  options?: DispatchBookingOptions,
): Promise<BookingRecord> {
  const body =
    options?.matchingMode === 'sequential' || options?.matchingMode === 'pool'
      ? JSON.stringify({ matchingMode: options.matchingMode })
      : undefined
  const payload = await requestJson<{ booking: BookingRecord }>(
    `/api/marketplace/bookings/${bookingId}/dispatch`,
    {
      method: 'POST',
      ...(body ? { body } : {}),
    },
    'customer',
  )
  return payload.booking
}

export type DriverPresenceRecord = {
  driverId: string
  online: boolean
  lat: number | null
  lng: number | null
  rating: number | null
  completedJobs: number | null
  updatedAt: number
}

/** Register driver online/GPS for matching rank (demo marketplace). */
export async function postDriverPresence(body: {
  driverId: string
  online: boolean
  lat?: number | null
  lng?: number | null
  rating?: number | null
  completedJobs?: number | null
}): Promise<DriverPresenceRecord> {
  const payload = await requestJson<{ presence: DriverPresenceRecord }>(
    '/api/marketplace/drivers/presence',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    'driver',
  )
  return payload.presence
}

export async function fetchBookings(): Promise<BookingRecord[]> {
  const payload = await requestJson<{ bookings: BookingRecord[] }>('/api/marketplace/bookings')
  return payload.bookings
}

export async function fetchBooking(bookingId: string): Promise<BookingRecord> {
  const payload = await requestJson<{ booking: BookingRecord }>(
    `/api/marketplace/bookings/${bookingId}`,
    undefined,
    'customer',
  )
  return payload.booking
}

export type BookingDetailResponse = {
  booking: BookingRecord
  offers: MarketplaceOffer[]
  notifications: BookingNotificationRecord[]
  media: BookingMediaRecord[]
}

export async function fetchBookingDetail(bookingId: string): Promise<BookingDetailResponse> {
  return requestJson<BookingDetailResponse>(`/api/marketplace/bookings/${bookingId}`, undefined, 'none')
}

export type PatchBookingStatusBody = {
  status: BookingLifecycleStatus
  matchedDriver?: BookingDriver | null
  assignedDriverId?: string | null
  driverControlled?: boolean
}

export async function patchBookingStatus(
  bookingId: string,
  body: PatchBookingStatusBody,
): Promise<BookingRecord> {
  const payload = await requestJson<{ booking: BookingRecord }>(
    `/api/marketplace/bookings/${bookingId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    'driver',
  )
  return payload.booking
}

export async function submitCustomerBookingRating(
  bookingId: string,
  body: { stars: BookingCustomerRating['stars']; note?: string | null },
): Promise<BookingRecord> {
  const payload = await requestJson<{ booking: BookingRecord }>(
    `/api/marketplace/bookings/${bookingId}/customer-rating`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    'customer',
  )
  return payload.booking
}

export type PatchBookingDriverLocationBody = {
  lat: number
  lng: number
  heading?: number
  driverId?: string
}

export async function patchBookingDriverLocation(
  bookingId: string,
  body: PatchBookingDriverLocationBody,
): Promise<BookingRecord> {
  const payload = await requestJson<{ booking: BookingRecord }>(
    `/api/marketplace/bookings/${bookingId}/location`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    'driver',
  )
  return payload.booking
}

export async function fetchOffers(bookingId?: string): Promise<MarketplaceOffer[]> {
  const q = bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : ''
  const payload = await requestJson<{ offers: MarketplaceOffer[] }>(`/api/marketplace/offers${q}`)
  return payload.offers
}

export async function upsertMarketplaceOffer(offer: MarketplaceOffer): Promise<MarketplaceOffer> {
  const payload = await requestJson<{ offer: MarketplaceOffer }>(
    '/api/marketplace/offers',
    {
      method: 'POST',
      body: JSON.stringify(offer),
    },
    'driver',
  )
  return payload.offer
}

export async function patchMarketplaceOffer(
  offerId: string,
  body: { status?: MarketplaceOfferStatus },
): Promise<MarketplaceOffer> {
  const payload = await requestJson<{ offer: MarketplaceOffer }>(
    `/api/marketplace/offers/${offerId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    'driver',
  )
  return payload.offer
}

/** Subscribe to marketplace writes (same origin as API). Returns unsubscribe. */
export function subscribeMarketplaceStream(onEvent: () => void): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {}
  }
  const base = `${API_ROOT}/api/marketplace/stream`
  let lastEventId = ''
  let es: EventSource | null = null
  let attempt = 0
  let closed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const backoffMs = () => Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))

  const teardownEs = () => {
    if (es) {
      es.close()
      es = null
    }
  }

  const clearTimer = () => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const connect = () => {
    if (closed) return
    clearTimer()
    teardownEs()
    const q = lastEventId ? `?lastEventId=${encodeURIComponent(lastEventId)}` : ''
    es = new EventSource(`${base}${q}`)
    es.addEventListener('marketplace', (ev) => {
      attempt = 0
      if (ev.lastEventId) lastEventId = ev.lastEventId
      onEvent()
    })
    es.addEventListener('ping', (ev) => {
      if (ev.lastEventId) lastEventId = ev.lastEventId
    })
    es.onerror = () => {
      if (closed) return
      attempt += 1
      teardownEs()
      reconnectTimer = window.setTimeout(connect, backoffMs())
    }
  }

  connect()
  return () => {
    closed = true
    clearTimer()
    teardownEs()
  }
}

export async function fetchNotifications(): Promise<BookingNotificationRecord[]> {
  const payload = await requestJson<{ notifications: BookingNotificationRecord[] }>(
    '/api/marketplace/notifications',
  )
  return payload.notifications
}

export async function markNotificationRead(notificationId: string): Promise<BookingNotificationRecord> {
  const payload = await requestJson<{ notification: BookingNotificationRecord }>(
    `/api/marketplace/notifications/${notificationId}/read`,
    {
      method: 'POST',
    },
  )
  return payload.notification
}
