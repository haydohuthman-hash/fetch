import {
  accessDetailsComplete,
  deriveFlowStep,
  isJunkAccessPhase,
  isJunkBookingConfirmPhase,
  isJunkQuotePhase,
  isJobDetailsPhase,
  isRouteTerminalPhase,
  readyForPricing,
  requiresDropoff,
} from './bookingReadiness'
import { deriveNextQuestion } from './deriveNextQuestion'
import { beginJunkDriverDemo, canBeginJunkDriverDemo } from './junkDriverDemo'
import { computeBookingPricing, computeBookingQuoteBreakdown } from './pricing'
import { classifyJobLane, parseFromText } from './parseFromText'
import type {
  BookingJobType,
  BookingServiceMode,
  BookingServiceType,
  BookingState,
  HandleUserInputResult,
  UserInput,
} from './types'

function laneToServiceType(lane: ReturnType<typeof classifyJobLane>): BookingServiceType {
  if (lane === 'junk_removal') return 'remove'
  if (lane === 'delivery_pickup') return 'pickup'
  return 'move'
}

function jobTypeForServiceType(type: BookingServiceType, current: BookingState): BookingJobType {
  if (type === 'remove') return 'junkRemoval'
  if (type === 'helpers') return 'helper'
  if (type === 'cleaning') return 'cleaning'
  if (type === 'move') return 'homeMoving'
  if (current.isHeavyItem || current.specialItemType) return 'heavyItem'
  return 'deliveryPickup'
}

function parseJobTypeSelection(text: string): BookingJobType | null {
  const t = text.trim().toLowerCase()
  if (t === 'junk removal' || t === 'junk' || t === 'remove junk') return 'junkRemoval'
  if (
    t === 'delivery / pickup' ||
    t === 'delivery/pickup' ||
    t === 'delivery' ||
    t === 'pickup' ||
    t === 'pick up'
  ) {
    return 'deliveryPickup'
  }
  if (t === 'heavy item' || t === 'heavy') return 'heavyItem'
  if (t === 'home moving' || t === 'moving' || t === 'move' || t === 'move home') {
    return 'homeMoving'
  }
  if (t === 'helper' || t === 'helpers' || t === 'need helpers') return 'helper'
  if (
    t === 'cleaning' ||
    t === 'cleaner' ||
    t === 'house cleaning' ||
    t === 'home cleaning' ||
    t === 'end of lease clean'
  ) {
    return 'cleaning'
  }
  return null
}

function serviceModeForJobType(jobType: BookingJobType): BookingServiceMode {
  if (jobType === 'junkRemoval') return 'junk'
  if (jobType === 'homeMoving') return 'move'
  if (jobType === 'helper') return 'helpers'
  if (jobType === 'cleaning') return 'cleaning'
  return 'pickup'
}

function serviceTypeForJobType(jobType: BookingJobType): BookingServiceType {
  if (jobType === 'junkRemoval') return 'remove'
  if (jobType === 'homeMoving') return 'move'
  if (jobType === 'helper') return 'helpers'
  if (jobType === 'cleaning') return 'cleaning'
  return 'pickup'
}

function syncIntentState(state: BookingState): BookingState {
  const next = { ...state }
  if (next.jobType == null && next.serviceType) {
    next.jobType = jobTypeForServiceType(next.serviceType, next)
  }
  if (next.jobType) {
    next.serviceMode = serviceModeForJobType(next.jobType)
    next.serviceType = serviceTypeForJobType(next.jobType)
    if (next.jobType === 'homeMoving') {
      next.moveContext = next.moveContext ?? 'standard'
    }
    if (next.jobType === 'heavyItem') {
      next.isHeavyItem = true
    }
  }
  next.flowStep = deriveFlowStep(next)
  return next
}

/** Home intent cards: lock `jobType` without parsing label text. */
export function selectHomeJobType(
  bookingState: BookingState,
  jobType: BookingJobType,
): HandleUserInputResult {
  const next = syncIntentState({
    ...bookingState,
    mode: 'building',
    source: 'quick_action',
    jobType,
    currentQuestion: null,
    suggestions: [],
    detectedItems: bookingState.detectedItems,
    itemCounts: bookingState.itemCounts,
    isHeavyItem: jobType === 'heavyItem' ? true : bookingState.isHeavyItem,
  })
  const plan = deriveNextQuestion(next)
  next.currentQuestion = plan.question
  next.suggestions = plan.suggestions
  return { bookingState: next, reply: plan.question ?? 'Done.' }
}

