import { getFetchApiBaseUrl } from './fetchApiBase'
import type { StoreCatalogProduct } from './storeApi'
import { adminAddStoreProduct } from './storeApi'

export type AdminProductSource = 'database' | 'legacy_file'

export type AdminProduct = {
  id: string
  sku: string
  title: string
  /** Short line under title (Postgres subtitle); legacy file rows may omit */
  subtitle?: string
  category: string
  subcategoryId: string | null
  subcategoryLabel: string | null
  price: number
  comparePrice: number | null
  costPrice: number | null
  description: string
  imageUrl: string
  isBundle: boolean
  isActive: boolean
  tags?: string[]
  createdAt: string | null
  updatedAt: string | null
  metadata: Record<string, unknown>
  stockQuantity: number | null
  source?: AdminProductSource
  /** Catalog origin (Postgres `product_source`). Distinct from `source` (database vs legacy file). */
  productSource?: 'fetch' | 'amazon'
  externalListing?: boolean
  affiliateUrl?: string
  asin?: string | null
}

/** Draft from POST /api/import-product — FUTURE: replace with PA-API payload shape */
export type AmazonProductImportDraft = {
  asin: string
  affiliateUrl: string
  title: string
  subtitle: string
  imageUrl: string
  priceAud: number | null
  productSource: 'amazon'
  external: boolean
  metaFetched: boolean
  warning?: string
}

export type AdminCatalogMeta = {
  databaseProducts: boolean
}

