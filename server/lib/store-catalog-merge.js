import { STORE_CATALOG_PRODUCTS } from './store-catalog-data.js'
import { SUPPLY_SKU_PRICE_AUD } from './supplies-catalog.js'

/**
 * @typedef {{
 *   id: string,
 *   sku: string,
 *   title: string,
 *   subtitle: string,
 *   categoryId: string,
 *   priceAud: number,
 *   description?: string,
 *   compareAtAud?: number,
 *   coverImageUrl?: string,
 *   subcategoryId?: string,
 *   subcategoryLabel?: string,
 *   affiliateUrl?: string,
 *   externalListing?: boolean,
 *   productSource?: string,
 *   asin?: string,
 * }} MergedProduct
 */

/** @type {() => Promise<Partial<MergedProduct>[]>} */
let overrideReader = async () => []

/** @type {() => Promise<Partial<MergedProduct>[]>} */
let postgresProductReader = async () => []

/**
 * @param {() => Promise<Partial<MergedProduct>[]>} fn
 */
export function setStoreCatalogOverrideReader(fn) {
  overrideReader = fn
}

/**
 * Active Postgres `products` rows as partial merged catalog rows (checkout / merged map).
 * @param {() => Promise<Partial<MergedProduct>[]>} fn
 */
export function setStoreCatalogPostgresReader(fn) {
  postgresProductReader = fn
}

/** @type {{ products: MergedProduct[], map: Map<string, MergedProduct>, skuIndex: Map<string, MergedProduct>, loaded: boolean } | null} */
let snapshot = null

/**
 * @param {unknown} row
 * @returns {MergedProduct | null}
 */
function normalizeProduct(row) {
  if (!row || typeof row !== 'object') return null
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const sku = typeof row.sku === 'string' ? row.sku.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const subtitle = typeof row.subtitle === 'string' ? row.subtitle.trim() : ''
  const categoryId = typeof row.categoryId === 'string' ? row.categoryId.trim() : ''
  const priceRaw = Number(row.priceAud)
  if (!id || !sku || !title || !categoryId) return null
  if (!Number.isFinite(priceRaw) || priceRaw < 0) return null
  const priceAud = Math.round(priceRaw)
  /** @type {MergedProduct} */
  const out = { id, sku, title, subtitle: subtitle || '—', categoryId, priceAud }
  const aff = typeof row.affiliateUrl === 'string' ? row.affiliateUrl.trim().slice(0, 2048) : ''
  if (aff) out.affiliateUrl = aff
  if (row.externalListing === true) out.externalListing = true
  if (row.productSource === 'amazon') out.productSource = 'amazon'
  const asin = typeof row.asin === 'string' ? row.asin.trim().toUpperCase() : ''
  if (asin && /^[A-Z0-9]{10}$/.test(asin)) out.asin = asin
  const desc = typeof row.description === 'string' ? row.description.trim().slice(0, 4000) : ''
  if (desc) out.description = desc
  let compareAt = 0
  if (row.compareAtAud != null && Number.isFinite(Number(row.compareAtAud))) {
    compareAt = Math.round(Number(row.compareAtAud) * 100) / 100
  } else if (row.compareAtPriceAud != null && Number.isFinite(Number(row.compareAtPriceAud))) {
    compareAt = Math.round(Number(row.compareAtPriceAud) * 100) / 100
  }
  if (compareAt > 0 && (priceAud <= 0 || compareAt > priceAud)) {
    out.compareAtAud = compareAt
  }
  const cv = typeof row.coverImageUrl === 'string' ? row.coverImageUrl.trim().slice(0, 2048) : ''
  if (cv) out.coverImageUrl = cv
  const sid = typeof row.subcategoryId === 'string' ? row.subcategoryId.trim() : ''
  const sl = typeof row.subcategoryLabel === 'string' ? row.subcategoryLabel.trim() : ''
  if (sid) out.subcategoryId = sid
  if (sl) out.subcategoryLabel = sl
  return out
}

export async function refreshMergedStoreCatalog() {
  const rawExtra = await overrideReader()
  const rawPg = await postgresProductReader()
  const extra = rawExtra.map(normalizeProduct).filter(Boolean)
  const pgMerged = rawPg.map(normalizeProduct).filter(Boolean)
  const byId = new Map(STORE_CATALOG_PRODUCTS.map((p) => [p.id, { ...p }]))
  for (const p of extra) {
    byId.set(p.id, p)
  }
  /** Postgres wins on id collision (admin catalog of record). */
  for (const p of pgMerged) {
    byId.set(p.id, p)
  }
  const products = [...byId.values()]
  const map = new Map(products.map((p) => [p.id, p]))
  const skuIndex = new Map()
  for (const p of products) {
    skuIndex.set(p.sku, p)
  }
  snapshot = { products, map, skuIndex, loaded: true }
}

export function getMergedCatalogMap() {
  if (!snapshot?.loaded) {
    throw new Error('[store-catalog-merge] catalog not initialized — call refreshMergedStoreCatalog() at boot')
  }
  return snapshot.map
}

export function getMergedCatalogProducts() {
  if (!snapshot?.loaded) {
    throw new Error('[store-catalog-merge] catalog not initialized')
  }
  return snapshot.products
}

/**
 * Static SKU table first, then any merged product (for admin-added SKUs).
 * @param {string} sku
 * @returns {number | undefined}
 */
export function getSupplySkuPriceAudMerged(sku) {
  if (!sku || typeof sku !== 'string') return undefined
  const fromStatic = SUPPLY_SKU_PRICE_AUD[sku]
  if (fromStatic != null) return fromStatic
  if (!snapshot?.skuIndex) return undefined
  const p = snapshot.skuIndex.get(sku)
  return p ? p.priceAud : undefined
}
