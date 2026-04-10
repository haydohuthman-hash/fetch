/**
 * Published demo peer listings + seller personas for local / showcase feeds.
 * Merged into GET /api/listings (prepended, deduped by id) so marketplace + Drops always have furniture samples.
 */

const PREFIX = 'demo_pub_lst_'

/** @type {Record<string, Record<string, unknown>>} */
const BY_ID = {}

function row(listing) {
  BY_ID[listing.id] = listing
  return listing
}

function buildAll() {
  const now = Date.now()
  const mk = (
    idSuffix,
    profileAuthorId,
    profileDisplayName,
    profileAvatar,
    title,
    description,
    priceCents,
    compareAtCents,
    imageUrl,
    keywords,
  ) =>
    row({
      id: `${PREFIX}${idSuffix}`,
      createdAt: now - 86400000 * 4,
      updatedAt: now - 3600000,
      sellerUserId: null,
      sellerEmail: null,
      profileAuthorId,
      profileDisplayName,
      profileAvatar,
      title,
      description,
      priceCents,
      compareAtCents,
      category: 'furniture',
      condition: 'good',
      keywords,
      locationLabel: 'Brisbane · demo',
      sku: `DEMO-FURN-${idSuffix}`,
      acceptsOffers: true,
      fetchDelivery: true,
      sameDayDelivery: true,
      status: 'published',
      images: [{ url: imageUrl, sort: 0 }],
      saleMode: 'fixed',
      auctionEndsAt: null,
      reserveCents: 0,
      minBidIncrementCents: 50,
      auctionHighBidCents: 0,
      auctionHighBidderKey: null,
      auctionClosed: false,
      bids: [],
    })

  // 5 demo seller personas; 6 listings (ArbourHomes has two)
  const p1 = 'demo_prof_arbour_homes'
  const p2 = 'demo_prof_hedge_studio'
  const p3 = 'demo_prof_loft_lane'
  const p4 = 'demo_prof_coast_line'
  const p5 = 'demo_prof_studio_north'

  return [
    mk(
      '1',
      p1,
      'ArbourHomes',
      '🪑',
      'Mid-century oak sideboard — 180cm',
      'Demo listing. Solid oak, soft-close drawers, light wear on corners. Same-day Fetch delivery promo.',
      42000,
      58900,
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=82',
      'sideboard, oak, mid century, storage, dining, furniture',
    ),
    mk(
      '2',
      p1,
      'ArbourHomes',
      '🪑',
      'Velvet 3-seat sofa — forest green',
      'Demo listing. Deep seat, removable cushions. Pet-free home. Same-day delivery available.',
      89000,
      129000,
      'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=82',
      'sofa, velvet, lounge, green, three seater, furniture',
    ),
    mk(
      '3',
      p2,
      'HedgeStudio',
      '🛋️',
      'Round oak dining table — seats 6',
      'Demo listing. Pedestal base, seats six comfortably. Light surface marks.',
      65000,
      0,
      'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=900&q=82',
      'dining table, oak, round, six seater, furniture',
    ),
    mk(
      '4',
      p3,
      'LoftLane',
      '🏠',
      'Ergonomic mesh office chair',
      'Demo listing. Lumbar support, adjustable arms. WFH upgrade.',
      18500,
      32900,
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=900&q=82',
      'office chair, ergonomic, mesh, desk, furniture',
    ),
    mk(
      '5',
      p4,
      'CoastlineCo',
      '🌿',
      'Walnut desk with cable tray',
      'Demo listing. Minimal scratch on top. Cable management built in.',
      32000,
      45900,
      'https://images.unsplash.com/photo-1532372320572-cda25653a26d?w=900&q=82',
      'desk, walnut, office, cable management, furniture',
    ),
    mk(
      '6',
      p5,
      'StudioNorth',
      '✨',
      'Queen upholstered bed frame + slats',
      'Demo listing. Linen-look fabric, no mattress. Easy disassembly.',
      27500,
      41000,
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=900&q=82',
      'bed frame, queen, upholstered, bedroom, furniture',
    ),
  ]
}

let cached = null
export function buildPublicDemoListings() {
  if (!cached) {
    Object.keys(BY_ID).forEach((k) => delete BY_ID[k])
    cached = buildAll()
  }
  return cached
}

export function getPublicDemoListingById(id) {
  buildPublicDemoListings()
  return BY_ID[id] ?? null
}

export function isPublicDemoListingId(id) {
  return typeof id === 'string' && id.startsWith(PREFIX)
}

/**
 * Match peerListingsStore.listListings filters so merged results stay consistent.
 * @param {Record<string, unknown>[]} listings
 * @param {{ status?: string, q?: string, category?: string, profileAuthorId?: string, minPrice?: unknown, maxPrice?: unknown }} filters
 */
export function filterPublicDemoListings(listings, filters) {
  const status = filters?.status
  if (status && status !== 'published') return []
  let rows = [...listings]
  const profileAuthorId =
    typeof filters?.profileAuthorId === 'string' ? filters.profileAuthorId.trim() : ''
  if (profileAuthorId) {
    rows = rows.filter((l) => String(l.profileAuthorId ?? '').trim() === profileAuthorId)
  }
  const q = typeof filters?.q === 'string' ? filters.q : ''
  if (q.trim()) {
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
  const category = typeof filters?.category === 'string' ? filters.category : ''
  if (category) {
    rows = rows.filter((l) => l.category === category)
  }
  const minP = filters?.minPrice
  if (minP != null) {
    const m = Number(minP)
    if (Number.isFinite(m)) rows = rows.filter((l) => (l.priceCents ?? 0) >= m * 100)
  }
  const maxP = filters?.maxPrice
  if (maxP != null) {
    const m = Number(maxP)
    if (Number.isFinite(m)) rows = rows.filter((l) => (l.priceCents ?? 0) <= m * 100)
  }
  rows.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
  return rows
}
