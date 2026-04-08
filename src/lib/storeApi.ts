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

export type StoreCatalogProduct = {
  id: string
  sku: string
  title: string
  subtitle: string
  categoryId: string
  priceAud: number
  coverImageUrl: string
  isCustom?: boolean
  description?: string
  compareAtAud?: number
  subcategoryId?: string
  subcategoryLabel?: string
  productSource?: 'fetch' | 'amazon'
  externalListing?: boolean
  affiliateUrl?: string
  asin?: string
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

export async function fetchStoreCatalog(category?: string): Promise<StoreCatalogProduct[]> {
  const qs = new URLSearchParams()
  if (category) qs.set('category', category)
  const suffix = qs.toString()
  const path = `/api/store/catalog${suffix ? `?${suffix}` : ''}`
  const response = await fetch(`${getFetchApiBaseUrl()}${path}`, {
    credentials: 'include',
    headers: { ...marketplaceActorHeaders('customer') },
  })
  const payload = (await response.json().catch(() => ({}))) as {
    products?: StoreCatalogProduct[]
    error?: string
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Catalog failed (${response.status})`)
  }
  return payload.products ?? []
}

async function storeAdminJson<T>(adminKey: string, path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const response = await fetch(`${getFetchApiBaseUrl()}${path}`, {
    credentials: 'include',
    ...init,
    method,
    headers: {
      ...(method === 'GET' || method === 'HEAD' || method === 'DELETE' ? {} : { 'Content-Type': 'application/json' }),
      'X-Fetch-Store-Admin-Key': adminKey.trim(),
      ...(init?.headers ?? {}),
    },
  })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; detail?: string }
  if (!response.ok) {
    if (response.status === 502 || response.status === 504) {
      throw new Error(
        'API unreachable (502/504). If you use Vite, start the backend on the proxied port (default 8787): npm run server — or run both with npm run dev:all. If you use another port, set FETCH_DEV_API_PORT to match and restart Vite.',
      )
    }
    const error = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`
    const detail = typeof payload.detail === 'string' ? `: ${payload.detail}` : ''
    throw new Error(`${error}${detail}`)
  }
  return payload
}

export async function pingStoreAdmin(adminKey: string): Promise<boolean> {
  await storeAdminJson<{ ok: boolean }>(adminKey, '/api/store/admin/ping', { method: 'POST' })
  return true
}

export async function fetchAdminCustomProducts(adminKey: string): Promise<StoreCatalogProduct[]> {
  const payload = await storeAdminJson<{ products: StoreCatalogProduct[] }>(
    adminKey,
    '/api/store/admin/products',
  )
  return payload.products ?? []
}

export async function adminAddStoreProduct(
  adminKey: string,
  body: {
    categoryId: string
    title: string
    subtitle?: string
    description?: string
    priceAud: number
    compareAtPriceAud?: number
    sku?: string
    id?: string
    subcategoryId?: string
    subcategoryLabel?: string
    tags?: string[]
  },
): Promise<StoreCatalogProduct> {
  const payload = await storeAdminJson<{ product: StoreCatalogProduct }>(adminKey, '/api/store/admin/products', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return payload.product
}

export async function uploadStoreProductCover(
  adminKey: string,
  productId: string,
  file: File,
): Promise<StoreCatalogProduct> {
  const fd = new FormData()
  fd.append('file', file)
  const response = await fetch(
    `${getFetchApiBaseUrl()}/api/store/admin/products/${encodeURIComponent(productId)}/cover`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Fetch-Store-Admin-Key': adminKey.trim() },
      body: fd,
    },
  )
  const payload = (await response.json().catch(() => ({}))) as { product?: StoreCatalogProduct; error?: string }
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Upload failed (${response.status})`)
  }
  if (!payload.product) throw new Error('product_missing')
  return payload.product
}

export async function adminDeleteStoreProduct(adminKey: string, productId: string): Promise<void> {
  await storeAdminJson(adminKey, `/api/store/admin/products/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  })
}

export async function fetchAdminStoreOrders(adminKey: string): Promise<{
  orders: StoreOrder[]
  summary: { total: number; paid: number; pending: number; failed: number }
}> {
  return storeAdminJson(adminKey, '/api/store/admin/orders')
}
