import fs from 'node:fs/promises'
import path from 'node:path'

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {string} filePath
 */
export function createStoreOrdersStore(filePath) {
  const resolved = path.resolve(filePath)

  async function readOrders() {
    try {
      const raw = await fs.readFile(resolved, 'utf8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      if (e && e.code === 'ENOENT') return []
      throw e
    }
  }

  async function writeOrders(rows) {
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, JSON.stringify(rows, null, 2), 'utf8')
  }

  return {
    /** @param {Record<string, unknown> & { id?: string }} entry */
    async appendPendingOrder(entry) {
      const rows = await readOrders()
      const order = {
        id: entry.id ?? makeId('sto'),
        createdAt: Date.now(),
        kind: 'supply_cart',
        status: 'pending',
        ...entry,
      }
      rows.unshift(order)
      await writeOrders(rows.slice(0, 500))
      return order
    },

    /** @param {string} id */
    async getById(id) {
      const rows = await readOrders()
      return rows.find((r) => r.id === id) ?? null
    },

    /** @param {string} paymentIntentId */
    async findByPaymentIntentId(paymentIntentId) {
      const rows = await readOrders()
      return rows.find((r) => r.paymentIntentId === paymentIntentId) ?? null
    },

    /** @param {number} [limit] */
    async listRecent(limit = 500) {
      const rows = await readOrders()
      return rows.slice(0, Math.max(1, Math.min(2000, Math.floor(Number(limit) || 500))))
    },

    /**
     * @param {string} id
     * @param {Partial<{ status: string, webhookConfirmedAt: number, paymentIntentId: string }>} patch
     */
    async patchOrder(id, patch) {
      const rows = await readOrders()
      const idx = rows.findIndex((r) => r.id === id)
      if (idx < 0) return null
      rows[idx] = { ...rows[idx], ...patch }
      await writeOrders(rows)
      return rows[idx]
    },
  }
}
