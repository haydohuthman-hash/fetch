import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Admin-added catalog rows (merged on top of static {@link STORE_CATALOG_PRODUCTS}).
 * @param {string} filePath
 */
export function createStoreCatalogOverridesStore(filePath) {
  const resolved = path.resolve(filePath)

  async function readProducts() {
    try {
      const raw = await fs.readFile(resolved, 'utf8')
      const j = JSON.parse(raw)
      return Array.isArray(j.products) ? j.products : []
    } catch (e) {
      if (e && e.code === 'ENOENT') return []
      throw e
    }
  }

  async function writeProducts(products) {
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, JSON.stringify({ products }, null, 2), 'utf8')
  }

  return {
    readProducts,

    /** @param {{ id: string, sku: string, title: string, subtitle: string, categoryId: string, priceAud: number }} product */
    async upsertProduct(product) {
      const cur = await readProducts()
      const next = cur.filter((p) => p && p.id !== product.id)
      next.push(product)
      await writeProducts(next)
      return product
    },

    /** @param {string} id */
    async deleteById(id) {
      const cur = await readProducts()
      const next = cur.filter((p) => p && p.id !== id)
      if (next.length === cur.length) return false
      await writeProducts(next)
      return true
    },
  }
}
