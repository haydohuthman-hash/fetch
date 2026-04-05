/**
 * Persistent Uber-style matching: rank online drivers, send sequential offers,
 * expire on timeout, retry next candidate until matched or match_failed.
 */

const DEFAULT_OFFER_TIMEOUT_MS = 45_000
const MATCH_WALL_MS = 10 * 60_000
const NO_ONLINE_DRIVER_GRACE_MS = 90_000
const WAVE_GAP_MS = 25_000

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function haversineMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function isMatchingStatus(status) {
  return status === 'pending_match' || status === 'dispatching'
}

function offersForBooking(state, bookingId) {
  return ensureArray(state.offers).filter((o) => o?.bookingId === bookingId)
}

function declinedDrivers(state, bookingId) {
  const set = new Set()
  for (const o of offersForBooking(state, bookingId)) {
    if (o.status === 'declined' && o.driverId) set.add(o.driverId)
  }
  return set
}

function rankOnlineDrivers(state, booking, now) {
  const pickup = booking.pickupCoords
  const presences = ensureArray(state.driverPresence).filter(
    (p) => p && p.driverId && p.online === true && now - (p.updatedAt ?? 0) < 180_000,
  )
  const declined = declinedDrivers(state, booking.id)

  const scored = presences
    .filter((p) => !declined.has(p.driverId))
    .map((p) => {
      const dist =
        pickup && typeof p.lat === 'number' && typeof p.lng === 'number'
          ? haversineMeters(pickup, { lat: p.lat, lng: p.lng })
          : 50_000
      const rating = typeof p.rating === 'number' && Number.isFinite(p.rating) ? p.rating : 4.75
      const jobs = typeof p.completedJobs === 'number' && p.completedJobs >= 0 ? p.completedJobs : 0
      // Lower score is better: distance primary, then rating, then experience.
      const score = dist * 1 + (5 - rating) * 2500 - Math.min(jobs, 500) * 8
      return { driverId: p.driverId, score, dist, rating }
    })
  scored.sort((a, b) => a.score - b.score)
  return scored.map((s) => s.driverId)
}

function ensureMatchingMeta(booking, now) {
  if (!booking.matchingMeta) {
    const started = booking.dispatchMeta?.startedAt ?? now
    booking.matchingMeta = {
      matchStartedAt: started,
      driversContacted: 0,
      activeOfferId: null,
      activeDriverId: null,
      offerSentAt: null,
      offerTimeoutMs: DEFAULT_OFFER_TIMEOUT_MS,
      candidateCursor: 0,
      rankedDriverIds: [],
    }
  }
  if (typeof booking.matchingMeta.offerTimeoutMs !== 'number' || booking.matchingMeta.offerTimeoutMs < 5000) {
    booking.matchingMeta.offerTimeoutMs = DEFAULT_OFFER_TIMEOUT_MS
  }
}

function findOffer(state, offerId) {
  return ensureArray(state.offers).find((o) => o.offerId === offerId)
}

function clearActiveOffer(state, booking, now) {
  const meta = booking.matchingMeta
  if (!meta) return
  if (!meta.activeOfferId) {
    meta.activeDriverId = null
    meta.offerSentAt = null
    return
  }
  const o = findOffer(state, meta.activeOfferId)
  if (o && o.status === 'pending') {
    o.status = 'expired'
    o.updatedAt = now
  }
  meta.activeOfferId = null
  meta.activeDriverId = null
  meta.offerSentAt = null
  meta.lastOfferClearedAt = now
}

function issueOffer(state, booking, driverId, now, makeId) {
  const meta = booking.matchingMeta
  const round = meta.driversContacted
  const offerId = `m_${booking.id}_${driverId}_${round}`
  const without = ensureArray(state.offers).filter((o) => o.offerId !== offerId)
  const offer = {
    offerId,
    bookingId: booking.id,
    driverId,
    status: 'pending',
    updatedAt: now,
  }
  state.offers = [offer, ...without]
  meta.activeOfferId = offerId
  meta.activeDriverId = driverId
  meta.offerSentAt = now
  meta.driversContacted = round + 1
  meta.candidateCursor = meta.candidateCursor + 1
}

