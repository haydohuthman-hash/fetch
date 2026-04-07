import { computePriceForDraft } from '../../src/lib/booking/quoteEngine.ts'

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function clampConfidence(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
}

function buildMissingFields(draft) {
  const missing = []
  if (!draft.jobType) missing.push('jobType')
  if (!draft.serviceType) missing.push('serviceType')
  if (!draft.pickupAddressText?.trim()) missing.push('pickupAddressText')
  if (draft.serviceType === 'helpers' && draft.helperHours == null) missing.push('helperHours')
  if (draft.serviceType === 'helpers' && !draft.helperType?.trim()) missing.push('helperType')
  if (draft.serviceType === 'cleaning' && draft.cleaningHours == null) missing.push('cleaningHours')
  if (draft.serviceType === 'cleaning' && !draft.cleaningType?.trim()) missing.push('cleaningType')
  if ((draft.serviceType === 'move' || draft.serviceType === 'pickup') && !draft.dropoffAddressText?.trim()) {
    missing.push('dropoffAddressText')
  }
  if (
    (draft.serviceType === 'move' || draft.serviceType === 'pickup') &&
    draft.route?.distanceMeters == null
  ) {
    missing.push('route')
  }
  if (draft.serviceType === 'pickup' && !(draft.detectedItems?.length || Object.keys(draft.itemCounts ?? {}).length)) {
    missing.push('items')
  }
  if (draft.jobType === 'heavyItem') {
    if (draft.accessDetails?.stairs == null) missing.push('stairs')
    if (draft.accessDetails?.lift == null) missing.push('lift')
    if (draft.accessDetails?.carryDistance == null) missing.push('carryDistance')
    if (draft.accessDetails?.disassembly == null) missing.push('disassembly')
  }
  if (draft.serviceType === 'remove' && draft.disposalRequired == null) missing.push('disposalRequired')
  if (
    (draft.serviceType === 'move' || draft.serviceType === 'remove') &&
    draft.accessDetails?.stairs == null
  ) {
    missing.push('stairs')
  }
  if (
    (draft.serviceType === 'move' || draft.serviceType === 'remove') &&
    draft.accessDetails?.lift == null
  ) {
    missing.push('lift')
  }
  if (
    (draft.serviceType === 'move' || draft.serviceType === 'remove') &&
    draft.accessDetails?.carryDistance == null
  ) {
    missing.push('carryDistance')
  }
  if (
    (draft.serviceType === 'move' || draft.serviceType === 'remove') &&
    draft.accessDetails?.disassembly == null
  ) {
    missing.push('disassembly')
  }
  if (
    draft.serviceType === 'move' &&
    draft.homeBedrooms == null &&
    draft.moveSize == null &&
    !draft.scanEstimatedSize
  ) {
    missing.push('moveSize')
  }
  return missing
}

