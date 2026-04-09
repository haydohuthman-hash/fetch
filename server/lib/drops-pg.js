/**
 * Drops feed persistence (Postgres). Media rows support video, image carousel, live_replay.
 * FUTURE: Mux/Cloudflare webhooks attach live_replay assets here.
 */

/** @typedef {import('pg').Pool} PgPool */

const VALID_REGIONS = new Set(['SEQ', 'NSW', 'VIC', 'AU_WIDE'])
const VALID_STATUS = new Set(['draft', 'published', 'archived'])
const VALID_MODERATION = new Set(['ok', 'pending', 'rejected'])

/**
 * @param {PgPool} pool
 */
export async function ensureDropsTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drops (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      seller_key text NOT NULL,
      author_id text NOT NULL,
      seller_display text NOT NULL,
      title text NOT NULL,
      price_label text NOT NULL DEFAULT '',
      blurb text NOT NULL DEFAULT '',
      categories text[] NOT NULL DEFAULT ARRAY[]::text[],
      region text NOT NULL DEFAULT 'SEQ',
      commerce jsonb,
      commerce_sale_mode text NOT NULL DEFAULT 'buy_now',
      status text NOT NULL DEFAULT 'draft',
      moderation_state text NOT NULL DEFAULT 'ok',
      like_count bigint NOT NULL DEFAULT 0,
      view_ms_total bigint NOT NULL DEFAULT 0,
      growth_velocity_score double precision NOT NULL DEFAULT 1,
      watch_time_ms_seed bigint NOT NULL DEFAULT 0,
      is_official boolean NOT NULL DEFAULT false,
      is_sponsored boolean NOT NULL DEFAULT false,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`ALTER TABLE drops ADD COLUMN IF NOT EXISTS user_id uuid;`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_drops_user_created ON drops (user_id, created_at DESC);`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drop_media (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      drop_id uuid NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('video', 'image', 'live_replay')),
      url text NOT NULL,
      sort_order int NOT NULL DEFAULT 0,
      poster_url text,
      duration_ms int
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_drop_media_drop ON drop_media (drop_id, sort_order);`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_drops_feed ON drops (published_at DESC NULLS LAST) WHERE status = 'published' AND moderation_state = 'ok';`,
  )
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drop_engagement_events (
      id bigserial PRIMARY KEY,
      drop_id uuid NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      client_id text NOT NULL DEFAULT '',
      amount bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_drop_engagement_drop ON drop_engagement_events (drop_id, created_at DESC);`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_posts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      drop_id uuid NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
      seller_key text NOT NULL,
      media_kind text NOT NULL DEFAULT 'video',
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT marketplace_posts_drop_id_key UNIQUE (drop_id)
    );
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_marketplace_posts_created ON marketplace_posts (created_at DESC);`,
  )
}

/**
 * @param {PgPool} pool
 * @param {string} dropId
 * @param {string} sellerKey
 * @param {'video'|'carousel'} mediaKind
 */
export async function insertMarketplacePost(pool, dropId, sellerKey, mediaKind) {
  const sk = typeof sellerKey === 'string' ? sellerKey.trim() : ''
  const mk = mediaKind === 'carousel' ? 'carousel' : 'video'
  await pool.query(
    `INSERT INTO marketplace_posts (drop_id, seller_key, media_kind) VALUES ($1::uuid,$2,$3)
     ON CONFLICT (drop_id) DO UPDATE SET seller_key = EXCLUDED.seller_key, media_kind = EXCLUDED.media_kind`,
    [dropId, sk, mk],
  )
}

/**
 * @param {object} row
 * @param {{ kind: string, url: string, sort_order: number, poster_url: string | null, duration_ms: number | null }[]} media
 */
export function serializeDropPublic(row, media) {
  const sorted = [...media].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const images = sorted.filter((m) => m.kind === 'image').map((m) => m.url)
  const videoRow = sorted.find((m) => m.kind === 'video' || m.kind === 'live_replay')
  /** @type {Record<string, unknown>} */
  const out = {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : undefined,
    title: row.title,
    seller: row.seller_display,
    authorId: row.author_id,
    priceLabel: row.price_label,
    blurb: row.blurb,
    likes: Number(row.like_count) || 0,
    growthVelocityScore: Number(row.growth_velocity_score) || 1,
    watchTimeMsSeed: Number(row.watch_time_ms_seed) || 0,
    viewMsTotal: Number(row.view_ms_total) || 0,
    categories: Array.isArray(row.categories) ? row.categories : [],
    region: row.region,
    commerce: row.commerce && typeof row.commerce === 'object' ? row.commerce : undefined,
    commerceSaleMode: row.commerce_sale_mode === 'auction' ? 'auction' : 'buy_now',
    isOfficial: Boolean(row.is_official),
    isSponsored: Boolean(row.is_sponsored),
  }
  if (images.length > 0) {
    out.imageUrls = images
    out.mediaKind = 'images'
  }
  if (videoRow && images.length === 0) {
    out.videoUrl = videoRow.url
    out.mediaKind = videoRow.kind === 'live_replay' ? 'live_replay' : 'video'
    if (videoRow.poster_url) out.poster = videoRow.poster_url
  }
  return out
}

/**
 * @param {PgPool} pool
 * @param {{ limit?: number, cursor?: string }} q
 */
/** Server-side ranking (watch + likes + growth + sponsor), aligned with client feedRanking weights. */
const FEED_ORDER_RANKED = `(LN(GREATEST(1, d.like_count::double precision)) * 28.0
  + LN(GREATEST(100.0, d.view_ms_total::double precision)) * 0.012
  + COALESCE(d.growth_velocity_score, 1)::double precision * 18.0)
  * CASE WHEN d.is_sponsored THEN 1.22 ELSE 1.0 END DESC,
  d.published_at DESC NULLS LAST, d.id DESC`

const FEED_ORDER_RECENCY = `d.published_at DESC NULLS LAST, d.id DESC`

/**
 * @param {PgPool} pool
 * @param {{ limit?: number, cursor?: string, ranked?: boolean }} q
 */
export async function listPublishedDropsFeed(pool, q) {
  const limit = Math.min(48, Math.max(1, Number(q.limit) || 24))
  const cursor = typeof q.cursor === 'string' ? q.cursor.trim() : ''
  const ranked = Boolean(q.ranked)
  let curPublished = null
  let curId = null
  if (cursor) {
    const pipe = cursor.indexOf('|')
    if (pipe > 0) {
      curPublished = cursor.slice(0, pipe)
      curId = cursor.slice(pipe + 1)
    }
  }
  const orderBy = ranked ? FEED_ORDER_RANKED : FEED_ORDER_RECENCY
  const useKeyset = !ranked && Boolean(curPublished && curId)
  const { rows } = await pool.query(
    `SELECT d.* FROM drops d
     WHERE d.status = 'published' AND d.moderation_state = 'ok'
       AND (
         NOT $4::boolean
         OR $2::timestamptz IS NULL OR $3::uuid IS NULL
         OR (d.published_at, d.id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY ${orderBy}
     LIMIT $1::int`,
    [limit + 1, curPublished, curId, useKeyset],
  )
  const page = rows.slice(0, limit)
  const next = !ranked && rows.length > limit ? rows[limit] : null
  const ids = page.map((r) => r.id)
  if (!ids.length) return { drops: [], nextCursor: null }
  const { rows: mediaRows } = await pool.query(
    `SELECT * FROM drop_media WHERE drop_id = ANY($1::uuid[]) ORDER BY drop_id, sort_order`,
    [ids],
  )
  const byDrop = new Map()
  for (const m of mediaRows) {
    const k = String(m.drop_id)
    if (!byDrop.has(k)) byDrop.set(k, [])
    byDrop.get(k).push(m)
  }
  const drops = page.map((d) => serializeDropPublic(d, byDrop.get(String(d.id)) ?? []))
  let nextCursor = null
  if (next) {
    const t = next.published_at instanceof Date ? next.published_at.toISOString() : String(next.published_at)
    nextCursor = `${t}|${next.id}`
  }
  return { drops, nextCursor }
}

/**
 * @param {PgPool} pool
 * @param {string} id
 */
export async function getDropWithMedia(pool, id) {
  const { rows } = await pool.query(`SELECT * FROM drops WHERE id = $1::uuid LIMIT 1`, [id])
  const row = rows[0]
  if (!row) return null
  const { rows: media } = await pool.query(
    `SELECT * FROM drop_media WHERE drop_id = $1::uuid ORDER BY sort_order`,
    [id],
  )
  return { drop: row, media, public: serializeDropPublic(row, media) }
}

/**
 * @param {PgPool} pool
 * @param {string} sellerKey
 * @param {object} body
 */
export async function createDropDraft(pool, sellerKey, body) {
  const sk = typeof sellerKey === 'string' ? sellerKey.trim() : ''
  if (!sk) throw new Error('seller_key_required')
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const authorId = typeof body.authorId === 'string' ? body.authorId.trim().slice(0, 128) : 'anon'
  const sellerDisplay = typeof body.sellerDisplay === 'string' ? body.sellerDisplay.trim().slice(0, 120) : '@seller'
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : 'Untitled'
  const priceLabel = typeof body.priceLabel === 'string' ? body.priceLabel.trim().slice(0, 80) : ''
  const blurb = typeof body.blurb === 'string' ? body.blurb.trim().slice(0, 400) : ''
  const categories = Array.isArray(body.categories) ? body.categories.map((c) => String(c).trim()).filter(Boolean).slice(0, 8) : []
  const region = typeof body.region === 'string' && VALID_REGIONS.has(body.region.trim()) ? body.region.trim() : 'SEQ'
  const commerce = body.commerce && typeof body.commerce === 'object' ? body.commerce : null
  const commerceSaleMode = body.commerceSaleMode === 'auction' ? 'auction' : 'buy_now'
  const growth = Number(body.growthVelocityScore)
  const growthVelocityScore = Number.isFinite(growth) && growth > 0 ? growth : 1.55
  const watchSeed = Number(body.watchTimeMsSeed)
  const watchTimeMsSeed = Number.isFinite(watchSeed) && watchSeed >= 0 ? Math.round(watchSeed) : 0

  console.log('[publish-db] createDropDraft insert start', {
    userId: userId || null,
    authorId,
    hasCommerce: Boolean(commerce),
    categoriesCount: categories.length,
  })
  try {
    const { rows } = await pool.query(
      `INSERT INTO drops (user_id, seller_key, author_id, seller_display, title, price_label, blurb, categories, region, commerce, commerce_sale_mode, growth_velocity_score, watch_time_ms_seed)
       VALUES (NULLIF($1,'')::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
       RETURNING *`,
      [
        userId,
        sk,
        authorId,
        sellerDisplay,
        title,
        priceLabel,
        blurb,
        categories,
        region,
        JSON.stringify(commerce),
        commerceSaleMode,
        growthVelocityScore,
        watchTimeMsSeed,
      ],
    )
    console.log('[publish-db] createDropDraft insert done', { dropId: rows?.[0]?.id ?? null })
    return rows[0] ?? null
  } catch (e) {
    console.error('[publish-db] createDropDraft insert failed', e)
    throw e
  }
}

/**
 * @param {PgPool} pool
 * @param {string} userId
 * @param {number} windowSeconds
 */
export async function countRecentDropsByUser(pool, userId, windowSeconds = 60) {
  const uid = typeof userId === 'string' ? userId.trim() : ''
  if (!uid) return 0
  const sec = Math.max(1, Math.min(3600, Math.round(Number(windowSeconds) || 60)))
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM drops
      WHERE user_id = $1::uuid
        AND created_at > now() - make_interval(secs => $2::int)`,
    [uid, sec],
  )
  return Number(rows?.[0]?.c || 0)
}

/**
 * @param {PgPool} pool
 * @param {string} dropId
 * @param {string} sellerKey
 * @param {object} patch
 */
export async function updateDrop(pool, dropId, sellerKey, patch) {
  const existing = await pool.query(`SELECT * FROM drops WHERE id = $1::uuid LIMIT 1`, [dropId])
  const row = existing.rows[0]
  if (!row) return null
  if (String(row.seller_key) !== String(sellerKey).trim()) throw new Error('forbidden')

  const title = typeof patch.title === 'string' ? patch.title.trim().slice(0, 200) : row.title
  const priceLabel = typeof patch.priceLabel === 'string' ? patch.priceLabel.trim().slice(0, 80) : row.price_label
  const blurb = typeof patch.blurb === 'string' ? patch.blurb.trim().slice(0, 400) : row.blurb
  let categories = row.categories
  if (Array.isArray(patch.categories)) {
    categories = patch.categories.map((c) => String(c).trim()).filter(Boolean).slice(0, 8)
  }
  let region = row.region
  if (typeof patch.region === 'string' && VALID_REGIONS.has(patch.region.trim())) region = patch.region.trim()
  let commerce = row.commerce
  if (patch.commerce !== undefined) {
    commerce = patch.commerce && typeof patch.commerce === 'object' ? patch.commerce : null
  }
  let commerceSaleMode = row.commerce_sale_mode
  if (patch.commerceSaleMode === 'auction' || patch.commerceSaleMode === 'buy_now') {
    commerceSaleMode = patch.commerceSaleMode
  }
  let moderation = row.moderation_state
  if (typeof patch.moderation_state === 'string' && VALID_MODERATION.has(patch.moderation_state)) {
    moderation = patch.moderation_state
  }

  const { rows } = await pool.query(
    `UPDATE drops SET title = $2, price_label = $3, blurb = $4, categories = $5, region = $6, commerce = $7::jsonb, commerce_sale_mode = $8, moderation_state = $9, updated_at = now()
     WHERE id = $1::uuid RETURNING *`,
    [dropId, title, priceLabel, blurb, categories, region, JSON.stringify(commerce), commerceSaleMode, moderation],
  )
  return rows[0] ?? null
}

/**
 * @param {PgPool} pool
 * @param {string} dropId
 * @param {string} sellerKey
 */
export async function publishDrop(pool, dropId, sellerKey) {
  const existing = await pool.query(`SELECT * FROM drops WHERE id = $1::uuid LIMIT 1`, [dropId])
  const row = existing.rows[0]
  if (!row) return null
  if (String(row.seller_key) !== String(sellerKey).trim()) throw new Error('forbidden')
  const { rows: media } = await pool.query(`SELECT 1 FROM drop_media WHERE drop_id = $1::uuid LIMIT 1`, [dropId])
  if (!media.length) throw new Error('media_required')

  const { rows } = await pool.query(
    `UPDATE drops SET status = 'published', published_at = now(), updated_at = now() WHERE id = $1::uuid RETURNING *`,
    [dropId],
  )
  return rows[0] ?? null
}

/**
 * @param {PgPool} pool
 * @param {string} dropId
 * @param {{ kind: string, url: string, sortOrder?: number, posterUrl?: string, durationMs?: number }} m
 */
export async function addDropMedia(pool, dropId, m) {
  const kind = m.kind === 'image' || m.kind === 'video' || m.kind === 'live_replay' ? m.kind : null
  if (!kind) throw new Error('invalid_media_kind')
  const url = typeof m.url === 'string' ? m.url.trim().slice(0, 2048) : ''
  if (!url) throw new Error('url_required')
  const sortOrder = m.sortOrder != null ? Math.round(Number(m.sortOrder)) : 0
  const posterUrl = typeof m.posterUrl === 'string' ? m.posterUrl.trim().slice(0, 2048) : null
  const durationMs = m.durationMs != null ? Math.round(Number(m.durationMs)) : null
  const { rows } = await pool.query(
    `INSERT INTO drop_media (drop_id, kind, url, sort_order, poster_url, duration_ms) VALUES ($1::uuid,$2,$3,$4,$5,$6) RETURNING *`,
    [dropId, kind, url, sortOrder, posterUrl, durationMs],
  )
  return rows[0] ?? null
}

/**
 * Internal: attach media from trusted webhooks (Mux replay) without seller_key checks.
 * @param {PgPool} pool
 * @param {string} dropId
 * @param {{ kind: string, url: string, sortOrder?: number, posterUrl?: string, durationMs?: number }} m
 */
export async function addDropMediaInternal(pool, dropId, m) {
  return addDropMedia(pool, dropId, m)
}

/**
 * Publish a draft drop (e.g. after live replay asset is ready). Trusted callers only.
 * @param {PgPool} pool
 * @param {string} dropId
 */
export async function publishDropInternal(pool, dropId) {
  const { rows: media } = await pool.query(`SELECT 1 FROM drop_media WHERE drop_id = $1::uuid LIMIT 1`, [dropId])
  if (!media.length) throw new Error('media_required')
  const { rows } = await pool.query(
    `UPDATE drops SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
     WHERE id = $1::uuid AND status = 'draft' RETURNING *`,
    [dropId],
  )
  return rows[0] ?? null
}

/**
 * @param {PgPool} pool
 * @param {number} [limit]
 */
export async function listModerationPendingDrops(pool, limit = 24) {
  const lim = Math.min(100, Math.max(1, Math.round(Number(limit) || 24)))
  const { rows } = await pool.query(
    `SELECT d.* FROM drops d WHERE d.moderation_state = 'pending' ORDER BY d.created_at DESC LIMIT $1::int`,
    [lim],
  )
  const ids = rows.map((r) => r.id)
  if (!ids.length) return { drops: [] }
  const { rows: mediaRows } = await pool.query(
    `SELECT * FROM drop_media WHERE drop_id = ANY($1::uuid[]) ORDER BY drop_id, sort_order`,
    [ids],
  )
  const byDrop = new Map()
  for (const m of mediaRows) {
    const k = String(m.drop_id)
    if (!byDrop.has(k)) byDrop.set(k, [])
    byDrop.get(k).push(m)
  }
  return { drops: rows.map((d) => serializeDropPublic(d, byDrop.get(String(d.id)) ?? [])) }
}

/**
 * @param {PgPool} pool
 * @param {string} dropId
 * @param {string} eventType
 * @param {string} clientId
 * @param {number} amount
 */
export async function recordDropEngagement(pool, dropId, eventType, clientId, amount) {
  const cid = typeof clientId === 'string' ? clientId.trim().slice(0, 128) : 'anon'
  const et = typeof eventType === 'string' ? eventType.trim().slice(0, 32) : 'view_ms'
  const amt = Math.max(0, Math.round(Number(amount) || 0))
  if (!amt) return
  await pool.query(`INSERT INTO drop_engagement_events (drop_id, event_type, client_id, amount) VALUES ($1::uuid, $2, $3, $4)`, [
    dropId,
    et,
    cid,
    amt,
  ])
  if (et === 'like_delta') {
    await pool.query(`UPDATE drops SET like_count = GREATEST(0, like_count + $2), updated_at = now() WHERE id = $1::uuid`, [
      dropId,
      amt,
    ])
  }
  if (et === 'view_ms') {
    await pool.query(`UPDATE drops SET view_ms_total = view_ms_total + $2, updated_at = now() WHERE id = $1::uuid`, [
      dropId,
      amt,
    ])
  }
}
