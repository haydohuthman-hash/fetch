import type { BookingDriverLocation, BookingLifecycleStatus } from '../assistant/types'
import { stableDriverAnchorFromPickup } from '../homeDirections'

export type LiveTrackingLegPhase = 'to_pickup' | 'to_dropoff'

export type LiveTrackingLatLng = { lat: number; lng: number }

export type LiveTrackingEndpoints = {
  origin: LiveTrackingLatLng
  destination: LiveTrackingLatLng
  phase: LiveTrackingLegPhase
}

export type ResolveLiveTrackingParams = {
  status: BookingLifecycleStatus | null | undefined
  bookingId: string
  pickupCoords: LiveTrackingLatLng | null | undefined
  dropoffCoords: LiveTrackingLatLng | null | undefined
  driverLocation: BookingDriverLocation | null | undefined
  gpsFreshMs: number
  /** For tests / deterministic behavior */
  now?: number
}

/**
 * Single source of truth for traffic Directions origin/destination during live marketplace trips.
 * Matches driver dashboard rules: pickup leg for dispatching/matched/en_route; dropoff leg for
 * in_progress; no leg at arrived or outside active drive phases.
 */
export function resolveLiveTrackingEndpoints(
  p: ResolveLiveTrackingParams,
): LiveTrackingEndpoints | null {
  const now = p.now ?? Date.now()
  const pickup = p.pickupCoords
  const dropoff = p.dropoffCoords
  const st = p.status ?? null

  const freshDriver: LiveTrackingLatLng | null =
    p.driverLocation && now - p.driverLocation.updatedAt < p.gpsFreshMs
      ? { lat: p.driverLocation.lat, lng: p.driverLocation.lng }
      : null

  if (st === 'dispatching' || st === 'matched' || st === 'en_route') {
    if (!pickup) return null
    const origin = freshDriver ?? stableDriverAnchorFromPickup(p.bookingId, pickup)
    return {
      origin,
      destination: { lat: pickup.lat, lng: pickup.lng },
      phase: 'to_pickup',
    }
  }

  if (st === 'in_progress') {
    if (!dropoff) return null
    const pickupLL = pickup ? { lat: pickup.lat, lng: pickup.lng } : null
    const dropLL = { lat: dropoff.lat, lng: dropoff.lng }
    const origin = freshDriver ?? pickupLL ?? stableDriverAnchorFromPickup(`${p.bookingId}_drop`, dropLL)
    return {
      origin,
      destination: dropLL,
      phase: 'to_dropoff',
    }
  }

  return null
}

/** True when the full pickup→dropoff job polyline should be hidden (live leg is authoritative). */
export function shouldHideJobRouteDuringLiveTracking(
  status: BookingLifecycleStatus | null | undefined,
  bookingId: string | null | undefined,
): boolean {
  if (!bookingId || bookingId.startsWith('demo-')) return false
  const st = status ?? null
  return (
    st === 'dispatching' ||
    st === 'matched' ||
    st === 'en_route' ||
    st === 'in_progress'
  )
}
