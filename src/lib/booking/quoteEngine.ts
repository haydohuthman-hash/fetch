/**
 * Canonical Fetch quote engine — single entry for client, assistant, and server parity.
 */
import {
  BOOKING_QUOTE_VERSION,
  type BookingJobType,
  type BookingPricing,
  type BookingQuoteBreakdown,
  type BookingServiceType,
  type BookingState,
} from '../assistant/types'
import { estimateRouteKmDuration } from '../assistant/parseFromText'
import type { FetchAiBookingDraft } from './types'
import { computeSpecialtySurcharge } from './specialtyItemCatalog'

export type ScannerEstimatedSize = 'small' | 'medium' | 'large' | 'whole_home'

export type PricingJobInput = {
  jobType: BookingJobType
  serviceType: BookingServiceType
  distanceMeters: number | null
  durationSeconds: number | null
  pickupAddressText: string
  dropoffAddressText: string
  detectedItems: string[]
  itemCounts: Record<string, number>
  homeBedrooms: number | null
  moveSize: BookingState['moveSize']
  /** From photo scan when user has not set move size / bedrooms. */
  scanEstimatedSize: ScannerEstimatedSize | null
  accessDetails: BookingState['accessDetails']
  accessRisk: BookingState['accessRisk']
  disposalRequired: boolean | null
  helperHours: number | null
  helperType: string | null
  cleaningHours: number | null
  cleaningType: string | null
  specialItemType: string | null
  isHeavyItem: boolean
  isBulky: boolean
  needsTwoMovers: boolean
  needsSpecialEquipment: boolean
  /** Normalized specialty slugs; duplicates imply quantity. */
  specialtyItemSlugs?: string[]
}

export type ComputePriceOptions = {
  /** When true, estimate distance/duration from addresses if route missing. Default true. */
  allowRouteFallback?: boolean
  /** 0–50: courtesy discount applied to quoted dollars (neural field booking). */
  customerDiscountPercent?: number
}

export type ComputePriceOk = {
  ok: true
  breakdown: BookingQuoteBreakdown
  pricing: BookingPricing
  totalPrice: number
  depositDueNow: number
  balanceRemaining: number
  usedRouteFallback: boolean
}

export type ComputePriceErr = {
  ok: false
  code: 'missing_service' | 'missing_route' | 'missing_addresses_for_fallback'
  message: string
  missingFields: string[]
}

export type ComputePriceResult = ComputePriceOk | ComputePriceErr

function jobTypeNeedsRoute(jobType: BookingJobType): boolean {
  return (
    jobType === 'deliveryPickup' || jobType === 'heavyItem' || jobType === 'homeMoving'
  )
}

function accessRiskSurchargeAud(risk: BookingState['accessRisk']): number {
  if (risk === 'medium') return 18
  if (risk === 'high') return 35
  return 0
}

function effectiveMoveSizeMultiplier(input: PricingJobInput): {
  factor: number
  label: 'bedrooms' | 'moveSize' | 'scan' | 'default'
} {
  const totalItems =
    Object.values(input.itemCounts ?? {}).reduce((sum, qty) => sum + Math.max(0, qty || 0), 0) ||
    input.detectedItems.length

  if (input.homeBedrooms != null) {
    const f =
      input.homeBedrooms >= 4
        ? 1.8
        : input.homeBedrooms === 3
          ? 1.5
          : input.homeBedrooms === 2
            ? 1.3
            : 1.1
    return { factor: f, label: 'bedrooms' }
  }
  if (input.moveSize === 'large') return { factor: 1.45, label: 'moveSize' }
  if (input.moveSize === 'medium') return { factor: 1.2, label: 'moveSize' }
  if (input.moveSize === 'small') return { factor: 1, label: 'moveSize' }

  if (input.scanEstimatedSize) {
    switch (input.scanEstimatedSize) {
      case 'whole_home':
        return { factor: 1.45, label: 'scan' }
      case 'large':
        return { factor: 1.35, label: 'scan' }
      case 'medium':
        return { factor: 1.15, label: 'scan' }
      case 'small':
      default:
        return { factor: 1, label: 'scan' }
    }
  }

  if (input.serviceType === 'move' && totalItems > 0) {
    return { factor: 1.2, label: 'default' }
  }
  return { factor: 1, label: 'default' }
}

