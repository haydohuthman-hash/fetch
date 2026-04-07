import type { BookingPaymentIntent } from './assistant/types'
import { getFetchApiBaseUrl } from './fetchApiBase'
import { marketplaceActorHeaders } from './booking/marketplaceApiAuth'

export type StoreCartLine = { productId: string; qty: number }

export type ValidatedStoreCart = {
  lines: {
    productId: string
    sku: string
    title: string
    unitPriceAud: number
    qty: number
    lineTotalAud: number
  }[]
  subtotalAud: number
  currency: string
}

export type StoreOrder = {
  id: string
  createdAt: number
  kind: string
  status: string
  lines: ValidatedStoreCart['lines']
  subtotalAud: number
  currency: string
  customerUserId?: string | null
  customerEmail?: string | null
  bundleId?: string | null
  paymentIntentId?: string | null
  stripePaymentIntentId?: string | null
  shipping?: { name?: string; email?: string; address?: string }
}

async function storeJson<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function syncCheckoutCustomerSession(email: string): Promise<void> {
  const em = email.trim().toLowerCase()
  if (!em) return
  await fetch(`${getFetchApiBaseUrl()}/api/auth/customer-session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: em }),
  }).catch(() => {})
}

export async function validateStoreCart(lines: StoreCartLine[]): Promise<ValidatedStoreCart> {
  const payload = await storeJson<{ lines: ValidatedStoreCart['lines']; subtotalAud: number; currency: string }>(
    '/api/store/cart/validate',
    { method: 'POST', body: JSON.stringify({ lines }) },
  )
  return { lines: payload.lines, subtotalAud: payload.subtotalAud, currency: payload.currency }
}

export async function storeCheckout(
  body: {
    lines?: StoreCartLine[]
    bundleId?: string
    shipping?: { name?: string; email?: string; address?: string }
  },
  idempotencyKey?: string,
): Promise<{ storeOrder: StoreOrder; paymentIntent: BookingPaymentIntent; idempotent?: boolean }> {
  const headers: Record<string, string> = {}
  if (idempotencyKey?.trim()) headers['Idempotency-Key'] = idempotencyKey.trim()
  return storeJson('/api/store/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  })
}

export async function getStoreOrder(orderId: string): Promise<StoreOrder> {
  const payload = await storeJson<{ order: StoreOrder }>(`/api/store/orders/${encodeURIComponent(orderId)}`)
  return payload.order
}
