/**
 * Postgres persistence for Live Battles.
 * All write operations are server-validated; scores cannot be set from the client.
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function ensureBattlesTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battles (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mode          text NOT NULL DEFAULT 'mixed',
      status        text NOT NULL DEFAULT 'pending',
      duration_ms   integer NOT NULL DEFAULT 300000,
      started_at    timestamptz,
      ends_at       timestamptz,
      viewer_count  integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battle_participants (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      battle_id     uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
      seller_key    text NOT NULL,
      side          text NOT NULL,
      display_name  text NOT NULL DEFAULT '@seller',
      avatar        text NOT NULL DEFAULT '',
      rating        numeric(3,2),
      stream_url    text,
      featured_product_json jsonb,
      score         integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (battle_id, side)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battle_boosts (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      battle_id     uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
      viewer_id     text NOT NULL,
      viewer_name   text NOT NULL DEFAULT 'Viewer',
      side          text NOT NULL,
      tier          smallint NOT NULL,
      credits_cost  integer NOT NULL DEFAULT 0,
      points_added  integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battle_comments (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      battle_id     uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
      viewer_id     text NOT NULL,
      viewer_name   text NOT NULL DEFAULT 'Viewer',
      body          text NOT NULL DEFAULT '',
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battle_results (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      battle_id       uuid NOT NULL UNIQUE REFERENCES battles(id) ON DELETE CASCADE,
      winner_id       text,
      winner_side     text,
      is_tie          boolean NOT NULL DEFAULT false,
      score_a         integer NOT NULL DEFAULT 0,
      score_b         integer NOT NULL DEFAULT 0,
      total_boosts_a  integer NOT NULL DEFAULT 0,
      total_boosts_b  integer NOT NULL DEFAULT 0,
      total_bids_a    integer NOT NULL DEFAULT 0,
      total_bids_b    integer NOT NULL DEFAULT 0,
      total_sales_a   integer NOT NULL DEFAULT 0,
      total_sales_b   integer NOT NULL DEFAULT 0,
      reward_badge    text,
      reward_feed_boost_expires_at timestamptz,
      reward_credits  integer NOT NULL DEFAULT 0,
      created_at      timestamptz NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battle_seller_stats (
      seller_id       text PRIMARY KEY,
      total_battles   integer NOT NULL DEFAULT 0,
      wins            integer NOT NULL DEFAULT 0,
      losses          integer NOT NULL DEFAULT 0,
      ties            integer NOT NULL DEFAULT 0,
      current_streak  integer NOT NULL DEFAULT 0,
      best_streak     integer NOT NULL DEFAULT 0,
      total_boosts_received integer NOT NULL DEFAULT 0,
      total_sales_in_battles integer NOT NULL DEFAULT 0,
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `)
  console.log('[battles-pg] tables ensured')
}

/** @param {import('pg').Pool} pool */
export async function createBattle(pool, { mode, durationMs }) {
  const { rows } = await pool.query(
    `INSERT INTO battles (mode, duration_ms) VALUES ($1, $2) RETURNING *`,
    [mode || 'mixed', durationMs || 300000],
  )
  return rows[0]
}

/** @param {import('pg').Pool} pool */
export async function joinBattle(pool, { battleId, sellerKey, side, displayName, avatar, rating }) {
  const { rows } = await pool.query(
    `INSERT INTO battle_participants (battle_id, seller_key, side, display_name, avatar, rating)
     VALUES ($1::uuid, $2, $3, $4, $5, $6)
     ON CONFLICT (battle_id, side) DO UPDATE
       SET seller_key = EXCLUDED.seller_key, display_name = EXCLUDED.display_name,
           avatar = EXCLUDED.avatar, rating = EXCLUDED.rating
     RETURNING *`,
    [battleId, sellerKey, side, displayName || '@seller', avatar || '', rating ?? null],
  )
  return rows[0]
}