function buildHeuristicReview(draft) {
  const priceResult = computePriceForDraft(draft, { allowRouteFallback: true })
  const pricing = priceResult.ok ? priceResult.pricing : null
  const quoteBreakdown = priceResult.ok ? priceResult.breakdown : null
  const missingFields = buildMissingFields(draft)
  const totalItems =
    Object.values(draft.itemCounts ?? {}).reduce((sum, qty) => sum + Math.max(0, qty || 0), 0) ||
    draft.detectedItems.length
  const riskFlags = []
  if (draft.accessDetails?.stairs) riskFlags.push('Stairs likely add handling time.')
  if (draft.accessDetails?.disassembly) riskFlags.push('Disassembly should be planned before dispatch.')
  if ((draft.accessDetails?.carryDistance ?? 0) > 20) riskFlags.push('Long carry distance may require extra labour.')
  if (draft.disposalRequired) riskFlags.push('Disposal fees are included in the quote.')
  if ((draft.scanConfidence ?? 1) < 0.55) riskFlags.push('Photo scan confidence is low, so item counts may need confirmation.')
  if (!riskFlags.length) riskFlags.push('Job looks straightforward from the current details.')

  const blockerMap = {
    serviceType: 'Select the service type before locking the booking.',
    jobType: 'Select the booking intent before continuing.',
    pickupAddressText: 'Set the pickup location.',
    dropoffAddressText: 'Set the drop-off location.',
    route: 'Route distance is still missing.',
    items: 'Add the item list so Fetch AI can confirm the quote.',
    disposalRequired: 'Confirm whether disposal is included.',
    stairs: 'Confirm stairs access.',
    lift: 'Confirm lift access.',
    carryDistance: 'Confirm carry distance.',
    disassembly: 'Confirm if disassembly is needed.',
    moveSize: 'Confirm move size or bedroom count.',
    helperHours: 'Confirm how long help is needed.',
    helperType: 'Confirm what kind of help is needed.',
    cleaningHours: 'Confirm how long cleaning is needed.',
    cleaningType: 'Confirm what type of cleaning is needed.',
  }

  const blockers = missingFields.map((field) => blockerMap[field]).filter(Boolean)
  const serviceLabel =
    draft.jobType || draft.serviceMode?.replace('_', ' ') || draft.serviceType || 'booking'
  const headlineBits = [
    serviceLabel,
    draft.pickupAddressText?.trim() ? `from ${draft.pickupAddressText.trim()}` : null,
    draft.dropoffAddressText?.trim() ? `to ${draft.dropoffAddressText.trim()}` : null,
  ].filter(Boolean)
  const summary = `Fetch AI reviewed a ${headlineBits.join(' ')} job with ${totalItems || 1} item${
    totalItems === 1 ? '' : 's'
  }.`

  let riskLevel = 'low'
  if (missingFields.length >= 3 || riskFlags.length >= 3) riskLevel = 'high'
  else if (missingFields.length > 0 || riskFlags.length > 1) riskLevel = 'medium'

  const suggestedPrompt = missingFields[0]
    ? blockerMap[missingFields[0]] ?? 'Confirm the remaining details.'
    : pricing
      ? 'Quote is ready. Secure payment to confirm the booking.'
      : 'Review the details before continuing.'

  return {
    draft,
    ready: missingFields.length === 0,
    missingFields,
    blockers,
    suggestedPrompt,
    pricing,
    quoteBreakdown,
    aiReview: {
      status: 'ready',
      summary,
      confidence: clampConfidence(draft.scanConfidence, missingFields.length === 0 ? 0.9 : 0.74),
      riskLevel,
      highlights: riskFlags,
      blockers,
      suggestedPrompt,
      quoteBreakdown,
      lastReviewedAt: Date.now(),
      errorMessage: null,
    },
  }
}

