import type {
  BookingDriver,
  BookingLifecycleStatus,
  BookingMode,
  BookingStage,
  BookingState,
} from '../assistant/types'
import {
  getNextWireStatus,
  isWireStatusActiveDriverFlow,
  isWireStatusAdvancedBooking,
  LIVE_WIRE_STATUS_EDGES,
  WIRE_ACTIVE_DRIVER_GPS,
} from './bookingWireConstants'

/** Uber-style logical phase; persisted API still uses {@link BookingLifecycleStatus}. */
export type BookingLifecyclePhase =
  | 'idle'
  | 'selecting_service'
  | 'entering_pickup'
  | 'entering_dropoff'
  | 'reviewing_job'
  | 'pricing'
  | 'confirming_booking'
  | 'booking_confirmed'
  | 'pending_match'
  | 'match_failed'
  | 'driver_assigned'
  | 'driver_en_route'
  | 'arrived_at_pickup'
  | 'in_transit'
  | 'completed'
  | 'cancelled'

const TERMINAL_PHASES: ReadonlySet<BookingLifecyclePhase> = new Set(['completed', 'cancelled'])

const TERMINAL_PERSISTED: ReadonlySet<BookingLifecycleStatus> = new Set(['completed', 'cancelled'])

/** @deprecated Use {@link LIVE_WIRE_STATUS_EDGES} — kept for driver / marketplace call sites. */
export const DRIVER_STATUS_PROGRESSION = LIVE_WIRE_STATUS_EDGES

/** Persisted statuses where we stream driver GPS to the booking (assigned + active leg). */
export const PERSISTED_STATUSES_DRIVER_GPS = WIRE_ACTIVE_DRIVER_GPS

export function lifecyclePhaseFromPersistedStatus(
  status: BookingLifecycleStatus | null | undefined,
): BookingLifecyclePhase {
  switch (status) {
    case 'draft':
      return 'reviewing_job'
    case 'payment_required':
      return 'confirming_booking'
    case 'confirmed':
      return 'booking_confirmed'
    case 'dispatching':
    case 'pending_match':
      return 'pending_match'
    case 'match_failed':
      return 'match_failed'
    case 'matched':
      return 'driver_assigned'
    case 'en_route':
      return 'driver_en_route'
    case 'arrived':
      return 'arrived_at_pickup'
    case 'in_progress':
      return 'in_transit'
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'idle'
  }
}

/** Any persisted booking row with `status` (avoids importing `./types` circularly). */
export function lifecyclePhaseFromBookingRecord(record: { status: BookingLifecycleStatus }): BookingLifecyclePhase {
  return lifecyclePhaseFromPersistedStatus(record.status)
}

/**
 * Wizard is locked once payment is required or the job has advanced into dispatch / live.
 * (`draft` alone does not lock — user can still edit until payment line.)
 */
export function isWizardLockedByPersistedStatus(status: BookingState['bookingStatus']): boolean {
  return isWireStatusAdvancedBooking(status)
}

/**
 * Dispatch timeline: from matching through completion (includes `completed` for final poll refresh).
 * Replaces legacy `isActiveDriverFlow`.
 */
export function isLivePipelinePersistedStatus(status: BookingLifecycleStatus | null | undefined): boolean {
  return isWireStatusActiveDriverFlow(status)
}

/** Customer app: poll marketplace booking while status may still change on the server. */
export function shouldPollPersistedBookingStatus(status: BookingLifecycleStatus | null | undefined): boolean {
  return isWireStatusActiveDriverFlow(status)
}

export function isTerminalPhase(phase: BookingLifecyclePhase): boolean {
  return TERMINAL_PHASES.has(phase)
}

export function isTerminalPersistedStatus(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return TERMINAL_PERSISTED.has(status)
}

/** Booking row is still “open” (customer / activity lists). */
export function isActiveBookingPersistedStatus(status: BookingLifecycleStatus | null | undefined): boolean {
  if (status == null) return false
  return !TERMINAL_PERSISTED.has(status)
}

/** Any non-terminal phase (includes `booking_confirmed`, wizard phases, etc.). */
export function isJobActivePhase(phase: BookingLifecyclePhase): boolean {
  return !isTerminalPhase(phase)
}

/**
 * Ride pipeline: matching → assigned → done (includes `completed` for feed / poll tail).
 * Maps to legacy `isActiveDriverFlow` / home job card activity.
 */
export function isRideLifecyclePhase(phase: BookingLifecyclePhase): boolean {
  switch (phase) {
    case 'pending_match':
    case 'match_failed':
    case 'driver_assigned':
    case 'driver_en_route':
    case 'arrived_at_pickup':
    case 'in_transit':
    case 'completed':
      return true
    default:
      return false
  }
}

export function getNextPersistedJobStatus(
  current: BookingLifecycleStatus,
): BookingLifecycleStatus | null {
  return getNextWireStatus(current)
}

