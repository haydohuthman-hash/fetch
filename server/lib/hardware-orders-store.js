import fs from 'node:fs/promises'
import path from 'node:path'

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createHardwareOrdersStore(filePath) {
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
    async appendOrder(entry) {
      const rows = await readOrders()
      const order = {
        id: makeId('hwo'),
        createdAt: Date.now(),
        ...entry,
      }
      rows.unshift(order)
      await writeOrders(rows.slice(0, 200))
      return order
    },
  }
}
