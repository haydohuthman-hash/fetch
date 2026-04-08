/** @typedef {import('pg').Pool} PgPool */

/** Default seed categories when the table is empty (aligned with legacy storefront ids). */
const DEFAULT_CATEGORIES = [
  { id: 'drinks', label: 'Drinks', sort_order: 0 },
  { id: 'cleaning', label: 'Cleaning supplies', sort_order: 1 },
  { id: 'packing', label: 'Moving supplies', sort_order: 2 },
  { id: 'kitchen', label: 'Kitchen', sort_order: 3 },
  { id: 'bedroom', label: 'Bedroom', sort_order: 4 },
  { id: 'bathroom', label: 'Bathroom', sort_order: 5 },
  { id: 'livingRoom', label: 'Living room', sort_order: 6 },
  { id: 'laundry', label: 'Laundry', sort_order: 7 },
  { id: 'storage', label: 'Storage', sort_order: 8 },
]

const GENERAL_SLUG = 'general'

/** Lowercase slug: letter then alphanumeric + hyphens, 2–64 chars total. */
const CATEGORY_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}$/

/**
 * @param {PgPool} pool
 */
export async function ensureStoreCategoriesTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_categories (
      id text PRIMARY KEY,
      label text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`
    ALTER TABLE store_categories ADD COLUMN IF NOT EXISTS short_description text NOT NULL DEFAULT '';
  `)
  await pool.query(`
    ALTER TABLE store_categories ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT ARRAY[]::text[];
  `)
  await pool.query(`
    ALTER TABLE store_categories ADD COLUMN IF NOT EXISTS hero_image_url text NOT NULL DEFAULT '';
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_subcategories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id text NOT NULL REFERENCES store_categories(id) ON DELETE CASCADE,
      slug text NOT NULL,
      label text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (category_id, slug)
    );
  `)
  await pool.query(`
    ALTER TABLE store_subcategories ADD COLUMN IF NOT EXISTS short_description text NOT NULL DEFAULT '';
  `)
  await pool.query(`
    ALTER TABLE store_subcategories ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT ARRAY[]::text[];
  `)
  await pool.query(`
    ALTER TABLE store_subcategories ADD COLUMN IF NOT EXISTS hero_image_url text NOT NULL DEFAULT '';
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_store_subcategories_category ON store_subcategories (category_id, sort_order);`,
  )
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id uuid;`)
  await pool.query(`
    DO $$
    BEGIN
      ALTER TABLE products
        ADD CONSTRAINT products_subcategory_id_fkey
        FOREIGN KEY (subcategory_id) REFERENCES store_subcategories(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products (subcategory_id);`)
}

/**
 * Seed top-level categories + one "General" subcategory each; backfill products.subcategory_id.
 * @param {PgPool} pool
 */
export async function seedStoreCategoriesIfEmpty(pool) {
  const { rows: c } = await pool.query(`SELECT COUNT(*)::int AS n FROM store_categories`)
  if ((c[0]?.n ?? 0) > 0) return

  for (const row of DEFAULT_CATEGORIES) {
    await pool.query(
      `INSERT INTO store_categories (id, label, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.label, row.sort_order],
    )
  }
  for (const row of DEFAULT_CATEGORIES) {
    await pool.query(
      `INSERT INTO store_subcategories (category_id, slug, label, sort_order)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (category_id, slug) DO NOTHING`,
      [row.id, GENERAL_SLUG, 'General'],
    )
  }

  await backfillProductSubcategoriesGeneral(pool)
}

/**
 * Assign General subcategory to products missing `subcategory_id`.
 * @param {PgPool} pool
 */
export async function backfillProductSubcategoriesGeneral(pool) {
  await pool.query(
    `
    UPDATE products p
    SET subcategory_id = s.id
    FROM store_subcategories s
    WHERE p.subcategory_id IS NULL
      AND s.category_id = p.category
      AND s.slug = $1
  `,
    [GENERAL_SLUG],
  )
}

/**
 * @param {PgPool} pool
 * @param {string} categoryId
 * @param {string} slug
 */
export async function getSubcategoryIdByCategoryAndSlug(pool, categoryId, slug) {
  const { rows } = await pool.query(
    `SELECT id FROM store_subcategories WHERE category_id = $1 AND slug = $2 AND is_active = true LIMIT 1`,
    [categoryId, slug],
  )
  return rows[0]?.id ?? null
}

/**
 * @param {PgPool} pool
 * @param {string} id - uuid
 */
