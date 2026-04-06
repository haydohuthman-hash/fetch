import { fetchBookings } from './booking/api'
import type { BookingRecord } from './booking/types'
import type { HomeActivityEntry, HomeAlertRecord } from './homeActivityFeed'
import { loadHomeActivities, loadHomeAlerts } from './homeActivityFeed'
import { loadPaymentMethods } from './paymentMethods'
import { loadSavedAddresses, type SavedAddress } from './savedAddresses'

export type BrainMemoryCatalogKind = 'activity' | 'alert' | 'address' | 'chat_turn'

export type BrainMemoryCatalogEntry = {
  /** Stable id for focus + DOM (`activity:…`, `alert:…`, …). */
  id: string
  kind: BrainMemoryCatalogKind
  label: string
  keywords: string[]
  sortAt: number
  /** Present for `alert` entries from the local feed. */
  alertUnread?: boolean
}

/** Optional rich rendering in neural field bubbles (see FetchBrainMemoryOverlay). */
export type BrainChatBubbleUi =
  | { kind: 'scanning' }
  | { kind: 'address_confirm'; pickup?: string; dropoff?: string }
  | {
      kind: 'price_preview'
      /** Legacy ballpark line (older saved threads). */
      rangeLabel?: string
      note?: string
      /** Exact-quote card (neural field). */
      headline?: string
      totalAud?: number
      depositAud?: number
      summaryLines?: string[]
      payCtaLabel?: string
      courtesyLabel?: string
      showAsapPreview?: boolean
      asapEtaMinutes?: number
      asapDriverLabel?: string
      mapPreviewUrl?: string | null
    }

export type BrainChatCatalogLine = {
  id: string
  role: 'user' | 'assistant'
  text: string
  sortAt: number
  ui?: BrainChatBubbleUi
  /** Session-only blob: or remote URL; omitted when reloaded from disk. */
  attachmentUrl?: string
}

export type BrainAccountSnapshot = {
  generatedAt: number
  /** Sum of `priceMax` on activities whose payment status is succeeded-like. */
  totalSpendAud: number
  paymentActivityCount: number
  quoteActivityCount: number
  activityCount: number
  alertCount: number
  unreadAlertCount: number
  savedAddressCount: number
  paymentMethodCount: number
  /** Sum of `distanceMeters` on activities that recorded a route. */
  activityDistanceMetersSum: number
  /**
   * Extra km from marketplace completed bookings when API succeeds; merged into mileage display only when > activity sum.
   */
  bookingRouteMetersSupplement: number | null
  bookingMetersFromApi: number | null
  activities: HomeActivityEntry[]
  alerts: HomeAlertRecord[]
  addresses: SavedAddress[]
  brainChatLines: BrainChatCatalogLine[]
  catalog: BrainMemoryCatalogEntry[]
}

function paymentCountsAsSpend(status?: string) {
  return status === 'succeeded' || status === 'processing'
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}

function uniqKeywords(words: string[], cap = 24): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of words) {
    const k = w.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(k)
    if (out.length >= cap) break
  }
  return out
}

function buildCatalog(
  activities: HomeActivityEntry[],
  alerts: HomeAlertRecord[],
  addresses: SavedAddress[],
  brainChatLines: BrainChatCatalogLine[],
): BrainMemoryCatalogEntry[] {
  const catalog: BrainMemoryCatalogEntry[] = []

  for (const a of activities) {
    const label = a.title
    const kw = uniqKeywords([
      ...tokenize(a.title),
      ...tokenize(a.subtitle ?? ''),
      ...tokenize(a.jobType ?? ''),
      ...(a.title.toLowerCase().includes('quote') ? ['quote', 'estimate', 'pricing'] : []),
      ...(a.title.toLowerCase().includes('payment') ? ['payment', 'paid', 'charge'] : []),
    ])
    catalog.push({
      id: `activity:${a.id}`,
      kind: 'activity',
      label,
      keywords: kw,
      sortAt: a.at,
    })
  }

  for (const al of alerts) {
    catalog.push({
      id: `alert:${al.id}`,
      kind: 'alert',
      label: al.title,
      keywords: uniqKeywords([...tokenize(al.title), ...tokenize(al.body)]),
      sortAt: al.at,
      alertUnread: !al.read,
    })
  }

  for (const addr of addresses) {
    catalog.push({
      id: `address:${addr.id}`,
      kind: 'address',
      label: addr.label,
      keywords: uniqKeywords([
        ...tokenize(addr.label),
        ...tokenize(addr.address),
        ...tokenize(addr.notes),
        ...(addr.label.toLowerCase() === 'home' ? ['home', 'house'] : []),
        ...(addr.label.toLowerCase().includes('work') ? ['work', 'office', 'job'] : []),
      ]),
      sortAt: addr.id === 'addr_home' || addr.id === 'addr_work' ? 1e12 : 0,
    })
  }

  for (const c of brainChatLines) {
    catalog.push({
      id: `chat_turn:${c.id}`,
      kind: 'chat_turn',
      label: c.role === 'user' ? 'You said' : 'Fetch said',
      keywords: uniqKeywords([...tokenize(c.text), c.role]),
      sortAt: c.sortAt,
    })
  }

  catalog.sort((x, y) => y.sortAt - x.sortAt)
  return catalog
}

