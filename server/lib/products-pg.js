import crypto from 'node:crypto'
import { buildAmazonAffiliateUrl } from './amazon-product-import.js'
import {
  getSubcategoryIdByCategoryAndSlug,
  getSubcategoryRow,
  GENERAL_SLUG,
  isCategoryActive,
} from './store-categories-pg.js'

/** @typedef {import('pg').Pool} PgPool */

/** Legacy default category ids (fallback when listing without DB). */
const LEGACY_PRODUCT_CATEGORY_IDS = new Set([
  'drinks',
  'cleaning',
  'packing',
  'kitchen',
  'bedroom',
  'bathroom',
  'livingRoom',
  'laundry',
  'storage',
])

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeTagsInput(raw) {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim().toLowerCase().slice(0, 64)).filter(Boolean).slice(0, 32)
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;]+/)
      .map((t) => t.trim().toLowerCase().slice(0, 64))
      .filter(Boolean)
      .slice(0, 32)
  }
  return []
}

/**
 * @param {PgPool} pool
 * @param {string} category
 */
async function assertActiveProductCategory(pool, category) {
  const c = typeof category === 'string' ? category.trim() : ''
  if (!c) throw new Error('invalid_category')
  const ok = await isCategoryActive(pool, c)
  if (!ok) throw new Error('invalid_category')
}

/**
 * @param {PgPool} pool
 */
