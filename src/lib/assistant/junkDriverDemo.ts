import { isLivePipelinePersistedStatus } from '../booking/bookingLifecycle'
import { deriveFlowStep } from './bookingReadiness'
import type { BookingDriver, BookingLifecycleStatus, BookingState } from './types'

/** Junk: assistant can start search before payment. Other jobs: after payment succeeds or status confirmed. */
export function canBeginDriverSearchDemo(state: BookingState): boolean {
  if (state.pricing == null) return false
  if (state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') return false
  if (state.jobType === 'junkRemoval') {
    return (
      state.junkConfirmStepComplete &&
      (state.bookingStatus == null || state.bookingStatus === 'payment_required')
    )
  }
  return (
    state.paymentIntent?.status === 'succeeded' || state.bookingStatus === 'confirmed'
  )
}

/** @deprecated Use canBeginDriverSearchDemo */
export const canBeginJunkDriverDemo = canBeginDriverSearchDemo

/** Demo handoff: pending_match + searching for a driver. */
export function beginDriverSearchDemo(state: BookingState): BookingState {
  const next: BookingState = {
    ...state,
    bookingStatus: 'pending_match',
    mode: 'searching',
    matchingHandoff: {
      ...state.matchingHandoff,
      requestedAt: Date.now(),
      ready: false,
      payload: state.matchingHandoff.payload,
    },
    bookingId: state.bookingId ?? `demo-${Date.now().toString(36)}`,
  }
  next.flowStep = deriveFlowStep(next)
  return next
}

/** @deprecated Use beginDriverSearchDemo */
export const beginJunkDriverDemo = beginDriverSearchDemo

export function patchBookingLifecycle(
  state: BookingState,
  patch: Partial<Pick<BookingState, 'bookingStatus' | 'mode' | 'driver'>>,
): BookingState {
  const next = { ...state, ...patch } as BookingState
  next.flowStep = deriveFlowStep(next)
  return next
}

export const DEMO_DRIVER: BookingDriver = {
  name: 'Alex M.',
  etaMinutes: 8,
  vehicle: 'Van',
  rating: 4.9,
}

export function isActiveDriverFlow(status: BookingLifecycleStatus | null): boolean {
  return isLivePipelinePersistedStatus(status)
}

/** @deprecated Use isActiveDriverFlow */
export const isActiveJunkDriverFlow = isActiveDriverFlow
