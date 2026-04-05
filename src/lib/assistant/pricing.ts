import type { BookingPriceRange, BookingPricing, BookingQuoteBreakdown, BookingState } from './types'
import { computePriceForState, type ComputePriceOptions } from '../booking/quoteEngine'

export type { ComputePriceOptions, ComputePriceResult } from '../booking/quoteEngine'
export {
  computePrice,
  computePriceForDraft,
  computePriceForState,
  draftToPricingInput,
  resolveRouteMetrics,
  stateToPricingInput,
} from '../booking/quoteEngine'

/** @deprecated Prefer `computePriceForState` for explicit errors. */
export function computeBookingQuoteBreakdown(
  state: BookingState,
  options?: ComputePriceOptions,
): BookingQuoteBreakdown | null {
  const r = computePriceForState(state, options)
  return r.ok ? r.breakdown : null
}

/** @deprecated Prefer `computePriceForState` for explicit errors. */
export function computeBookingPricing(
  state: BookingState,
  options?: ComputePriceOptions,
): BookingPricing | null {
  const r = computePriceForState(state, options)
  return r.ok ? r.pricing : null
}

export function computeBookingPriceRange(
  state: BookingState,
  options?: ComputePriceOptions,
): BookingPriceRange | null {
  const fromState = state.pricing
  const r = computePriceForState(state, options)
  const pricing = fromState ?? (r.ok ? r.pricing : null)
  if (!pricing) return null
  return {
    min: pricing.minPrice,
    max: pricing.maxPrice,
    estimatedDurationMin: Math.round(pricing.estimatedDuration / 60),
  }
}
