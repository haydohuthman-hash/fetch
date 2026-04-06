/**
 * Optional structured booking hints from `/api/fetch-ai/chat` (validated client + server).
 * Client geocodes address strings; never trust raw coordinates from the model in v1.
 */
import { countSpecialtySlugs, normalizeSpecialtySlug } from './booking/specialtyItemCatalog'

export type FetchAiBookingPatchJobType =
  | 'junkRemoval'
  | 'homeMoving'
  | 'deliveryPickup'
  | 'heavyItem'
  | 'helper'
  | 'cleaning'

export type FetchAiSpecialtyItemPatch = {
  slug: string
  quantity?: number
}

export type FetchAiBookingPatch = {
  jobType?: FetchAiBookingPatchJobType
  pickupAddressText?: string
  dropoffAddressText?: string
  /** When true, client should surface the home booking sheet + map (e.g. after closing brain). */
  openBookingOnMap?: boolean
  /** User wants immediate dispatch vs planning ahead. */
  schedulePreference?: 'asap' | 'scheduled'
  /** When scheduled: short window description from the user. */
  scheduledWindowText?: string
  /** Multi-stop, extra pickups/dropoffs, or multiple jobs — narrative for the quote card. */
  extraStopsNote?: string
  /**
   * Bulky / specialty goods the user mentioned (whitelist slugs only).
   * Quantities are merged with existing `BookingState.specialtyItemSlugs` (capped per slug).
   */
  specialtyItems?: FetchAiSpecialtyItemPatch[]
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
const SPECIALTY_PATCH_MAX = 12

function trimAddr(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined
  const t = s.trim().slice(0, ADDR_MAX)
  return t.length > 0 ? t : undefined
}

function parseSpecialtyItems(raw: unknown): FetchAiSpecialtyItemPatch[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: FetchAiSpecialtyItemPatch[] = []
  for (const row of raw.slice(0, SPECIALTY_PATCH_MAX)) {
    if (row == null || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const slugRaw = typeof o.slug === 'string' ? o.slug : ''
    const slug = normalizeSpecialtySlug(slugRaw)
    if (!slug) continue
    let qty = 1
    if (typeof o.quantity === 'number' && Number.isFinite(o.quantity)) {
      qty = Math.max(1, Math.min(5, Math.floor(o.quantity)))
    }
    out.push({ slug, quantity: qty })
  }
  return out.length > 0 ? out : undefined
}

/** Merge validated specialty patch lines into flat slug list (duplicates = quantity). */
export function mergeSpecialtyItemSlugs(
  existing: readonly string[] | undefined | null,
  patch: FetchAiSpecialtyItemPatch[] | undefined | null,
): string[] {
  if (!patch?.length) return [...(existing ?? [])]
  const counts = countSpecialtySlugs(existing)
  for (const row of patch) {
    const slug = normalizeSpecialtySlug(row.slug)
    if (!slug) continue
    const q = Math.max(1, Math.min(5, Math.floor(row.quantity ?? 1)))
    counts.set(slug, Math.min(5, (counts.get(slug) ?? 0) + q))
  }
  const out: string[] = []
  for (const [slug, n] of counts) {
    for (let i = 0; i < n; i++) out.push(slug)
  }
  return out
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
  const sp = o.schedulePreference
  if (sp === 'asap' || sp === 'scheduled') out.schedulePreference = sp
  const swt =
    typeof o.scheduledWindowText === 'string' ? o.scheduledWindowText.trim().slice(0, 200) : ''
  if (swt) out.scheduledWindowText = swt
  const ex = typeof o.extraStopsNote === 'string' ? o.extraStopsNote.trim().slice(0, 500) : ''
  if (ex) out.extraStopsNote = ex
  const spec = parseSpecialtyItems(o.specialtyItems)
  if (spec) out.specialtyItems = spec
  if (
    !out.jobType &&
    !out.pickupAddressText &&
    !out.dropoffAddressText &&
    !out.schedulePreference &&
    !out.scheduledWindowText &&
    !out.extraStopsNote &&
    !out.specialtyItems
  ) {
    return null
  }
  if (out.openBookingOnMap === true && !out.jobType && !out.pickupAddressText) return null
  return out
}
