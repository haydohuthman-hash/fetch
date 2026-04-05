/**
 * Driver accept + lifecycle: PATCH offer to accepted, then PATCH booking to matched
 * with matchedDriver, assignedDriverId, and driverControlled so server demo timers
 * do not fight manual status updates (see server marketplace-store applyBookingLifecycle).
 */
import type { BookingDriver, BookingLifecycleStatus } from '../assistant/types'
import { patchBookingStatus, patchMarketplaceOffer, upsertMarketplaceOffer } from '../booking/api'

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

const PROGRESSION: Array<{ from: BookingLifecycleStatus; to: BookingLifecycleStatus }> = [
  { from: 'matched', to: 'en_route' },
  { from: 'en_route', to: 'arrived' },
  { from: 'arrived', to: 'in_progress' },
  { from: 'in_progress', to: 'completed' },
]

export function nextDriverStatus(current: BookingLifecycleStatus): BookingLifecycleStatus | null {
  const step = PROGRESSION.find((s) => s.from === current)
  return step?.to ?? null
}