export async function ensureProductsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sku text NOT NULL UNIQUE,
      title text NOT NULL,
      category text NOT NULL,
      price_aud integer NOT NULL CHECK (price_aud >= 0),
      compare_price_aud integer NULL,
      cost_price_aud integer NULL,
      description text NOT NULL DEFAULT '',
      image_url text NOT NULL DEFAULT '',
      is_bundle boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      metadata jsonb NOT NULL DEFAULT '{}',
      stock_quantity integer NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_created ON products (created_at DESC);`)
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[];
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);`)
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS product_source text NOT NULL DEFAULT 'fetch';
  `)
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS external_listing boolean NOT NULL DEFAULT false;
  `)
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS affiliate_url text NOT NULL DEFAULT '';
  `)
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS asin text NULL;`)
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS subtitle text NOT NULL DEFAULT '';
  `)
}

/**
 * Map DB row → shape accepted by store-catalog-merge `normalizeProduct` (Partial<MergedProduct>).
 * @param {Record<string, unknown>} row
 */
export function productRowToMergedPartial(row) {
  const id = row.id != null ? String(row.id) : ''
  const sku = typeof row.sku === 'string' ? row.sku.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const categoryId = typeof row.category === 'string' ? row.category.trim() : ''
  const priceAud = Number(row.price_aud)
  const compareRaw = row.compare_price_aud
  const compareAtAud =
    compareRaw != null && Number.isFinite(Number(compareRaw)) ? Math.round(Number(compareRaw)) : undefined
  const desc = typeof row.description === 'string' ? row.description.trim().slice(0, 4000) : ''
  const img = typeof row.image_url === 'string' ? row.image_url.trim().slice(0, 2048) : ''
  if (!id || !sku || !title || !categoryId || !Number.isFinite(priceAud) || priceAud < 0) return null
  const subLine = typeof row.subtitle === 'string' ? row.subtitle.trim().slice(0, 300) : ''
  /** @type {Record<string, unknown>} */
  const out = {
    id,
    sku,
    title,
    subtitle: subLine || '—',
    categoryId,
    priceAud: Math.round(priceAud),
  }
  if (desc) out.description = desc
  if (compareAtAud != null && compareAtAud > 0) out.compareAtAud = compareAtAud
  if (img) out.coverImageUrl = img
  const subId = row.subcategory_id != null ? String(row.subcategory_id) : ''
  const subLabel = typeof row.subcategory_label === 'string' ? row.subcategory_label.trim() : ''
  if (subId) out.subcategoryId = subId
  if (subLabel) out.subcategoryLabel = subLabel
  const aff = typeof row.affiliate_url === 'string' ? row.affiliate_url.trim().slice(0, 2048) : ''
  if (aff) out.affiliateUrl = aff
  if (row.external_listing === true) out.externalListing = true
  const src = typeof row.product_source === 'string' ? row.product_source.trim() : 'fetch'
  if (src === 'amazon') out.productSource = 'amazon'
  const asin = row.asin != null && String(row.asin).trim() ? String(row.asin).trim().toUpperCase().slice(0, 16) : ''
  if (asin) out.asin = asin
  return out
}

/**
 * Active products for merged store catalog (checkout).
 * @param {PgPool} pool
 */
export async function listActiveProductsForMerge(pool) {
  const { rows } = await pool.query(
    `SELECT p.id, p.sku, p.title, p.category, p.price_aud, p.compare_price_aud, p.description, p.image_url,
            p.subcategory_id, p.subtitle, p.product_source, p.external_listing, p.affiliate_url, p.asin,
            s.label AS subcategory_label
     FROM products p
     LEFT JOIN store_subcategories s ON s.id = p.subcategory_id
     WHERE p.is_active = true ORDER BY p.created_at ASC`,
  )
  return rows
}

/**
 * @param {PgPool} pool
 * @param {{ activeOnly?: boolean, category?: string, tag?: string }} [opts]
 */
export async function listProductsApi(pool, opts = {}) {
  const activeOnly = opts.activeOnly !== false
  const category = typeof opts.category === 'string' ? opts.category.trim() : ''
  const tag = typeof opts.tag === 'string' ? opts.tag.trim().toLowerCase().slice(0, 64) : ''
  const cond = []
  const params = []
  if (activeOnly) {
    params.push(true)
    cond.push(`p.is_active = $${params.length}`)
  }
  if (category) {
    params.push(category)
    cond.push(`p.category = $${params.length}`)
  }
  if (tag) {
    params.push(tag)
    cond.push(`$${params.length} = ANY(p.tags)`)
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  const { rows } = await pool.query(
    `SELECT p.id, p.sku, p.title, p.category, p.price_aud, p.compare_price_aud, p.cost_price_aud, p.description, p.image_url,
            p.is_bundle, p.is_active, p.metadata, p.stock_quantity, p.created_at, p.updated_at, p.tags,
            p.subcategory_id, p.subtitle, p.product_source, p.external_listing, p.affiliate_url, p.asin,
            s.label AS subcategory_label
     FROM products p
     LEFT JOIN store_subcategories s ON s.id = p.subcategory_id
     ${where}
     ORDER BY p.created_at DESC`,
    params,
  )
  return rows
}

/**
 * @param {PgPool} pool
 * @param {string} id
 */
export async function getProductById(pool, id) {
  const { rows } = await pool.query(
    `SELECT p.*, s.label AS subcategory_label
     FROM products p
     LEFT JOIN store_subcategories s ON s.id = p.subcategory_id
     WHERE p.id = $1::uuid LIMIT 1`,
    [id],
  )
  return rows[0] ?? null
}

function nextSku() {
  return `FETCH_${crypto.randomBytes(5).toString('hex').toUpperCase()}`
}

/**
 * @param {PgPool} pool
 * @param {object} body
 */
export async function insertProduct(pool, body) {
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  if (!title) throw new Error('title_required')
  await assertActiveProductCategory(pool, category)
  const tags = normalizeTagsInput(body.tags)
  let sku = typeof body.sku === 'string' ? body.sku.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80) : ''
  const rawAsin = typeof body.asin === 'string' ? body.asin.trim().toUpperCase() : ''
  const productSource =
    typeof body.productSource === 'string' && body.productSource.trim().toLowerCase() === 'amazon'
      ? 'amazon'
      : 'fetch'
  if (!sku && rawAsin && /^[A-Z0-9]{10}$/.test(rawAsin)) sku = `AMZ_${rawAsin}`
  if (!sku) sku = nextSku()
  const priceRaw = Number(body.price)
  if (!Number.isFinite(priceRaw) || priceRaw < 0) throw new Error('invalid_price')
  const priceAud = Math.round(priceRaw)
  let compareAt = null
  if (body.comparePrice != null && String(body.comparePrice).trim() !== '') {
    const c = Math.round(Number(body.comparePrice))
    if (Number.isFinite(c) && c > 0) compareAt = c
  }
  let costAt = null
  if (body.costPrice != null && String(body.costPrice).trim() !== '') {
    const c = Math.round(Number(body.costPrice))
    if (Number.isFinite(c) && c >= 0) costAt = c
  }
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : ''
  const imageUrlRaw =
    typeof body.image_url === 'string'
      ? body.image_url
      : typeof body.imageUrl === 'string'
        ? body.imageUrl
        : ''
  const imageUrl = imageUrlRaw.trim().slice(0, 2048)
  const isBundle = Boolean(body.is_bundle ?? body.isBundle)
  const isActive = body.is_active != null ? Boolean(body.is_active) : body.isActive != null ? Boolean(body.isActive) : true
  const subtitle = typeof body.subtitle === 'string' ? body.subtitle.trim().slice(0, 300) : ''
  let externalListing = Boolean(body.external ?? body.externalListing)
  let affiliateUrl =
    typeof body.affiliateUrl === 'string'
      ? body.affiliateUrl.trim().slice(0, 2048)
      : typeof body.affiliate_url === 'string'
        ? body.affiliate_url.trim().slice(0, 2048)
        : ''
  let asin = rawAsin && /^[A-Z0-9]{10}$/.test(rawAsin) ? rawAsin : null
  if (productSource === 'amazon') {
    externalListing = true
    if (!asin && sku.startsWith('AMZ_') && sku.length === 14) {
      const maybe = sku.slice(4)
      if (/^[A-Z0-9]{10}$/.test(maybe)) asin = maybe
    }
    if (!affiliateUrl && asin) affiliateUrl = buildAmazonAffiliateUrl(asin)
  }

  if (compareAt != null && compareAt > 0 && priceAud > 0 && compareAt <= priceAud) {
    throw new Error('compare_at_invalid')
  }

  const rawSub = body.subcategoryId ?? body.subcategory_id
  let subcategoryId = null
  if (rawSub != null && String(rawSub).trim()) {
    const sid = String(rawSub).trim()
    const sub = await getSubcategoryRow(pool, sid)
    if (!sub || sub.category_id !== category) throw new Error('invalid_subcategory')
    subcategoryId = sid
  } else {
    subcategoryId = await getSubcategoryIdByCategoryAndSlug(pool, category, GENERAL_SLUG)
  }
  if (!subcategoryId) throw new Error('subcategory_required')

  const { rows } = await pool.query(
    `INSERT INTO products (sku, title, category, subcategory_id, price_aud, compare_price_aud, cost_price_aud, description, image_url, is_bundle, is_active, tags,
        subtitle, product_source, external_listing, affiliate_url, asin)
     VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id`,
    [
      sku,
      title,
      category,
      subcategoryId,
      priceAud,
      compareAt,
      costAt,
      description,
      imageUrl,
      isBundle,
      isActive,
      tags,
      subtitle,
      productSource,
      externalListing,
      affiliateUrl,
      asin,
    ],
  )
  const newId = rows[0]?.id
  if (!newId) throw new Error('insert_failed')
  return (await getProductById(pool, String(newId))) ?? null
}

/**
 * @param {PgPool} pool
 * @param {string} id
 * @param {object} patch
 */
export async function updateProduct(pool, id, patch) {
  const existing = await getProductById(pool, id)
  if (!existing) return null

  let title = String(existing.title ?? '')
  let category = String(existing.category ?? '')
  let priceAud = Math.round(Number(existing.price_aud))
  let comparePriceAud =
    existing.compare_price_aud != null && existing.compare_price_aud !== ''
      ? Math.round(Number(existing.compare_price_aud))
      : null
  let costPriceAud =
    existing.cost_price_aud != null && existing.cost_price_aud !== ''
      ? Math.round(Number(existing.cost_price_aud))
      : null
  let description = String(existing.description ?? '')
  let imageUrl = String(existing.image_url ?? '')
  let isBundle = Boolean(existing.is_bundle)
  let isActive = Boolean(existing.is_active)
  let subcategoryId =
    existing.subcategory_id != null && String(existing.subcategory_id).trim()
      ? String(existing.subcategory_id).trim()
      : null
  let subtitle = String(existing.subtitle ?? '')
  let productSource = String(existing.product_source ?? 'fetch') || 'fetch'
  let externalListing = Boolean(existing.external_listing)
  let affiliateUrl = String(existing.affiliate_url ?? '')
  let asin =
    existing.asin != null && String(existing.asin).trim()
      ? String(existing.asin).trim().toUpperCase().slice(0, 16)
      : null

  if (typeof patch.title === 'string') title = patch.title.trim().slice(0, 200)
  if (typeof patch.category === 'string') {
    const c = patch.category.trim()
    await assertActiveProductCategory(pool, c)
    category = c
  }
  if (patch.price != null && String(patch.price).trim() !== '') {
    const p = Math.round(Number(patch.price))
    if (!Number.isFinite(p) || p < 0) throw new Error('invalid_price')
    priceAud = p
  }
  if (patch.comparePrice !== undefined) {
    if (patch.comparePrice == null || String(patch.comparePrice).trim() === '') {
      comparePriceAud = null
    } else {
      const c = Math.round(Number(patch.comparePrice))
      if (!Number.isFinite(c) || c < 0) throw new Error('invalid_compare')
      comparePriceAud = c > 0 ? c : null
    }
  }
  if (patch.costPrice !== undefined) {
    if (patch.costPrice == null || String(patch.costPrice).trim() === '') {
      costPriceAud = null
    } else {
      const c = Math.round(Number(patch.costPrice))
      if (!Number.isFinite(c) || c < 0) throw new Error('invalid_cost')
      costPriceAud = c
    }
  }
  if (typeof patch.description === 'string') description = patch.description.trim().slice(0, 4000)
  if (typeof patch.image_url === 'string') imageUrl = patch.image_url.trim().slice(0, 2048)
  if (typeof patch.imageUrl === 'string') imageUrl = patch.imageUrl.trim().slice(0, 2048)
  if (patch.is_bundle != null) isBundle = Boolean(patch.is_bundle)
  if (patch.isBundle != null) isBundle = Boolean(patch.isBundle)
  if (patch.is_active != null) isActive = Boolean(patch.is_active)
  if (patch.isActive != null) isActive = Boolean(patch.isActive)

  let tags = Array.isArray(existing.tags) ? [...existing.tags] : normalizeTagsInput(existing.tags)
  if (patch.tags !== undefined) tags = normalizeTagsInput(patch.tags)

  if (typeof patch.subtitle === 'string') subtitle = patch.subtitle.trim().slice(0, 300)
  if (typeof patch.productSource === 'string') {
    const ps = patch.productSource.trim().toLowerCase()
    if (ps === 'amazon' || ps === 'fetch') productSource = ps
  }
  if (patch.externalListing != null) externalListing = Boolean(patch.externalListing)
  if (patch.external != null) externalListing = Boolean(patch.external)
  if (typeof patch.affiliateUrl === 'string') affiliateUrl = patch.affiliateUrl.trim().slice(0, 2048)
  if (typeof patch.affiliate_url === 'string') affiliateUrl = patch.affiliate_url.trim().slice(0, 2048)
  if (patch.asin !== undefined) {
    if (patch.asin == null || String(patch.asin).trim() === '') asin = null
    else {
      const a = String(patch.asin).trim().toUpperCase()
      asin = /^[A-Z0-9]{10}$/.test(a) ? a : null
    }
  }
  if (productSource === 'amazon') {
    externalListing = true
    if (!affiliateUrl && asin) affiliateUrl = buildAmazonAffiliateUrl(asin)
  }

  if (patch.subcategoryId !== undefined || patch.subcategory_id !== undefined) {
    const raw = patch.subcategoryId ?? patch.subcategory_id
    if (raw == null || String(raw).trim() === '') {
      subcategoryId = await getSubcategoryIdByCategoryAndSlug(pool, category, GENERAL_SLUG)
    } else {
      const sub = await getSubcategoryRow(pool, String(raw).trim())
      if (!sub || sub.category_id !== category) throw new Error('invalid_subcategory')
      subcategoryId = String(sub.id)
    }
  } else if (typeof patch.category === 'string') {
    const curSub = subcategoryId ? await getSubcategoryRow(pool, subcategoryId) : null
    if (!curSub || curSub.category_id !== category) {
      subcategoryId = await getSubcategoryIdByCategoryAndSlug(pool, category, GENERAL_SLUG)
    }
  }
  if (!subcategoryId) {
    subcategoryId = await getSubcategoryIdByCategoryAndSlug(pool, category, GENERAL_SLUG)
  }
  if (!subcategoryId) throw new Error('subcategory_required')

  const cmp = comparePriceAud
  if (cmp != null && cmp > 0 && priceAud > 0 && cmp <= priceAud) throw new Error('compare_at_invalid')

  await pool.query(
    `UPDATE products SET
       title = $2, category = $3, subcategory_id = $4::uuid, price_aud = $5, compare_price_aud = $6, cost_price_aud = $7,
       description = $8, image_url = $9, is_bundle = $10, is_active = $11, tags = $12,
       subtitle = $13, product_source = $14, external_listing = $15, affiliate_url = $16, asin = $17, updated_at = now()
     WHERE id = $1::uuid`,
    [
      id,
      title,
      category,
      subcategoryId,
      priceAud,
      comparePriceAud,
      costPriceAud,
      description,
      imageUrl,
      isBundle,
      isActive,
      tags,
      subtitle,
      productSource,
      externalListing,
      affiliateUrl,
      asin,
    ],
  )
  return getProductById(pool, id)
}

/**
 * @param {PgPool} pool
 * @param {string} id
 */
export async function deleteProduct(pool, id) {
  const r = await pool.query(`DELETE FROM products WHERE id = $1::uuid`, [id])
  return (r.rowCount ?? 0) > 0
}

export { LEGACY_PRODUCT_CATEGORY_IDS as PRODUCT_CATEGORY_IDS }
