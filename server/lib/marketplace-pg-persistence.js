import pg from 'pg'

/** State key → DB collection name */
const COLLECTION_KEYS = [
  ['bookings', 'bookings'],
  ['offers', 'offers'],
  ['notifications', 'notifications'],
  ['media', 'media'],
  ['paymentIntents', 'payment_intents'],
  ['driverPresence', 'driver_presence'],
]

/** @param {string} collection */
/** @param {object} entity */
function entityIdForRow(collection, entity) {
  if (!entity || typeof entity !== 'object') return ''
  if (collection === 'offers') return String(entity.offerId ?? '')
  if (collection === 'driver_presence') return String(entity.driverId ?? '')
  return String(entity.id ?? '')
}

/**
 * @param {import('pg').Pool} pool
 */
export async function attachPostgresMarketplacePersistence(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_entities (
      collection text NOT NULL,
      entity_id text NOT NULL,
      payload jsonb NOT NULL,
      PRIMARY KEY (collection, entity_id)
    );
  `)

  return {
    pool,
    async load() {
      const { rows } = await pool.query(
        'SELECT collection, entity_id, payload FROM marketplace_entities',
      )
      /** @type {Record<string, unknown>} */
      const base = {
        bookings: [],
        offers: [],
        notifications: [],
        media: [],
        paymentIntents: [],
        driverPresence: [],
      }
      const collToKey = Object.fromEntries(COLLECTION_KEYS.map(([a, b]) => [b, a]))
      for (const row of rows) {
        const key = collToKey[row.collection]
        if (key && Array.isArray(base[key])) {
          base[key].push(row.payload)
        }
      }
      return base
    },
    /** @param {object} state @param {string} [_json] */
    async save(state, _json) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        /** @type {string[]} */
        const cols = []
        /** @type {string[]} */
        const ids = []
        for (const [stateKey, coll] of COLLECTION_KEYS) {
          const list = state[stateKey]
          if (!Array.isArray(list)) continue
          for (const entity of list) {
            const entityId = entityIdForRow(coll, entity)
            if (!entityId) continue
            cols.push(coll)
            ids.push(entityId)
            await client.query(
              `INSERT INTO marketplace_entities (collection, entity_id, payload)
               VALUES ($1, $2, $3::jsonb)
               ON CONFLICT (collection, entity_id) DO UPDATE SET payload = EXCLUDED.payload`,
              [coll, entityId, JSON.stringify(entity)],
            )
          }
        }
        if (cols.length > 0) {
          await client.query(
            `DELETE FROM marketplace_entities m
             WHERE NOT EXISTS (
               SELECT 1 FROM unnest($1::text[], $2::text[]) AS k(coll, eid)
               WHERE k.coll = m.collection AND k.eid = m.entity_id
             )`,
            [cols, ids],
          )
        } else {
          await client.query('DELETE FROM marketplace_entities')
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },
  }
}

/**
 * @param {string} databaseUrl
 * @deprecated Prefer attachPostgresMarketplacePersistence(sharedPool) from a single app pool.
 */
export async function createPostgresMarketplacePersistence(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 12 })
  const persistence = await attachPostgresMarketplacePersistence(pool)
  return persistence
}
