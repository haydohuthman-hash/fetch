/**
 * Driver accept + lifecycle: PATCH offer to accepted, then PATCH booking to matched
 * with matchedDriver, assignedDriverId, and driverControlled so server demo timers
 * do not fight manual status updates (see server marketplace-store applyBookingLifecycle).
 */
import type { BookingDriver, BookingLifecycleStatus } from '../assistant/types'
import { patchBookingStatus, patchMarketplaceOffer, upsertMarketplaceOffer } from '../booking/api'
import { getNextPersistedJobStatus } from '../booking/bookingLifecycle'

export type AcceptDispatchParams = {
  bookingId: string
  driverId: string
  matchedDriver: BookingDriver
  /** Defaults to `${driverId}_offer` */
  offerId?: string
}

export async function acceptDispatchOffer({
  bookingId,
  driverId,
  matchedDriver,
  offerId = `${driverId}_${bookingId}`,
}: AcceptDispatchParams) {
  await upsertMarketplaceOffer({
    offerId,
    bookingId,
    driverId,
    status: 'pending',
  })
  await patchMarketplaceOffer(offerId, { status: 'accepted' })
  await patchBookingStatus(bookingId, {
    status: 'matched',
    matchedDriver,
    assignedDriverId: driverId,
    driverControlled: true,
  })
}

export function nextDriverStatus(current: BookingLifecycleStatus): BookingLifecycleStatus | null {
  return getNextPersistedJobStatus(current)
}
