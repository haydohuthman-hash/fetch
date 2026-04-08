import {
  getMergedCatalogMap,
  getSupplySkuPriceAudMerged,
} from './store-catalog-merge.js'
import { STORE_CATALOG_PRODUCTS, buildStoreProductByIdMap } from './store-catalog-data.js'
import { STORE_BUNDLES, bundleRetailTotalAud, resolveBundleLines } from './store-bundles.js'

const MAX_QTY_PER_LINE = 20
const MAX_DISTINCT_LINES = 50

/** Fallback map before merge boot (tests / rare sync import order). */
const staticProductById = buildStoreProductByIdMap()

function productMap() {
  try {
    return getMergedCatalogMap()
  } catch {
    return staticProductById
  }
}

/**
 * @param {{ productId: string, qty: number }[]} lines
 * @returns {{ ok: true, lines: { productId: string, sku: string, title: string, unitPriceAud: number, qty: number, lineTotalAud: number }[], subtotalAud: number, currency: string } | { ok: false, error: string }}
 */
export function validateSupplyCartLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, error: 'cart_empty' }
  }
  if (lines.length > MAX_DISTINCT_LINES) {
    return { ok: false, error: 'cart_too_many_lines' }
  }
  /** @type {Map<string, number>} */
  const qtyByProduct = new Map()
  for (const row of lines) {
    const pid = typeof row?.productId === 'string' ? row.productId.trim() : ''
    const qtyRaw = Number(row?.qty)
    if (!pid) return { ok: false, error: 'invalid_line' }
    if (!Number.isFinite(qtyRaw) || qtyRaw < 1) return { ok: false, error: 'invalid_qty' }
    const qty = Math.min(MAX_QTY_PER_LINE, Math.floor(qtyRaw))
    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + qty)
  }
  for (const [, q] of qtyByProduct) {
    if (q > MAX_QTY_PER_LINE) return { ok: false, error: 'qty_cap_exceeded' }
  }

  const productById = productMap()

  /** @type {{ productId: string, sku: string, title: string, unitPriceAud: number, qty: number, lineTotalAud: number }[]} */
  const out = []
  let subtotal = 0
  for (const [productId, qty] of qtyByProduct) {
    const p = productById.get(productId)
    if (!p) return { ok: false, error: 'unknown_product', detail: productId }
    if (p.externalListing && p.affiliateUrl) {
      return { ok: false, error: 'external_product_not_checkout', detail: productId }
    }
    const serverPrice = getSupplySkuPriceAudMerged(p.sku)
    if (serverPrice == null || serverPrice !== p.priceAud) {
      return { ok: false, error: 'price_mismatch', detail: p.sku }
    }
    const lineTotal = Math.round(serverPrice * qty)
    subtotal += lineTotal
    out.push({
      productId: p.id,
      sku: p.sku,
      title: p.title,
      unitPriceAud: serverPrice,
      qty,
      lineTotalAud: lineTotal,
    })
  }
  return { ok: true, lines: out, subtotalAud: subtotal, currency: 'AUD' }
}

/**
 * @param {string} bundleId
 * @returns {{ ok: true, bundleId: string, lines: { productId: string, sku: string, title: string, unitPriceAud: number, qty: number, lineTotalAud: number }[], subtotalAud: number, retailAud: number, currency: string } | { ok: false, error: string, detail?: string }}
 */
export function validateBundleCart(bundleId) {
  const id = typeof bundleId === 'string' ? bundleId.trim() : ''
  if (!id) return { ok: false, error: 'bundle_id_required' }
  const bundle = STORE_BUNDLES.find((b) => b.id === id)
  if (!bundle) return { ok: false, error: 'unknown_bundle' }
  const pmap = productMap()
  const lines = resolveBundleLines(bundle, pmap)
  if (lines.length !== bundle.productIds.length) {
    return { ok: false, error: 'bundle_incomplete' }
  }
  let sumCheck = 0
  for (const line of lines) {
    const serverPrice = getSupplySkuPriceAudMerged(line.sku)
    if (serverPrice == null || serverPrice !== line.unitPriceAud) {
      return { ok: false, error: 'price_mismatch', detail: line.sku }
    }
    sumCheck += line.unitPriceAud * line.qty
  }
  const retail = bundleRetailTotalAud(bundle, pmap)
  if (retail !== sumCheck) return { ok: false, error: 'bundle_retail_mismatch' }
  const subtotal = Math.round(bundle.bundlePriceAud)
  const outLines = lines.map((l) => ({
    ...l,
    lineTotalAud: Math.round(l.unitPriceAud * l.qty),
  }))
  return {
    ok: true,
    bundleId: bundle.id,
    lines: outLines,
    subtotalAud: subtotal,
    retailAud: retail,
    currency: 'AUD',
  }
}

export { STORE_CATALOG_PRODUCTS, STORE_BUNDLES }
