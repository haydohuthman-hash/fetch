/**
 * Optional structured booking hints from `/api/fetch-ai/chat` (validated client + server).
 * Client geocodes address strings; never trust raw coordinates from the model in v1.
 */
export type FetchAiBookingPatchJobType =
  | 'junkRemoval'
  | 'homeMoving'
  | 'deliveryPickup'
  | 'heavyItem'
  | 'helper'
  | 'cleaning'

export type FetchAiBookingPatch = {
  jobType?: FetchAiBookingPatchJobType
  pickupAddressText?: string
  dropoffAddressText?: string
  /** When true, client should surface the home booking sheet + map (e.g. after closing brain). */
  openBookingOnMap?: boolean
}

const JOB_TYPES = new Set<FetchAiBookingPatchJobType>([
  'junkRemoval',
  'homeMoving',
  'deliveryPickup',
  'heavyItem',
  'helper',
  'cleaning',
])

const ADDR_MAX = 220

function trimAddr(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined
  const t = s.trim().slice(0, ADDR_MAX)
  return t.length > 0 ? t : undefined
}

/** Parse and validate bookingPatch from API JSON (defensive). */
export function parseFetchAiBookingPatch(raw: unknown): FetchAiBookingPatch | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const out: FetchAiBookingPatch = {}
  const jt = o.jobType
  if (typeof jt === 'string' && JOB_TYPES.has(jt as FetchAiBookingPatchJobType)) {
    out.jobType = jt as FetchAiBookingPatchJobType
  }
  const pu = trimAddr(o.pickupAddressText)
  if (pu) out.pickupAddressText = pu
  const dr = trimAddr(o.dropoffAddressText)
  if (dr) out.dropoffAddressText = dr
  if (o.openBookingOnMap === true) out.openBookingOnMap = true
  if (!out.jobType && !out.pickupAddressText && !out.dropoffAddressText) return null
  if (out.openBookingOnMap === true && !out.jobType && !out.pickupAddressText) return null
  return out
}