function computeBreakdownCore(
  input: PricingJobInput,
  distanceMeters: number,
  durationSeconds: number,
): BookingQuoteBreakdown {
  const km = distanceMeters / 1000
  const routeMin = Math.max(10, Math.round(durationSeconds / 60))
  const totalItems =
    Object.values(input.itemCounts ?? {}).reduce((sum, qty) => sum + Math.max(0, qty || 0), 0) ||
    input.detectedItems.length

  const { factor: moveSizeFactor } = effectiveMoveSizeMultiplier(input)

  const isJunk = input.serviceType === 'remove'
  const junkLoadTier = isJunk
    ? totalItems >= 15
      ? 'full_truck'
      : totalItems >= 8
        ? 'half_truck'
        : totalItems >= 3
          ? 'ute_load'
          : 'single'
    : null

  const baseFee = isJunk
    ? junkLoadTier === 'full_truck'
      ? 320
      : junkLoadTier === 'half_truck'
        ? 195
        : junkLoadTier === 'ute_load'
          ? 125
          : 99
    : input.serviceType === 'pickup'
      ? 56
      : 74
  const distanceFeePerKm = isJunk ? 4.5 : input.serviceType === 'pickup' ? 2.7 : 4.1
  const routeFee = km * distanceFeePerKm
  const routeTimeFee = routeMin * (input.serviceType === 'pickup' ? 0.45 : isJunk ? 0.7 : 0.6)
  const inventoryFee = isJunk
    ? Math.max(0, totalItems - 1) * 12
    : Math.max(0, totalItems - 1) * (input.serviceType === 'pickup' ? 5 : 8)

  let accessFee =
    (input.accessDetails.stairs ? (isJunk ? 35 : 22) : 0) +
    (input.accessDetails.lift === false ? (isJunk ? 18 : 12) : 0) +
    (input.accessDetails.disassembly ? (isJunk ? 30 : 24) : 0) +
    Math.max(0, (input.accessDetails.carryDistance ?? 0) - 10) * (isJunk ? 1.2 : 0.7)
  accessFee += accessRiskSurchargeAud(input.accessRisk)

  const disposalFee =
    isJunk && input.disposalRequired
      ? junkLoadTier === 'full_truck'
        ? 145
        : junkLoadTier === 'half_truck'
          ? 88
          : junkLoadTier === 'ute_load'
            ? 52
            : 28
      : 0

  const autoHelpers =
    input.serviceType === 'move' && (moveSizeFactor >= 1.45 || totalItems >= 8 || routeMin >= 55)
      ? 2
      : input.serviceType === 'move' && (moveSizeFactor >= 1.2 || totalItems >= 4)
        ? 1
        : 0
  const helperFee = autoHelpers * (input.serviceType === 'pickup' ? 18 : 28)
  const heavyItemFee =
    input.jobType === 'heavyItem'
      ? (input.isHeavyItem ? 42 : 0) +
        (input.needsTwoMovers ? 28 : 0) +
        (input.needsSpecialEquipment ? 36 : 0) +
        (input.isBulky ? 16 : 0)
      : 0

  if (input.serviceType === 'helpers') {
    const hours = Math.max(1, input.helperHours ?? 1)
    const baseHelpersFee = 36
    const hourlyRate = 48
    const supportFee = /\bassembly\b/i.test(input.helperType ?? '')
      ? 14
      : /\bloading|lifting\b/i.test(input.helperType ?? '')
        ? 8
        : 0
    const spec = computeSpecialtySurcharge('helpers', input.specialtyItemSlugs)
    const subtotal = baseHelpersFee + hours * hourlyRate + supportFee + spec.aud
    const spread = Math.max(12, subtotal * 0.12)

    return {
      baseFee: Math.round(baseHelpersFee),
      routeFee: 0,
      routeTimeFee: 0,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: Math.round(hours * hourlyRate + supportFee),
      specialtyFee: Math.round(spec.aud),
      specialtyLines: spec.lines,
      moveSizeMultiplier: 1,
      subtotal: Math.round(subtotal),
      spread: Math.round(spread),
      totalItems: 0,
      autoHelpers: 0,
    }
  }

  if (input.serviceType === 'cleaning') {
    const hours = Math.max(1, input.cleaningHours ?? 1)
    const baseCleaningFee = 36
    const hourlyRate = 48
    const supportFee = /\bdeep\b/i.test(input.cleaningType ?? '')
      ? 14
      : /\b(end of lease|bond)\b/i.test(input.cleaningType ?? '')
        ? 22
        : 0
    const spec = computeSpecialtySurcharge('cleaning', input.specialtyItemSlugs)
    const subtotal = baseCleaningFee + hours * hourlyRate + supportFee + spec.aud
    const spread = Math.max(12, subtotal * 0.12)

    return {
      baseFee: Math.round(baseCleaningFee),
      routeFee: 0,
      routeTimeFee: 0,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: Math.round(hours * hourlyRate + supportFee),
      specialtyFee: Math.round(spec.aud),
      specialtyLines: spec.lines,
      moveSizeMultiplier: 1,
      subtotal: Math.round(subtotal),
      spread: Math.round(spread),
      totalItems: 0,
      autoHelpers: 0,
    }
  }

  const spec = computeSpecialtySurcharge(input.serviceType, input.specialtyItemSlugs)
  const lineSubtotal =
    (baseFee + routeFee + routeTimeFee + inventoryFee + accessFee + disposalFee + helperFee + heavyItemFee) *
    moveSizeFactor
  const subtotal = lineSubtotal + spec.aud
  const spread = Math.max(14, subtotal * 0.16)

  return {
    baseFee: Math.round(baseFee),
    routeFee: Math.round(routeFee),
    routeTimeFee: Math.round(routeTimeFee),
    inventoryFee: Math.round(inventoryFee),
    accessFee: Math.round(accessFee),
    disposalFee: Math.round(disposalFee),
    helperFee: Math.round(helperFee),
    specialtyFee: Math.round(spec.aud),
    specialtyLines: spec.lines,
    moveSizeMultiplier: Number(moveSizeFactor.toFixed(2)),
    subtotal: Math.round(subtotal),
    spread: Math.round(spread),
    totalItems,
    autoHelpers,
  }
}

