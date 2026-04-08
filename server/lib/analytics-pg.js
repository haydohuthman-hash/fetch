/** @typedef {import('pg').Pool} PgPool */

/**
 * @param {PgPool} pool
 */
export async function ensureAnalyticsTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_pings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id text NOT NULL,
      path text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_pings_created ON analytics_pings (created_at DESC);`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_analytics_pings_session ON analytics_pings (session_id, created_at DESC);`,
  )
}

/**
 * @param {PgPool} pool
 * @param {string} sessionId
 * @param {string} path
 */
export async function recordAnalyticsPing(pool, sessionId, path) {
  const sid = typeof sessionId === 'string' ? sessionId.trim().slice(0, 128) : ''
  if (!sid) return
  const p = typeof path === 'string' ? path.trim().slice(0, 512) : ''
  await pool.query(`INSERT INTO analytics_pings (session_id, path) VALUES ($1, $2)`, [sid, p])
}

/**
 * @param {PgPool} pool
 * @param {number} windowMinutes
 */
export async function countLiveVisitors(pool, windowMinutes) {
  const w = Math.max(1, Math.min(60, Math.floor(Number(windowMinutes) || 5)))
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT session_id)::int AS n
     FROM analytics_pings
     WHERE created_at >= now() - ($1::int * interval '1 minute')`,
    [w],
  )
  return rows[0]?.n ?? 0
}

/**
 * @param {PgPool} pool
 * @param {number} days
 */
export async function visitorBucketsByDay(pool, days) {
  const d = Math.max(1, Math.min(90, Math.floor(Number(days) || 30)))
  const { rows } = await pool.query(
    `
    SELECT (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date AS day,
           COUNT(DISTINCT session_id)::int AS visitors
    FROM analytics_pings
    WHERE created_at >= (now() AT TIME ZONE 'UTC') - ($1::int * interval '1 day')
    GROUP BY 1
    ORDER BY 1 ASC
  `,
    [d],
  )
  return rows.map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    visitors: Number(r.visitors) || 0,
  }))
}
