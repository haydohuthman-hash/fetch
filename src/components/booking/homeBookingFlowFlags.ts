import type { BookingState } from '../../lib/assistant'
import {
  isJobDetailsPhase,
  isRouteTerminalPhase,
  refinementDataReady,
  requiresDropoff,
} from '../../lib/assistant'

/**
 * Derives which booking sheet / orb sections are visible from `BookingState.flowStep`
 * and related readiness helpers (used by HomeView orchestration).
 */
export function computeHomeBookingFlowFlags(
  bookingState: BookingState,
  pendingConfirm: unknown,
) {
  const showConfirm = Boolean(pendingConfirm)
  const flowStep = bookingState.flowStep
  const jobType = bookingState.jobType

  const showIntent = !showConfirm && (!jobType || flowStep === 'intent')
  const showPickup = !showConfirm && Boolean(jobType && flowStep === 'pickup')
  const showDropoff = !showConfirm && Boolean(jobType && flowStep === 'dropoff')
  const postAddress =
    !showConfirm && Boolean(jobType) && !showIntent && !showPickup && !showDropoff
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
    showConfirm,
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