function buildPricing(
  input: PricingJobInput,
  breakdown: BookingQuoteBreakdown,
  distanceMeters: number,
  durationSeconds: number,
  usedRouteFallback: boolean,
  lockedQuoteAt?: number,
): BookingPricing {
  const km = distanceMeters / 1000
  const totalItems =
    Object.values(input.itemCounts ?? {}).reduce((sum, qty) => sum + Math.max(0, qty || 0), 0) ||
    input.detectedItems.length

  const junkTier =
    input.serviceType === 'remove'
      ? totalItems >= 15
        ? 'full truck'
        : totalItems >= 8
          ? 'half truck'
          : totalItems >= 3
            ? 'ute load'
            : 'single item'
      : null
  const explanationParts =
    input.serviceType === 'remove'
      ? [
          'junk removal',
          junkTier ?? '',
          `${totalItems} item${totalItems === 1 ? '' : 's'}`,
          input.disposalRequired ? 'incl. disposal' : '',
        ].filter(Boolean)
      : [
          `${input.serviceType} job`,
          `${km.toFixed(1)} km`,
          `${totalItems} item${totalItems === 1 ? '' : 's'}`,
        ]
  if (input.serviceType === 'helpers') {
    explanationParts.splice(
      0,
      explanationParts.length,
      'helpers job',
      `${Math.max(1, input.helperHours ?? 1)} hr`,
    )
    if (input.helperType?.trim()) explanationParts.push(input.helperType.trim())
  }
  if (input.serviceType === 'cleaning') {
    explanationParts.splice(
      0,
      explanationParts.length,
      'cleaning job',
      `${Math.max(1, input.cleaningHours ?? 1)} hr`,
    )
    if (input.cleaningType?.trim()) explanationParts.push(input.cleaningType.trim())
  }
  if (input.jobType === 'heavyItem') {
    explanationParts.splice(
      0,
      explanationParts.length,
      'heavy item job',
      `${km.toFixed(1)} km`,
      input.specialItemType ?? `${totalItems} item${totalItems === 1 ? '' : 's'}`,
    )
    if (input.needsTwoMovers) explanationParts.push('two movers')
    if (input.needsSpecialEquipment) explanationParts.push('special equipment')
  }
  if (breakdown.specialtyFee > 0 && breakdown.specialtyLines.length > 0) {
    explanationParts.push(
      `specialty: ${breakdown.specialtyLines.map((l) => `${l.label} (+$${l.aud})`).join(', ')}`,
    )
  }
  if (input.accessDetails.stairs) explanationParts.push('stairs')
  if (input.accessDetails.disassembly) explanationParts.push('disassembly')
  if (input.serviceType === 'remove' && input.disposalRequired) explanationParts.push('disposal')
  if (
    input.serviceType !== 'helpers' &&
    input.serviceType !== 'cleaning' &&
    breakdown.autoHelpers > 0
  ) {
    explanationParts.push(`${breakdown.autoHelpers} helper${breakdown.autoHelpers > 1 ? 's' : ''}`)
  }
  if (usedRouteFallback) explanationParts.push('estimate route')

  const minPrice = Math.round(Math.max(45, breakdown.subtotal - breakdown.spread))
  const maxPrice = Math.round(Math.max(58, breakdown.subtotal + breakdown.spread))
  const totalPrice = Math.round(breakdown.subtotal)
  const depositDueNow = totalPrice
  const balanceRemaining = 0

  return {
    minPrice,
    maxPrice,
    currency: 'AUD',
    estimatedDuration:
      input.serviceType === 'helpers'
        ? Math.max(3600, Math.round((input.helperHours ?? 1) * 3600))
        : input.serviceType === 'cleaning'
          ? Math.max(3600, Math.round((input.cleaningHours ?? 1) * 3600))
          : Math.max(1800, Math.round(durationSeconds + 1200 + totalItems * 120)),
    explanation: explanationParts.join(' · '),
    totalPrice,
    depositDueNow,
    balanceRemaining,
    usedRouteFallback,
    quoteVersion: BOOKING_QUOTE_VERSION,
    ...(lockedQuoteAt != null ? { lockedQuoteAt } : {}),
  }
}

