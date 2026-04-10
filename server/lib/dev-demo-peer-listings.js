/**
 * Non-production: synthetic peer listings for the local demo account so Buy & Sell
 * "My listings" shows editable drafts without seeding the JSON store manually.
 */

import { normalizeEmail } from './fetch-marketplace-auth.js'

const DEFAULT_EMAIL = 'demo@fetch.local'

/** @type {Map<string, Record<string, unknown>>} */
const demoPatches = new Map()

export function devDemoPeerListingsEnabled() {
  return process.env.NODE_ENV !== 'production'
}

export function devDemoUserEmail() {
  const raw = (process.env.FETCH_DEV_DEMO_USER_EMAIL || DEFAULT_EMAIL).trim()
  return normalizeEmail(raw) || normalizeEmail(DEFAULT_EMAIL)
}

/**
 * @param {{ customerEmail?: string | null, customerUserId?: string | null }} actor
 */
export function isDevDemoMarketplaceActor(actor) {
  if (!devDemoPeerListingsEnabled()) return false
  const em = normalizeEmail(actor?.customerEmail || '')
  return Boolean(em) && em === devDemoUserEmail()
}

/**
 * @param {{ customerEmail?: string | null, customerUserId?: string | null }} actor
 */
function profileAuthorForActor(actor) {
  const uid = typeof actor.customerUserId === 'string' ? actor.customerUserId.trim() : ''
  if (uid) return uid
  const em = normalizeEmail(actor.customerEmail || '')
  return em ? `acct_${em.replace(/[^a-z0-9]+/g, '_')}` : 'acct_demo_fetch_local'
}

/**
 * @param {{ customerEmail?: string | null, customerUserId?: string | null }} actor
 */
function displayNameForActor(actor) {
  const em = normalizeEmail(actor.customerEmail || '')
  if (!em) return 'DemoSeller'
  const local = em.split('@')[0] || 'seller'
  return local.charAt(0).toUpperCase() + local.slice(1)
}

/**
 * @param {{ customerEmail?: string | null, customerUserId?: string | null }} actor
 * @returns {Record<string, unknown>[]}
 */
export function buildDevDemoPeerListings(actor) {
  const email = normalizeEmail(actor.customerEmail || '')
  const sellerUserId = typeof actor.customerUserId === 'string' ? actor.customerUserId.trim() : null
  const profileAuthorId = profileAuthorForActor(actor)
  const profileDisplayName = displayNameForActor(actor)
  const now = Date.now()

  const bases = [
    {
      id: 'demo_lst_ringlight',
      createdAt: now - 86400000 * 3,
      updatedAt: now - 3600000,
      sellerUserId,
      sellerEmail: email,
      title: 'LED ring light 18" — desk setup',
      description:
        'Demo listing for local dev. USB-powered, dimmable. Minor scuff on base. Pickup Brisbane inner north.',
      priceCents: 8900,
      compareAtCents: 14900,
      category: 'electronics',
      condition: 'good',
      keywords: 'ring light, streaming, desk, usb, led',
      locationLabel: 'Brisbane QLD (demo)',
      sku: 'DEMO-RING-01',
      acceptsOffers: true,
      fetchDelivery: false,
      status: 'draft',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80',
          sort: 0,
        },
      ],
      saleMode: 'fixed',
      auctionEndsAt: null,
      reserveCents: 0,
      minBidIncrementCents: 50,
      auctionHighBidCents: 0,
      auctionHighBidderKey: null,
      auctionClosed: false,
      bids: [],
      profileAuthorId,
      profileDisplayName,
      profileAvatar: '',
    },
    {
      id: 'demo_lst_planter',
      createdAt: now - 86400000 * 2,
      updatedAt: now - 7200000,
      sellerUserId,
      sellerEmail: email,
      title: 'Ceramic planter trio — indoor herbs',
      description:
        'Three matching ceramic pots with drip trays. Demo marketplace item linked from Drops sample videos.',
      priceCents: 4500,
      compareAtCents: 0,
      category: 'general',
      condition: 'like new',
      keywords: 'planter, ceramic, indoor, herbs, pots',
      locationLabel: 'Brisbane QLD (demo)',
      sku: 'DEMO-PLNT-02',
      acceptsOffers: false,
      fetchDelivery: true,
      status: 'draft',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=800&q=80',
          sort: 0,
        },
      ],
      saleMode: 'fixed',
      auctionEndsAt: null,
      reserveCents: 0,
      minBidIncrementCents: 50,
      auctionHighBidCents: 0,
      auctionHighBidderKey: null,
      auctionClosed: false,
      bids: [],
      profileAuthorId,
      profileDisplayName,
      profileAvatar: '',
    },
  ]

  return bases.map((row) => {
    const patch = demoPatches.get(row.id)
    return patch ? { ...row, ...patch, id: row.id } : row
  })
}

/**
 * @param {{ customerEmail?: string | null, customerUserId?: string | null }} actor
 * @param {string} id
 */
export function getDevDemoPeerListing(actor, id) {
  if (!isDevDemoMarketplaceActor(actor)) return null
  return buildDevDemoPeerListings(actor).find((l) => l.id === id) ?? null
}

/**
 * @param {string} id
 */
export function isDevDemoListingId(id) {
  return typeof id === 'string' && id.startsWith('demo_lst_')
}

/**
 * @param {{ customerEmail?: string | null, customerUserId?: string | null }} actor
 * @param {string} id
 * @param {Record<string, unknown>} body
 */
export function patchDevDemoPeerListing(actor, id, body) {
  if (!isDevDemoMarketplaceActor(actor) || !isDevDemoListingId(id)) return null
  const base = buildDevDemoPeerListings(actor).find((l) => l.id === id)
  if (!base) return null
  const prev = demoPatches.get(id) ?? {}
  const next = { ...prev, updatedAt: Date.now() }
  const fields = [
    'title',
    'description',
    'category',
    'condition',
    'keywords',
    'locationLabel',
    'sku',
    'acceptsOffers',
    'fetchDelivery',
    'profileAuthorId',
    'profileDisplayName',
    'profileAvatar',
    'status',
  ]
  for (const k of fields) {
    if (body[k] !== undefined) next[k] = body[k]
  }
  if (body.priceAud != null) {
    const c = Math.max(0, Math.round(Number(body.priceAud) * 100))
    if (Number.isFinite(c)) next.priceCents = c
  }
  if (body.compareAtPriceAud !== undefined) {
    const c = Math.max(0, Math.round(Number(body.compareAtPriceAud) * 100))
    next.compareAtCents = Number.isFinite(c) && c > 0 ? c : 0
  }
  if (body.compareAtCents !== undefined) {
    const c = Math.max(0, Math.round(Number(body.compareAtCents)))
    next.compareAtCents = Number.isFinite(c) && c > 0 ? c : 0
  }
  demoPatches.set(id, next)
  return buildDevDemoPeerListings(actor).find((l) => l.id === id) ?? null
}

export function resetDevDemoPeerPatches() {
  demoPatches.clear()
}
