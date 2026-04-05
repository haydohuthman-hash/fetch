import type { BookingCoords, BookingDriver, BookingLifecycleStatus } from '../assistant/types'

export type { MarketplaceOffer, MarketplaceOfferStatus } from '../booking/types'

export type DriverJobViewModel = {
  id: string
  status: BookingLifecycleStatus
  jobTypeLabel: string | null
  pickupAddressText: string
  dropoffAddressText: string
  pickupCoords: BookingCoords | null
  dropoffCoords: BookingCoords | null
  /** Short summary for cards, e.g. distance or price band */
  routeSummary: string | null
  pricingSummary: string | null
  matchedDriver: BookingDriver | null
  lastTimelineTitle: string | null
  lastTimelineAt: number | null
  assignedDriverId: string | null
  driverControlled: boolean
}
