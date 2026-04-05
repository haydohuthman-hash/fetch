import type { BookingLifecycleStatus } from '../assistant/types'

/** Wire statuses that count as “paid / committed” for {@link deriveFlowStep} gating. */
export const WIRE_STATUSES_TREATED_AS_PAID: readonly BookingLifecycleStatus[] = [
  'confirmed',
  'dispatching',
  'pending_match',
  'match_failed',
  'matched',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
] as const

export function isWireStatusTreatedAsPaid(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return (WIRE_STATUSES_TREATED_AS_PAID as readonly string[]).includes(status)
}

/** Customer or system is finding a driver (Uber-style matching). */
export const WIRE_STATUSES_MATCHING: readonly BookingLifecycleStatus[] = ['dispatching', 'pending_match']

export function isWireStatusMatching(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return (WIRE_STATUSES_MATCHING as readonly string[]).includes(status)
}

/**
 * Booking is past the address/quote wizard guard rails in {@link isRouteTerminalPhase} /
 * {@link isJobDetailsPhase} (payment line or later).
 */
export const WIRE_STATUSES_ADVANCED_BOOKING: readonly BookingLifecycleStatus[] = [
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
] as const

export function isWireStatusAdvancedBooking(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return (WIRE_STATUSES_ADVANCED_BOOKING as readonly string[]).includes(status)
}

export function isWireStatusTerminal(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return status === 'completed' || status === 'cancelled'
}

/** Home feed / demo: dispatching → completed (inclusive). */
const WIRE_ACTIVE_DRIVER_FLOW: readonly BookingLifecycleStatus[] = [
  'dispatching',
  'pending_match',
  'match_failed',
  'matched',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
] as const

export function isWireStatusActiveDriverFlow(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return (WIRE_ACTIVE_DRIVER_FLOW as readonly string[]).includes(status)
}

/** Driver GPS upload while assigned to an active leg. */
export const WIRE_ACTIVE_DRIVER_GPS: readonly BookingLifecycleStatus[] = [
  'matched',
  'en_route',
  'arrived',
  'in_progress',
] as const

export function isWireStatusActiveForDriverGps(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return (WIRE_ACTIVE_DRIVER_GPS as readonly string[]).includes(status)
}

export function isWireStatusInLiveRideStep(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return (
    status === 'dispatching' ||
    status === 'pending_match' ||
    status === 'match_failed' ||
    status === 'matched' ||
    status === 'en_route' ||
    status === 'arrived' ||
    status === 'in_progress' ||
    status === 'completed'
  )
}

/** Driver PATCH progression after accepting a job (matches server demo ordering). */
export const LIVE_WIRE_STATUS_EDGES: ReadonlyArray<{
  from: BookingLifecycleStatus
  to: BookingLifecycleStatus
}> = [
  { from: 'matched', to: 'en_route' },
  { from: 'en_route', to: 'arrived' },
  { from: 'arrived', to: 'in_progress' },
  { from: 'in_progress', to: 'completed' },
] as const

export function getNextWireStatus(current: BookingLifecycleStatus): BookingLifecycleStatus | null {
  const step = LIVE_WIRE_STATUS_EDGES.find((s) => s.from === current)
  return step?.to ?? null
}