async function maybeEnhanceWithOpenAI(draft, review, apiKey) {
  if (!apiKey) return review
  try {
    const prompt = `You are Fetch AI reviewing a booking draft. Return JSON only.
{
  "summary":"short string",
  "confidence":0.0,
  "riskLevel":"low|medium|high",
  "highlights":["short string"],
  "blockers":["short string"],
  "suggestedPrompt":"short string"
}
Draft:
${JSON.stringify(draft, null, 2)}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) return review
    const payload = await response.json()
    const raw = payload?.choices?.[0]?.message?.content
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return review
    return {
      ...review,
      aiReview: {
        ...review.aiReview,
        summary:
          typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim()
            : review.aiReview.summary,
        confidence: clampConfidence(parsed.confidence, review.aiReview.confidence ?? 0.8),
        riskLevel:
          parsed.riskLevel === 'low' || parsed.riskLevel === 'medium' || parsed.riskLevel === 'high'
            ? parsed.riskLevel
            : review.aiReview.riskLevel,
        highlights: Array.isArray(parsed.highlights)
          ? parsed.highlights.filter((value) => typeof value === 'string').slice(0, 5)
          : review.aiReview.highlights,
        blockers: Array.isArray(parsed.blockers)
          ? parsed.blockers.filter((value) => typeof value === 'string').slice(0, 5)
          : review.aiReview.blockers,
        suggestedPrompt:
          typeof parsed.suggestedPrompt === 'string' && parsed.suggestedPrompt.trim()
            ? parsed.suggestedPrompt.trim()
            : review.aiReview.suggestedPrompt,
      },
    }
  } catch {
    return review
  }
}

export async function reviewBookingDraft(draft, { openAiApiKey } = {}) {
  const normalized = {
    jobType: draft?.jobType ?? null,
    flowStep: draft?.flowStep ?? 'intent',
    serviceMode: draft?.serviceMode ?? null,
    serviceType: draft?.serviceType ?? null,
    pickupAddressText: typeof draft?.pickupAddressText === 'string' ? draft.pickupAddressText : '',
    pickupCoords: draft?.pickupCoords ?? null,
    dropoffAddressText: typeof draft?.dropoffAddressText === 'string' ? draft.dropoffAddressText : '',
    dropoffCoords: draft?.dropoffCoords ?? null,
    route: draft?.route ?? null,
    pricing: null,
    quoteBreakdown: null,
    detectedItems: Array.isArray(draft?.detectedItems) ? draft.detectedItems.slice(0, 24) : [],
    itemCounts: draft?.itemCounts && typeof draft.itemCounts === 'object' ? { ...draft.itemCounts } : {},
    inventorySummary: typeof draft?.inventorySummary === 'string' ? draft.inventorySummary : null,
    accessDetails: {
      stairs: draft?.accessDetails?.stairs ?? null,
      lift: draft?.accessDetails?.lift ?? null,
      carryDistance:
        typeof draft?.accessDetails?.carryDistance === 'number' ? draft.accessDetails.carryDistance : null,
      disassembly: draft?.accessDetails?.disassembly ?? null,
    },
    disposalRequired:
      typeof draft?.disposalRequired === 'boolean' ? draft.disposalRequired : null,
    helperHours: typeof draft?.helperHours === 'number' ? draft.helperHours : null,
    helperType: typeof draft?.helperType === 'string' ? draft.helperType : null,
    helperNotes: typeof draft?.helperNotes === 'string' ? draft.helperNotes : null,
    cleaningHours: typeof draft?.cleaningHours === 'number' ? draft.cleaningHours : null,
    cleaningType: typeof draft?.cleaningType === 'string' ? draft.cleaningType : null,
    cleaningNotes: typeof draft?.cleaningNotes === 'string' ? draft.cleaningNotes : null,
    specialItemType: typeof draft?.specialItemType === 'string' ? draft.specialItemType : null,
    specialtyItemSlugs: Array.isArray(draft?.specialtyItemSlugs)
      ? draft.specialtyItemSlugs.filter((s) => typeof s === 'string').slice(0, 24)
      : [],
    isHeavyItem: Boolean(draft?.isHeavyItem),
    isBulky: Boolean(draft?.isBulky),
    needsTwoMovers: Boolean(draft?.needsTwoMovers),
    needsSpecialEquipment: Boolean(draft?.needsSpecialEquipment),
    accessRisk:
      draft?.accessRisk === 'low' || draft?.accessRisk === 'medium' || draft?.accessRisk === 'high'
        ? draft.accessRisk
        : null,
    moveSize: draft?.moveSize ?? null,
    homeBedrooms: typeof draft?.homeBedrooms === 'number' ? draft.homeBedrooms : null,
    scanEstimatedSize:
      draft?.scanEstimatedSize === 'small' ||
      draft?.scanEstimatedSize === 'medium' ||
      draft?.scanEstimatedSize === 'large' ||
      draft?.scanEstimatedSize === 'whole_home'
        ? draft.scanEstimatedSize
        : null,
    scanConfidence: typeof draft?.scanConfidence === 'number' ? draft.scanConfidence : null,
    bookingId: typeof draft?.bookingId === 'string' ? draft.bookingId : null,
  }
  const heuristic = buildHeuristicReview(normalized)
  return maybeEnhanceWithOpenAI(normalized, heuristic, openAiApiKey)
}

export function createPaymentIntentRecord({
  bookingId = null,
  amount,
  currency = 'AUD',
  metadata = null,
}) {
  return {
    id: makeId('pi'),
    bookingId,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    status: 'requires_confirmation',
    amount: Math.max(0, Math.round((Number(amount) || 0) * 100) / 100),
    currency,
    paymentMethodId: null,
    clientSecret: `${makeId('secret')}_client_secret`,
    lastError: null,
    createdAt: Date.now(),
    confirmedAt: null,
    /** 'demo' | 'stripe' — Stripe requires webhook before dispatch when FETCH_REQUIRE_STRIPE_WEBHOOK=1 */
    provider: 'demo',
    webhookConfirmedAt: null,
    stripePaymentIntentId: null,
  }
}