export function canAdvancePersistedJobStatus(
  from: BookingLifecycleStatus,
  to: BookingLifecycleStatus,
): boolean {
  return getNextWireStatus(from) === to
}

/**
 * When persisting from a session phase, prefer these wire values (server-supported subset).
 * Returns null when the phase is client-only or ambiguous.
 */
export function wireStatusFromSessionPhase(phase: BookingLifecyclePhase): BookingLifecycleStatus | null {
  switch (phase) {
    case 'confirming_booking':
      return 'payment_required'
    case 'booking_confirmed':
      return 'confirmed'
    case 'pending_match':
      return 'dispatching'
    case 'driver_assigned':
      return 'matched'
    case 'driver_en_route':
      return 'en_route'
    case 'arrived_at_pickup':
      return 'arrived'
    case 'in_transit':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    case 'match_failed':
      return 'match_failed'
    case 'reviewing_job':
      return 'draft'
    default:
      return null
  }
}

/** Customer orb / home map `BookingMode`. */
export function customerUiModeFromLifecyclePhase(phase: BookingLifecyclePhase): BookingMode {
  switch (phase) {
    case 'idle':
    case 'completed':
    case 'cancelled':
      return 'idle'
    case 'pricing':
      return 'pricing'
    case 'pending_match':
      return 'searching'
    case 'match_failed':
      return 'building'
    case 'driver_assigned':
      return 'matched'
    case 'driver_en_route':
    case 'arrived_at_pickup':
    case 'in_transit':
      return 'live'
    default:
      return 'building'
  }
}

/**
 * Driver dashboard map stage (`BookingStage`). `pending_match` stays `building` for offer / route preview
 * (same coarse stage as before shared phase unification).
 */
export function driverMapStageFromLifecyclePhase(phase: BookingLifecyclePhase): BookingStage {
  switch (phase) {
    case 'idle':
    case 'completed':
    case 'cancelled':
      return 'idle'
    case 'pending_match':
    case 'match_failed':
    case 'booking_confirmed':
    case 'confirming_booking':
    case 'reviewing_job':
    case 'pricing':
    case 'selecting_service':
    case 'entering_pickup':
    case 'entering_dropoff':
      return 'building'
    case 'driver_assigned':
    case 'driver_en_route':
      return 'matched'
    case 'arrived_at_pickup':
    case 'in_transit':
      return 'live'
    default:
      return 'building'
  }
}

export function customerUiModeFromPersistedStatus(
  status: BookingLifecycleStatus | null | undefined,
): BookingMode {
  return customerUiModeFromLifecyclePhase(lifecyclePhaseFromPersistedStatus(status))
}

export function driverMapStageFromPersistedStatus(
  status: BookingLifecycleStatus | null | undefined,
): BookingStage {
  return driverMapStageFromLifecyclePhase(lifecyclePhaseFromPersistedStatus(status))
}

export type LifecycleEtaInput = {
  phase: BookingLifecyclePhase
  driver: BookingDriver | null
  /** Optional route duration in minutes (e.g. from Directions). */
  routeDurationMinutes?: number | null
}

/** Short ETA / status line for job cards and overlays (not a title). */
export function getEtaLabel(input: LifecycleEtaInput): string {
  const { phase, driver, routeDurationMinutes } = input
  switch (phase) {
    case 'pending_match':
      return 'Matching you with someone nearby…'
    case 'match_failed':
      return 'No driver confirmed in time — you can retry or cancel.'
    case 'driver_assigned':
      if (driver?.etaMinutes != null) return `~${driver.etaMinutes} min away`
      return 'A driver is on the way.'
    case 'driver_en_route':
      if (routeDurationMinutes != null) return `~${routeDurationMinutes} min to pickup`
      return 'Heading to your pickup address.'
    case 'arrived_at_pickup':
      return 'Your driver is at the pickup.'
    case 'in_transit':
      return 'Job in progress.'
    case 'completed':
      return 'Thanks for booking with Fetch.'
    default:
      return ''
  }
}

export function getLifecycleJobCardCopy(
  phase: BookingLifecyclePhase,
  driver: BookingDriver | null,
  routeDurationMinutes?: number | null,
): { title: string; line: string } {
  const line = getEtaLabel({ phase, driver, routeDurationMinutes })
  switch (phase) {
    case 'pending_match':
      return { title: 'Finding a driver', line }
    case 'match_failed':
      return { title: 'No driver yet', line }
    case 'driver_assigned':
      return {
        title: 'Driver matched',
        line: driver
          ? `${driver.name} · ~${driver.etaMinutes ?? '—'} min away`
          : line || 'A driver is on the way.',
      }
    case 'driver_en_route':
      return { title: 'On the way', line }
    case 'arrived_at_pickup':
      return { title: 'Arrived', line }
    case 'in_transit':
      return { title: 'In progress', line: 'Loading and clearing your items.' }
    case 'completed':
      return { title: 'Completed', line }
    default:
      return { title: 'Job update', line: '' }
  }
}
