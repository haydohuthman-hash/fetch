/**
 * Seed Postgres `products` from static `STORE_CATALOG_PRODUCTS` (idempotent on `sku`).
 *
 * Usage (repo root):
 *   DATABASE_URL=postgres://... node scripts/seed-products-from-store-catalog.mjs
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { STORE_CATALOG_PRODUCTS } from '../server/lib/store-catalog-data.js'
import { ensureProductsTable } from '../server/lib/products-pg.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(root, '.env') })
dotenv.config({ path: path.join(root, '.env.local'), override: true })

const url = (process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('[seed-products] DATABASE_URL is required')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 4 })

await ensureProductsTable(pool)

let inserted = 0
for (const p of STORE_CATALOG_PRODUCTS) {
  const desc = [p.subtitle].filter(Boolean).join('\n')
  const r = await pool.query(
    `INSERT INTO products (sku, title, category, price_aud, description, image_url, is_bundle, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, false, true)
     ON CONFLICT (sku) DO NOTHING
     RETURNING id`,
    [p.sku, p.title, p.categoryId, p.priceAud, desc, ''],
  )
  inserted += r.rowCount ?? 0
}

await pool.end()
console.log('[seed-products] inserted rows (skipped conflicts):', inserted)
