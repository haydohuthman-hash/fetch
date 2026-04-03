import {
  isAddressAndRouteCheckpointComplete,
  pickupCoordsReady,
  requiresDropoff,
  routeComputedReady,
} from './bookingReadiness'
import type { BookingState } from './types'

type QuestionPlan = {
  question: string | null
  suggestions: string[]
}

/**
 * Booking entry stops after verified pickup (+ dropoff + route when required).
 * No scan, pricing, payment, or follow-up prompts.
 */
export function deriveNextQuestion(state: BookingState): QuestionPlan {
  if (state.mode === 'searching' || state.mode === 'matched' || state.mode === 'live') {
    return { question: null, suggestions: [] }
  }

  if (state.bookingStatus === 'payment_required') {
    return { question: 'Secure this booking with payment.', suggestions: [] }
  }

  if (state.bookingStatus === 'confirmed') {
    return { question: 'Ready to dispatch?', suggestions: ['Find driver'] }
  }

  if (!state.jobType) {
    return {
      question: 'What type of job is this?',
      suggestions: [
        'Junk removal',
        'Delivery / pickup',
        'Heavy item',
        'Home moving',
        'Helper',
      ],
    }
  }

  if (!state.pickupAddressText.trim()) {
    return { question: 'Where are we picking up from?', suggestions: [] }
  }
  if (!pickupCoordsReady(state)) {
    return { question: 'Choose the pickup so I can place it on the map.', suggestions: [] }
  }

  if (requiresDropoff(state.jobType)) {
    if (!state.dropoffAddressText.trim()) {
      return { question: "Nice — where's it going?", suggestions: [] }
    }
    if (!state.dropoffCoords) {
      return { question: 'Choose the drop-off so I can build the route.', suggestions: [] }
    }
    if (!routeComputedReady(state)) {
      return { question: 'Mapping your route…', suggestions: [] }
    }
  }

  if (isAddressAndRouteCheckpointComplete(state)) {
    if (!state.jobDetailsStarted) {
      return { question: 'Route ready', suggestions: [] }
    }
    if (!state.jobDetailsScanStepComplete) {
      return {
        question: 'What are we moving?',
        suggestions: [],
      }
    }
    if (state.jobType === 'junkRemoval' && !state.junkAccessStepComplete) {
      return { question: 'Access details', suggestions: [] }
    }
    if (
      state.jobType === 'junkRemoval' &&
      state.junkAccessStepComplete &&
      state.pricing &&
      !state.junkQuoteAcknowledged
    ) {
      return { question: 'Your junk pickup quote', suggestions: [] }
    }
    if (
      state.jobType === 'junkRemoval' &&
      state.junkQuoteAcknowledged &&
      state.pricing &&
      !state.junkConfirmStepComplete
    ) {
      return { question: 'Confirm your booking', suggestions: [] }
    }
  }

  return { question: null, suggestions: [] }
}
