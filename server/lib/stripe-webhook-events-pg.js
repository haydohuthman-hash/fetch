/**
 * Durable Stripe webhook idempotency (survives restarts / multiple instances).
 * @param {import('pg').Pool} pool
 */
export async function ensureStripeWebhookEventsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id text PRIMARY KEY,
      event_type text NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz,
      error text
    );
  `)
}

/**
 * @returns {Promise<'new' | 'retry' | 'duplicate'>}
 */
export async function classifyStripeWebhookDelivery(pool, eventId, eventType) {
  const ins = await pool.query(
    `INSERT INTO stripe_webhook_events (event_id, event_type) VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [eventId, eventType],
  )
  if (ins.rowCount > 0) return 'new'
  const sel = await pool.query(`SELECT processed_at FROM stripe_webhook_events WHERE event_id = $1`, [
    eventId,
  ])
  if (sel.rows[0]?.processed_at) return 'duplicate'
  return 'retry'
}

export async function markStripeWebhookEventDone(pool, eventId) {
  await pool.query(
    `UPDATE stripe_webhook_events SET processed_at = now(), error = null WHERE event_id = $1`,
    [eventId],
  )
}

export async function markStripeWebhookEventError(pool, eventId, message) {
  const err = (message || '').slice(0, 500)
  await pool.query(`UPDATE stripe_webhook_events SET error = $2 WHERE event_id = $1`, [eventId, err])
}
