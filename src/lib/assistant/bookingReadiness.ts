import { isWizardLockedByPersistedStatus } from '../booking/bookingLifecycle'
import {
  isWireStatusInLiveRideStep,
  isWireStatusTreatedAsPaid,
} from '../booking/bookingWireConstants'
import { haversineMeters } from '../homeDirections'
import type { BookingCoords, BookingFlowStep, BookingJobType, BookingState } from './types'

/** Wizard readiness (addresses, route, scan, junk gates, pricing). @see docs/booking-flow-design.md */

const ENDPOINT_MATCH_MAX_M = 220
const PROVISIONAL_ROAD_FACTOR = 1.18
const PROVISIONAL_AVG_SPEED_MPS = 7.5

export function isLaborJobType(jobType: BookingJobType | null): boolean {
  return jobType === 'helper' || jobType === 'cleaning'
}

export function requiresDropoff(jobType: BookingJobType | null): boolean {
  return jobType === 'deliveryPickup' || jobType === 'heavyItem' || jobType === 'homeMoving'
}

export function pickupCoordsReady(state: BookingState): boolean {
  return Boolean(state.pickupCoords)
}

export function dropoffCoordsReady(state: BookingState): boolean {
  if (!requiresDropoff(state.jobType)) return true
  return Boolean(state.dropoffCoords)
}

export function routeComputedReady(state: BookingState): boolean {
  if (!requiresDropoff(state.jobType)) return true
  const path = state.route?.path
  return (
    state.distanceMeters != null &&
    state.durationSeconds != null &&
    Array.isArray(path) &&
    path.length >= 2
  )
}

/** Pickup verified, and dropoff+route when that job type needs them. */
export function isAddressAndRouteCheckpointComplete(state: BookingState): boolean {
  if (!state.jobType) return false
  if (!pickupCoordsReady(state)) return false
  if (requiresDropoff(state.jobType)) {
    return dropoffCoordsReady(state) && routeComputedReady(state)
  }
  return true
}


/**
 * Route confirmation card: addresses (+ route) done, user has not tapped Next yet.
 */
