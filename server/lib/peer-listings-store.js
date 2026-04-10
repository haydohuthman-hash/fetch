import fs from 'node:fs/promises'
import path from 'node:path'

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {unknown} l
 */
export function normalizeListingRow(l) {
  if (!l || typeof l !== 'object') return /** @type {any} */ (l)
  const o = /** @type {Record<string, unknown>} */ (l)
  const saleMode = o.saleMode === 'auction' ? 'auction' : 'fixed'
  const ends = typeof o.auctionEndsAt === 'number' && Number.isFinite(o.auctionEndsAt) ? o.auctionEndsAt : null
  const profileAuthorId =
    typeof o.profileAuthorId === 'string' && o.profileAuthorId.trim()
      ? o.profileAuthorId.trim().slice(0, 128)
      : null
  const profileDisplayName =
    typeof o.profileDisplayName === 'string' && o.profileDisplayName.trim()
      ? o.profileDisplayName.trim().slice(0, 64)
      : null
  const profileAvatar =
    typeof o.profileAvatar === 'string' && o.profileAvatar.trim()
      ? o.profileAvatar.trim().slice(0, 120)
      : null
  return {
    ...o,
    profileAuthorId,
    profileDisplayName,
    profileAvatar,
    saleMode,
    auctionEndsAt: saleMode === 'auction' ? ends : null,
    reserveCents: saleMode === 'auction' ? Math.max(0, Math.round(Number(o.reserveCents) || 0)) : 0,
    minBidIncrementCents:
      saleMode === 'auction' ? Math.max(1, Math.round(Number(o.minBidIncrementCents) || 50)) : 50,
    auctionHighBidCents: Math.max(0, Math.round(Number(o.auctionHighBidCents) || 0)),
    auctionHighBidderKey: o.auctionHighBidderKey ? String(o.auctionHighBidderKey) : null,
    auctionClosed: Boolean(o.auctionClosed),
    bids: Array.isArray(o.bids) ? o.bids : [],
    sameDayDelivery: Boolean(o.sameDayDelivery),
  }
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
        listings: Array.isArray(p.listings) ? p.listings.map(normalizeListingRow) : [],
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

    async listListings({
      status = 'published',
      q,
      category,
      minPrice,
      maxPrice,
      profileAuthorId,
      cursor,
      limit = 24,
    }) {
      const { listings } = await readAll()
      let rows = listings.filter((l) => !status || l.status === status)
      if (profileAuthorId && typeof profileAuthorId === 'string' && profileAuthorId.trim()) {
        const pid = profileAuthorId.trim()
        rows = rows.filter((l) => String(l.profileAuthorId ?? '').trim() === pid)
      }
      if (q && typeof q === 'string' && q.trim()) {
        const raw = q.trim().toLowerCase()
        const tokens = raw.split(/\s+/).filter((t) => t.length > 0)
        rows = rows.filter((l) => {
          const hay = [
            l.title,
            l.description,
            l.keywords,
            l.sku,
            l.locationLabel,
            l.category,
            l.condition,
            l.compareAtCents != null && l.compareAtCents > 0
              ? `was ${(l.compareAtCents / 100).toFixed(0)} compare retail`
              : '',
          ]
            .map((x) => String(x ?? '').toLowerCase())
            .join(' \t ')
          if (hay.includes(raw)) return true
          return tokens.length > 0 && tokens.every((t) => hay.includes(t))
        })
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

    async createListing({
      sellerUserId,
      sellerEmail,
      title,
      description,
      priceAud,
      compareAtCents: compareAtCentsIn,
      category,
      condition,
      keywords,
      locationLabel,
      sku,
      acceptsOffers,
      fetchDelivery,
      sameDayDelivery,
      saleMode,
      auctionEndsAt,
      reserveCents: reserveIn,
      minBidIncrementCents: minIncIn,
      profileAuthorId,
      profileDisplayName,
      profileAvatar,
    }) {
      const data = await readAll()
      const skuTrim = String(sku || '').trim().slice(0, 64)
      const priceCents = Math.max(0, Math.round(Number(priceAud) * 100)) || 0
      let compareAtCents = 0
      if (compareAtCentsIn != null && Number.isFinite(Number(compareAtCentsIn))) {
        const c = Math.max(0, Math.round(Number(compareAtCentsIn)))
        if (c > 0) compareAtCents = c
      }
      if (priceCents === 0 || (compareAtCents > 0 && priceCents > 0 && compareAtCents <= priceCents)) {
        compareAtCents = 0
      }
      const mode = saleMode === 'auction' ? 'auction' : 'fixed'
      const endsRaw = Number(auctionEndsAt)
      const auctionEnds =
        mode === 'auction' && Number.isFinite(endsRaw) && endsRaw > Date.now() ? Math.round(endsRaw) : null
      let reserve = 0
      if (mode === 'auction') {
        const r = Number(reserveIn)
        reserve = Number.isFinite(r) && r >= 0 ? Math.round(r) : priceCents
      }
      const minInc =
        mode === 'auction' ? Math.max(50, Math.round(Number(minIncIn) || 100)) : 100
      const listing = {
        id: makeId('lst'),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sellerUserId: sellerUserId || null,
        sellerEmail: sellerEmail || null,
        title: String(title || '').slice(0, 200),
        description: String(description || '').slice(0, 8000),
        priceCents,
        compareAtCents,
        category: String(category || 'general').slice(0, 64),
        condition: String(condition || 'used').slice(0, 32),
        keywords: String(keywords || '').slice(0, 2000),
        locationLabel: String(locationLabel || '').slice(0, 200),
        sku: skuTrim || null,
        acceptsOffers: Boolean(acceptsOffers),
        fetchDelivery: Boolean(fetchDelivery),
        sameDayDelivery: Boolean(sameDayDelivery),
        status: 'draft',
        images: [],
        saleMode: mode,
        auctionEndsAt: auctionEnds,
        reserveCents: mode === 'auction' ? Math.max(0, reserve) : 0,
        minBidIncrementCents: minInc,
        auctionHighBidCents: 0,
        auctionHighBidderKey: null,
        auctionClosed: false,
        bids: [],
        profileAuthorId:
          profileAuthorId && String(profileAuthorId).trim()
            ? String(profileAuthorId).trim().slice(0, 128)
            : null,
        profileDisplayName:
          profileDisplayName && String(profileDisplayName).trim()
            ? String(profileDisplayName).trim().slice(0, 64)
            : null,
        profileAvatar:
          profileAvatar && String(profileAvatar).trim()
            ? String(profileAvatar).trim().slice(0, 120)
            : null,
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
      if (patch.compareAtCents !== undefined) {
        const c = Math.max(0, Math.round(Number(patch.compareAtCents)))
        next.compareAtCents = Number.isFinite(c) && c > 0 ? c : 0
      }
      if (patch.compareAtPriceAud !== undefined) {
        const c = Math.max(0, Math.round(Number(patch.compareAtPriceAud) * 100))
        next.compareAtCents = Number.isFinite(c) && c > 0 ? c : 0
      }
      if (patch.category != null) next.category = String(patch.category).slice(0, 64)
      if (patch.condition != null) next.condition = String(patch.condition).slice(0, 32)
      if (patch.keywords != null) next.keywords = String(patch.keywords).slice(0, 2000)
      if (patch.locationLabel != null) next.locationLabel = String(patch.locationLabel).slice(0, 200)
      if (patch.sku !== undefined) {
        const s = String(patch.sku ?? '').trim().slice(0, 64)
        next.sku = s || null
      }
      if (patch.acceptsOffers != null) next.acceptsOffers = Boolean(patch.acceptsOffers)
      if (patch.fetchDelivery != null) next.fetchDelivery = Boolean(patch.fetchDelivery)
      if (patch.sameDayDelivery != null) next.sameDayDelivery = Boolean(patch.sameDayDelivery)
      if (patch.saleMode === 'auction' || patch.saleMode === 'fixed') next.saleMode = patch.saleMode
      if (patch.auctionEndsAt !== undefined) {
        const t = Number(patch.auctionEndsAt)
        next.auctionEndsAt =
          next.saleMode === 'auction' && Number.isFinite(t) && t > Date.now() ? Math.round(t) : null
      }
      if (patch.reserveCents !== undefined && next.saleMode === 'auction') {
        next.reserveCents = Math.max(0, Math.round(Number(patch.reserveCents) || 0))
      }
      if (patch.minBidIncrementCents !== undefined && next.saleMode === 'auction') {
        next.minBidIncrementCents = Math.max(1, Math.round(Number(patch.minBidIncrementCents) || 50))
      }
      if (patch.profileAuthorId !== undefined) {
        const s = String(patch.profileAuthorId ?? '').trim().slice(0, 128)
        next.profileAuthorId = s || null
      }
      if (patch.profileDisplayName !== undefined) {
        const s = String(patch.profileDisplayName ?? '').trim().slice(0, 64)
        next.profileDisplayName = s || null
      }
      if (patch.profileAvatar !== undefined) {
        const s = String(patch.profileAvatar ?? '').trim().slice(0, 120)
        next.profileAvatar = s || null
      }
      const pc = next.priceCents ?? 0
      const cc = next.compareAtCents ?? 0
      if (pc === 0 || (cc > 0 && pc > 0 && cc <= pc)) next.compareAtCents = 0
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

    /**
     * @param {{ listingId: string, bidderKey: string, amountCents: number, stripePaymentIntentId?: string | null }} p
     */
    async placeBid(p) {
      const data = await readAll()
      const idx = data.listings.findIndex((l) => l.id === p.listingId)
      if (idx < 0) return { error: 'listing_not_found' }
      const l = normalizeListingRow(data.listings[idx])
      if (l.status !== 'published') return { error: 'listing_not_available' }
      if (l.saleMode !== 'auction') return { error: 'not_auction' }
      if (l.auctionClosed) return { error: 'auction_closed' }
      const now = Date.now()
      if (l.auctionEndsAt && now > l.auctionEndsAt) return { error: 'auction_ended' }
      const sk = sellerKey(l.sellerUserId, l.sellerEmail)
      if (sk && sk === p.bidderKey) return { error: 'cannot_bid_own_listing' }
      const reserve = l.reserveCents || 0
      const high = l.auctionHighBidCents || 0
      const inc = l.minBidIncrementCents || 50
      const amount = Math.round(Number(p.amountCents))
      if (!Number.isFinite(amount) || amount < 1) return { error: 'invalid_amount' }
      if (high === 0) {
        if (amount < reserve) return { error: 'below_reserve' }
      } else if (amount < high + inc) {
        return { error: 'bid_too_low' }
      }
      const bids = Array.isArray(l.bids) ? [...l.bids] : []
      bids.unshift({
        bidderKey: p.bidderKey,
        amountCents: amount,
        createdAt: now,
        stripePaymentIntentId: p.stripePaymentIntentId || null,
        status: p.stripePaymentIntentId ? 'authorized' : 'simulated',
      })
      const next = {
        ...l,
        auctionHighBidCents: amount,
        auctionHighBidderKey: p.bidderKey,
        bids,
        updatedAt: now,
      }
      data.listings[idx] = next
      await writeAll(data)
      return { listing: next }
    },

    async closeExpiredAuctions() {
      const data = await readAll()
      const now = Date.now()
      let changed = false
      for (let i = 0; i < data.listings.length; i++) {
        const l = normalizeListingRow(data.listings[i])
        if (l.saleMode !== 'auction' || l.auctionClosed) continue
        if (l.auctionEndsAt && now > l.auctionEndsAt) {
          data.listings[i] = { ...l, auctionClosed: true, updatedAt: now }
          changed = true
        }
      }
      if (changed) await writeAll(data)
    },
  }
}

function listingOwnedBy(listing, sellerKeyVal) {
  if (!sellerKeyVal) return false
  if (listing.sellerUserId && sellerKeyVal === `uid:${listing.sellerUserId}`) return true
  if (listing.sellerEmail && sellerKeyVal === `em:${String(listing.sellerEmail).toLowerCase()}`) return true
  return false
}
