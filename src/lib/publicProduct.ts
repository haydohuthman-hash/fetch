import type { SupplyProduct } from './suppliesCatalog'

export type MarketplacePublicProduct = {
  id: string
  sku: string
  title: string
  subtitle?: string
  category: string
  subcategoryId: string | null
  subcategoryLabel: string | null
  price: number
  comparePrice: number | null
  description: string
  imageUrl: string
  isBundle: boolean
  isActive: boolean
  tags?: string[]
  createdAt: string | null
  /** FUTURE: PA-API — same slot for richer supplier metadata */
  productSource?: 'fetch' | 'amazon'
  externalListing?: boolean
  affiliateUrl?: string
  asin?: string | null
}

export function publicProductToSupplyProduct(p: MarketplacePublicProduct): SupplyProduct {
  const compare =
    p.comparePrice != null && Number.isFinite(p.comparePrice) && p.comparePrice > 0
      ? p.comparePrice
      : undefined
  const tags = Array.isArray(p.tags) ? p.tags.map((t) => String(t)) : undefined
  const sub =
    typeof p.subtitle === 'string' && p.subtitle.trim()
      ? p.subtitle.trim()
      : p.isBundle
        ? 'Bundle'
        : '—'
  const desc = (p.description || '').trim()
  return {
    id: p.id,
    sku: p.sku,
    title: p.title,
    subtitle: sub,
    priceAud: Math.round(p.price),
    categoryId: p.category,
    ...(p.subcategoryId ? { subcategoryId: p.subcategoryId } : {}),
    ...(p.subcategoryLabel ? { subcategoryLabel: p.subcategoryLabel } : {}),
    previewStyle: 'slate',
    specs: [desc.slice(0, 160) || sub],
    description: desc || p.title,
    coverImageUrl: (p.imageUrl || '').trim() || '',
    ...(compare != null ? { compareAtAud: compare } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(p.productSource === 'amazon' ? { productSource: 'amazon' } : {}),
    ...(p.externalListing ? { externalListing: true } : {}),
    ...(typeof p.affiliateUrl === 'string' && p.affiliateUrl.trim() ? { affiliateUrl: p.affiliateUrl.trim() } : {}),
    ...(p.asin ? { asin: p.asin } : {}),
  }
}
