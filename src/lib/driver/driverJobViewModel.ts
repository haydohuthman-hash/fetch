import { isTerminalPersistedStatus } from '../booking/bookingLifecycle'
import { isWireStatusMatching } from '../booking/bookingWireConstants'
import type { BookingRecord, MarketplaceOffer } from '../booking/types'
import type { BookingJobType } from '../assistant/types'
import type { DriverJobViewModel } from './types'

function jobTypeLabel(jobType: BookingJobType | null): string | null {
  if (!jobType) return null
  const map: Record<BookingJobType, string> = {
    junkRemoval: 'Junk removal',
    deliveryPickup: 'Delivery / pickup',
    heavyItem: 'Heavy item',
    homeMoving: 'Home moving',
    helper: 'Helper',
    cleaning: 'Cleaning',
  }
  return map[jobType] ?? jobType
}

function routeSummaryFromRecord(booking: BookingRecord): string | null {
  const r = booking.route
  const dm = r?.distanceMeters ?? null
  const ds = r?.durationSeconds ?? null
  if (dm != null && ds != null) {
    return `${(dm / 1000).toFixed(1)} km · ~${Math.round(ds / 60)} min`
  }
  if (dm != null) return `${(dm / 1000).toFixed(1)} km`
  if (ds != null) return `~${Math.round(ds / 60)} min`
  return null
}

function pricingSummary(booking: BookingRecord): string | null {
  const p = booking.pricing
  if (!p) return null
  if (p.totalPrice != null) {
    return `$${p.totalPrice} ${p.currency} (${p.minPrice}–${p.maxPrice})`
  }
  return `$${p.minPrice}–$${p.maxPrice} ${p.currency}`
}

export function toDriverJobViewModel(booking: BookingRecord): DriverJobViewModel {
  const tl = booking.timeline?.[0]
  return {
    id: booking.id,
    status: booking.status,
    jobTypeLabel: jobTypeLabel(booking.jobType),
    pickupAddressText: booking.pickupAddressText,
    dropoffAddressText: booking.dropoffAddressText,
    pickupCoords: booking.pickupCoords,
    dropoffCoords: booking.dropoffCoords,
    routeSummary: routeSummaryFromRecord(booking),
    pricingSummary: pricingSummary(booking),
    matchedDriver: booking.matchedDriver ?? null,
    lastTimelineTitle: tl?.title ?? null,
    lastTimelineAt: tl?.createdAt ?? null,
    assignedDriverId: booking.assignedDriverId ?? null,
    driverControlled: Boolean(booking.driverControlled),
  }
}

export function isTerminalBookingStatus(status: BookingRecord['status']): boolean {
  return isTerminalPersistedStatus(status)
}

/** Open dispatch pool: paid + matching, not assigned to another driver. */
export function isAvailableDispatchJob(booking: BookingRecord, myDriverId: string): boolean {
  if (!isWireStatusMatching(booking.status)) return false
  const assigned = booking.assignedDriverId
  if (assigned && assigned !== myDriverId) return false
  const pinged = booking.matchingMeta?.activeDriverId
  if (pinged && pinged !== myDriverId) return false
  return true
}

export function hasMyAcceptedOffer(bookingId: string, offers: MarketplaceOffer[], myDriverId: string): boolean {
  return offers.some(
    (o) => o.bookingId === bookingId && o.driverId === myDriverId && o.status === 'accepted',
  )
}

export function myPendingOfferForBooking(
  bookingId: string,
  offers: MarketplaceOffer[],
  myDriverId: string,
): MarketplaceOffer | undefined {
  return offers.find(
    (o) => o.bookingId === bookingId && o.driverId === myDriverId && o.status === 'pending',
  )
}

export function filterMyActiveJobs(
  bookings: BookingRecord[],
  offers: MarketplaceOffer[],
  myDriverId: string,
): BookingRecord[] {
  return bookings.filter((b) => {
    if (isTerminalBookingStatus(b.status)) return false
    if (b.assignedDriverId === myDriverId) return true
    return hasMyAcceptedOffer(b.id, offers, myDriverId)
  })
}

function hasMyDeclinedOffer(bookingId: string, offers: MarketplaceOffer[], myDriverId: string): boolean {
  return offers.some(
    (o) => o.bookingId === bookingId && o.driverId === myDriverId && o.status === 'declined',
  )
}

export function filterAvailableJobs(
  bookings: BookingRecord[],
  offers: MarketplaceOffer[],
  myDriverId: string,
): BookingRecord[] {
  return bookings.filter((b) => {
    if (!isAvailableDispatchJob(b, myDriverId)) return false
    if (b.assignedDriverId === myDriverId) return false
    if (hasMyDeclinedOffer(b.id, offers, myDriverId)) return false
    const acceptedByOther = offers.some(
      (o) => o.bookingId === b.id && o.driverId !== myDriverId && o.status === 'accepted',
    )
    if (acceptedByOther) return false
    if (hasMyAcceptedOffer(b.id, offers, myDriverId)) return false
    return true
  })
}