export async function getSubcategoryRow(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, category_id, slug, label, sort_order, is_active, short_description, keywords, hero_image_url
     FROM store_subcategories WHERE id = $1::uuid LIMIT 1`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * @param {PgPool} pool
 * @param {string} categoryId
 */
export async function listSubcategoriesPublic(pool, categoryId) {
  const { rows } = await pool.query(
    `SELECT id, slug, label, sort_order
     FROM store_subcategories
     WHERE category_id = $1 AND is_active = true
     ORDER BY sort_order ASC, label ASC`,
    [categoryId],
  )
  return rows
}

/**
 * Admin: categories with subcategories and product counts per subcategory.
 * @param {PgPool} pool
 */
export async function listCategoriesAdminTree(pool) {
  const { rows: cats } = await pool.query(
    `SELECT id, label, sort_order, is_active, short_description, keywords, hero_image_url
     FROM store_categories ORDER BY sort_order ASC, id ASC`,
  )
  const { rows: subs } = await pool.query(
    `SELECT s.id, s.category_id, s.slug, s.label, s.sort_order, s.is_active,
            s.short_description, s.keywords, s.hero_image_url,
            (SELECT COUNT(*)::int FROM products p WHERE p.subcategory_id = s.id) AS product_count
     FROM store_subcategories s
     ORDER BY s.category_id, s.sort_order ASC, s.label ASC`,
  )
  return { categories: cats, subcategories: subs }
}

/**
 * Public tree: active categories with nested active subcategories (shop + anon API).
 * @param {PgPool} pool
 */
export async function listPublicStoreCategoriesNested(pool) {
  const { rows: cats } = await pool.query(
    `SELECT id, label, sort_order, short_description, keywords, hero_image_url
     FROM store_categories WHERE is_active = true ORDER BY sort_order ASC, id ASC`,
  )
  const { rows: subs } = await pool.query(
    `SELECT id, category_id, slug, label, sort_order, short_description, keywords, hero_image_url
     FROM store_subcategories WHERE is_active = true
     ORDER BY category_id, sort_order ASC, label ASC`,
  )
  const byCat = new Map()
  for (const s of subs) {
    const list = byCat.get(s.category_id) ?? []
    list.push(s)
    byCat.set(s.category_id, list)
  }
  return cats.map((c) => ({
    ...c,
    subcategories: byCat.get(c.id) ?? [],
  }))
}

/**
 * @param {PgPool} pool
 * @param {string} categoryId
 */
export async function countProductsUsingCategory(pool, categoryId) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM products WHERE category = $1`, [categoryId])
  return rows[0]?.n ?? 0
}

/**
 * @param {PgPool} pool
 * @param {string} categoryId
 */
export async function isCategoryActive(pool, categoryId) {
  const id = typeof categoryId === 'string' ? categoryId.trim() : ''
  if (!id) return false
  const { rows } = await pool.query(
    `SELECT 1 FROM store_categories WHERE id = $1 AND is_active = true LIMIT 1`,
    [id],
  )
  return rows.length > 0
}

/**
 * @param {PgPool} pool
 * @param {{ id?: string, label: string, sortOrder?: number }} body
 */
export async function insertCategory(pool, body) {
  const rawId =
    typeof body.id === 'string' && body.id.trim()
      ? body.id
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 64)
      : ''
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : ''
  if (!rawId || !label) throw new Error('category_fields_required')
  if (!CATEGORY_ID_PATTERN.test(rawId)) throw new Error('invalid_category_id')
  const sortOrder =
    body.sortOrder != null && Number.isFinite(Number(body.sortOrder)) ? Math.round(Number(body.sortOrder)) : 0
  await pool.query(`INSERT INTO store_categories (id, label, sort_order) VALUES ($1, $2, $3)`, [
    rawId,
    label,
    sortOrder,
  ])
  await pool.query(
    `INSERT INTO store_subcategories (category_id, slug, label, sort_order)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (category_id, slug) DO NOTHING`,
    [rawId, GENERAL_SLUG, 'General'],
  )
  const { rows } = await pool.query(`SELECT * FROM store_categories WHERE id = $1`, [rawId])
  return rows[0] ?? null
}

/**
 * @param {PgPool} pool
 * @param {{ categoryId: string, slug: string, label: string, sortOrder?: number }} body
 */
export async function insertSubcategory(pool, body) {
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 64) : ''
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : ''
  if (!categoryId || !slug || !label) throw new Error('subcategory_fields_required')
  const sortOrder =
    body.sortOrder != null && Number.isFinite(Number(body.sortOrder)) ? Math.round(Number(body.sortOrder)) : 0

  const { rows } = await pool.query(
    `INSERT INTO store_subcategories (category_id, slug, label, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, category_id, slug, label, sort_order, is_active`,
    [categoryId, slug, label, sortOrder],
  )
  return rows[0]
}

/**
 * @param {PgPool} pool
 * @param {string} id
 * @param {Partial<{ label: string, sortOrder: number, isActive: boolean, slug: string }>} patch
 */
