import { deriveFlowStep } from '../assistant/bookingReadiness'
import type { BookingDriver, BookingLifecycleStatus, BookingState } from '../assistant/types'
import {
  customerUiModeFromLifecyclePhase,
  driverMapStageFromLifecyclePhase,
  getLifecycleJobCardCopy,
  isRideLifecyclePhase,
  lifecyclePhaseFromBookingRecord,
  lifecyclePhaseFromPersistedStatus,
  type BookingLifecyclePhase,
} from './bookingLifecycle'
import { getNextWireStatus, isWireStatusMatching } from './bookingWireConstants'
import type { BookingRecord } from './types'

/** Canonical session phase (alias of {@link BookingLifecyclePhase}). */
export type BookingSessionPhase = BookingLifecyclePhase

export { wireStatusFromSessionPhase } from './bookingLifecycle'

export const sessionPhaseFromWireStatus = lifecyclePhaseFromPersistedStatus

export const getCustomerMapModeFromPhase = customerUiModeFromLifecyclePhase

export const getDriverMapStageFromPhase = driverMapStageFromLifecyclePhase

export { getNextWireStatus }

export type AdvanceWireActor = 'driver' | 'server' | 'customer'

export function canAdvanceWireStatus(input: {
  current: BookingLifecycleStatus
  next?: BookingLifecycleStatus
  actor: AdvanceWireActor
}): boolean {
  if (input.actor !== 'driver') return false
  const n = getNextWireStatus(input.current)
  if (input.next != null) return n === input.next
  return n != null
}

function prePaymentPhaseFromFlow(state: BookingState): BookingSessionPhase {
  if (!state.jobType) {
    return state.mode === 'idle' ? 'idle' : 'selecting_service'
  }
  const fs = deriveFlowStep(state)
  switch (fs) {
    case 'intent':
      return 'selecting_service'
    case 'pickup':
      return 'entering_pickup'
    case 'dropoff':
      return 'entering_dropoff'
    case 'route':
    case 'refinement':
      return 'reviewing_job'
    case 'quote':
      return state.pricing ? 'pricing' : 'reviewing_job'
    case 'payment':
      return 'confirming_booking'
    case 'dispatch':
      return 'booking_confirmed'
    case 'live':
      if (state.mode === 'searching') return 'pending_match'
      if (state.mode === 'matched') return 'driver_assigned'
      if (state.mode === 'live') return 'driver_en_route'
      return 'pending_match'
  }
}

/**
 * Derives phase from live {@link BookingState}: persisted `bookingStatus` first, then local wizard via
 * {@link deriveFlowStep}.
 */
export function getSessionPhaseFromBookingState(state: BookingState): BookingSessionPhase {
  const w = state.bookingStatus
  if (w === 'completed') return 'completed'
  if (w === 'cancelled') return 'cancelled'
  if (w === 'match_failed') return 'match_failed'
  if (
    (w === 'payment_required' || w === 'confirmed' || w === 'draft') &&
    state.jobType === 'junkRemoval' &&
    state.mode === 'searching'
  ) {
    return 'pending_match'
  }
  if (w === 'payment_required') return 'confirming_booking'
  if (w === 'confirmed') return 'booking_confirmed'
  if (isWireStatusMatching(w)) return 'pending_match'
  if (w === 'matched') return 'driver_assigned'
  if (w === 'en_route') return 'driver_en_route'
  if (w === 'arrived') return 'arrived_at_pickup'
  if (w === 'in_progress') return 'in_transit'
  if (w === 'draft') return prePaymentPhaseFromFlow(state)
  return prePaymentPhaseFromFlow(state)
}

export function getSessionPhaseFromRecord(record: Pick<BookingRecord, 'status' | 'jobType'>): BookingSessionPhase {
  if (record.status === 'draft' && record.jobType == null) return 'idle'
  return lifecyclePhaseFromBookingRecord(record)
}

function representativeWireForRideSessionPhase(phase: BookingSessionPhase): BookingLifecycleStatus | null {
  switch (phase) {
    case 'driver_assigned':
      return 'matched'
    case 'driver_en_route':
      return 'en_route'
    case 'arrived_at_pickup':
      return 'arrived'
    case 'in_transit':
      return 'in_progress'
    default:
      return null
  }
}

export function getNextSessionPhase(phase: BookingSessionPhase): BookingSessionPhase | null {
  const w = representativeWireForRideSessionPhase(phase)
  if (!w) return null
  const next = getNextWireStatus(w)
  return next ? lifecyclePhaseFromPersistedStatus(next) : null
}

export const isJobActive = isRideLifecyclePhase

/**
 * Title + line for job overlays (consolidates legacy `junkLiveJobCopy`); duration is converted to minutes for ETA text.
 */
export function getSessionPhaseJobCard(input: {
  phase: BookingSessionPhase
  driver?: BookingDriver | null
  durationSeconds?: number | null
}): { title: string; line: string } {
  const routeDurationMinutes =
    input.durationSeconds != null && Number.isFinite(input.durationSeconds)
      ? Math.max(1, Math.round(input.durationSeconds / 60))
      : null
  return getLifecycleJobCardCopy(input.phase, input.driver ?? null, routeDurationMinutes)
}