/** @param {import('pg').Pool} pool */
export async function startBattle(pool, battleId) {
  const now = new Date()
  const { rows: battle } = await pool.query(`SELECT * FROM battles WHERE id = $1::uuid`, [battleId])
  if (!battle[0]) throw new Error('battle_not_found')
  if (battle[0].status !== 'pending') throw new Error('battle_already_started')

  const endsAt = new Date(now.getTime() + (battle[0].duration_ms || 300000))
  const { rows } = await pool.query(
    `UPDATE battles SET status = 'live', started_at = $2, ends_at = $3, updated_at = $2
     WHERE id = $1::uuid AND status = 'pending' RETURNING *`,
    [battleId, now, endsAt],
  )
  return rows[0]
}

/** Server-validated score add. Prevents client-side fake scores. */
export async function addBattleScore(pool, { battleId, side, points, reason }) {
  if (points <= 0) return null
  const { rows } = await pool.query(
    `UPDATE battle_participants SET score = score + $3
     WHERE battle_id = $1::uuid AND side = $2 RETURNING score`,
    [battleId, side, Math.round(points)],
  )
  return rows[0]?.score ?? null
}

/** @param {import('pg').Pool} pool */
export async function recordBattleBoost(pool, { battleId, viewerId, viewerName, side, tier, creditsCost, pointsAdded }) {
  const { rows } = await pool.query(
    `INSERT INTO battle_boosts (battle_id, viewer_id, viewer_name, side, tier, credits_cost, points_added)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [battleId, viewerId, viewerName, side, tier, creditsCost, pointsAdded],
  )
  return rows[0]
}

/** @param {import('pg').Pool} pool */
export async function addBattleComment(pool, { battleId, viewerId, viewerName, body }) {
  const text = (body || '').trim().slice(0, 500)
  if (!text) return null
  const { rows } = await pool.query(
    `INSERT INTO battle_comments (battle_id, viewer_id, viewer_name, body)
     VALUES ($1::uuid, $2, $3, $4) RETURNING *`,
    [battleId, viewerId, viewerName, text],
  )
  return rows[0]
}

/** Finalize battle: lock scores, determine winner, write results, update stats. */
export async function finalizeBattle(pool, battleId) {
  const { rows: battles } = await pool.query(`SELECT * FROM battles WHERE id = $1::uuid`, [battleId])
  const battle = battles[0]
  if (!battle) throw new Error('battle_not_found')
  if (battle.status === 'ended') {
    const { rows: existing } = await pool.query(`SELECT * FROM battle_results WHERE battle_id = $1::uuid`, [battleId])
    return existing[0] ?? null
  }

  await pool.query(`UPDATE battles SET status = 'ended', updated_at = now() WHERE id = $1::uuid`, [battleId])

  const { rows: parts } = await pool.query(
    `SELECT * FROM battle_participants WHERE battle_id = $1::uuid ORDER BY side`,
    [battleId],
  )
  const partA = parts.find((p) => p.side === 'a')
  const partB = parts.find((p) => p.side === 'b')
  const scoreA = partA?.score ?? 0
  const scoreB = partB?.score ?? 0

  const { rows: boostRows } = await pool.query(
    `SELECT side, COUNT(*)::int AS c FROM battle_boosts WHERE battle_id = $1::uuid GROUP BY side`,
    [battleId],
  )
  const boostsA = boostRows.find((r) => r.side === 'a')?.c ?? 0
  const boostsB = boostRows.find((r) => r.side === 'b')?.c ?? 0

  let winnerId = null
  let winnerSide = null
  let isTie = false

  if (scoreA > scoreB) {
    winnerId = partA?.seller_key
    winnerSide = 'a'
  } else if (scoreB > scoreA) {
    winnerId = partB?.seller_key
    winnerSide = 'b'
  } else {
    isTie = true
  }

  const rewardBadge = winnerId ? 'Battle Winner' : null
  const feedBoostExpires = winnerId ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null
  const rewardCredits = winnerId ? 50 : 0

  const { rows: results } = await pool.query(
    `INSERT INTO battle_results
       (battle_id, winner_id, winner_side, is_tie, score_a, score_b,
        total_boosts_a, total_boosts_b, reward_badge, reward_feed_boost_expires_at, reward_credits)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (battle_id) DO NOTHING
     RETURNING *`,
    [battleId, winnerId, winnerSide, isTie, scoreA, scoreB, boostsA, boostsB, rewardBadge, feedBoostExpires, rewardCredits],
  )

  for (const p of parts) {
    const isWinner = p.seller_key === winnerId
    await pool.query(
      `INSERT INTO battle_seller_stats (seller_id, total_battles, wins, losses, ties, current_streak, best_streak, total_boosts_received, updated_at)
       VALUES ($1, 1, $2::int, $3::int, $4::int, $5::int, $5::int, $6, now())
       ON CONFLICT (seller_id) DO UPDATE SET
         total_battles = battle_seller_stats.total_battles + 1,
         wins = battle_seller_stats.wins + $2::int,
         losses = battle_seller_stats.losses + $3::int,
         ties = battle_seller_stats.ties + $4::int,
         current_streak = CASE WHEN $2::int = 1 THEN battle_seller_stats.current_streak + 1 ELSE 0 END,
         best_streak = GREATEST(battle_seller_stats.best_streak, CASE WHEN $2::int = 1 THEN battle_seller_stats.current_streak + 1 ELSE battle_seller_stats.best_streak END),
         total_boosts_received = battle_seller_stats.total_boosts_received + $6,
         updated_at = now()`,
      [
        p.seller_key,
        isWinner && !isTie ? 1 : 0,
        !isWinner && !isTie ? 1 : 0,
        isTie ? 1 : 0,
        isWinner && !isTie ? 1 : 0,
        p.side === 'a' ? boostsA : boostsB,
      ],
    )
  }

  return results[0] ?? null
}

/** @param {import('pg').Pool} pool */
export async function getBattleWithParticipants(pool, battleId) {
  const { rows: battles } = await pool.query(`SELECT * FROM battles WHERE id = $1::uuid`, [battleId])
  if (!battles[0]) return null
  const { rows: parts } = await pool.query(
    `SELECT * FROM battle_participants WHERE battle_id = $1::uuid ORDER BY side`,
    [battleId],
  )
  const { rows: results } = await pool.query(
    `SELECT * FROM battle_results WHERE battle_id = $1::uuid`,
    [battleId],
  )
  return { battle: battles[0], participants: parts, result: results[0] ?? null }
}

/** @param {import('pg').Pool} pool */
export async function getSellerBattleStats(pool, sellerId) {
  const { rows } = await pool.query(`SELECT * FROM battle_seller_stats WHERE seller_id = $1`, [sellerId])
  return rows[0] ?? null
}

/** @param {import('pg').Pool} pool */
export async function listActiveBattles(pool) {
  const { rows } = await pool.query(
    `SELECT b.*, json_agg(json_build_object('side', bp.side, 'display_name', bp.display_name, 'avatar', bp.avatar, 'score', bp.score)) AS participants
     FROM battles b
     LEFT JOIN battle_participants bp ON bp.battle_id = b.id
     WHERE b.status IN ('pending', 'live')
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT 20`,
  )
  return rows
}

/** Check + finalize battles whose timer has expired. */
export async function finalizeExpiredBattles(pool) {
  const { rows } = await pool.query(
    `SELECT id FROM battles WHERE status = 'live' AND ends_at <= now()`,
  )
  const out = []
  for (const r of rows) {
    try {
      const res = await finalizeBattle(pool, r.id)
      if (res) out.push(res)
    } catch (e) {
      console.error('[battles-pg] finalize expired failed', r.id, e)
    }
  }
  return out
}