export async function updateSubcategory(pool, id, patch) {
  const row = await getSubcategoryRow(pool, id)
  if (!row) return null
  let label = row.label
  let sort_order = row.sort_order
  let is_active = row.is_active
  let slug = row.slug
  if (typeof patch.label === 'string') label = patch.label.trim().slice(0, 120)
  if (patch.sortOrder != null && Number.isFinite(Number(patch.sortOrder))) sort_order = Math.round(Number(patch.sortOrder))
  if (patch.isActive != null) is_active = Boolean(patch.isActive)
  if (typeof patch.slug === 'string') {
    const s = patch.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 64)
    if (s) slug = s
  }
  let shortDesc = row.short_description ?? ''
  let keywords = Array.isArray(row.keywords) ? row.keywords : []
  let heroUrl = row.hero_image_url ?? ''
  if (typeof patch.shortDescription === 'string') shortDesc = patch.shortDescription.trim().slice(0, 500)
  if (patch.keywords != null) {
    keywords = Array.isArray(patch.keywords)
      ? patch.keywords.map((k) => String(k).trim().slice(0, 64)).filter(Boolean).slice(0, 32)
      : []
  }
  if (typeof patch.heroImageUrl === 'string') heroUrl = patch.heroImageUrl.trim().slice(0, 2048)
  const { rows } = await pool.query(
    `UPDATE store_subcategories SET label = $2, sort_order = $3, is_active = $4, slug = $5,
        short_description = $6, keywords = $7, hero_image_url = $8, updated_at = now()
     WHERE id = $1::uuid
     RETURNING id, category_id, slug, label, sort_order, is_active, short_description, keywords, hero_image_url`,
    [id, label, sort_order, is_active, slug, shortDesc, keywords, heroUrl],
  )
  return rows[0] ?? null
}

/**
 * @param {PgPool} pool
 * @param {string} id
 */
export async function deleteSubcategory(pool, id) {
  const row = await getSubcategoryRow(pool, id)
  if (!row) return { ok: false, error: 'not_found' }
  if (row.slug === GENERAL_SLUG) return { ok: false, error: 'cannot_delete_general' }
  const { rows: used } = await pool.query(`SELECT COUNT(*)::int AS n FROM products WHERE subcategory_id = $1::uuid`, [id])
  if ((used[0]?.n ?? 0) > 0) return { ok: false, error: 'subcategory_in_use' }
  await pool.query(`DELETE FROM store_subcategories WHERE id = $1::uuid`, [id])
  return { ok: true }
}

/**
 * @param {PgPool} pool
 * @param {string} categoryId
 * @param {Partial<{ label: string, sortOrder: number, isActive: boolean }>} patch
 */
export async function updateCategory(pool, categoryId, patch) {
  const { rows: ex } = await pool.query(`SELECT id FROM store_categories WHERE id = $1 LIMIT 1`, [categoryId])
  if (!ex.length) return null
  if (patch.isActive === false) {
    const n = await countProductsUsingCategory(pool, categoryId)
    if (n > 0) throw new Error('category_has_products')
  }
  const sets = []
  const params = [categoryId]
  if (typeof patch.label === 'string') {
    params.push(patch.label.trim().slice(0, 120))
    sets.push(`label = $${params.length}`)
  }
  if (patch.sortOrder != null && Number.isFinite(Number(patch.sortOrder))) {
    params.push(Math.round(Number(patch.sortOrder)))
    sets.push(`sort_order = $${params.length}`)
  }
  if (typeof patch.shortDescription === 'string') {
    params.push(patch.shortDescription.trim().slice(0, 500))
    sets.push(`short_description = $${params.length}`)
  }
  if (patch.keywords != null) {
    const arr = Array.isArray(patch.keywords)
      ? patch.keywords.map((k) => String(k).trim().slice(0, 64)).filter(Boolean).slice(0, 32)
      : []
    params.push(arr)
    sets.push(`keywords = $${params.length}`)
  }
  if (typeof patch.heroImageUrl === 'string') {
    params.push(patch.heroImageUrl.trim().slice(0, 2048))
    sets.push(`hero_image_url = $${params.length}`)
  }
  if (patch.isActive != null) {
    params.push(Boolean(patch.isActive))
    sets.push(`is_active = $${params.length}`)
  }
  if (!sets.length) {
    const { rows } = await pool.query(`SELECT * FROM store_categories WHERE id = $1`, [categoryId])
    return rows[0] ?? null
  }
  sets.push('updated_at = now()')
  const { rows } = await pool.query(
    `UPDATE store_categories SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params,
  )
  return rows[0] ?? null
}

export { DEFAULT_CATEGORIES, GENERAL_SLUG }
