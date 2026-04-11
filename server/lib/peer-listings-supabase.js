/**
 * Durable marketplace peer store backed by Supabase (service role).
 * API-compatible with createPeerListingsStore() from peer-listings-store.js.
 */
import { normalizeInitialListingImages, normalizeListingRow } from './peer-listings-store.js'

const T_LISTINGS = 'marketplace_peer_listings'
const T_SELLERS = 'marketplace_peer_sellers'
const T_ORDERS = 'marketplace_listing_orders'
const T_LEDGER = 'marketplace_peer_ledger'

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function logSb(op, table, err) {
  if (!err) return
  console.error('[peer-listings-db]', op, table, {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
  })
}

function toUuidOrNull(s) {
  if (!s || typeof s !== 'string') return null
  const t = s.trim()
  const re =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return re.test(t) ? t : null
}

/** @param {Record<string, unknown>} row */
function mapListingFromDb(row) {
  if (!row) return null
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now()
  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : createdAt
  const auctionEnds = row.auction_ends_at != null ? Number(row.auction_ends_at) : null
  return normalizeListingRow({
    id: row.id,
    sellerUserId: row.user_id || null,
    sellerEmail: row.seller_email || null,
    title: row.title,
    description: row.description || '',
    priceCents: row.price_cents ?? 0,
    compareAtCents: row.compare_at_cents ?? 0,
    category: row.category,
    condition: row.condition,
    keywords: row.keywords || '',
    locationLabel: row.location_label || '',
    sku: row.sku,
    acceptsOffers: row.accepts_offers,
    fetchDelivery: row.fetch_delivery,
    sameDayDelivery: row.same_day_delivery,
    status: row.status,
    images: Array.isArray(row.images) ? row.images : [],
    saleMode: row.sale_mode,
    auctionEndsAt: Number.isFinite(auctionEnds) ? auctionEnds : null,
    reserveCents: row.reserve_cents ?? 0,
    minBidIncrementCents: row.min_bid_increment_cents ?? 100,
    auctionHighBidCents: row.auction_high_bid_cents ?? 0,
    auctionHighBidderKey: row.auction_high_bidder_key,
    auctionClosed: row.auction_closed,
    bids: Array.isArray(row.bids) ? row.bids : [],
    profileAuthorId: row.profile_author_id,
    profileDisplayName: row.profile_display_name,
    profileAvatar: row.profile_avatar,
    createdAt,
    updatedAt,
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function createPeerListingsSupabaseStore(supabase) {
  function sellerKey(userId, email) {
    if (userId && typeof userId === 'string') return `uid:${userId.trim()}`
    if (email && typeof email === 'string') return `em:${email.trim().toLowerCase()}`
    return null
  }

  function listingOwnedBy(listing, sellerKeyVal) {
    if (!sellerKeyVal) return false
    if (listing.sellerUserId && sellerKeyVal === `uid:${listing.sellerUserId}`) return true
    if (listing.sellerEmail && sellerKeyVal === `em:${String(listing.sellerEmail).toLowerCase()}`) return true
    return false
  }

  /** @param {Record<string, unknown>} row */
  function mapSellerFromDb(row) {
    if (!row) return null
    return {
      userKey: row.user_key,
      stripeAccountId: row.stripe_account_id,
      onboardingComplete: Boolean(row.onboarding_complete),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    }
  }

  /** @param {Record<string, unknown>} row */
  function mapOrderFromDb(row) {
    if (!row) return null
    return {
      id: row.id,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      listingId: row.listing_id,
      sellerKey: row.seller_key,
      buyerUserId: row.buyer_user_id,
      buyerEmail: row.buyer_email,
      priceCents: row.price_cents,
      platformFeeCents: row.platform_fee_cents,
      sellerNetCents: row.seller_net_cents,
      status: row.status,
      paymentIntentId: row.payment_intent_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      lastError: row.last_error,
      webhookConfirmedAt: row.webhook_confirmed_at
        ? new Date(row.webhook_confirmed_at).getTime()
        : null,
    }
  }

  /** @param {Record<string, unknown>} row */
  function mapLedgerFromDb(row) {
    if (!row) return null
    return {
      id: row.id,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      sellerKey: row.seller_key,
      type: row.type,
      listingOrderId: row.listing_order_id,
      listingId: row.listing_id,
      grossCents: row.gross_cents,
      feeCents: row.fee_cents,
      netCents: row.net_cents,
      currency: row.currency,
      stripeChargeId: row.stripe_charge_id,
    }
  }

  /** @param {any} listing normalized API listing */
  function listingToDbInsert(listing) {
    const loc = String(listing.locationLabel || '').slice(0, 200)
    return {
      id: listing.id,
      user_id: toUuidOrNull(String(listing.sellerUserId || '')),
      seller_email: listing.sellerEmail ? String(listing.sellerEmail).toLowerCase().slice(0, 320) : null,
      title: listing.title,
      description: listing.description,
      price_cents: listing.priceCents ?? 0,
      compare_at_cents: listing.compareAtCents ?? 0,
      category: listing.category,
      condition: listing.condition,
      keywords: listing.keywords || '',
      suburb: loc || null,
      location_label: loc,
      images: listing.images || [],
      status: listing.status,
      sku: listing.sku || null,
      accepts_offers: Boolean(listing.acceptsOffers),
      fetch_delivery: Boolean(listing.fetchDelivery),
      same_day_delivery: Boolean(listing.sameDayDelivery),
      profile_author_id: listing.profileAuthorId || null,
      profile_display_name: listing.profileDisplayName || null,
      profile_avatar: listing.profileAvatar || null,
      sale_mode: listing.saleMode === 'auction' ? 'auction' : 'fixed',
      auction_ends_at: listing.auctionEndsAt != null ? Math.round(Number(listing.auctionEndsAt)) : null,
      reserve_cents: listing.reserveCents ?? 0,
      min_bid_increment_cents: listing.minBidIncrementCents ?? 100,
      auction_high_bid_cents: listing.auctionHighBidCents ?? 0,
      auction_high_bidder_key: listing.auctionHighBidderKey || null,
      auction_closed: Boolean(listing.auctionClosed),
      bids: listing.bids || [],
    }
  }

  /** Partial update (no id). Trigger sets updated_at. */
  function listingToDbUpdate(listing) {
    const row = listingToDbInsert({ ...listing, id: 'x' })
    delete row.id
    return row
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
      let query = supabase.from(T_LISTINGS).select('*')
      if (status) query = query.eq('status', status)
      if (profileAuthorId && typeof profileAuthorId === 'string' && profileAuthorId.trim()) {
        query = query.eq('profile_author_id', profileAuthorId.trim())
      }
      if (category && typeof category === 'string') {
        query = query.eq('category', category)
      }
      const minN = minPrice != null ? Number(minPrice) : NaN
      if (Number.isFinite(minN)) query = query.gte('price_cents', Math.round(minN * 100))
      const maxN = maxPrice != null ? Number(maxPrice) : NaN
      if (Number.isFinite(maxN)) query = query.lte('price_cents', Math.round(maxN * 100))

      query = query.order('updated_at', { ascending: false }).limit(900)
      const { data, error } = await query
      logSb('select', T_LISTINGS, error)
      if (error) throw new Error(`supabase_listings_list:${error.message}`)
      let rows = (data || []).map((r) => mapListingFromDb(r)).filter(Boolean)

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
      const { data, error } = await supabase.from(T_LISTINGS).select('*').eq('id', id).maybeSingle()
      logSb('get', T_LISTINGS, error)
      if (error) throw new Error(`supabase_listing_get:${error.message}`)
      return mapListingFromDb(data)
    },

    async getListingVisible(id, viewerSellerKey) {
      const l = await this.getListing(id)
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
      images: imagesIn,
    }) {
      const skuTrim = String(sku || '').trim().slice(0, 64)
      const priceNum = Number(priceAud)
      const priceCents =
        Number.isFinite(priceNum) && priceNum >= 0 ? Math.max(0, Math.round(priceNum * 100)) : 0
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
      if (mode === 'auction' && !auctionEnds) {
        const err = new Error('auction_end_required')
        err.code = 'auction_end_required'
        throw err
      }
      let reserve = 0
      if (mode === 'auction') {
        const r = Number(reserveIn)
        reserve = Number.isFinite(r) && r >= 0 ? Math.round(r) : priceCents
      }
      const minInc = mode === 'auction' ? Math.max(50, Math.round(Number(minIncIn) || 100)) : 100
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
        images: normalizeInitialListingImages(imagesIn),
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
      const row = listingToDbInsert(listing)
      const { data, error } = await supabase.from(T_LISTINGS).insert(row).select('*').single()
      logSb('insert', T_LISTINGS, error)
      if (error) throw new Error(`supabase_listing_create:${error.message}`)
      return mapListingFromDb(data)
    },

    async patchListing(id, sellerKeyVal, patch) {
      const l = await this.getListing(id)
      if (!l) return null
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

      const upd = listingToDbUpdate(next)
      const { data, error } = await supabase.from(T_LISTINGS).update(upd).eq('id', id).select('*').single()
      logSb('update', T_LISTINGS, error)
      if (error) throw new Error(`supabase_listing_patch:${error.message}`)
      return { listing: mapListingFromDb(data) }
    },

    async setListingStatus(id, sellerKeyVal, status) {
      const l = await this.getListing(id)
      if (!l) return null
      if (!listingOwnedBy(l, sellerKeyVal)) return { error: 'forbidden' }
      const { data, error } = await supabase.from(T_LISTINGS).update({ status }).eq('id', id).select('*').single()
      logSb('update_status', T_LISTINGS, error)
      if (error) throw new Error(`supabase_listing_status:${error.message}`)
      return { listing: mapListingFromDb(data) }
    },

    async addListingImage(id, sellerKeyVal, { url, sort }) {
      const l = await this.getListing(id)
      if (!l) return null
      if (!listingOwnedBy(l, sellerKeyVal)) return { error: 'forbidden' }
      const images = Array.isArray(l.images) ? [...l.images] : []
      if (images.length >= 12) return { error: 'too_many_images' }
      images.push({ url: String(url).slice(0, 2048), sort: sort ?? images.length })
      const upd = listingToDbUpdate({ ...l, images, updatedAt: Date.now() })
      const { data, error } = await supabase.from(T_LISTINGS).update(upd).eq('id', id).select('*').single()
      logSb('update_images', T_LISTINGS, error)
      if (error) throw new Error(`supabase_listing_image:${error.message}`)
      return { listing: mapListingFromDb(data) }
    },

    async markListingSold(listingId) {
      const { data: cur, error: e0 } = await supabase.from(T_LISTINGS).select('id').eq('id', listingId).maybeSingle()
      logSb('select', T_LISTINGS, e0)
      if (e0 || !cur) return false
      const { error } = await supabase.from(T_LISTINGS).update({ status: 'sold' }).eq('id', listingId)
      logSb('mark_sold', T_LISTINGS, error)
      if (error) throw new Error(`supabase_listing_sold:${error.message}`)
      return true
    },

    async getSeller(userKey) {
      const { data, error } = await supabase.from(T_SELLERS).select('*').eq('user_key', userKey).maybeSingle()
      logSb('get', T_SELLERS, error)
      if (error) throw new Error(`supabase_seller_get:${error.message}`)
      return mapSellerFromDb(data)
    },

    async upsertSellerStripe(userKey, stripeAccountId) {
      const row = {
        user_key: userKey,
        stripe_account_id: stripeAccountId,
        updated_at: new Date().toISOString(),
        onboarding_complete: false,
      }
      const { data, error } = await supabase.from(T_SELLERS).upsert(row, { onConflict: 'user_key' }).select('*').single()
      logSb('upsert', T_SELLERS, error)
      if (error) throw new Error(`supabase_seller_upsert:${error.message}`)
      return mapSellerFromDb(data)
    },

    async setSellerOnboardingComplete(stripeAccountId) {
      const { data: rows, error: e1 } = await supabase
        .from(T_SELLERS)
        .select('*')
        .eq('stripe_account_id', stripeAccountId)
        .limit(1)
      logSb('select', T_SELLERS, e1)
      if (e1) throw new Error(`supabase_seller_find:${e1.message}`)
      const s = rows?.[0]
      if (!s) return null
      const { data, error } = await supabase
        .from(T_SELLERS)
        .update({ onboarding_complete: true, updated_at: new Date().toISOString() })
        .eq('user_key', s.user_key)
        .select('*')
        .single()
      logSb('update', T_SELLERS, error)
      if (error) throw new Error(`supabase_seller_onboarding:${error.message}`)
      return mapSellerFromDb(data)
    },

    async setSellerOnboardingByUserKey(userKey, complete) {
      const { data, error } = await supabase
        .from(T_SELLERS)
        .update({
          onboarding_complete: Boolean(complete),
          updated_at: new Date().toISOString(),
        })
        .eq('user_key', userKey)
        .select('*')
        .maybeSingle()
      logSb('update', T_SELLERS, error)
      if (error) throw new Error(`supabase_seller_onboarding_key:${error.message}`)
      return mapSellerFromDb(data)
    },

    async listListingsBySeller(sellerKeyVal) {
      if (!sellerKeyVal) return []
      let q = supabase.from(T_LISTINGS).select('*').order('updated_at', { ascending: false })
      if (sellerKeyVal.startsWith('uid:')) {
        const uid = toUuidOrNull(sellerKeyVal.slice(4))
        if (!uid) return []
        q = q.eq('user_id', uid)
      } else if (sellerKeyVal.startsWith('em:')) {
        const em = sellerKeyVal.slice(3).trim().toLowerCase()
        q = q.eq('seller_email', em)
      } else return []
      const { data, error } = await q
      logSb('list_mine', T_LISTINGS, error)
      if (error) throw new Error(`supabase_listings_mine:${error.message}`)
      return (data || []).map((r) => mapListingFromDb(r)).filter(Boolean)
    },

    async appendListingOrder(order) {
      const id = makeId('lo')
      const row = {
        id,
        listing_id: order.listingId,
        seller_key: order.sellerKey,
        buyer_user_id: order.buyerUserId ?? null,
        buyer_email: order.buyerEmail ?? null,
        price_cents: order.priceCents,
        platform_fee_cents: order.platformFeeCents ?? 0,
        seller_net_cents: order.sellerNetCents ?? 0,
        status: order.status,
        payment_intent_id: order.paymentIntentId ?? null,
        stripe_payment_intent_id: order.stripePaymentIntentId ?? null,
      }
      const { data, error } = await supabase.from(T_ORDERS).insert(row).select('*').single()
      logSb('insert', T_ORDERS, error)
      if (error) throw new Error(`supabase_order_create:${error.message}`)
      return mapOrderFromDb(data)
    },

    async findListingOrderByPaymentIntent(pid) {
      if (!pid || typeof pid !== 'string') return null
      const safe = pid.replace(/[(),]/g, '')
      const { data, error } = await supabase
        .from(T_ORDERS)
        .select('*')
        .or(`payment_intent_id.eq.${safe},stripe_payment_intent_id.eq.${safe}`)
        .maybeSingle()
      logSb('find_order_pi', T_ORDERS, error)
      if (error) throw new Error(`supabase_order_find_pi:${error.message}`)
      return mapOrderFromDb(data)
    },

    async getListingOrder(id) {
      const { data, error } = await supabase.from(T_ORDERS).select('*').eq('id', id).maybeSingle()
      logSb('get_order', T_ORDERS, error)
      if (error) throw new Error(`supabase_order_get:${error.message}`)
      return mapOrderFromDb(data)
    },

    async patchListingOrder(id, patch) {
      const dbPatch = {}
      if (patch.status != null) dbPatch.status = patch.status
      if (patch.paymentIntentId !== undefined) dbPatch.payment_intent_id = patch.paymentIntentId
      if (patch.stripePaymentIntentId !== undefined) dbPatch.stripe_payment_intent_id = patch.stripePaymentIntentId
      if (patch.lastError !== undefined) dbPatch.last_error = patch.lastError
      if (patch.webhookConfirmedAt !== undefined) {
        dbPatch.webhook_confirmed_at =
          patch.webhookConfirmedAt != null ? new Date(Number(patch.webhookConfirmedAt)).toISOString() : null
      }
      const { data, error } = await supabase.from(T_ORDERS).update(dbPatch).eq('id', id).select('*').single()
      logSb('patch_order', T_ORDERS, error)
      if (error) throw new Error(`supabase_order_patch:${error.message}`)
      return mapOrderFromDb(data)
    },

    async appendLedger(entry) {
      const id = makeId('led')
      const row = {
        id,
        seller_key: entry.sellerKey,
        type: entry.type,
        listing_order_id: entry.listingOrderId ?? null,
        listing_id: entry.listingId ?? null,
        gross_cents: entry.grossCents ?? 0,
        fee_cents: entry.feeCents ?? 0,
        net_cents: entry.netCents ?? 0,
        currency: entry.currency || 'aud',
        stripe_charge_id: entry.stripeChargeId || '',
      }
      const { data, error } = await supabase.from(T_LEDGER).insert(row).select('*').single()
      logSb('insert', T_LEDGER, error)
      if (error) throw new Error(`supabase_ledger_append:${error.message}`)
      return mapLedgerFromDb(data)
    },

    async ledgerForSeller(userKey, { from, to } = {}) {
      let q = supabase.from(T_LEDGER).select('*').eq('seller_key', userKey).order('created_at', { ascending: false })
      if (from != null && Number.isFinite(Number(from))) {
        q = q.gte('created_at', new Date(Number(from)).toISOString())
      }
      if (to != null && Number.isFinite(Number(to))) {
        q = q.lte('created_at', new Date(Number(to)).toISOString())
      }
      const { data, error } = await q
      logSb('ledger', T_LEDGER, error)
      if (error) throw new Error(`supabase_ledger_list:${error.message}`)
      return (data || []).map((r) => mapLedgerFromDb(r)).filter(Boolean)
    },

    async placeBid(p) {
      const l = await this.getListing(p.listingId)
      if (!l) return { error: 'listing_not_found' }
      const row = normalizeListingRow(l)
      if (row.status !== 'published') return { error: 'listing_not_available' }
      if (row.saleMode !== 'auction') return { error: 'not_auction' }
      if (row.auctionClosed) return { error: 'auction_closed' }
      const now = Date.now()
      if (row.auctionEndsAt && now > row.auctionEndsAt) return { error: 'auction_ended' }
      const sk = sellerKey(row.sellerUserId, row.sellerEmail)
      if (sk && sk === p.bidderKey) return { error: 'cannot_bid_own_listing' }
      const reserve = row.reserveCents || 0
      const high = row.auctionHighBidCents || 0
      const inc = row.minBidIncrementCents || 50
      const amount = Math.round(Number(p.amountCents))
      if (!Number.isFinite(amount) || amount < 1) return { error: 'invalid_amount' }
      if (high === 0) {
        if (amount < reserve) return { error: 'below_reserve' }
      } else if (amount < high + inc) {
        return { error: 'bid_too_low' }
      }
      const bids = Array.isArray(row.bids) ? [...row.bids] : []
      bids.unshift({
        bidderKey: p.bidderKey,
        amountCents: amount,
        createdAt: now,
        stripePaymentIntentId: p.stripePaymentIntentId || null,
        status: p.stripePaymentIntentId ? 'authorized' : 'simulated',
      })
      const next = {
        ...row,
        auctionHighBidCents: amount,
        auctionHighBidderKey: p.bidderKey,
        bids,
        updatedAt: now,
      }
      const upd = listingToDbUpdate(next)
      const { data, error } = await supabase.from(T_LISTINGS).update(upd).eq('id', p.listingId).select('*').single()
      logSb('place_bid', T_LISTINGS, error)
      if (error) throw new Error(`supabase_place_bid:${error.message}`)
      return { listing: mapListingFromDb(data) }
    },

    /** Seller resets unsold ended auction with a new timer (same listing id). */
    async repostExpiredAuctionListing(id, sellerKeyVal, opts = {}) {
      const l = await this.getListing(id)
      if (!l) return { error: 'listing_not_found' }
      const row = normalizeListingRow(l)
      if (!listingOwnedBy(row, sellerKeyVal)) return { error: 'forbidden' }
      if (row.saleMode !== 'auction') return { error: 'not_auction' }
      if (row.status !== 'published') return { error: 'bad_status' }
      const now = Date.now()
      const timeEnded = Boolean((row.auctionEndsAt && now > row.auctionEndsAt) || row.auctionClosed)
      if (!timeEnded) return { error: 'auction_not_ended' }
      const reserve = Math.max(0, row.reserveCents || row.priceCents || 0)
      const high = Math.max(0, row.auctionHighBidCents || 0)
      const unsold = reserve <= 0 ? high === 0 : high < reserve
      if (!unsold) return { error: 'reserve_met' }
      const endsRaw = Number(opts.auctionEndsAt)
      if (!Number.isFinite(endsRaw) || endsRaw <= now + 60_000) return { error: 'invalid_end' }
      let priceCents = row.priceCents
      if (opts.priceAud != null) {
        const p = Math.round(Number(opts.priceAud) * 100)
        if (Number.isFinite(p) && p >= 0) priceCents = p
      }
      let minInc = row.minBidIncrementCents || 100
      if (opts.minBidIncrementCents != null) {
        const m = Math.round(Number(opts.minBidIncrementCents))
        if (Number.isFinite(m) && m >= 50) minInc = m
      }
      const nextReserve = Math.max(0, priceCents)
      const next = {
        ...row,
        priceCents,
        reserveCents: nextReserve,
        minBidIncrementCents: minInc,
        auctionClosed: false,
        auctionEndsAt: Math.round(endsRaw),
        bids: [],
        auctionHighBidCents: 0,
        auctionHighBidderKey: null,
        updatedAt: now,
      }
      const upd = listingToDbUpdate(next)
      const { data, error } = await supabase.from(T_LISTINGS).update(upd).eq('id', id).select('*').single()
      logSb('repost_auction', T_LISTINGS, error)
      if (error) throw new Error(`supabase_repost_auction:${error.message}`)
      return { listing: mapListingFromDb(data) }
    },

    async closeExpiredAuctions() {
      const now = Date.now()
      const { data: ids, error: e1 } = await supabase
        .from(T_LISTINGS)
        .select('id')
        .eq('sale_mode', 'auction')
        .eq('auction_closed', false)
        .not('auction_ends_at', 'is', null)
        .lt('auction_ends_at', now)
      logSb('close_auction_select', T_LISTINGS, e1)
      if (e1) {
        console.error('[peer-listings-db] closeExpiredAuctions select failed', e1.message)
        return
      }
      const idList = (ids || []).map((r) => r.id).filter(Boolean)
      if (!idList.length) return
      const { error: e2 } = await supabase.from(T_LISTINGS).update({ auction_closed: true }).in('id', idList)
      logSb('close_auction_batch', T_LISTINGS, e2)
      if (e2) console.error('[peer-listings-db] closeExpiredAuctions batch update', e2.message)
    },
  }
}
