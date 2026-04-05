import fs from 'node:fs/promises'

const EMPTY_MARKETPLACE = {
  bookings: [],
  offers: [],
  notifications: [],
  media: [],
  paymentIntents: [],
}

const DISPATCHABLE_STATUSES = new Set(['confirmed'])

const LIFECYCLE_STEPS = [
  { afterMs: 0, status: 'dispatching', kind: 'dispatching', title: 'Dispatch started', message: 'Fetch AI is finding the best nearby driver.' },
  { afterMs: 3500, status: 'matched', kind: 'matched', title: 'Driver matched', message: 'A driver has accepted the booking.' },
  { afterMs: 9000, status: 'en_route', kind: 'en_route', title: 'Driver en route', message: 'Your driver is heading to pickup.' },
  { afterMs: 16000, status: 'arrived', kind: 'arrived', title: 'Driver arrived', message: 'Your driver has arrived at pickup.' },
  { afterMs: 22000, status: 'in_progress', kind: 'in_progress', title: 'Job in progress', message: 'Your booking is now underway.' },
  { afterMs: 32000, status: 'completed', kind: 'completed', title: 'Booking completed', message: 'The booking has been marked complete.' },
]

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
  }
}

function normalizeState(parsed) {
  return {
    bookings: ensureArray(parsed?.bookings),
    offers: ensureArray(parsed?.offers),
    notifications: ensureArray(parsed?.notifications),
    media: ensureArray(parsed?.media),
    paymentIntents: ensureArray(parsed?.paymentIntents),
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

function deriveDriver(booking) {
  const seed = String(booking.id || booking.pickupAddressText || 'fetch')
  const names = ['Mia', 'Noah', 'Aria', 'Zane', 'Ruby', 'Kai']
  const vehicles = ['Ute', 'Van', 'Truck']
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return {
    name: names[hash % names.length],
    vehicle: vehicles[hash % vehicles.length],
    etaMinutes: 4 + (hash % 9),
    rating: Number((4.7 + ((hash % 25) / 100)).toFixed(2)),
  }
}

function syncPaymentIntentToBooking(state, booking) {
  if (!booking?.paymentIntent?.id) return
  const intent = state.paymentIntents.find((row) => row.id === booking.paymentIntent.id)
  if (intent) booking.paymentIntent = { ...intent }
}

function canDispatchBooking(booking) {
  return (
    Boolean(booking) &&
    DISPATCHABLE_STATUSES.has(booking.status) &&
    booking.paymentIntent?.status === 'succeeded'
  )
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

  if (!booking.dispatchMeta?.startedAt) return
  // Driver dashboard PATCH drives status; skip demo timer progression.
  if (booking.driverControlled) return

  for (const step of LIFECYCLE_STEPS) {
    if (now - booking.dispatchMeta.startedAt < step.afterMs) break
    if (booking.status !== step.status) {
      booking.status = step.status
      booking.updatedAt = now
      if (step.status === 'matched' || step.status === 'en_route' || step.status === 'arrived' || step.status === 'in_progress' || step.status === 'completed') {
        booking.matchedDriver = booking.matchedDriver || deriveDriver(booking)
      }
    }
    ensureTimelineEntry(booking, step.kind, step.title, step.message, booking.dispatchMeta.startedAt + step.afterMs)
    ensureNotification(state, booking.id, step.kind, step.title, step.message, booking.dispatchMeta.startedAt + step.afterMs)
  }
}

export function createMarketplaceStore(dataFile) {
  async function readState() {
    try {
      const raw = await fs.readFile(dataFile, 'utf8')
      const parsed = JSON.parse(raw)
      const state = normalizeState(parsed)
      materializeState(state)
      return state
    } catch {
      return cloneEmptyState()
    }
  }

  async function writeState(state) {
    await fs.writeFile(dataFile, JSON.stringify(state, null, 2), 'utf8')
  }

  function materializeState(state, now = Date.now()) {
    state.bookings = ensureArray(state.bookings)
    state.notifications = ensureArray(state.notifications)
    state.paymentIntents = ensureArray(state.paymentIntents)
    for (const booking of state.bookings) {
      applyBookingLifecycle(state, booking, now)
    }
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

  function startDispatch(state, bookingId) {
    const booking = state.bookings.find((entry) => entry.id === bookingId)
    if (!booking) return { booking: null, error: 'booking_not_found' }
    if (!canDispatchBooking(booking)) {
      return { booking: null, error: 'booking_not_dispatchable' }
    }
    const startedAt = Date.now()
    booking.status = 'dispatching'
    booking.dispatchMeta = { startedAt }
    booking.updatedAt = startedAt
    booking.matchedDriver = deriveDriver(booking)
    materializeState(state, startedAt)
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
  }
}
