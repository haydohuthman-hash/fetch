import fs from 'node:fs/promises'
import { advanceMatchingEngine } from './matching-engine.js'

const EMPTY_MARKETPLACE = {
  bookings: [],
  offers: [],
  notifications: [],
  media: [],
  paymentIntents: [],
  driverPresence: [],
}

const DISPATCHABLE_STATUSES = new Set(['confirmed', 'match_failed'])

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function cloneEmptyState() {
  return {
    bookings: [],
    offers: [],
    notifications: [],
    media: [],
    paymentIntents: [],
    driverPresence: [],
  }
}

function normalizeState(parsed) {
  return {
    bookings: ensureArray(parsed?.bookings),
    offers: ensureArray(parsed?.offers),
    notifications: ensureArray(parsed?.notifications),
    media: ensureArray(parsed?.media),
    paymentIntents: ensureArray(parsed?.paymentIntents),
    driverPresence: ensureArray(parsed?.driverPresence),
  }
}

function timelineHasEntry(booking, kind) {
  return ensureArray(booking.timeline).some((entry) => entry?.kind === kind)
}

function ensureTimelineEntry(booking, kind, title, description, createdAt = Date.now()) {
  if (!timelineHasEntry(booking, kind)) {
    booking.timeline = ensureArray(booking.timeline)
    booking.timeline.unshift({
      id: makeId('tl'),
      kind,
      title,
      description,
      createdAt,
    })
  }
}

function notificationExists(state, bookingId, kind) {
  return ensureArray(state.notifications).some(
    (notification) => notification?.bookingId === bookingId && notification?.kind === kind,
  )
}

function ensureNotification(state, bookingId, kind, title, message, createdAt = Date.now()) {
  if (!notificationExists(state, bookingId, kind)) {
    state.notifications.unshift({
      id: makeId('notif'),
      bookingId,
      kind,
      title,
      message,
      createdAt,
      isRead: false,
      updatedAt: createdAt,
    })
  }
}

function syncPaymentIntentToBooking(state, booking) {
  if (!booking?.paymentIntent?.id) return
  const intent = state.paymentIntents.find((row) => row.id === booking.paymentIntent.id)
  if (intent) booking.paymentIntent = { ...intent }
}

function paymentConfirmedForDispatch(booking) {
  const pi = booking?.paymentIntent
  if (!pi || pi.status !== 'succeeded') return false
  if (process.env.FETCH_REQUIRE_STRIPE_WEBHOOK === '1' && pi.provider === 'stripe') {
    return Boolean(pi.webhookConfirmedAt)
  }
  return true
}

function canDispatchBooking(booking) {
  return (
    Boolean(booking) &&
    DISPATCHABLE_STATUSES.has(booking.status) &&
    paymentConfirmedForDispatch(booking)
  )
}

function isActivelyMatching(booking) {
  return booking?.status === 'pending_match' || booking?.status === 'dispatching'
}

function applyBookingLifecycle(state, booking, now) {
  syncPaymentIntentToBooking(state, booking)
  if (!booking?.timeline) booking.timeline = []
  if (!booking?.createdAt) booking.createdAt = now
  booking.updatedAt = now

  if (booking.status === 'payment_required') {
    ensureTimelineEntry(booking, 'payment_required', 'Payment required', 'Select a payment method to secure the booking.', booking.createdAt)
    ensureNotification(
      state,
      booking.id,
      'payment_required',
      'Payment required',
      'Secure your payment method to confirm the booking.',
      booking.createdAt,
    )
  }

  if (booking.status === 'confirmed') {
    ensureTimelineEntry(booking, 'booking_confirmed', 'Booking confirmed', 'Payment succeeded and the booking is ready to dispatch.', booking.updatedAt)
  }

  // Live matching + driver-controlled jobs no longer use timed demo progression here.
}

/**
 * @param {string | { dataFile?: string, load?: () => Promise<unknown>, save?: (state: object, json: string) => Promise<void>, onAfterWrite?: () => void }} arg
 * Legacy: createMarketplaceStore('/path/to.json')
 */
