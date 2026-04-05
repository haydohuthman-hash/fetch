import { patchMarketplaceOffer, upsertMarketplaceOffer } from '../booking/api'

export type DeclineDispatchParams = {
  bookingId: string
  driverId: string
  offerId?: string
}

/** Record a declined offer so this job stops surfacing for the driver. */
export async function declineDispatchOffer({
  bookingId,
  driverId,
  offerId = `${driverId}_${bookingId}`,
}: DeclineDispatchParams) {
  await upsertMarketplaceOffer({
    offerId,
    bookingId,
    driverId,
    status: 'pending',
  })
  await patchMarketplaceOffer(offerId, { status: 'declined' })
}
