import { driverMapStageFromPersistedStatus } from '../booking/bookingLifecycle'
import type { BookingLifecycleStatus, BookingStage } from '../assistant/types'

/**
 * Maps server booking lifecycle to driver map stages (shared phase model in {@link driverMapStageFromPersistedStatus}).
 */
export function bookingLifecycleToMapStage(status: BookingLifecycleStatus | null | undefined): BookingStage {
  return driverMapStageFromPersistedStatus(status)
}