export function createMarketplaceStore(arg) {
  const opts = typeof arg === 'string' ? { dataFile: arg } : arg ?? {}
  const { dataFile, load, save, onAfterWrite } = opts

  async function readState() {
    try {
      let parsed
      if (typeof load === 'function') {
        parsed = await load()
      } else if (dataFile) {
        const raw = await fs.readFile(dataFile, 'utf8')
        parsed = JSON.parse(raw)
      } else {
        return cloneEmptyState()
      }
      const state = normalizeState(parsed)
      materializeState(state)
      return state
    } catch {
      return cloneEmptyState()
    }
  }

  async function writeState(state) {
    const json = JSON.stringify(state, null, 2)
    if (typeof save === 'function') {
      await save(state, json)
    } else if (dataFile) {
      await fs.writeFile(dataFile, json, 'utf8')
    }
    try {
      onAfterWrite?.()
    } catch {
      /* ignore subscriber errors */
    }
  }

  function materializeState(state, now = Date.now()) {
    state.bookings = ensureArray(state.bookings)
    state.notifications = ensureArray(state.notifications)
    state.paymentIntents = ensureArray(state.paymentIntents)
    state.driverPresence = ensureArray(state.driverPresence)
    for (const booking of state.bookings) {
      applyBookingLifecycle(state, booking, now)
    }
    advanceMatchingEngine(state, now, { makeId, ensureTimelineEntry, ensureNotification })
    state.bookings.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    state.notifications.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return state
  }

  function upsertPaymentIntent(state, paymentIntent) {
    const without = state.paymentIntents.filter((row) => row.id !== paymentIntent.id)
    state.paymentIntents = [paymentIntent, ...without]
    return paymentIntent
  }

  function upsertBooking(state, payload) {
    const now = Date.now()
    const existing = state.bookings.find((booking) => booking.id === payload.id)
    const next = {
      ...(existing ?? {}),
      ...payload,
      updatedAt: now,
      createdAt: existing?.createdAt ?? payload.createdAt ?? now,
      timeline: ensureArray(payload.timeline).length ? payload.timeline : ensureArray(existing?.timeline),
      paymentIntent: payload.paymentIntent ?? existing?.paymentIntent ?? null,
      aiReview: payload.aiReview ?? existing?.aiReview ?? null,
      matchedDriver: payload.matchedDriver ?? existing?.matchedDriver ?? null,
      driverLocation:
        payload.driverLocation !== undefined
          ? payload.driverLocation
          : existing?.driverLocation ?? null,
      assignedDriverId:
        payload.assignedDriverId !== undefined
          ? payload.assignedDriverId
          : existing?.assignedDriverId ?? null,
      driverControlled:
        payload.driverControlled !== undefined
          ? Boolean(payload.driverControlled)
          : Boolean(existing?.driverControlled),
      customerRating:
        payload.customerRating !== undefined
          ? payload.customerRating
          : existing?.customerRating ?? null,
      customerEmail:
        payload.customerEmail !== undefined
          ? typeof payload.customerEmail === 'string'
            ? payload.customerEmail.trim().toLowerCase() || null
            : null
          : existing?.customerEmail ?? null,
      customerUserId:
        payload.customerUserId !== undefined
          ? typeof payload.customerUserId === 'string'
            ? payload.customerUserId.trim() || null
            : null
          : existing?.customerUserId ?? null,
      matchingMode:
        payload.matchingMode !== undefined
          ? payload.matchingMode === 'sequential' || payload.matchingMode === 'pool'
            ? payload.matchingMode
            : existing?.matchingMode ?? null
          : existing?.matchingMode ?? null,
      matchingMeta:
        payload.matchingMeta !== undefined ? payload.matchingMeta : existing?.matchingMeta ?? null,
      status: payload.status ?? existing?.status ?? 'draft',
    }
    if (!existing) {
      ensureTimelineEntry(next, 'draft_created', 'Booking draft created', 'Fetch AI has staged the booking for review.', next.createdAt)
    }
    if (next.aiReview?.status === 'ready') {
      ensureTimelineEntry(next, 'ai_reviewed', 'Fetch AI reviewed the booking', 'The booking was normalized and quoted server-side.', now)
    }
    if (next.paymentIntent?.status && next.status === 'payment_required') {
      ensureTimelineEntry(next, 'payment_required', 'Payment required', 'Select a payment method to continue.', now)
    }
    const without = state.bookings.filter((booking) => booking.id !== next.id)
    state.bookings = [next, ...without]
    materializeState(state, now)
    return next
  }

  function markNotificationRead(state, notificationId) {
    const notification = state.notifications.find((entry) => entry.id === notificationId)
    if (!notification) return null
    notification.isRead = true
    notification.updatedAt = Date.now()
    return notification
  }

  function upsertDriverPresence(state, row) {
    const id = typeof row.driverId === 'string' ? row.driverId.trim() : ''
    if (!id) return null
    const now = Date.now()
    const next = {
      driverId: id,
      online: Boolean(row.online),
      lat: typeof row.lat === 'number' && Number.isFinite(row.lat) ? row.lat : null,
      lng: typeof row.lng === 'number' && Number.isFinite(row.lng) ? row.lng : null,
      rating: typeof row.rating === 'number' && Number.isFinite(row.rating) ? row.rating : null,
      completedJobs: typeof row.completedJobs === 'number' && Number.isFinite(row.completedJobs) ? row.completedJobs : null,
      updatedAt: now,
    }
    const without = ensureArray(state.driverPresence).filter((p) => p.driverId !== id)
    state.driverPresence = [next, ...without]
    materializeState(state, now)
    return next
  }

  function startDispatch(state, bookingId, options = {}) {
    const envMode =
      typeof process.env.FETCH_DEFAULT_MATCHING_MODE === 'string' &&
      process.env.FETCH_DEFAULT_MATCHING_MODE.trim().toLowerCase() === 'sequential'
        ? 'sequential'
        : 'pool'
    const matchingMode =
      options.matchingMode === 'sequential' || options.matchingMode === 'pool'
        ? options.matchingMode
        : envMode

    const booking = state.bookings.find((entry) => entry.id === bookingId)
    if (!booking) return { booking: null, error: 'booking_not_found' }
    if (isActivelyMatching(booking)) {
      materializeState(state, Date.now())
      return { booking, error: null }
    }
    if (!canDispatchBooking(booking)) {
      return { booking: null, error: 'booking_not_dispatchable' }
    }
    const startedAt = Date.now()
    booking.status = 'pending_match'
    booking.dispatchMeta = { startedAt }
    booking.updatedAt = startedAt
    booking.matchedDriver = null
    booking.assignedDriverId = null
    booking.matchingMode = matchingMode
    // Pool: open board; drivers claim from dashboard (matching-engine skipped).
    // Sequential: server ranks online drivers and issues timed offers (matching-engine.js).
    const usePool = matchingMode === 'pool'
    booking.driverControlled = usePool
    booking.matchingMeta = null
    const title = 'Finding a driver'
    const timelineDesc = usePool
      ? 'Nearby drivers can see your job and accept when ready.'
      : 'We are contacting drivers one at a time, starting with the closest match.'
    const notifMsg = usePool
      ? 'Drivers in your area can claim this job from their app.'
      : 'Offers are sent to drivers in order until someone accepts.'
    ensureTimelineEntry(booking, 'pending_match', title, timelineDesc, startedAt)
    ensureNotification(state, booking.id, 'pending_match', title, notifMsg, startedAt)
    materializeState(state, startedAt)
    return { booking, error: null }
  }

  /**
   * Idempotent driver assignment: first accept wins; same driver retry returns ok.
   */
  function atomicAcceptMatch(state, bookingId, driverId, matchedDriver) {
    const id = typeof driverId === 'string' ? driverId.trim() : ''
    if (!id || !matchedDriver || typeof matchedDriver !== 'object') {
      return { booking: null, error: 'invalid_payload' }
    }
    const booking = state.bookings.find((entry) => entry.id === bookingId)
    if (!booking) return { booking: null, error: 'booking_not_found' }
    if (booking.status === 'matched' && booking.assignedDriverId === id) {
      materializeState(state, Date.now())
      return { booking, error: null }
    }
    if (booking.status === 'matched' && booking.assignedDriverId && booking.assignedDriverId !== id) {
      return { booking: null, error: 'already_assigned' }
    }
    if (booking.status !== 'pending_match' && booking.status !== 'dispatching') {
      return { booking: null, error: 'not_matching' }
    }
    if (booking.assignedDriverId && booking.assignedDriverId !== id) {
      return { booking: null, error: 'already_assigned' }
    }
    const now = Date.now()
    booking.status = 'matched'
    booking.matchedDriver = matchedDriver
    booking.assignedDriverId = id
    booking.driverControlled = true
    booking.matchingMeta = null
    booking.updatedAt = now
    for (const o of ensureArray(state.offers)) {
      if (o.bookingId !== booking.id || o.status !== 'pending') continue
      o.status = 'expired'
      o.updatedAt = now
    }
    materializeState(state, now)
    return { booking, error: null }
  }

  return {
    EMPTY_MARKETPLACE,
    readState,
    writeState,
    materializeState,
    upsertPaymentIntent,
    upsertBooking,
    markNotificationRead,
    startDispatch,
    atomicAcceptMatch,
    upsertDriverPresence,
  }
}