/**
 * Resolve route metrics; may use address fallback.
 */
export function resolveRouteMetrics(
  input: PricingJobInput,
  options?: ComputePriceOptions,
): { ok: true; distanceMeters: number; durationSeconds: number; usedRouteFallback: boolean } | ComputePriceErr {
  const allowFallback = options?.allowRouteFallback !== false
  let dm = input.distanceMeters
  let ds = input.durationSeconds
  let usedRouteFallback = false

  if (jobTypeNeedsRoute(input.jobType)) {
    if (dm == null || ds == null) {
      const pu = input.pickupAddressText?.trim() ?? ''
      const du = input.dropoffAddressText?.trim() ?? ''
      if (allowFallback && pu.length > 2 && du.length > 2) {
        const est = estimateRouteKmDuration(pu, du)
        dm = Math.round(est.distanceKm * 1000)
        ds = Math.round(est.durationMin * 60)
        usedRouteFallback = true
      } else {
        return {
          ok: false,
          code: 'missing_route',
          message:
            allowFallback && (!pu || !du)
              ? 'Add pickup and drop-off addresses to estimate the price.'
              : 'Route distance and duration are required for this job.',
          missingFields: ['route'],
        }
      }
    }
  } else {
    if (dm == null) dm = 0
    if (ds == null) ds = 0
  }

  return { ok: true, distanceMeters: dm, durationSeconds: ds, usedRouteFallback }
}

export function computePrice(
  input: PricingJobInput | null | undefined,
  options?: ComputePriceOptions,
): ComputePriceResult {
  if (!input?.serviceType || !input?.jobType) {
    return {
      ok: false,
      code: 'missing_service',
      message: 'Select a service type to see pricing.',
      missingFields: !input?.jobType ? ['jobType'] : ['serviceType'],
    }
  }

  const route = resolveRouteMetrics(input, options)
  if (!route.ok) return route

  const breakdown = computeBreakdownCore(input, route.distanceMeters, route.durationSeconds)
  let pricing = buildPricing(
    input,
    breakdown,
    route.distanceMeters,
    route.durationSeconds,
    route.usedRouteFallback,
  )

  const pctRaw = options?.customerDiscountPercent ?? 0
  const pct = Math.min(50, Math.max(0, Math.round(pctRaw)))
  let totalPrice = pricing.totalPrice ?? Math.round(breakdown.subtotal)
  let depositDueNow = pricing.depositDueNow ?? pricing.totalPrice ?? Math.round(breakdown.subtotal)
  if (pct > 0) {
    const factor = 1 - pct / 100
    const scale = (n: number) => Math.max(0, Math.round(n * factor))
    pricing = {
      ...pricing,
      minPrice: scale(pricing.minPrice),
      maxPrice: scale(pricing.maxPrice),
      totalPrice: scale(pricing.totalPrice ?? totalPrice),
      depositDueNow: scale(pricing.depositDueNow ?? depositDueNow),
      explanation: `${pricing.explanation} · ${pct}% courtesy discount`,
    }
    totalPrice = scale(totalPrice)
    depositDueNow = scale(depositDueNow)
  }

  return {
    ok: true,
    breakdown,
    pricing,
    totalPrice,
    depositDueNow,
    balanceRemaining: pricing.balanceRemaining ?? 0,
    usedRouteFallback: route.usedRouteFallback,
  }
}

