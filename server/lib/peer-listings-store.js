import fs from 'node:fs/promises'
import path from 'node:path'

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Single JSON file: listings, seller Stripe accounts, listing orders, earnings ledger.
 * @param {string} filePath
 */
export function createPeerListingsStore(filePath) {
  const resolved = path.resolve(filePath)

  async function readAll() {
    try {
      const raw = await fs.readFile(resolved, 'utf8')
      const p = JSON.parse(raw)
      return {
        listings: Array.isArray(p.listings) ? p.listings : [],
        sellers: Array.isArray(p.sellers) ? p.sellers : [],
        listingOrders: Array.isArray(p.listingOrders) ? p.listingOrders : [],
        ledger: Array.isArray(p.ledger) ? p.ledger : [],
      }
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        return { listings: [], sellers: [], listingOrders: [], ledger: [] }
      }
      throw e
    }
  }

  async function writeAll(data) {
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, JSON.stringify(data, null, 2), 'utf8')
  }

  function sellerKey(userId, email) {
    if (userId && typeof userId === 'string') return `uid:${userId.trim()}`
    if (email && typeof email === 'string') return `em:${email.trim().toLowerCase()}`
    return null
  }

  return {
    sellerKey,

    async listListings({ status = 'published', q, category, minPrice, maxPrice, cursor, limit = 24 }) {
      const { listings } = await readAll()
      let rows = listings.filter((l) => !status || l.status === status)
      if (q && typeof q === 'string' && q.trim()) {
        const n = q.trim().toLowerCase()
        rows = rows.filter(
          (l) =>
            (l.title && String(l.title).toLowerCase().includes(n)) ||
            (l.description && String(l.description).toLowerCase().includes(n)),
        )
      }
      if (category && typeof category === 'string') {
        rows = rows.filter((l) => l.category === category)
      }
      if (minPrice != null) {
        const m = Number(minPrice)
        if (Number.isFinite(m)) rows = rows.filter((l) => (l.priceCents ?? 0) >= m * 100)
      }
      if (maxPrice != null) {
        const m = Number(maxPrice)
        if (Number.isFinite(m)) rows = rows.filter((l) => (l.priceCents ?? 0) <= m * 100)
      }
      rows.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      let start = 0
      if (cursor && typeof cursor === 'string') {
        const idx = rows.findIndex((l) => l.id === cursor)
        if (idx >= 0) start = idx + 1
      }
      const slice = rows.slice(start, start + limit)
      const nextCursor = slice.length === limit ? slice[slice.length - 1].id : null
      return { listings: slice, nextCursor }
    },

    async getListing(id) {
      const { listings } = await readAll()
      return listings.find((l) => l.id === id) ?? null
    },

    async getListingVisible(id, viewerSellerKey) {
      const { listings } = await readAll()
      const l = listings.find((row) => row.id === id) ?? null
      if (!l) return null
      if (l.status !== 'draft') return l
      if (viewerSellerKey && listingOwnedBy(l, viewerSellerKey)) return l
      return null
    },

    async createListing({ sellerUserId, sellerEmail, title, description, priceAud, category, condition }) {
      const data = await readAll()
      const listing = {
        id: makeId('lst'),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sellerUserId: sellerUserId || null,
        sellerEmail: sellerEmail || null,
        title: String(title || '').slice(0, 200),
        description: String(description || '').slice(0, 8000),
        priceCents: Math.max(0, Math.round(Number(priceAud) * 100)) || 0,
        category: String(category || 'general').slice(0, 64),
        condition: String(condition || 'used').slice(0, 32),
        status: 'draft',
        images: [],
      }
      data.listings.unshift(listing)
      await writeAll(data)
      return listing
    },

    async patchListing(id, sellerKeyVal, patch) {
      const data = await readAll()
      const idx = data.listings.findIndex((l) => l.id === id)
      if (idx < 0) return null
      const l = data.listings[idx]
      if (!listingOwnedBy(l, sellerKeyVal)) return { error: 'forbidden' }
      const next = { ...l, ...patch, updatedAt: Date.now() }
      if (patch.title != null) next.title = String(patch.title).slice(0, 200)
      if (patch.description != null) next.description = String(patch.description).slice(0, 8000)
      if (patch.priceAud != null) next.priceCents = Math.max(0, Math.round(Number(patch.priceAud) * 100))
      if (patch.category != null) next.category = String(patch.category).slice(0, 64)
      if (patch.condition != null) next.condition = String(patch.condition).slice(0, 32)
      data.listings[idx] = next
      await writeAll(data)
      return { listing: next }
    },

    async setListingStatus(id, sellerKeyVal, status) {
      const data = await readAll()
      const idx = data.listings.findIndex((l) => l.id === id)
      if (idx < 0) return null
      const l = data.listings[idx]
      if (!listingOwnedBy(l, sellerKeyVal)) return { error: 'forbidden' }
      data.listings[idx] = { ...l, status, updatedAt: Date.now() }
      await writeAll(data)
      return { listing: data.listings[idx] }
    },

    async addListingImage(id, sellerKeyVal, { url, sort }) {
      const data = await readAll()
      const idx = data.listings.findIndex((l) => l.id === id)
      if (idx < 0) return null
      const l = data.listings[idx]
      if (!listingOwnedBy(l, sellerKeyVal)) return { error: 'forbidden' }
      const images = Array.isArray(l.images) ? [...l.images] : []
      if (images.length >= 12) return { error: 'too_many_images' }
      images.push({ url: String(url).slice(0, 2048), sort: sort ?? images.length })
      data.listings[idx] = { ...l, images, updatedAt: Date.now() }
      await writeAll(data)
      return { listing: data.listings[idx] }
    },

    async markListingSold(listingId) {
      const data = await readAll()
      const idx = data.listings.findIndex((l) => l.id === listingId)
      if (idx < 0) return false
      data.listings[idx] = { ...data.listings[idx], status: 'sold', updatedAt: Date.now() }
      await writeAll(data)
      return true
    },

    async getSeller(userKey) {
      const { sellers } = await readAll()
      return sellers.find((s) => s.userKey === userKey) ?? null
    },

    async upsertSellerStripe(userKey, stripeAccountId) {
      const data = await readAll()
      const i = data.sellers.findIndex((s) => s.userKey === userKey)
      const row = {
        userKey,
        stripeAccountId,
        updatedAt: Date.now(),
        onboardingComplete: false,
      }
      if (i < 0) data.sellers.push(row)
      else data.sellers[i] = { ...data.sellers[i], ...row }
      await writeAll(data)
      return row
    },

    async setSellerOnboardingComplete(stripeAccountId) {
      const data = await readAll()
      const s = data.sellers.find((x) => x.stripeAccountId === stripeAccountId)
      if (!s) return null
      s.onboardingComplete = true
      s.updatedAt = Date.now()
      await writeAll(data)
      return s
    },

    async setSellerOnboardingByUserKey(userKey, complete) {
      const data = await readAll()
      const s = data.sellers.find((x) => x.userKey === userKey)
      if (!s) return null
      s.onboardingComplete = Boolean(complete)
      s.updatedAt = Date.now()
      await writeAll(data)
      return s
    },

    async listListingsBySeller(sellerKeyVal) {
      const { listings } = await readAll()
      if (!sellerKeyVal) return []
      return listings.filter((l) => listingOwnedBy(l, sellerKeyVal))
    },

    async appendListingOrder(order) {
      const data = await readAll()
      const row = { id: makeId('lo'), createdAt: Date.now(), ...order }
      data.listingOrders.unshift(row)
      await writeAll(data)
      return row
    },

    async findListingOrderByPaymentIntent(pid) {
      const data = await readAll()
      return data.listingOrders.find((o) => o.paymentIntentId === pid || o.stripePaymentIntentId === pid) ?? null
    },

    async getListingOrder(id) {
      const data = await readAll()
      return data.listingOrders.find((o) => o.id === id) ?? null
    },

    async patchListingOrder(id, patch) {
      const data = await readAll()
      const idx = data.listingOrders.findIndex((o) => o.id === id)
      if (idx < 0) return null
      data.listingOrders[idx] = { ...data.listingOrders[idx], ...patch }
      await writeAll(data)
      return data.listingOrders[idx]
    },

    async appendLedger(entry) {
      const data = await readAll()
      const row = { id: makeId('led'), createdAt: Date.now(), ...entry }
      data.ledger.unshift(row)
      await writeAll(data)
      return row
    },

    async ledgerForSeller(userKey, { from, to } = {}) {
      const data = await readAll()
      let rows = data.ledger.filter((e) => e.sellerKey === userKey)
      if (from) rows = rows.filter((e) => e.createdAt >= Number(from))
      if (to) rows = rows.filter((e) => e.createdAt <= Number(to))
      return rows
    },
  }
}

function listingOwnedBy(listing, sellerKeyVal) {
  if (!sellerKeyVal) return false
  if (listing.sellerUserId && sellerKeyVal === `uid:${listing.sellerUserId}`) return true
  if (listing.sellerEmail && sellerKeyVal === `em:${String(listing.sellerEmail).toLowerCase()}`) return true
  return false
}
