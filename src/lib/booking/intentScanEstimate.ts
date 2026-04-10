import type { BookingState } from '../assistant/types'
import { computePrice, type PricingJobInput } from './quoteEngine'

/**
 * Ballpark junk-removal range for the intent (pre-address) AI scanner.
 * Uses the same quote engine as checkout with zeroed route (junk does not require a route).
 */
export function computeIntentJunkRemovalEstimate(state: BookingState) {
  if (!state.scan.result) return null
  const itemTotal = Object.values(state.itemCounts).reduce((sum, q) => sum + Math.max(0, q || 0), 0)
  if (itemTotal === 0 && (state.detectedItems?.length ?? 0) === 0) return null

  const input: PricingJobInput = {
    jobType: 'junkRemoval',
    serviceType: 'remove',
    distanceMeters: 0,
    durationSeconds: 0,
    pickupAddressText: state.pickupAddressText?.trim() || 'Estimate',
    dropoffAddressText: state.dropoffAddressText?.trim() ?? '',
    detectedItems: state.detectedItems ?? [],
    itemCounts: state.itemCounts ?? {},
    homeBedrooms: state.homeBedrooms,
    moveSize: state.moveSize,
    scanEstimatedSize: state.scan.result.estimatedSize ?? null,
    accessDetails: state.accessDetails,
    accessRisk: state.accessRisk,
    disposalRequired: state.disposalRequired,
    helperHours: state.helperHours,
    helperType: state.helperType,
    cleaningHours: state.cleaningHours,
    cleaningType: state.cleaningType,
    specialItemType: state.specialItemType,
    isHeavyItem: state.isHeavyItem,
    isBulky: state.isBulky,
    needsTwoMovers: state.needsTwoMovers,
    needsSpecialEquipment: state.needsSpecialEquipment,
    specialtyItemSlugs: state.specialtyItemSlugs ?? [],
  }

  const r = computePrice(input)
  return r.ok ? r.pricing : null
}
