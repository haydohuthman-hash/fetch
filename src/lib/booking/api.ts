import type {
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

const API_ROOT = getFetchApiBaseUrl()

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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

export async function upsertBooking(record: Partial<BookingRecord> & { id: string }): Promise<BookingRecord> {
  const payload = await requestJson<{ booking: BookingRecord }>('/api/marketplace/bookings', {
    method: 'POST',
    body: JSON.stringify(record),
  })
  return payload.booking
}

export async function dispatchBooking(bookingId: string): Promise<BookingRecord> {
  const payload = await requestJson<{ booking: BookingRecord }>(
    `/api/marketplace/bookings/${bookingId}/dispatch`,
    {
      method: 'POST',
    },
  )
  return payload.booking
}

export async function fetchBookings(): Promise<BookingRecord[]> {
  const payload = await requestJson<{ bookings: BookingRecord[] }>('/api/marketplace/bookings')
  return payload.bookings
}

export async function fetchBooking(bookingId: string): Promise<BookingRecord> {
  const payload = await requestJson<{ booking: BookingRecord }>(`/api/marketplace/bookings/${bookingId}`)
  return payload.booking
}

export type BookingDetailResponse = {
  booking: BookingRecord
  offers: MarketplaceOffer[]
  notifications: BookingNotificationRecord[]
  media: BookingMediaRecord[]
}

export async function fetchBookingDetail(bookingId: string): Promise<BookingDetailResponse> {
  return requestJson<BookingDetailResponse>(`/api/marketplace/bookings/${bookingId}`)
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
  )
  return payload.booking
}

export async function fetchOffers(bookingId?: string): Promise<MarketplaceOffer[]> {
  const q = bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : ''
  const payload = await requestJson<{ offers: MarketplaceOffer[] }>(`/api/marketplace/offers${q}`)
  return payload.offers
}

export async function upsertMarketplaceOffer(offer: MarketplaceOffer): Promise<MarketplaceOffer> {
  const payload = await requestJson<{ offer: MarketplaceOffer }>('/api/marketplace/offers', {
    method: 'POST',
    body: JSON.stringify(offer),
  })
  return payload.offer
}

export async function patchMarketplaceOffer(
  offerId: string,
  body: { status?: MarketplaceOfferStatus },
): Promise<MarketplaceOffer> {
  const payload = await requestJson<{ offer: MarketplaceOffer }>(`/api/marketplace/offers/${offerId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return payload.offer
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
