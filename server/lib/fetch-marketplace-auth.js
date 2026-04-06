/**
 * Customer sessions: signed httpOnly cookie (see /api/auth/*).
 * Headers X-Fetch-User-Email / X-Fetch-Driver-Id are honored only when FETCH_ALLOW_HEADER_AUTH=1 (dev / tests).
 */

import {
  FETCH_SESSION_COOKIE_NAME,
  readCookieFromRequest,
  verifyFetchSessionCookie,
} from './fetch-session-cookie.js'

export function normalizeEmail(email) {
  if (typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

export function parseMarketplaceActor(req) {
  const email = normalizeEmail(req.headers['x-fetch-user-email'])
  const driverId =
    typeof req.headers['x-fetch-driver-id'] === 'string' ? req.headers['x-fetch-driver-id'].trim() : ''
  return {
    customerEmail: email || null,
    customerUserId: null,
    driverId: driverId || null,
    isAuthenticated: Boolean(email || driverId),
  }
}

/**
 * Production path: verify `fetch_session` cookie.
 * Dev override: same headers as {@link parseMarketplaceActor} when FETCH_ALLOW_HEADER_AUTH=1.
 */
export function resolveMarketplaceActor(req) {
  const secret = (process.env.FETCH_SESSION_SECRET || 'fetch_dev_session_insecure').trim()
  const raw = readCookieFromRequest(req, FETCH_SESSION_COOKIE_NAME)
  const payload = raw ? verifyFetchSessionCookie(raw, secret) : null
  if (payload?.role === 'customer' && typeof payload.email === 'string') {
    const email = normalizeEmail(payload.email)
    if (email) {
      const customerUserId = typeof payload.userId === 'string' ? payload.userId.trim() : null
      return {
        customerEmail: email,
        customerUserId,
        driverId: null,
        isAuthenticated: true,
        authSource: 'cookie',
      }
    }
  }
  if (payload?.role === 'driver' && typeof payload.driverId === 'string') {
    const driverId = payload.driverId.trim()
    if (driverId) {
      return {
        customerEmail: null,
        customerUserId: null,
        driverId,
        isAuthenticated: true,
        authSource: 'cookie',
      }
    }
  }
  if (process.env.FETCH_ALLOW_HEADER_AUTH === '1') {
    const h = parseMarketplaceActor(req)
    return { ...h, customerUserId: null, authSource: 'header' }
  }
  return {
    customerEmail: null,
    customerUserId: null,
    driverId: null,
    isAuthenticated: false,
    authSource: 'none',
  }
}

const LOCKED_AFTER_PAYMENT = new Set([
  'payment_required',
  'confirmed',
  'dispatching',
  'pending_match',
  'match_failed',
  'matched',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
])

export function bookingLockedFromDowngrade(existingStatus, requestedStatus) {
  if (requestedStatus !== 'draft') return false
  return LOCKED_AFTER_PAYMENT.has(existingStatus)
}

export function assertCustomerCanAccessBooking(actor, booking) {
  if (process.env.FETCH_STRICT_CUSTOMER_AUTH === '1') {
    if (!actor?.customerEmail && !actor?.customerUserId) return false
    const bUid = typeof booking.customerUserId === 'string' ? booking.customerUserId.trim() : ''
    const aUid = typeof actor.customerUserId === 'string' ? actor.customerUserId.trim() : ''
    if (aUid && bUid) return bUid === aUid
    if (!booking.customerEmail) return true
    return Boolean(actor.customerEmail) && booking.customerEmail === actor.customerEmail
  }
  if (!actor.customerEmail) return true
  if (!booking.customerEmail) return true
  return booking.customerEmail === actor.customerEmail
}

export function assertDriverCanPatchLocation(actor, booking, bodyDriverId) {
  if (!actor.driverId) return true
  const assigned = booking.assignedDriverId
  if (!assigned) return true
  const bodyId = typeof bodyDriverId === 'string' ? bodyDriverId.trim() : ''
  if (bodyId && bodyId !== assigned) return false
  return actor.driverId === assigned
}

const DRIVER_DRIVEN_STATUSES = new Set(['matched', 'en_route', 'arrived', 'in_progress', 'completed'])

export function assertDriverCanPatchStatus(actor, booking, nextStatus, body) {
  if (!actor.driverId) return true
  if (!DRIVER_DRIVEN_STATUSES.has(nextStatus)) return true
  const assigned = booking.assignedDriverId
  if (!assigned) return true
  if (nextStatus === 'matched') {
    const id = typeof body?.assignedDriverId === 'string' ? body.assignedDriverId.trim() : ''
    return id === actor.driverId
  }
  return actor.driverId === assigned
}
