import type { BookingState } from '../assistant/types'
import { computePrice, type PricingJobInput } from './quoteEngine'

/**
 * Distance-based delivery price: $79 local (< ~15 km) scaling to $200 (~80 km+).
 * Accepts either route distance or raw coords for haversine fallback.
 */
export function computeDeliveryEstimate(
  distanceMeters: number | null,
  coords?: {
    pickup: { lat: number; lng: number }
    dropoff: { lat: number; lng: number }
  },
): { minPrice: number; maxPrice: number } | null {
  let km: number | null = null

  if (distanceMeters != null && Number.isFinite(distanceMeters) && distanceMeters > 0) {
    km = distanceMeters / 1000
  } else if (coords?.pickup && coords?.dropoff) {
    km = haversineKm(coords.pickup, coords.dropoff)
  }

  if (km == null || km < 0.2) return null

  const BASE = 79
  const MAX = 200
  const LONG_KM = 80

  const raw = BASE + ((MAX - BASE) * Math.min(km, LONG_KM)) / LONG_KM
  const center = Math.round(raw)
  const spread = Math.max(8, Math.round(center * 0.12))

  return {
    minPrice: Math.max(BASE, center - spread),
    maxPrice: Math.min(MAX + 20, center + spread),
  }
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

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
