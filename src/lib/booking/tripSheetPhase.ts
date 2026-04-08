import type { BookingState } from '../assistant/types'
import { isLivePipelinePersistedStatus } from './bookingLifecycle'
import {
  isWireStatusMatching,
  isWireStatusTreatedAsPaid,
} from './bookingWireConstants'

/**
 * Uber-style trip card phase: derived only from booking state + the same UI flags
 * [`HomeView`](../../views/HomeView.tsx) uses for step visibility (no extra server contract).
 *
 * Phase meanings (user-facing copy lives in the sheet, not here):
 * - **idle_intent** — service picker / intent landing.
 * - **confirm_pin** — reserved for pin confirmation flows.
 * - **pickup_address** / **dropoff_address** — address capture (single or dual).
 * - **labor_details** — helper / cleaning hours + task type.
 * - **building_route** — `flowStep === 'route'` before route metrics are ready (transitional).
 * - **confirm_route** — route + addresses ready, optional “continue to scan” before `jobDetailsStarted`.
 * - **job_scan** — photo / item capture step.
 * - **quote_loading** — post-scan, pricing not yet on the sheet.
 * - **review_price** — quote visible, user has not completed payment.
 * - **pay_checkout** — Stripe embedded checkout active (`stripeCheckoutActive`).
 * - **dispatch_pending** — paid + `confirmed`, pre-driver or pre-live UI.
 * - **matching** / **driver_assigned** / **en_route** / **arrived** / **in_progress** — live pipeline.
 * - **completed** / **match_failed** — terminal live outcomes.
 *
 * @see docs/booking-flow-design.md (repo root)
 */
export type TripSheetPhase =
  | 'idle_intent'
  | 'confirm_pin'
  | 'pickup_address'
  | 'dropoff_address'
  | 'labor_details'
  | 'building_route'
  | 'confirm_route'
  | 'job_scan'
  | 'quote_loading'
  | 'review_price'
  | 'pay_checkout'
  | 'dispatch_pending'
  | 'matching'
  | 'driver_assigned'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'match_failed'

export type TripSheetUiFlags = {
  showConfirm: boolean
  /** Pickup + drop-off fields shown together (moving / multi-stop jobs). */
  showDualAddresses: boolean
  showIntent: boolean
  showPickup: boolean
  showDropoff: boolean
  showLaborDetails: boolean
  showRouteReady: boolean
  showBuildingRoute: boolean
  showScanner: boolean
  showPostScan: boolean
  hasSheetPricing: boolean
  stripeCheckoutActive: boolean
}

export function deriveTripSheetPhase(
  state: BookingState,
  f: TripSheetUiFlags,
): TripSheetPhase {
  if (f.showIntent) return 'idle_intent'
  if (f.showConfirm) return 'confirm_pin'
  if (f.showDualAddresses) return 'pickup_address'
  if (f.showPickup) return 'pickup_address'
  if (f.showDropoff) return 'dropoff_address'
  if (f.showLaborDetails) return 'labor_details'
  if (f.showBuildingRoute) return 'building_route'
  if (f.showRouteReady) return 'confirm_route'
  if (f.showScanner) return 'job_scan'
  if (f.showPostScan) {
    const st = state.bookingStatus
    if (st && isLivePipelinePersistedStatus(st)) {
      if (st === 'completed') return 'completed'
      if (st === 'match_failed') return 'match_failed'
      if (isWireStatusMatching(st)) return 'matching'
      if (st === 'matched') return 'driver_assigned'
      if (st === 'en_route') return 'en_route'
      if (st === 'arrived') return 'arrived'
      if (st === 'in_progress') return 'in_progress'
      return 'matching'
    }
    if (!f.hasSheetPricing) return 'quote_loading'
    if (f.stripeCheckoutActive) return 'pay_checkout'
    const paid =
      state.paymentIntent?.status === 'succeeded' ||
      isWireStatusTreatedAsPaid(state.bookingStatus)
    if (paid && state.bookingStatus === 'confirmed') return 'dispatch_pending'
    if (!paid) return 'review_price'
    return 'quote_loading'
  }
  return 'idle_intent'
}

/** Taller sheet snap while the trip narrative is matching or live. */
export function tripSheetPhasePrefersExpandedSnap(phase: TripSheetPhase): boolean {
  return (
    phase === 'matching' ||
    phase === 'dispatch_pending' ||
    phase === 'driver_assigned' ||
    phase === 'en_route' ||
    phase === 'arrived' ||
    phase === 'in_progress' ||
    phase === 'completed' ||
    phase === 'match_failed'
  )
}

/**
 * Phases where the floating voice orb should defer to in-sheet Help (map-first trip mode).
 */
export function tripSheetPhaseSuppressesHomeOrb(phase: TripSheetPhase): boolean {
  return (
    phase === 'dispatch_pending' ||
    phase === 'matching' ||
    phase === 'driver_assigned' ||
    phase === 'en_route' ||
    phase === 'arrived' ||
    phase === 'in_progress' ||
    phase === 'completed' ||
    phase === 'match_failed'
  )
}

/** Customer map stage aligned to trip phase when wire status / mode lag. */
export function mapStageForTripSheetPhase(
  phase: TripSheetPhase,
  fallbackMode: BookingState['mode'],
): 'idle' | 'building' | 'pricing' | 'searching' | 'matched' | 'live' {
  if (phase === 'matching' || phase === 'dispatch_pending') return 'searching'
  if (phase === 'driver_assigned') return 'matched'
  if (phase === 'en_route' || phase === 'arrived' || phase === 'in_progress') return 'live'
  if (fallbackMode === 'searching' || fallbackMode === 'matched' || fallbackMode === 'live') {
    return fallbackMode
  }
  return 'building'
}