/** Sheet submit: set labor fields, compute quote (no photo scan). */
export function applyLaborDetailsFromSheet(
  state: BookingState,
  payload: { hours: number; taskType: string; notes: string },
): HandleUserInputResult {
  if (state.jobType !== 'helper' && state.jobType !== 'cleaning') {
    return { bookingState: state, reply: 'Done.' }
  }
  const hours = Math.max(1, Math.min(12, Math.round(Number(payload.hours) || 1)))
  const taskType = payload.taskType.trim()
  const notesTrim = payload.notes.trim()
  let next: BookingState = {
    ...state,
    jobDetailsStarted: true,
    jobDetailsScanStepComplete: true,
  }
  if (state.jobType === 'helper') {
    next = { ...next, helperHours: hours, helperType: taskType, helperNotes: notesTrim || null }
  } else {
    next = {
      ...next,
      cleaningHours: hours,
      cleaningType: taskType,
      cleaningNotes: notesTrim || null,
    }
  }
  next = syncIntentState(next)
  if (readyForPricing(next) && !isRouteTerminalPhase(next) && !next.pricing) {
    next.quoteBreakdown = computeBookingQuoteBreakdown(next)
    next.pricing = computeBookingPricing(next)
    if (
      next.pricing &&
      !(
        next.jobType === 'junkRemoval' &&
        (!next.junkQuoteAcknowledged || !next.junkConfirmStepComplete)
      )
    ) {
      next.mode = 'pricing'
    }
  }
  next = syncIntentState(next)
  const plan = deriveNextQuestion(next)
  next.currentQuestion = plan.question
  next.suggestions = plan.suggestions
  if (next.mode === 'pricing' && next.pricing) {
    return {
      bookingState: next,
      reply: `Perfect. $${next.pricing.minPrice} to $${next.pricing.maxPrice} - about ${Math.round(next.pricing.estimatedDuration / 60)} min.`,
    }
  }
  return { bookingState: next, reply: plan.question ?? 'Done.' }
}

function dedupeItems(items: string[]): string[] {
  return [...new Set(items.map((v) => v.trim()).filter(Boolean))].slice(0, 16)
}

function normalizeItemKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function addItemCount(itemCounts: Record<string, number>, item: string, delta: number): Record<string, number> {
  const key = normalizeItemKey(item)
  if (!key) return itemCounts
  const next = { ...itemCounts }
  const qty = Math.max(0, (next[key] ?? 0) + delta)
  if (qty <= 0) delete next[key]
  else next[key] = qty
  return next
}

function itemSummary(itemCounts: Record<string, number>): string | null {
  const pairs = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])
  if (pairs.length === 0) return null
  const first = pairs.slice(0, 4).map(([name, qty]) => (qty > 1 ? `${qty}x ${name}` : name))
  return first.join(', ')
}

