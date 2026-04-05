import type { BookingRecord } from '../booking/types'

export type DriverEarningsSummary = {
  completedCount: number
  /** Demo: sum of booking maxPrice AUD for jobs you completed. */
  totalAud: number
  recent: BookingRecord[]
}

export function summarizeDriverEarnings(
  bookings: BookingRecord[],
  myDriverId: string,
  recentLimit = 8,
): DriverEarningsSummary {
  const mine = bookings.filter(
    (b) => b.status === 'completed' && b.assignedDriverId === myDriverId,
  )
  let totalAud = 0
  for (const b of mine) {
    const max = b.pricing?.maxPrice
    if (typeof max === 'number' && Number.isFinite(max)) totalAud += max
  }
  return {
    completedCount: mine.length,
    totalAud,
    recent: mine.slice(0, recentLimit),
  }
}