export function isRouteTerminalPhase(state: BookingState): boolean {
  if (!isAddressAndRouteCheckpointComplete(state)) return false
  if (isLaborJobType(state.jobType)) return false
  if (state.jobDetailsStarted) return false
  if (state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') return false
  if (isWizardLockedByPersistedStatus(state.bookingStatus)) return false
  return true
}

/** Item / scan / describe step after route Next. */
export function isJobDetailsPhase(state: BookingState): boolean {
  if (!isAddressAndRouteCheckpointComplete(state)) return false
  if (isLaborJobType(state.jobType)) return false
  if (!state.jobDetailsStarted) return false
  if (state.mode === 'pricing' || state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') {
    return false
  }
  if (state.pricing != null || state.bookingStatus === 'payment_required') return false
  if (isWizardLockedByPersistedStatus(state.bookingStatus)) return false
  if (state.jobType === 'junkRemoval') {
    return !state.jobDetailsScanStepComplete
  }
  if (state.jobDetailsScanStepComplete) return false
  return true
}

/** Junk only: photo scan done, collecting access details before quote. */
export function isJunkAccessPhase(state: BookingState): boolean {
  if (state.jobType !== 'junkRemoval') return false
  if (!isAddressAndRouteCheckpointComplete(state)) return false
  if (!state.jobDetailsStarted) return false
  if (!state.jobDetailsScanStepComplete) return false
  if (state.junkAccessStepComplete) return false
  if (state.mode === 'pricing' || state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') {
    return false
  }
  if (state.pricing != null || state.bookingStatus === 'payment_required') return false
  if (isWizardLockedByPersistedStatus(state.bookingStatus)) return false
  return true
}

/** Junk only: quote computed; user reviews before confirmation / payment. */
export function isJunkQuotePhase(state: BookingState): boolean {
  if (state.jobType !== 'junkRemoval') return false
  if (!state.junkAccessStepComplete) return false
  if (state.junkQuoteAcknowledged) return false
  if (state.pricing == null || state.quoteBreakdown == null) return false
  if (state.mode === 'pricing' || state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') {
    return false
  }
  if (state.bookingStatus === 'payment_required' || isWizardLockedByPersistedStatus(state.bookingStatus)) {
    return false
  }
  return true
}

/** Junk only: past quote; reviewing full summary before payment. */
export function isJunkBookingConfirmPhase(state: BookingState): boolean {
  if (state.jobType !== 'junkRemoval') return false
  if (!state.junkQuoteAcknowledged) return false
  if (state.junkConfirmStepComplete) return false
  if (state.pricing == null || state.quoteBreakdown == null) return false
  if (state.mode === 'pricing' || state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') {
    return false
  }
  if (state.bookingStatus === 'payment_required' || isWizardLockedByPersistedStatus(state.bookingStatus)) {
    return false
  }
  return true
}

/** Items / helper details collected (scanner-first for non-helper). */
export function refinementDataReady(state: BookingState): boolean {
  if (state.jobType === 'helper') {
    return state.helperHours != null && Boolean(state.helperType?.trim())
  }
  if (state.jobType === 'cleaning') {
    return state.cleaningHours != null && Boolean(state.cleaningType?.trim())
  }
  if (state.jobType === 'junkRemoval') {
    return state.jobDetailsScanStepComplete && state.scan.images.length > 0
  }
  return state.detectedItems.length > 0
}

export function accessDetailsRelevant(state: BookingState): boolean {
  if (state.jobType === 'junkRemoval' || state.jobType === 'heavyItem') return true
  if (state.jobType === 'homeMoving' || state.jobType === 'deliveryPickup') return true
  return false
}

export function accessDetailsComplete(state: BookingState): boolean {
  if (!accessDetailsRelevant(state)) return true
  const a = state.accessDetails
  return (
    a.stairs != null && a.lift != null && a.carryDistance != null && a.disassembly != null
  )
}

export function junkDisposalResolved(state: BookingState): boolean {
  if (state.jobType !== 'junkRemoval') return true
  return state.disposalRequired != null
}

function endpointsMatchPickDrop(
  path: BookingCoords[],
  pickup: BookingCoords,
  dropoff: BookingCoords,
): boolean {
  if (path.length < 2) return false
  const a = path[0]!
  const b = path[path.length - 1]!
  return (
    haversineMeters(a, pickup) < ENDPOINT_MATCH_MAX_M &&
    haversineMeters(b, dropoff) < ENDPOINT_MATCH_MAX_M
  )
}

/**
 * Straight-line route + rough drive time so the flow can leave the “building route” step
 * before Google Directions finishes.
 */
export function applyProvisionalStraightRouteToBookingState(state: BookingState): BookingState {
  const p = state.pickupCoords
  const d = state.dropoffCoords
  if (!p || !d) return state
  const straightM = Math.max(1, haversineMeters(p, d))
  const distanceMeters = Math.max(1, Math.round(straightM * PROVISIONAL_ROAD_FACTOR))
  const durationSeconds = Math.max(60, Math.round(distanceMeters / PROVISIONAL_AVG_SPEED_MPS))
  const path: BookingCoords[] = [{ lat: p.lat, lng: p.lng }, { lat: d.lat, lng: d.lng }]
  const next: BookingState = {
    ...state,
    route: {
      path,
      distanceMeters,
      durationSeconds,
      provisional: true,
    },
    distanceMeters,
    durationSeconds,
  }
  next.flowStep = deriveFlowStep(next)
  return next
}

/**
 * Ensures drop-off jobs have a usable route in state whenever both coords exist.
 * Keeps a completed non-provisional Directions path until pickup/drop-off stops change.
 */
export function applyProvisionalRouteIfNeeded(state: BookingState): BookingState {
  if (!requiresDropoff(state.jobType)) return state
  const p = state.pickupCoords
  const d = state.dropoffCoords
  if (!p || !d) return state
  const r = state.route
  const path = r?.path
  if (
    r &&
    Array.isArray(path) &&
    path.length >= 2 &&
    endpointsMatchPickDrop(path, p, d)
  ) {
    return state
  }
  return applyProvisionalStraightRouteToBookingState(state)
}

/** Merge Google Directions result into booking state and refresh `flowStep`. */
export function applyDirectionsToBookingState(
  state: BookingState,
  path: BookingCoords[],
  distanceMeters: number,
  durationSeconds: number,
): BookingState {
  const next: BookingState = {
    ...state,
    route: {
      path,
      distanceMeters,
      durationSeconds,
      provisional: false,
    },
    distanceMeters,
    durationSeconds,
  }
  next.flowStep = deriveFlowStep(next)
  return next
}

/**
 * High-level flow step for map/card orchestration (intent → addresses → route → scan/refine → quote…).
 */
export function deriveFlowStep(state: BookingState): BookingFlowStep {
  if (!state.jobType) return 'intent'
  if (!pickupCoordsReady(state)) return 'pickup'
  if (!dropoffCoordsReady(state)) return 'dropoff'
  if (!routeComputedReady(state)) return 'route'
  if (state.jobType === 'helper' || state.jobType === 'cleaning') {
    if (!refinementDataReady(state)) return 'refinement'
  } else {
    if (!refinementDataReady(state)) return 'refinement'
    if (!junkDisposalResolved(state)) return 'refinement'
    if (!accessDetailsComplete(state)) return 'refinement'
  }
  if (!state.pricing) return 'quote'
  if (
    state.jobType === 'junkRemoval' &&
    (!state.junkQuoteAcknowledged || !state.junkConfirmStepComplete)
  ) {
    return 'quote'
  }
  const paid =
    state.paymentIntent?.status === 'succeeded' || isWireStatusTreatedAsPaid(state.bookingStatus)
  if (!paid) return 'payment'
  if (state.bookingStatus === 'confirmed') return 'dispatch'
  if (isWireStatusInLiveRideStep(state.bookingStatus)) {
    return 'live'
  }
  return 'quote'
}

export function readyForPricing(state: BookingState): boolean {
  if (!state.jobType) return false
  if (state.jobType === 'helper') {
    return (
      Boolean(state.pickupCoords) &&
      state.helperHours != null &&
      Boolean(state.helperType?.trim())
    )
  }
  if (state.jobType === 'cleaning') {
    return (
      Boolean(state.pickupCoords) &&
      state.cleaningHours != null &&
      Boolean(state.cleaningType?.trim())
    )
  }
  if (!pickupCoordsReady(state)) return false
  if (!dropoffCoordsReady(state)) return false
  if (!routeComputedReady(state)) return false
  if (!refinementDataReady(state)) return false
  if (!junkDisposalResolved(state)) return false
  if (!accessDetailsComplete(state)) return false
  return true
}
