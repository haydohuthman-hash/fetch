import type { BookingCoords, BookingFlowStep, BookingJobType, BookingState } from './types'

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
  return (
    state.distanceMeters != null &&
    state.durationSeconds != null &&
    Boolean(state.route)
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

function isAdvancedBookingLifecycle(status: BookingState['bookingStatus']): boolean {
  return (
    status === 'payment_required' ||
    status === 'confirmed' ||
    status === 'dispatching' ||
    status === 'matched' ||
    status === 'en_route' ||
    status === 'arrived' ||
    status === 'in_progress' ||
    status === 'completed'
  )
}

/**
 * Route confirmation card: addresses (+ route) done, user has not tapped Next yet.
 */
export function isRouteTerminalPhase(state: BookingState): boolean {
  if (!isAddressAndRouteCheckpointComplete(state)) return false
  if (state.jobDetailsStarted) return false
  if (state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') return false
  if (isAdvancedBookingLifecycle(state.bookingStatus)) return false
  return true
}

/** Item / scan / describe step after route Next. */
export function isJobDetailsPhase(state: BookingState): boolean {
  if (!isAddressAndRouteCheckpointComplete(state)) return false
  if (!state.jobDetailsStarted) return false
  if (state.mode === 'pricing' || state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') {
    return false
  }
  if (state.pricing != null || state.bookingStatus === 'payment_required') return false
  if (isAdvancedBookingLifecycle(state.bookingStatus)) return false
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
  if (isAdvancedBookingLifecycle(state.bookingStatus)) return false
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
  if (state.bookingStatus === 'payment_required' || isAdvancedBookingLifecycle(state.bookingStatus)) {
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
  if (state.bookingStatus === 'payment_required' || isAdvancedBookingLifecycle(state.bookingStatus)) {
    return false
  }
  return true
}

/** Items / helper details collected (scanner-first for non-helper). */
export function refinementDataReady(state: BookingState): boolean {
  if (state.jobType === 'helper') {
    return state.helperHours != null && Boolean(state.helperType?.trim())
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
  if (state.jobType === 'helper') {
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
    state.paymentIntent?.status === 'succeeded' ||
    state.bookingStatus === 'confirmed' ||
    state.bookingStatus === 'dispatching' ||
    state.bookingStatus === 'matched' ||
    state.bookingStatus === 'en_route' ||
    state.bookingStatus === 'arrived' ||
    state.bookingStatus === 'in_progress' ||
    state.bookingStatus === 'completed'
  if (!paid) return 'payment'
  if (state.bookingStatus === 'confirmed') return 'dispatch'
  if (
    state.bookingStatus === 'dispatching' ||
    state.bookingStatus === 'matched' ||
    state.bookingStatus === 'en_route' ||
    state.bookingStatus === 'arrived' ||
    state.bookingStatus === 'in_progress' ||
    state.bookingStatus === 'completed'
  ) {
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
  if (!pickupCoordsReady(state)) return false
  if (!dropoffCoordsReady(state)) return false
  if (!routeComputedReady(state)) return false
  if (!refinementDataReady(state)) return false
  if (!junkDisposalResolved(state)) return false
  if (!accessDetailsComplete(state)) return false
  return true
}
