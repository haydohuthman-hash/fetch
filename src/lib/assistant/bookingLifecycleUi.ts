import {
  customerUiModeFromPersistedStatus,
  shouldPollPersistedBookingStatus,
} from '../booking/bookingLifecycle'
import type { BookingLifecycleStatus, BookingState } from './types'

/** Map persisted booking status to map/orb UI `mode` (searching / matched / live). */
export function uiModeFromBookingLifecycle(status: BookingLifecycleStatus | null): BookingState['mode'] {
  return customerUiModeFromPersistedStatus(status)
}

export function shouldPollMarketplaceBooking(
  bookingId: string | null,
  status: BookingLifecycleStatus | null,
): boolean {
  if (!bookingId || bookingId.startsWith('demo-')) return false
  if (!status) return false
  return shouldPollPersistedBookingStatus(status)
}
