/**
 * Whitelist of specialty / bulky items for deterministic surcharges (AUD).
 * Slugs align with chat `bookingPatch.specialtyItems` and overlap scan `specialItemType` where possible.
 */
import type { BookingServiceType } from '../assistant/types'

/** Default: junk, moves, delivery/pickup, heavy (all use routed or item-based quoting except pure hourly). */
const ROUTED_SERVICES: BookingServiceType[] = ['move', 'pickup', 'remove']

export const SPECIALTY_SLUGS = [
  'pool_table',
  'snooker_table',
  'spa',
  'piano',
  'safe',
  'marble_table',
  'wardrobe',
  'fridge',
  'gym_equipment',
  'sofa',
  'mattress',
] as const

export type SpecialtySlug = (typeof SPECIALTY_SLUGS)[number]

type CatalogEntry = {
  displayLabel: string
  surchargeAud: number
  appliesTo: readonly BookingServiceType[]
}

export const SPECIALTY_ITEM_CATALOG: Record<SpecialtySlug, CatalogEntry> = {
  pool_table: { displayLabel: 'Pool table', surchargeAud: 85, appliesTo: ROUTED_SERVICES },
  snooker_table: { displayLabel: 'Snooker table', surchargeAud: 95, appliesTo: ROUTED_SERVICES },
  spa: { displayLabel: 'Spa / hot tub', surchargeAud: 120, appliesTo: ROUTED_SERVICES },
  piano: { displayLabel: 'Piano', surchargeAud: 95, appliesTo: ROUTED_SERVICES },
  safe: { displayLabel: 'Safe', surchargeAud: 55, appliesTo: ROUTED_SERVICES },
  marble_table: { displayLabel: 'Marble table', surchargeAud: 48, appliesTo: ROUTED_SERVICES },
  wardrobe: { displayLabel: 'Large wardrobe', surchargeAud: 35, appliesTo: ROUTED_SERVICES },
  fridge: { displayLabel: 'Fridge / freezer', surchargeAud: 42, appliesTo: ROUTED_SERVICES },
  gym_equipment: { displayLabel: 'Gym equipment', surchargeAud: 45, appliesTo: ROUTED_SERVICES },
  sofa: { displayLabel: 'Sofa / lounge', surchargeAud: 28, appliesTo: ROUTED_SERVICES },
  mattress: { displayLabel: 'Mattress', surchargeAud: 22, appliesTo: ROUTED_SERVICES },
}

const SLUG_SET = new Set<string>(SPECIALTY_SLUGS)

export function normalizeSpecialtySlug(raw: string): SpecialtySlug | null {
  const t = raw.trim().toLowerCase().replace(/-/g, '_')
  return SLUG_SET.has(t) ? (t as SpecialtySlug) : null
}

export type SpecialtyLine = { label: string; aud: number }

const MAX_QTY_PER_SLUG = 5

/**
 * Aggregate duplicate slugs in `rawSlugs` as quantities (e.g. two `pool_table` entries => qty 2).
 */
export function countSpecialtySlugs(rawSlugs: readonly string[] | null | undefined): Map<SpecialtySlug, number> {
  const counts = new Map<SpecialtySlug, number>()
  if (!rawSlugs?.length) return counts
  for (const raw of rawSlugs) {
    const slug = normalizeSpecialtySlug(raw)
    if (!slug) continue
    const next = Math.min(MAX_QTY_PER_SLUG, (counts.get(slug) ?? 0) + 1)
    counts.set(slug, next)
  }
  return counts
}

export function computeSpecialtySurcharge(
  serviceType: BookingServiceType,
  rawSlugs: readonly string[] | null | undefined,
): { aud: number; lines: SpecialtyLine[] } {
  const counts = countSpecialtySlugs(rawSlugs)
  let aud = 0
  const lines: SpecialtyLine[] = []
  for (const [slug, qty] of counts) {
    const entry = SPECIALTY_ITEM_CATALOG[slug]
    if (!entry.appliesTo.includes(serviceType)) continue
    const lineAud = entry.surchargeAud * qty
    aud += lineAud
    const label = qty > 1 ? `${entry.displayLabel} ×${qty}` : entry.displayLabel
    lines.push({ label, aud: lineAud })
  }
  return { aud, lines }
}
