import fs from 'node:fs'
import path from 'node:path'

/**
 * Single-row JSON snapshot in SQLite (durable writes; same shape as marketplace JSON file).
 * Requires Node 22.5+ (`node:sqlite`).
 */
export async function createSqlitePersistence(dbFile) {
  const { DatabaseSync } = await import('node:sqlite')

  const dir = path.dirname(dbFile)
  fs.mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(dbFile)
  db.exec(
    'CREATE TABLE IF NOT EXISTS marketplace_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)',
  )

  return {
    async load() {
      const row = db.prepare('SELECT data FROM marketplace_snapshot WHERE id = 1').get()
      if (!row?.data) return null
      return JSON.parse(row.data)
    },
    async save(_state, json) {
      db.prepare('INSERT OR REPLACE INTO marketplace_snapshot (id, data) VALUES (1, ?)').run(json)
    },
  }
}
