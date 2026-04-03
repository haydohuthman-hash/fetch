import { deriveFlowStep } from './bookingReadiness'
import type { BookingDriver, BookingState } from './types'

export function canBeginJunkDriverDemo(state: BookingState): boolean {
  return (
    state.jobType === 'junkRemoval' &&
    state.junkConfirmStepComplete &&
    state.pricing != null &&
    (state.bookingStatus == null || state.bookingStatus === 'payment_required')
  )
}

/** Demo handoff: dispatching + searching for a driver (no real payment). */
export function beginJunkDriverDemo(state: BookingState): BookingState {
  const next: BookingState = {
    ...state,
    bookingStatus: 'dispatching',
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

export function isActiveJunkDriverFlow(status: BookingState['bookingStatus']): boolean {
  if (status == null) return false
  return (
    status === 'dispatching' ||
    status === 'matched' ||
    status === 'en_route' ||
    status === 'arrived' ||
    status === 'in_progress' ||
    status === 'completed'
  )
}