function failMatching(state, booking, now, _makeId, ensureTimelineEntry, ensureNotification, message) {
  clearActiveOffer(state, booking, now)
  booking.status = 'match_failed'
  booking.updatedAt = now
  booking.matchingMeta = null
  ensureTimelineEntry(booking, 'match_failed', 'No driver available', message, now)
  ensureNotification(state, booking.id, 'match_failed', 'No driver available', message, now)
}

/**
 * @param {object} state
 * @param {number} now
 * @param {object} helpers
 * @param {() => string} helpers.makeId
 * @param {(b:any,k:string,t:string,d:string,n?:number)=>void} helpers.ensureTimelineEntry
 * @param {(s:any,bid:string,k:string,t:string,m:string,n?:number)=>void} helpers.ensureNotification
 */
export function advanceMatchingEngine(state, now, { makeId, ensureTimelineEntry, ensureNotification }) {
  if (!state.driverPresence) state.driverPresence = []

  for (const booking of ensureArray(state.bookings)) {
    if (!isMatchingStatus(booking.status)) continue
    // Pool-only jobs: drivers accept from the dashboard; no server-timed offer waves or auto match_failed.
    if (booking.driverControlled) continue
    if (!booking.dispatchMeta?.startedAt) continue

    ensureMatchingMeta(booking, now)
    const meta = booking.matchingMeta
    const ranked = rankOnlineDrivers(state, booking, now)
    meta.rankedDriverIds = ranked

    const elapsed = now - meta.matchStartedAt
    if (elapsed >= MATCH_WALL_MS) {
      failMatching(
        state,
        booking,
        now,
        makeId,
        ensureTimelineEntry,
        ensureNotification,
        'We could not confirm a driver in time. You can try again or cancel.',
      )
      continue
    }

    // Active offer: react to driver or timeout
    if (meta.activeOfferId && meta.activeDriverId) {
      const offer = findOffer(state, meta.activeOfferId)
      if (!offer) {
        clearActiveOffer(state, booking, now)
      } else if (offer.status === 'accepted') {
        // Accept path should have moved booking to matched; clean up if stuck.
        continue
      } else if (offer.status === 'declined') {
        clearActiveOffer(state, booking, now)
      } else if (offer.status === 'pending' && meta.offerSentAt && now - meta.offerSentAt >= meta.offerTimeoutMs) {
        clearActiveOffer(state, booking, now)
      } else if (offer.status === 'expired') {
        clearActiveOffer(state, booking, now)
      } else {
        continue
      }
    }

    // No active offer — pick next candidate
    if (ranked.length === 0) {
      if (elapsed >= NO_ONLINE_DRIVER_GRACE_MS) {
        failMatching(
          state,
          booking,
          now,
          makeId,
          ensureTimelineEntry,
          ensureNotification,
          'No online drivers nearby yet. Try again in a few minutes.',
        )
      }
      continue
    }

    // Reset cursor if we walked past the end — new wave after a short gap
    if (meta.candidateCursor >= ranked.length) {
      const ref = meta.lastOfferClearedAt ?? meta.matchStartedAt
      if (now - ref < WAVE_GAP_MS) continue
      meta.candidateCursor = 0
    }

    const nextDriverId = ranked[meta.candidateCursor]
    if (!nextDriverId) continue

    // Skip if this driver still has a non-terminal offer for this booking
    const existing = offersForBooking(state, booking.id).find(
      (o) => o.driverId === nextDriverId && o.status === 'pending',
    )
    if (existing) {
      meta.activeOfferId = existing.offerId
      meta.activeDriverId = nextDriverId
      meta.offerSentAt = existing.updatedAt ?? now
      continue
    }

    issueOffer(state, booking, nextDriverId, now, makeId)
    ensureTimelineEntry(
      booking,
      'pending_match',
      'Contacting drivers',
      `Offer sent to driver ${nextDriverId}.`,
      now,
    )
  }
}