export function draftToPricingInput(draft: FetchAiBookingDraft): PricingJobInput | null {
  if (!draft.serviceType || !draft.jobType) return null
  const dm = draft.route?.distanceMeters ?? null
  const ds = draft.route?.durationSeconds ?? null
  return {
    jobType: draft.jobType,
    serviceType: draft.serviceType,
    distanceMeters: dm,
    durationSeconds: ds,
    pickupAddressText: draft.pickupAddressText ?? '',
    dropoffAddressText: draft.dropoffAddressText ?? '',
    detectedItems: draft.detectedItems ?? [],
    itemCounts: draft.itemCounts ?? {},
    homeBedrooms: draft.homeBedrooms ?? null,
    moveSize: draft.moveSize ?? null,
    scanEstimatedSize: draft.scanEstimatedSize ?? null,
    accessDetails: draft.accessDetails,
    accessRisk: draft.accessRisk ?? null,
    disposalRequired: draft.disposalRequired,
    helperHours: draft.helperHours,
    helperType: draft.helperType,
    cleaningHours: draft.cleaningHours,
    cleaningType: draft.cleaningType,
    specialItemType: draft.specialItemType,
    isHeavyItem: draft.isHeavyItem,
    isBulky: draft.isBulky,
    needsTwoMovers: draft.needsTwoMovers,
    needsSpecialEquipment: draft.needsSpecialEquipment,
    specialtyItemSlugs: draft.specialtyItemSlugs ?? [],
  }
}

export function stateToPricingInput(state: BookingState): PricingJobInput | null {
  if (!state.serviceType || !state.jobType) return null
  const dm = state.distanceMeters ?? state.route?.distanceMeters ?? null
  const ds = state.durationSeconds ?? state.route?.durationSeconds ?? null
  const scanSize = state.scan.result?.estimatedSize ?? null
  return {
    jobType: state.jobType,
    serviceType: state.serviceType,
    distanceMeters: dm,
    durationSeconds: ds,
    pickupAddressText: state.pickupAddressText ?? '',
    dropoffAddressText: state.dropoffAddressText ?? '',
    detectedItems: state.detectedItems ?? [],
    itemCounts: state.itemCounts ?? {},
    homeBedrooms: state.homeBedrooms,
    moveSize: state.moveSize,
    scanEstimatedSize: scanSize,
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
}

export function computePriceForDraft(
  draft: FetchAiBookingDraft,
  options?: ComputePriceOptions,
): ComputePriceResult {
  const input = draftToPricingInput(draft)
  if (!input) {
    return {
      ok: false,
      code: 'missing_service',
      message: 'Select a service type to see pricing.',
      missingFields: ['jobType', 'serviceType'],
    }
  }
  return computePrice(input, options)
}

export function computePriceForState(
  state: BookingState,
  options?: ComputePriceOptions,
): ComputePriceResult {
  const input = stateToPricingInput(state)
  if (!input) {
    return {
      ok: false,
      code: 'missing_service',
      message: 'Select a service type to see pricing.',
      missingFields: ['jobType', 'serviceType'],
    }
  }
  const discountFromState =
    options?.customerDiscountPercent !== undefined
      ? options.customerDiscountPercent
      : (state.fieldVoiceDiscountPercent ?? 0)
  return computePrice(input, {
    ...options,
    customerDiscountPercent: discountFromState,
  })
}
