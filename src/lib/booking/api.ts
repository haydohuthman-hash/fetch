import type { BookingPaymentIntent } from '../assistant'
import type {
  BookingNotificationRecord,
  BookingRecord,
  FetchAiBookingDraft,
  FetchAiReviewResponse,
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

export async function createPaymentIntent(params: {
  bookingId?: string | null
  amount: number
  currency?: 'AUD'
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
): Promise<BookingPaymentIntent> {
  const payload = await requestJson<{ paymentIntent: BookingPaymentIntent }>(
    `/api/payments/intents/${paymentIntentId}/confirm`,
    {
      method: 'POST',
      body: JSON.stringify({ paymentMethodId }),
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