async function adminJson<T>(adminKey: string, path: string, init?: RequestInit): Promise<T> {
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
    const error = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`
    const detail = typeof payload.detail === 'string' ? `: ${payload.detail}` : ''
    throw new Error(`${error}${detail}`)
  }
  return payload
}

export function storeCatalogProductToAdminProduct(p: StoreCatalogProduct): AdminProduct {
  const compare =
    p.compareAtAud != null && Number.isFinite(Number(p.compareAtAud)) && Number(p.compareAtAud) > 0
      ? Math.round(Number(p.compareAtAud))
      : null
  return {
    id: p.id,
    sku: p.sku,
    title: p.title,
    category: p.categoryId,
    subcategoryId: p.subcategoryId ?? null,
    subcategoryLabel: p.subcategoryLabel ?? null,
    price: p.priceAud,
    comparePrice: compare,
    costPrice: null,
    description: (p.description ?? '').trim(),
    imageUrl: (p.coverImageUrl ?? '').trim(),
    isBundle: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
    metadata: {},
    stockQuantity: null,
    source: 'legacy_file',
  }
}

export async function fetchAdminCatalogProducts(
  adminKey: string,
): Promise<{ products: AdminProduct[]; meta: AdminCatalogMeta }> {
  const payload = await adminJson<{
    products: AdminProduct[]
    meta?: AdminCatalogMeta
  }>(adminKey, '/api/admin/products')
  const products = (payload.products ?? []).map((p) => ({
    ...p,
    subcategoryId: p.subcategoryId ?? null,
    subcategoryLabel: p.subcategoryLabel ?? null,
  }))
  return {
    products,
    meta: payload.meta ?? { databaseProducts: true },
  }
}

export async function adminImportProductFromUrl(
  adminKey: string,
  url: string,
): Promise<AmazonProductImportDraft> {
  const payload = await adminJson<{ ok?: boolean; draft?: AmazonProductImportDraft; error?: string }>(
    adminKey,
    '/api/import-product',
    { method: 'POST', body: JSON.stringify({ url: url.trim() }) },
  )
  if (!payload.ok || !payload.draft) {
    const err = typeof payload.error === 'string' ? payload.error : 'import_failed'
    throw new Error(err)
  }
  return payload.draft
}

export async function adminCreateProduct(
  adminKey: string,
  body: {
    title: string
    category: string
    subcategoryId?: string | null
    price: number
    comparePrice?: number | null
    costPrice?: number | null
    description?: string
    subtitle?: string
    imageUrl?: string
    isBundle?: boolean
    isActive?: boolean
    sku?: string
    tags?: string[]
    productSource?: 'fetch' | 'amazon'
    external?: boolean
    affiliateUrl?: string
    asin?: string | null
  },
): Promise<AdminProduct> {
  const payload = await adminJson<{ product: AdminProduct }>(adminKey, '/api/admin/products', {
    method: 'POST',
    body: JSON.stringify({
      title: body.title,
      category: body.category,
      subcategoryId: body.subcategoryId,
      price: body.price,
      comparePrice: body.comparePrice,
      costPrice: body.costPrice,
      description: body.description ?? '',
      subtitle: body.subtitle,
      imageUrl: body.imageUrl ?? '',
      is_bundle: body.isBundle,
      is_active: body.isActive,
      sku: body.sku,
      tags: body.tags,
      productSource: body.productSource,
      external: body.external,
      affiliateUrl: body.affiliateUrl,
      asin: body.asin,
    }),
  })
  return payload.product
}

/** Create file-based override (when DATABASE_URL is not configured). Upload images first via `adminUploadProductImage`. */
export async function adminCreateLegacyProduct(
  adminKey: string,
  body: {
    title: string
    category: string
    price: number
    comparePrice?: number | null
    description?: string
    imageUrl?: string
    subcategoryId?: string | null
    subcategoryLabel?: string | null
    tags?: string[]
  },
): Promise<AdminProduct> {
  const subtitle = (body.description ?? '').trim().slice(0, 300) || '—'
  const desc = (body.description ?? '').trim().slice(0, 4000)
  let compareAtPriceAud: number | undefined
  if (body.comparePrice != null && Number.isFinite(body.comparePrice) && body.comparePrice > 0) {
    compareAtPriceAud = body.comparePrice
  }
  const created = await adminAddStoreProduct(adminKey, {
    categoryId: body.category,
    title: body.title.trim(),
    subtitle,
    description: desc || undefined,
    priceAud: Math.round(body.price),
    compareAtPriceAud,
    subcategoryId: body.subcategoryId ?? undefined,
    subcategoryLabel: body.subcategoryLabel ?? undefined,
    tags: body.tags,
  })
  const imageUrl = (body.imageUrl ?? '').trim()
  if (imageUrl) {
    const patched = await adminJson<{ product: AdminProduct }>(
      adminKey,
      `/api/store/admin/products/${encodeURIComponent(created.id)}`,
      { method: 'PATCH', body: JSON.stringify({ imageUrl }) },
    )
    return patched.product
  }
  return storeCatalogProductToAdminProduct(created)
}

export async function adminPatchProduct(
  adminKey: string,
  id: string,
  patch: Partial<{
    title: string
    category: string
    subcategoryId: string | null
    subcategoryLabel: string | null
    price: number
    comparePrice: number | null
    costPrice: number | null
    description: string
    subtitle: string
    imageUrl: string
    isBundle: boolean
    isActive: boolean
    tags: string[]
    productSource: 'fetch' | 'amazon'
    externalListing: boolean
    affiliateUrl: string
    asin: string | null
  }>,
  source: AdminProductSource = 'database',
): Promise<AdminProduct> {
  if (source === 'legacy_file') {
    const subtitle = patch.description !== undefined ? patch.description.trim().slice(0, 300) || '—' : undefined
    const payload = await adminJson<{ product: AdminProduct }>(
      adminKey,
      `/api/store/admin/products/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: patch.title,
          subtitle,
          category: patch.category,
          subcategoryId: patch.subcategoryId,
          subcategoryLabel: patch.subcategoryLabel,
          price: patch.price,
          comparePrice: patch.comparePrice,
          description: patch.description,
          imageUrl: patch.imageUrl,
          tags: patch.tags,
        }),
      },
    )
    return payload.product
  }
  const payload = await adminJson<{ product: AdminProduct }>(
    adminKey,
    `/api/admin/products/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        title: patch.title,
        category: patch.category,
        subcategoryId: patch.subcategoryId,
        price: patch.price,
        comparePrice: patch.comparePrice,
        costPrice: patch.costPrice,
        description: patch.description,
        subtitle: patch.subtitle,
        imageUrl: patch.imageUrl,
        isBundle: patch.isBundle,
        isActive: patch.isActive,
        tags: patch.tags,
        productSource: patch.productSource,
        externalListing: patch.externalListing,
        affiliateUrl: patch.affiliateUrl,
        asin: patch.asin,
      }),
    },
  )
  return payload.product
}

export async function adminDeleteProduct(
  adminKey: string,
  id: string,
  source: AdminProductSource = 'database',
): Promise<void> {
  if (source === 'legacy_file') {
    await adminJson(adminKey, `/api/store/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return
  }
  await adminJson(adminKey, `/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function adminUploadProductImage(adminKey: string, file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const response = await fetch(`${getFetchApiBaseUrl()}/api/admin/products/upload-image`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Fetch-Store-Admin-Key': adminKey.trim() },
    body: fd,
  })
  const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string; detail?: string }
  if (!response.ok) {
    const error = typeof payload.error === 'string' ? payload.error : `Upload failed (${response.status})`
    const detail = typeof payload.detail === 'string' ? `: ${payload.detail}` : ''
    throw new Error(`${error}${detail}`)
  }
  if (!payload.url) throw new Error('url_missing')
  return payload.url
}
