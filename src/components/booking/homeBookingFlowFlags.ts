import type { BookingState } from '../../lib/assistant'
import {
  isJobDetailsPhase,
  isRouteTerminalPhase,
  refinementDataReady,
  requiresDropoff,
} from '../../lib/assistant'

/**
 * Derives which booking sheet / orb sections are visible from `BookingState.flowStep`
 * and related readiness helpers (mirrors `HomeView` orchestration).
 *
 * @see ../../../docs/booking-flow-design.md
 */
export function computeHomeBookingFlowFlags(bookingState: BookingState) {
  const flowStep = bookingState.flowStep
  const jobType = bookingState.jobType

  const showDualAddresses = Boolean(
    jobType && requiresDropoff(jobType) && (flowStep === 'pickup' || flowStep === 'dropoff'),
  )
  const showIntent = !jobType || flowStep === 'intent'
  const showPickup = Boolean(jobType && flowStep === 'pickup' && !showDualAddresses)
  const showDropoff = Boolean(jobType && flowStep === 'dropoff' && !showDualAddresses)
  const postAddress =
    Boolean(jobType) && !showIntent && !showPickup && !showDropoff && !showDualAddresses
  const laborJob = jobType === 'helper' || jobType === 'cleaning'
  const showLaborDetails =
    postAddress &&
    laborJob &&
    bookingState.mode === 'building' &&
    !refinementDataReady(bookingState) &&
    bookingState.pricing == null
  const showRouteReady = postAddress && isRouteTerminalPhase(bookingState)
  const showScanner = postAddress && isJobDetailsPhase(bookingState)
  const showBuildingRoute =
    postAddress && flowStep === 'route' && jobType != null && requiresDropoff(jobType)
  const showPostScan =
    postAddress &&
    !showRouteReady &&
    !showScanner &&
    !showBuildingRoute &&
    !showLaborDetails

  return {
    showConfirm: false,
    showDualAddresses,
    showIntent,
    showPickup,
    showDropoff,
    postAddress,
    laborJob,
    showLaborDetails,
    showRouteReady,
    showScanner,
    showBuildingRoute,
    showPostScan,
  }
}