function sumBookingRouteMeters(bookings: BookingRecord[]): number {
  let sum = 0
  for (const b of bookings) {
    if (b.status !== 'completed') continue
    const m = b.route?.distanceMeters
    if (typeof m === 'number' && Number.isFinite(m) && m > 0) sum += m
  }
  return sum
}

export function brainCatalogIdToGraphNodeId(catalogId: string): string {
  return `memcat_${catalogId.replace(/[^a-zA-Z0-9:_-]/g, '_').replace(/:/g, '__')}`
}

type BuildOpts = {
  brainChatLines: BrainChatCatalogLine[]
  bookingRouteMetersSupplement?: number | null
}

export function buildBrainAccountSnapshot(opts: BuildOpts): BrainAccountSnapshot {
  const activities = loadHomeActivities()
  const alerts = loadHomeAlerts()
  const addresses = loadSavedAddresses()
  const methods = loadPaymentMethods()
  const generatedAt = Date.now()

  let totalSpendAud = 0
  let paymentActivityCount = 0
  let quoteActivityCount = 0
  let activityDistanceMetersSum = 0

  for (const a of activities) {
    if (a.title.toLowerCase().includes('quote')) quoteActivityCount += 1
    if (paymentCountsAsSpend(a.paymentStatus) && typeof a.priceMax === 'number') {
      totalSpendAud += a.priceMax
      paymentActivityCount += 1
    }
    if (typeof a.distanceMeters === 'number' && a.distanceMeters > 0) {
      activityDistanceMetersSum += a.distanceMeters
    }
  }

  const unreadAlertCount = alerts.filter((x) => !x.read).length
  const bookingMetersFromApi =
    opts.bookingRouteMetersSupplement != null && opts.bookingRouteMetersSupplement > 0
      ? opts.bookingRouteMetersSupplement
      : null

  const catalog = buildCatalog(activities, alerts, addresses, opts.brainChatLines)

  return {
    generatedAt,
    totalSpendAud,
    paymentActivityCount,
    quoteActivityCount,
    activityCount: activities.length,
    alertCount: alerts.length,
    unreadAlertCount,
    savedAddressCount: addresses.length,
    paymentMethodCount: methods.length,
    activityDistanceMetersSum,
    bookingRouteMetersSupplement: opts.bookingRouteMetersSupplement ?? null,
    bookingMetersFromApi,
    activities,
    alerts,
    addresses,
    brainChatLines: opts.brainChatLines,
    catalog,
  }
}

/** Async: fills `bookingRouteMetersSupplement` from marketplace when reachable. */
export async function buildBrainAccountSnapshotAsync(brainChatLines: BrainChatCatalogLine[]) {
  let supplement: number | null = null
  try {
    const bookings = await fetchBookings()
    const sum = sumBookingRouteMeters(bookings)
    supplement = sum > 0 ? sum : null
  } catch {
    supplement = null
  }
  return buildBrainAccountSnapshot({ brainChatLines, bookingRouteMetersSupplement: supplement })
}

export function formatBrainMileageDisplay(s: BrainAccountSnapshot): {
  meters: number
  source: 'activity' | 'bookings' | 'none'
} {
  const act = s.activityDistanceMetersSum
  const book = s.bookingMetersFromApi ?? 0
  if (act > 0) return { meters: act, source: 'activity' }
  if (book > 0) return { meters: book, source: 'bookings' }
  return { meters: 0, source: 'none' }
}

/** Compact block for `postFetchAiChat` brain-only context (~budget). */
export function buildBrainAccountIntelForAi(s: BrainAccountSnapshot): string {
  const spend = s.totalSpendAud.toFixed(2)
  const mile = formatBrainMileageDisplay(s)
  const km =
    mile.meters > 0 ? `${(mile.meters / 1000).toFixed(1)} km (${mile.source})` : 'none logged'
  const lines = [
    `Brain intel (local, do not invent other numbers): spend_AUD≈${spend} (${s.paymentActivityCount} payment activities); quotes_logged=${s.quoteActivityCount}; activities=${s.activityCount}; alerts=${s.alertCount} unread=${s.unreadAlertCount}; saved_places=${s.savedAddressCount}; cards_on_file=${s.paymentMethodCount}; mileage=${km}.`,
  ]
  return lines.join(' ').slice(0, 900)
}