export function handleUserInput(input: UserInput, bookingState: BookingState): HandleUserInputResult {
  const text = input.text.trim()
  const inputSource = input.source ?? 'text'
  const isScanInput = inputSource === 'scan'
  const hasAddressSelection = Boolean(input.addressSelection)
  if (!text && !hasAddressSelection) {
    return {
      bookingState,
      reply: bookingState.currentQuestion ?? 'What can I fetch for you?',
    }
  }

  if (isRouteTerminalPhase(bookingState) && !hasAddressSelection) {
    const tl = text.trim().toLowerCase()
    if (tl === 'edit addresses' || tl === 'back') {
      let next: BookingState = { ...bookingState }
      if (requiresDropoff(bookingState.jobType)) {
        next = {
          ...next,
          dropoffAddressText: '',
          dropoffPlace: null,
          dropoffCoords: null,
          route: null,
          distanceMeters: null,
          durationSeconds: null,
        }
      } else if (bookingState.jobType === 'junkRemoval') {
        next = {
          ...next,
          pickupAddressText: '',
          pickupPlace: null,
          pickupCoords: null,
          route: null,
          distanceMeters: null,
          durationSeconds: null,
        }
      } else {
        next = {
          ...next,
          pickupAddressText: '',
          pickupPlace: null,
          pickupCoords: null,
          dropoffAddressText: '',
          dropoffPlace: null,
          dropoffCoords: null,
          route: null,
          distanceMeters: null,
          durationSeconds: null,
        }
      }
      next = syncIntentState(next)
      const plan = deriveNextQuestion(next)
      next.currentQuestion = plan.question
      next.suggestions = plan.suggestions
      return { bookingState: next, reply: plan.question ?? 'Done.' }
    }
    if (tl === 'next' || tl === 'continue') {
      let nextState: BookingState = { ...bookingState, jobDetailsStarted: true }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return {
        bookingState: nextState,
        reply: plan.question ?? 'What are we moving?',
      }
    }
    return { bookingState, reply: 'Route ready' }
  }

  if (isJunkAccessPhase(bookingState) && !hasAddressSelection && text && !isScanInput) {
    const tl = text.trim().toLowerCase()
    if (tl === 'junk access back') {
      let nextState: BookingState = {
        ...bookingState,
        jobDetailsScanStepComplete: false,
        junkAccessStepComplete: false,
        accessDetails: { stairs: null, lift: null, carryDistance: null, disassembly: null },
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return { bookingState: nextState, reply: plan.question ?? 'Scan your junk' }
    }
    if (tl === 'junk access next') {
      if (!accessDetailsComplete(bookingState)) {
        return {
          bookingState,
          reply: 'Please answer stairs, lift, carry distance, and disassembly using the buttons below.',
        }
      }
      let nextState: BookingState = {
        ...bookingState,
        junkAccessStepComplete: true,
        disposalRequired: bookingState.disposalRequired ?? true,
        internalDisposalDestination:
          bookingState.internalDisposalDestination ?? 'Licensed disposal facility',
      }
      nextState = syncIntentState(nextState)
      if (readyForPricing(nextState) && !isRouteTerminalPhase(nextState) && !nextState.pricing) {
        nextState.quoteBreakdown = computeBookingQuoteBreakdown(nextState)
        nextState.pricing = computeBookingPricing(nextState)
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      if (nextState.pricing) {
        return {
          bookingState: nextState,
          reply: "Got it \u2014 here's your fixed price.",
        }
      }
      return { bookingState: nextState, reply: plan.question ?? 'Done.' }
    }

    const accessPatch: Partial<BookingState['accessDetails']> = {}
    if (tl === 'junk-access-stairs-yes') accessPatch.stairs = true
    else if (tl === 'junk-access-stairs-no') accessPatch.stairs = false
    else if (tl === 'junk-access-lift-yes') accessPatch.lift = true
    else if (tl === 'junk-access-lift-no') accessPatch.lift = false
    else if (tl === 'junk-access-carry-short') accessPatch.carryDistance = 10
    else if (tl === 'junk-access-carry-medium') accessPatch.carryDistance = 20
    else if (tl === 'junk-access-carry-long') accessPatch.carryDistance = 35
    else if (tl === 'junk-access-disassembly-yes') accessPatch.disassembly = true
    else if (tl === 'junk-access-disassembly-no' || tl === 'junk-access-disassembly-na')
      accessPatch.disassembly = false
    if (Object.keys(accessPatch).length > 0) {
      let nextState: BookingState = {
        ...bookingState,
        accessDetails: { ...bookingState.accessDetails, ...accessPatch },
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return { bookingState: nextState, reply: 'Got it.' }
    }
    return {
      bookingState,
      reply: 'Use the options on the card for stairs, lift, carry distance, and disassembly.',
    }
  }

  if (isJunkQuotePhase(bookingState) && !hasAddressSelection && text) {
    const tl = text.trim().toLowerCase()
    if (tl === 'junk quote back') {
      let nextState: BookingState = {
        ...bookingState,
        pricing: null,
        quoteBreakdown: null,
        junkAccessStepComplete: false,
        junkConfirmStepComplete: false,
        mode: 'building',
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return { bookingState: nextState, reply: plan.question ?? 'Access details' }
    }
    if (tl === 'junk quote next') {
      let nextState: BookingState = {
        ...bookingState,
        junkQuoteAcknowledged: true,
        mode: 'building',
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return {
        bookingState: nextState,
        reply: 'Review the summary below, then confirm your booking.',
      }
    }
    return { bookingState, reply: 'Use Back or Next below.' }
  }

  if (isJunkBookingConfirmPhase(bookingState) && !hasAddressSelection && text) {
    const tl = text.trim().toLowerCase()
    if (tl === 'junk confirmation back') {
      let nextState: BookingState = {
        ...bookingState,
        junkQuoteAcknowledged: false,
        mode: 'building',
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return { bookingState: nextState, reply: plan.question ?? 'Your junk pickup quote' }
    }
    if (tl === 'junk confirm booking') {
      let nextState: BookingState = {
        ...bookingState,
        junkConfirmStepComplete: true,
        mode: 'pricing',
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      if (nextState.pricing) {
        return {
          bookingState: nextState,
          reply: `Perfect. $${nextState.pricing.minPrice} to $${nextState.pricing.maxPrice} - about ${Math.round(nextState.pricing.estimatedDuration / 60)} min.`,
        }
      }
      return { bookingState: nextState, reply: plan.question ?? 'Done.' }
    }
    return { bookingState, reply: 'Use Back or Confirm booking below.' }
  }

  if (isJobDetailsPhase(bookingState) && !hasAddressSelection && text) {
    const tl = text.trim().toLowerCase()

    if (bookingState.jobType === 'junkRemoval' && tl === 'junk scan back') {
      let nextState: BookingState = {
        ...bookingState,
        jobDetailsStarted: false,
        jobDetailsItemsConfirmed: false,
        jobDetailsScanStepComplete: false,
        junkAccessStepComplete: false,
        junkQuoteAcknowledged: false,
        junkConfirmStepComplete: false,
        accessDetails: { stairs: null, lift: null, carryDistance: null, disassembly: null },
        scan: { images: [], result: null, confidence: null },
        detectedItems: [],
        itemCounts: {},
        inventorySummary: null,
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return {
        bookingState: nextState,
        reply: plan.question ?? 'Route ready',
      }
    }

    if (bookingState.jobType === 'junkRemoval' && (tl === 'next' || tl === 'continue')) {
      if (bookingState.scan.images.length === 0) {
        return {
          bookingState,
          reply: 'Add at least one photo of your junk to continue.',
        }
      }
      let nextState: BookingState = {
        ...bookingState,
        jobDetailsScanStepComplete: true,
        jobDetailsItemsConfirmed: true,
      }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return {
        bookingState: nextState,
        reply: plan.question ?? 'Done.',
      }
    }

    if (bookingState.jobType !== 'junkRemoval' && tl === 'confirm job items') {
      const hasItems = Object.keys(bookingState.itemCounts).length > 0
      if (!hasItems) {
        return {
          bookingState,
          reply: 'Scan again or adjust the list once items appear.',
        }
      }
      let nextState = { ...bookingState, jobDetailsItemsConfirmed: true }
      nextState = syncIntentState(nextState)
      return { bookingState: nextState, reply: 'List confirmed.' }
    }
    if (bookingState.jobType !== 'junkRemoval' && (tl === 'next' || tl === 'continue')) {
      const hasImages = bookingState.scan.images.length > 0
      const hasItems = Object.keys(bookingState.itemCounts).length > 0
      if (!hasImages || !hasItems || !bookingState.jobDetailsItemsConfirmed) {
        return {
          bookingState,
          reply: 'Scan your items, review the list, and confirm before continuing.',
        }
      }
      let nextState = { ...bookingState, jobDetailsScanStepComplete: true }
      nextState = syncIntentState(nextState)
      const plan = deriveNextQuestion(nextState)
      nextState.currentQuestion = plan.question
      nextState.suggestions = plan.suggestions
      return {
        bookingState: nextState,
        reply: plan.question ?? 'Done.',
      }
    }
  }

  const selectedJobType = parseJobTypeSelection(text)
  if (bookingState.jobType == null && selectedJobType) {
    const next = syncIntentState({
      ...bookingState,
      mode: 'building',
      source: inputSource,
      jobType: selectedJobType,
      currentQuestion: null,
      suggestions: [],
      detectedItems: bookingState.detectedItems,
      itemCounts: bookingState.itemCounts,
      isHeavyItem: selectedJobType === 'heavyItem' ? true : bookingState.isHeavyItem,
    })
    const plan = deriveNextQuestion(next)
    next.currentQuestion = plan.question
    next.suggestions = plan.suggestions
    return { bookingState: next, reply: plan.question ?? 'Done.' }
  }

  const parsed = parseFromText(text)
  const lane = classifyJobLane(text)
  const serviceTypeFromIntent = laneToServiceType(lane)
  const question = (bookingState.currentQuestion ?? '').toLowerCase()
  const explicitRemove = /\b(remove|junk|rubbish|trash|take away|clear out)\b/i.test(text)
  const explicitPickup = /\b(pick\s*up|pickup|collect|store run|grab)\b/i.test(text)
  const explicitMove = /\b(move|moving|relocate|moving house|move house)\b/i.test(text)
  const explicitHeavy = /\b(heavy item|heavy|piano|safe|spa|pool table|marble table)\b/i.test(text)
  const explicitHelpers = /\b(helpers?|need help|lifting help|loading help|assembly help|general labour)\b/i.test(
    text,
  )
  const explicitCleaning = /\b(clean(ing|er)?|housekeeping|bond clean|end of lease clean)\b/i.test(text)
  const wantsDriverMatch = /\b(find driver|dispatch|match|book now|confirm booking)\b/i.test(text)
  const saysSmall = /\bsmall\b/i.test(text)
  const saysMedium = /\bmedium\b/i.test(text)
  const saysLarge = /\blarge|big\b/i.test(text)
  const addItemMatch = text.match(/^(?:add(?: item)?|plus|\+)\s+(.+)$/i)
  const removeItemMatch = text.match(/^(?:remove(?: item)?|minus|-)\s+(.+)$/i)

  let next: BookingState = {
    ...bookingState,
    source: inputSource,
    mode: bookingState.mode === 'idle' ? 'building' : bookingState.mode,
  }

  if (input.addressSelection) {
    const sel = input.addressSelection
    if (sel.field === 'pickup') {
      next.pickupAddressText = sel.formattedAddress
      next.pickupPlace = {
        placeId: sel.placeId,
        formattedAddress: sel.formattedAddress,
        name: sel.name,
      }
      next.pickupCoords = sel.coords
    } else {
      next.dropoffAddressText = sel.formattedAddress
      next.dropoffPlace = {
        placeId: sel.placeId,
        formattedAddress: sel.formattedAddress,
        name: sel.name,
      }
      next.dropoffCoords = sel.coords
    }
  }

  if (explicitRemove) next.serviceType = 'remove'
  else if (explicitPickup) next.serviceType = 'pickup'
  else if (explicitMove) next.serviceType = 'move'
  else if (explicitHeavy) {
    next.serviceType = 'pickup'
    next.jobType = 'heavyItem'
    next.isHeavyItem = true
  }
  else if (explicitHelpers) next.serviceType = 'helpers'
  else if (explicitCleaning) next.serviceType = 'cleaning'
  else if (!isScanInput && !next.serviceType && parsed.service) next.serviceType = serviceTypeFromIntent
  else if (
    !next.serviceType &&
    (/\bremove\b/i.test(text) || /\bpickup|pick up\b/i.test(text) || /\bmove\b/i.test(text))
  ) {
    if (/\bremove\b/i.test(text)) next.serviceType = 'remove'
    else if (/\bpickup|pick up\b/i.test(text)) next.serviceType = 'pickup'
    else next.serviceType = 'move'
  }

  next = syncIntentState(next)

  if (next.jobType === 'homeMoving' && next.moveContext == null) next.moveContext = 'standard'

  if (saysSmall) next.moveSize = 'small'
  if (saysMedium) next.moveSize = 'medium'
  if (saysLarge) next.moveSize = 'large'

  if (addItemMatch) {
    const item = addItemMatch[1]?.trim()
    if (item) {
      next.itemCounts = addItemCount(next.itemCounts, item, 1)
      next.detectedItems = dedupeItems([...next.detectedItems, item])
    }
  }
  if (removeItemMatch) {
    const item = removeItemMatch[1]?.trim()
    if (item) {
      next.itemCounts = addItemCount(next.itemCounts, item, -1)
      if ((next.itemCounts[normalizeItemKey(item)] ?? 0) <= 0) {
        const key = normalizeItemKey(item)
        next.detectedItems = next.detectedItems.filter((i) => normalizeItemKey(i) !== key)
      }
    }
  }

  if (!hasAddressSelection && parsed.items.length) {
    next.detectedItems = dedupeItems([...next.detectedItems, ...parsed.items])
    for (const item of parsed.items) {
      next.itemCounts = addItemCount(next.itemCounts, item, 1)
    }
  }
  if (isScanInput && next.scan.result) {
    const r = next.scan.result
    let fromScan: string[] = Array.isArray(r.detectedItems) ? [...r.detectedItems] : []
    if (fromScan.length === 0 && Array.isArray(r.mainItems) && r.mainItems.length > 0) {
      fromScan = [...r.mainItems]
    }
    if (fromScan.length === 0) {
      fromScan = ['Items from your photos']
    }
    const seen = new Set<string>()
    for (const raw of fromScan) {
      const item = typeof raw === 'string' ? raw.trim() : String(raw)
      const key = normalizeItemKey(item)
      if (!key || seen.has(key)) continue
      seen.add(key)
      next.itemCounts = addItemCount(next.itemCounts, item, 1)
      next.detectedItems = dedupeItems([...next.detectedItems, item])
    }
    if (r.specialItemType && r.specialItemType !== 'none') {
      next.specialItemType = r.specialItemType
    }
    if (r.isHeavyItem) {
      next.isHeavyItem = true
    }
    next.isBulky = next.isBulky || Boolean(r.isBulky)
    next.needsTwoMovers = next.needsTwoMovers || Boolean(r.needsTwoMovers)
    next.needsSpecialEquipment = next.needsSpecialEquipment || Boolean(r.needsSpecialEquipment)
    next.accessRisk = r.accessRisk ?? next.accessRisk
  }
  if (isScanInput && next.jobDetailsStarted) {
    next.jobDetailsItemsConfirmed = false
  }
  next.inventorySummary = itemSummary(next.itemCounts)
  next = syncIntentState(next)

  const ambiguousService =
    !next.jobType &&
    next.detectedItems.length > 0 &&
    !explicitMove &&
    !explicitPickup &&
    !explicitRemove
  if (ambiguousService) {
    next.currentQuestion = 'What type of job is this?'
    next.suggestions = [
      'Junk removal',
      'Delivery / pickup',
      'Heavy item',
      'Home moving',
      'Helper',
      'Cleaning',
    ]
    next.mode = 'building'
    return { bookingState: next, reply: next.currentQuestion }
  }

  if (!hasAddressSelection && parsed.pickup) {
    next.pickupAddressText = parsed.pickup
    if (!input.addressSelection || input.addressSelection.field !== 'pickup') {
      next.pickupPlace = null
      next.pickupCoords = null
    }
  }
  if (!hasAddressSelection && parsed.dropoff) {
    next.dropoffAddressText = parsed.dropoff
    if (!input.addressSelection || input.addressSelection.field !== 'dropoff') {
      next.dropoffPlace = null
      next.dropoffCoords = null
    }
  }

  if (
    !hasAddressSelection &&
    !parsed.pickup &&
    !parsed.dropoff &&
    !parsed.affirmative &&
    !parsed.negative &&
    text.length > 4 &&
    !next.pickupAddressText
  ) {
    const looksLikeAddress =
      /\b(st|street|rd|road|ave|avenue|dr|drive|cres|court|ct|pl|place|lane|ln|blvd|boulevard)\b/i.test(
        text,
      ) || /\bfrom\b/i.test(text)
    if (looksLikeAddress) next.pickupAddressText = text
  }

  const answeringServiceQuestion = /type of job|moved, picked up, or removed/.test(question)
  if (answeringServiceQuestion && !next.jobType) {
    const inferredJobType = parseJobTypeSelection(text)
    if (inferredJobType) {
      next.jobType = inferredJobType
    } else if (/\bremove|removal|junk\b/i.test(text)) next.jobType = 'junkRemoval'
    else if (/\bpickup|pick up|collect|delivery\b/i.test(text)) next.jobType = 'deliveryPickup'
    else if (/\bheavy|piano|safe|spa|pool table|marble\b/i.test(text)) next.jobType = 'heavyItem'
    else if (/\bmove|moving\b/i.test(text)) next.jobType = 'homeMoving'
    else if (/\bclean(ing|er)?|housekeeping|bond clean\b/i.test(text)) next.jobType = 'cleaning'
  }

  const answeringPickupQuestion = /grabbing it from|pickup/.test(question)
  if (
    answeringPickupQuestion &&
    !hasAddressSelection &&
    !parsed.affirmative &&
    !parsed.negative &&
    text.length > 2
  ) {
    next.pickupAddressText = text
    if (!input.addressSelection || input.addressSelection.field !== 'pickup') {
      next.pickupPlace = null
      next.pickupCoords = null
    }
  }

  const answeringDropoffQuestion = /where'?s it going|drop-off|dropoff/.test(question)
  if (
    answeringDropoffQuestion &&
    !hasAddressSelection &&
    !parsed.affirmative &&
    !parsed.negative &&
    text.length > 2
  ) {
    next.dropoffAddressText = text
    if (!input.addressSelection || input.addressSelection.field !== 'dropoff') {
      next.dropoffPlace = null
      next.dropoffCoords = null
    }
  }

  const answeringStoreQuestion = /which store/.test(question)
  if (
    answeringStoreQuestion &&
    !hasAddressSelection &&
    !parsed.affirmative &&
    !parsed.negative &&
    text.length > 1
  ) {
    next.pickupAddressText = text
    if (!input.addressSelection || input.addressSelection.field !== 'pickup') {
      next.pickupPlace = null
      next.pickupCoords = null
    }
  }

  const answeringHelperLocation = /need a hand|enter location|pick the location/.test(question)
  const answeringHelperLocationFallback =
    /set the location|choose the location|where do you need help/.test(question)
  const answeringCleaningLocation = /where should we clean/.test(question)
  if (
    (answeringHelperLocation || answeringHelperLocationFallback || answeringCleaningLocation) &&
    !hasAddressSelection &&
    !parsed.affirmative &&
    !parsed.negative &&
    text.length > 2
  ) {
    next.pickupAddressText = text
    if (!input.addressSelection || input.addressSelection.field !== 'pickup') {
      next.pickupPlace = null
      next.pickupCoords = null
    }
  }

  const answeringHelperHours = /how long do you need help/.test(question)
  if (answeringHelperHours) {
    const match = text.match(/\b(\d+)\s*(?:hour|hr)/i)
    if (match) {
      next.helperHours = Math.max(1, Math.min(12, Number.parseInt(match[1] ?? '1', 10) || 1))
    } else if (/4\+|four\+|four plus/i.test(text)) {
      next.helperHours = 4
    }
  }

  const answeringCleaningHours = /how many hours of cleaning/.test(question)
  if (answeringCleaningHours) {
    const match = text.match(/\b(\d+)\s*(?:hour|hr)/i)
    if (match) {
      next.cleaningHours = Math.max(1, Math.min(12, Number.parseInt(match[1] ?? '1', 10) || 1))
    } else if (/4\+|four\+|four plus/i.test(text)) {
      next.cleaningHours = 4
    }
  }

  const answeringHelperType = /what kind of help/.test(question)
  if (answeringHelperType && text.length > 1) {
    next.helperType = text
  }

  const answeringCleaningType = /what kind of clean/.test(question)
  if (answeringCleaningType && text.length > 1) {
    next.cleaningType = text
  }

  const answeringHelperNotes =
    next.serviceType === 'helpers' && /extra details|anything else/i.test(question)
  if (answeringHelperNotes && text.length > 1) {
    next.helperNotes = /no extra details|no notes|nothing else/i.test(text) ? 'No extra details' : text
  }

  const answeringCleaningNotes =
    next.serviceType === 'cleaning' && /notes for the cleaner|extra details|anything else/i.test(question)
  if (answeringCleaningNotes && text.length > 1) {
    next.cleaningNotes = /no extra details|no notes|nothing else/i.test(text) ? 'No extra details' : text
  }

  const answeringDisposalQuestion = /disposal|dispose/i.test(question)
  if (answeringDisposalQuestion) {
    if (parsed.affirmative || /\byes|dispose|include\b/i.test(text)) {
      next.disposalRequired = true
      next.internalDisposalDestination = 'Licensed disposal facility'
    } else if (parsed.negative || /\bno\b/i.test(text)) {
      next.disposalRequired = false
      next.internalDisposalDestination = null
    }
  }

  const answeringStairsQuestion = /any stairs/.test(question)
  if (answeringStairsQuestion) {
    if (parsed.stairsCount != null) next.accessDetails.stairs = parsed.stairsCount > 0
    else if (parsed.affirmative || /\byes|stairs|steps\b/i.test(text)) next.accessDetails.stairs = true
    else if (parsed.negative || /\bno\b/i.test(text)) next.accessDetails.stairs = false
  }

  const answeringLiftQuestion = /lift access/.test(question)
  if (answeringLiftQuestion) {
    if (parsed.hasLift != null) next.accessDetails.lift = parsed.hasLift
    else if (parsed.affirmative || /\byes|lift|elevator\b/i.test(text)) next.accessDetails.lift = true
    else if (parsed.negative || /\bno\b/i.test(text)) next.accessDetails.lift = false
  }

  const answeringCarryQuestion = /carry distance/.test(question)
  if (answeringCarryQuestion) {
    if (parsed.carryDistanceM != null) next.accessDetails.carryDistance = parsed.carryDistanceM
    else if (parsed.affirmative || /\byes|long\b/i.test(text)) next.accessDetails.carryDistance = 35
    else if (parsed.negative || /\bno|short\b/i.test(text)) next.accessDetails.carryDistance = 10
  }

  const answeringTrickyQuestion = /anything tricky/.test(question)
  if (answeringTrickyQuestion) {
    if (/disassembl|dismant|take apart/i.test(text)) next.accessDetails.disassembly = true
    else if (parsed.negative || /\ball good|nothing\b/i.test(text)) next.accessDetails.disassembly = false
    else if (parsed.affirmative) next.accessDetails.disassembly = true
  }

  if (
    !hasAddressSelection &&
    !next.jobDetailsStarted &&
    !parsed.pickup &&
    !parsed.dropoff &&
    !parsed.affirmative &&
    !parsed.negative &&
    text.length > 4 &&
    next.pickupAddressText &&
    !next.dropoffAddressText &&
    (next.serviceType === 'move' || next.serviceType === 'pickup')
  ) {
    next.dropoffAddressText = text
  }

  if (parsed.stairsCount != null && next.accessDetails.stairs == null) next.accessDetails.stairs = parsed.stairsCount > 0
  if (parsed.hasLift != null && next.accessDetails.lift == null) next.accessDetails.lift = parsed.hasLift
  if (parsed.carryDistanceM != null && next.accessDetails.carryDistance == null)
    next.accessDetails.carryDistance = parsed.carryDistanceM
  if (/disassemble|take apart|dismantle/i.test(text) && next.accessDetails.disassembly == null)
    next.accessDetails.disassembly = true

  if (readyForPricing(next) && !isRouteTerminalPhase(next) && !next.pricing) {
    next.quoteBreakdown = computeBookingQuoteBreakdown(next)
    next.pricing = computeBookingPricing(next)
    if (
      next.pricing &&
      !(
        next.jobType === 'junkRemoval' &&
        (!next.junkQuoteAcknowledged || !next.junkConfirmStepComplete)
      )
    ) {
      next.mode = 'pricing'
    }
  }

  next = syncIntentState(next)

  if (wantsDriverMatch && canBeginJunkDriverDemo(next)) {
    next = beginJunkDriverDemo(next)
  }

  const paymentConfirmed =
    next.paymentIntent?.status === 'succeeded' ||
    next.bookingStatus === 'confirmed' ||
    next.bookingStatus === 'dispatching' ||
    next.bookingStatus === 'matched' ||
    next.bookingStatus === 'en_route' ||
    next.bookingStatus === 'arrived' ||
    next.bookingStatus === 'in_progress' ||
    next.bookingStatus === 'completed'

  if (next.mode === 'pricing' && next.pricing && paymentConfirmed && wantsDriverMatch) {
    return { bookingState: next, reply: 'Tap Find driver to dispatch this booking.' }
  }

  const plan = deriveNextQuestion(next)
  next.currentQuestion = plan.question
  next.suggestions = plan.suggestions

  if (next.mode === 'searching') {
    return { bookingState: next, reply: "Give me a sec — I'll fetch someone." }
  }
  if (next.mode === 'matched' && next.driver) {
    return { bookingState: next, reply: `Done. ${next.driver.name} · ${next.driver.etaMinutes} min away.` }
  }
  if (next.mode === 'pricing' && next.pricing) {
    if (!paymentConfirmed && wantsDriverMatch) {
      return { bookingState: next, reply: 'Secure payment to lock this booking first.' }
    }
    return {
      bookingState: next,
      reply: `Perfect. $${next.pricing.minPrice} to $${next.pricing.maxPrice} - about ${Math.round(next.pricing.estimatedDuration / 60)} min.`,
    }
  }

  if (addItemMatch || removeItemMatch) {
    return {
      bookingState: next,
      reply: next.inventorySummary ? `Here's what I've got so far.` : 'Done.',
    }
  }

  if (next.mode === 'building' && next.jobType === 'junkRemoval' && !next.pickupAddressText) {
    return { bookingState: next, reply: 'Where are we grabbing it from?' }
  }
  if (next.mode === 'building' && next.jobType === 'helper' && !next.pickupAddressText) {
    return { bookingState: next, reply: 'Where do you need help?' }
  }
  if (next.mode === 'building' && next.jobType === 'cleaning' && !next.pickupAddressText) {
    return { bookingState: next, reply: 'Where should we clean?' }
  }
  if (plan.question) {
    return { bookingState: next, reply: plan.question }
  }
  return { bookingState: next, reply: 'Done.' }
}
