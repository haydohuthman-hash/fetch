import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { computePriceForDraft } from '../../src/lib/booking/quoteEngine.ts'
import { createPaymentIntentRecord, reviewBookingDraft } from './fetch-ai-booking.js'
import { createMarketplaceStore } from './marketplace-store.js'

test('reviewBookingDraft returns a ready review for a complete booking draft', async () => {
  const review = await reviewBookingDraft({
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '88 Charlotte St, Brisbane City QLD',
    dropoffCoords: { lat: -27.4682, lng: 153.0277 },
    route: {
      distanceMeters: 6400,
      durationSeconds: 1140,
      path: [],
    },
    pricing: null,
    quoteBreakdown: null,
    detectedItems: ['couch'],
    itemCounts: { couch: 1 },
    inventorySummary: 'couch',
    accessDetails: {
      stairs: false,
      lift: true,
      carryDistance: 10,
      disassembly: false,
    },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    moveSize: null,
    homeBedrooms: null,
    scanConfidence: 0.88,
    bookingId: null,
  })

  assert.equal(review.ready, true)
  assert.equal(review.aiReview.status, 'ready')
  assert.equal(review.pricing?.currency, 'AUD')
  assert.ok((review.pricing?.maxPrice ?? 0) >= (review.pricing?.minPrice ?? 0))
  assert.equal(review.missingFields.length, 0)
})

test('marketplace lifecycle materializes dispatch updates and notifications', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-booking-flow-'))
  const dataFile = path.join(tempDir, 'marketplace-data.json')
  const store = createMarketplaceStore(dataFile)
  const state = await store.readState()

  const paymentIntent = createPaymentIntentRecord({ bookingId: 'bk_test', amount: 179 })
  paymentIntent.status = 'succeeded'
  paymentIntent.confirmedAt = Date.now()
  store.upsertPaymentIntent(state, paymentIntent)
  store.upsertBooking(state, {
    id: 'bk_test',
    status: 'confirmed',
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '88 Charlotte St, Brisbane City QLD',
    dropoffCoords: { lat: -27.4682, lng: 153.0277 },
    route: {
      distanceMeters: 6400,
      durationSeconds: 1140,
      path: [],
    },
    pricing: {
      minPrice: 149,
      maxPrice: 179,
      currency: 'AUD',
      estimatedDuration: 2700,
      explanation: 'pickup job',
    },
    quoteBreakdown: {
      baseFee: 56,
      routeFee: 17,
      routeTimeFee: 9,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: 0,
      specialtyFee: 0,
      specialtyLines: [],
      moveSizeMultiplier: 1,
      subtotal: 82,
      spread: 14,
      totalItems: 1,
      autoHelpers: 0,
    },
    aiReview: {
      status: 'ready',
      summary: 'Fetch AI reviewed the booking.',
      confidence: 0.9,
      riskLevel: 'low',
      highlights: ['Job looks straightforward from the current details.'],
      blockers: [],
      suggestedPrompt: 'Quote is ready. Secure payment to confirm the booking.',
      quoteBreakdown: null,
      lastReviewedAt: Date.now(),
      errorMessage: null,
    },
    detectedItems: ['couch'],
    itemCounts: { couch: 1 },
    inventorySummary: 'couch',
    accessDetails: {
      stairs: false,
      lift: true,
      carryDistance: 10,
      disassembly: false,
    },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    paymentIntent,
    matchedDriver: null,
    timeline: [],
  })

  const dispatchStarted = Date.now()
  const dispatchResult = store.startDispatch(state, 'bk_test')
  assert.equal(dispatchResult.error, null)
  assert.ok(dispatchResult.booking)
  const booking = state.bookings.find((row) => row.id === 'bk_test')
  assert.ok(booking?.dispatchMeta?.startedAt)
  assert.equal(booking?.status, 'pending_match')
  assert.equal(booking?.matchedDriver, null)
  assert.equal(booking?.driverControlled, true)
  assert.equal(booking?.matchingMode, 'pool')
  store.materializeState(state, booking.dispatchMeta.startedAt + 120_000)

  const updated = state.bookings.find((row) => row.id === 'bk_test')
  assert.equal(updated?.status, 'pending_match')
  assert.equal(updated?.matchedDriver, null)
  assert.ok(state.notifications.some((notification) => notification.bookingId === 'bk_test'))
  assert.ok(updated?.timeline.some((entry) => entry.kind === 'pending_match'))

  await fs.rm(tempDir, { recursive: true, force: true })
  assert.ok(dispatchStarted > 0)
})

test('startDispatch sequential enables matching engine (driverControlled false)', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-seq-mode-'))
  const dataFile = path.join(tempDir, 'marketplace-data.json')
  const store = createMarketplaceStore(dataFile)
  const state = await store.readState()
  const paymentIntent = createPaymentIntentRecord({ bookingId: 'bk_seq_mode', amount: 120 })
  paymentIntent.status = 'succeeded'
  paymentIntent.confirmedAt = Date.now()
  store.upsertPaymentIntent(state, paymentIntent)
  store.upsertBooking(state, {
    id: 'bk_seq_mode',
    status: 'confirmed',
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: '1 Seq St',
    pickupCoords: { lat: -27.47, lng: 153.03 },
    dropoffAddressText: '2 Seq St',
    dropoffCoords: { lat: -27.48, lng: 153.04 },
    route: { distanceMeters: 1000, durationSeconds: 120, path: [] },
    pricing: {
      minPrice: 100,
      maxPrice: 120,
      currency: 'AUD',
      estimatedDuration: 600,
      explanation: 'test',
    },
    quoteBreakdown: {
      baseFee: 50,
      routeFee: 10,
      routeTimeFee: 5,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: 0,
      specialtyFee: 0,
      specialtyLines: [],
      moveSizeMultiplier: 1,
      subtotal: 65,
      spread: 10,
      totalItems: 1,
      autoHelpers: 0,
    },
    aiReview: {
      status: 'ready',
      summary: 'ok',
      confidence: 0.9,
      riskLevel: 'low',
      highlights: [],
      blockers: [],
      suggestedPrompt: null,
      quoteBreakdown: null,
      lastReviewedAt: Date.now(),
      errorMessage: null,
    },
    detectedItems: [],
    itemCounts: {},
    inventorySummary: null,
    accessDetails: { stairs: false, lift: true, carryDistance: 10, disassembly: false },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    paymentIntent,
    matchedDriver: null,
    timeline: [],
  })
  const r = store.startDispatch(state, 'bk_seq_mode', { matchingMode: 'sequential' })
  assert.equal(r.error, null)
  const b = state.bookings.find((row) => row.id === 'bk_seq_mode')
  assert.ok(b)
  assert.equal(b.matchingMode, 'sequential')
  assert.equal(b.driverControlled, false)
  await fs.rm(tempDir, { recursive: true, force: true })
})

test('atomicAcceptMatch rejects second driver', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-atomic-'))
  const dataFile = path.join(tempDir, 'm.json')
  const store = createMarketplaceStore(dataFile)
  const state = await store.readState()
  store.upsertBooking(state, {
    id: 'bk_atom',
    status: 'pending_match',
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: 'A',
    pickupCoords: { lat: -27, lng: 153 },
    dropoffAddressText: 'B',
    dropoffCoords: { lat: -27.1, lng: 153.1 },
    route: { distanceMeters: 500, durationSeconds: 60, path: [] },
    pricing: {
      minPrice: 50,
      maxPrice: 60,
      currency: 'AUD',
      estimatedDuration: 300,
      explanation: 't',
    },
    quoteBreakdown: {
      baseFee: 20,
      routeFee: 5,
      routeTimeFee: 2,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: 0,
      specialtyFee: 0,
      specialtyLines: [],
      moveSizeMultiplier: 1,
      subtotal: 27,
      spread: 5,
      totalItems: 1,
      autoHelpers: 0,
    },
    aiReview: {
      status: 'ready',
      summary: 'ok',
      confidence: 0.9,
      riskLevel: 'low',
      highlights: [],
      blockers: [],
      suggestedPrompt: null,
      quoteBreakdown: null,
      lastReviewedAt: Date.now(),
      errorMessage: null,
    },
    detectedItems: [],
    itemCounts: {},
    inventorySummary: null,
    accessDetails: { stairs: false, lift: true, carryDistance: 10, disassembly: false },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    paymentIntent: null,
    matchedDriver: null,
    timeline: [],
  })
  const d1 = { id: 'd1', name: 'Driver One', vehicle: 'Van', rating: 4.9 }
  const d2 = { id: 'd2', name: 'Driver Two', vehicle: 'Ute', rating: 4.8 }
  const a1 = store.atomicAcceptMatch(state, 'bk_atom', 'd1', d1)
  assert.equal(a1.error, null)
  const a2 = store.atomicAcceptMatch(state, 'bk_atom', 'd2', d2)
  assert.equal(a2.error, 'already_assigned')
  await fs.rm(tempDir, { recursive: true, force: true })
})

test('driverControlled skips demo dispatch timer progression', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-booking-flow-'))
  const dataFile = path.join(tempDir, 'marketplace-data.json')
  const store = createMarketplaceStore(dataFile)
  const state = await store.readState()

  const paymentIntent = createPaymentIntentRecord({ bookingId: 'bk_dc', amount: 179 })
  paymentIntent.status = 'succeeded'
  paymentIntent.confirmedAt = Date.now()
  store.upsertPaymentIntent(state, paymentIntent)
  store.upsertBooking(state, {
    id: 'bk_dc',
    status: 'confirmed',
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: '1 Test St',
    pickupCoords: { lat: -27.47, lng: 153.03 },
    dropoffAddressText: '2 Test St',
    dropoffCoords: { lat: -27.48, lng: 153.04 },
    route: { distanceMeters: 1000, durationSeconds: 120, path: [] },
    pricing: {
      minPrice: 100,
      maxPrice: 120,
      currency: 'AUD',
      estimatedDuration: 600,
      explanation: 'test',
    },
    quoteBreakdown: {
      baseFee: 50,
      routeFee: 10,
      routeTimeFee: 5,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: 0,
      specialtyFee: 0,
      specialtyLines: [],
      moveSizeMultiplier: 1,
      subtotal: 65,
      spread: 10,
      totalItems: 1,
      autoHelpers: 0,
    },
    aiReview: {
      status: 'ready',
      summary: 'ok',
      confidence: 0.9,
      riskLevel: 'low',
      highlights: [],
      blockers: [],
      suggestedPrompt: null,
      quoteBreakdown: null,
      lastReviewedAt: Date.now(),
      errorMessage: null,
    },
    detectedItems: [],
    itemCounts: {},
    inventorySummary: null,
    accessDetails: {
      stairs: false,
      lift: true,
      carryDistance: 10,
      disassembly: false,
    },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    paymentIntent,
    matchedDriver: null,
    timeline: [],
  })

  const dispatchResult = store.startDispatch(state, 'bk_dc')
  assert.equal(dispatchResult.error, null)
  const booking = state.bookings.find((row) => row.id === 'bk_dc')
  assert.ok(booking)
  assert.equal(booking.driverControlled, true)
  store.materializeState(state, booking.dispatchMeta.startedAt + 120_000)

  const updated = state.bookings.find((row) => row.id === 'bk_dc')
  assert.equal(updated?.status, 'pending_match')

  await fs.rm(tempDir, { recursive: true, force: true })
})

test('matching engine issues offer when driverControlled is false and a driver is online', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-booking-flow-'))
  const dataFile = path.join(tempDir, 'marketplace-data.json')
  const store = createMarketplaceStore(dataFile)
  const state = await store.readState()

  const paymentIntent = createPaymentIntentRecord({ bookingId: 'bk_offer', amount: 179 })
  paymentIntent.status = 'succeeded'
  paymentIntent.confirmedAt = Date.now()
  store.upsertPaymentIntent(state, paymentIntent)
  store.upsertBooking(state, {
    id: 'bk_offer',
    status: 'confirmed',
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '88 Charlotte St, Brisbane City QLD',
    dropoffCoords: { lat: -27.4682, lng: 153.0277 },
    route: { distanceMeters: 6400, durationSeconds: 1140, path: [] },
    pricing: {
      minPrice: 149,
      maxPrice: 179,
      currency: 'AUD',
      estimatedDuration: 2700,
      explanation: 'pickup job',
    },
    quoteBreakdown: {
      baseFee: 56,
      routeFee: 17,
      routeTimeFee: 9,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: 0,
      specialtyFee: 0,
      specialtyLines: [],
      moveSizeMultiplier: 1,
      subtotal: 82,
      spread: 14,
      totalItems: 1,
      autoHelpers: 0,
    },
    aiReview: {
      status: 'ready',
      summary: 'ok',
      confidence: 0.9,
      riskLevel: 'low',
      highlights: [],
      blockers: [],
      suggestedPrompt: null,
      quoteBreakdown: null,
      lastReviewedAt: Date.now(),
      errorMessage: null,
    },
    detectedItems: ['couch'],
    itemCounts: { couch: 1 },
    inventorySummary: 'couch',
    accessDetails: {
      stairs: false,
      lift: true,
      carryDistance: 10,
      disassembly: false,
    },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    paymentIntent,
    matchedDriver: null,
    timeline: [],
  })

  store.startDispatch(state, 'bk_offer')
  const booking = state.bookings.find((row) => row.id === 'bk_offer')
  assert.ok(booking)
  booking.driverControlled = false
  state.driverPresence = [
    {
      driverId: 'driver_nearby',
      online: true,
      lat: -27.468,
      lng: 153.038,
      updatedAt: Date.now(),
      rating: 4.9,
      completedJobs: 12,
    },
  ]
  store.materializeState(state, Date.now())

  assert.ok(state.offers.some((o) => o.bookingId === 'bk_offer' && o.status === 'pending'))

  await fs.rm(tempDir, { recursive: true, force: true })
})

test('reviewBookingDraft returns a ready review for helpers bookings', async () => {
  const review = await reviewBookingDraft({
    jobType: 'helper',
    serviceMode: 'helpers',
    serviceType: 'helpers',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '',
    dropoffCoords: null,
    route: null,
    pricing: null,
    quoteBreakdown: null,
    detectedItems: [],
    itemCounts: {},
    inventorySummary: null,
    accessDetails: {
      stairs: null,
      lift: null,
      carryDistance: null,
      disassembly: null,
    },
    disposalRequired: null,
    helperHours: 2,
    helperType: 'Loading help',
    helperNotes: 'One person to help load a van',
    moveSize: null,
    homeBedrooms: null,
    scanConfidence: null,
    bookingId: null,
  })

  assert.equal(review.ready, true)
  assert.equal(review.aiReview.status, 'ready')
  assert.equal(review.pricing?.currency, 'AUD')
  assert.match(review.pricing?.explanation ?? '', /helpers job/i)
  assert.equal(review.missingFields.length, 0)
})

test('reviewBookingDraft returns a ready review for move bookings', async () => {
  const review = await reviewBookingDraft({
    jobType: 'homeMoving',
    serviceMode: 'move',
    serviceType: 'move',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '88 Charlotte St, Brisbane City QLD',
    dropoffCoords: { lat: -27.4682, lng: 153.0277 },
    route: {
      distanceMeters: 12400,
      durationSeconds: 1860,
      path: [],
    },
    pricing: null,
    quoteBreakdown: null,
    detectedItems: ['sofa', 'fridge', 'boxes', 'washing machine'],
    itemCounts: { sofa: 1, fridge: 1, boxes: 6, 'washing machine': 1 },
    inventorySummary: 'sofa, fridge, 6x boxes, washing machine',
    accessDetails: {
      stairs: true,
      lift: false,
      carryDistance: 25,
      disassembly: false,
    },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    moveSize: 'medium',
    homeBedrooms: null,
    scanConfidence: null,
    bookingId: null,
  })

  assert.equal(review.ready, true)
  assert.equal(review.aiReview.status, 'ready')
  assert.ok((review.quoteBreakdown?.autoHelpers ?? 0) >= 1)
  assert.equal(review.missingFields.length, 0)
})

test('reviewBookingDraft returns a ready review for junk bookings', async () => {
  const review = await reviewBookingDraft({
    jobType: 'junkRemoval',
    serviceMode: 'junk',
    serviceType: 'remove',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '',
    dropoffCoords: null,
    route: null,
    pricing: null,
    quoteBreakdown: null,
    detectedItems: ['mattress', 'boxes'],
    itemCounts: { mattress: 1, boxes: 4 },
    inventorySummary: 'mattress, 4x boxes',
    accessDetails: {
      stairs: false,
      lift: true,
      carryDistance: 15,
      disassembly: false,
    },
    disposalRequired: true,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    moveSize: null,
    homeBedrooms: null,
    scanConfidence: null,
    bookingId: null,
  })

  assert.equal(review.ready, true)
  assert.equal(review.aiReview.status, 'ready')
  assert.ok((review.quoteBreakdown?.disposalFee ?? 0) > 0)
  assert.ok(review.aiReview.highlights.some((line) => /disposal/i.test(line)))
  assert.equal(review.missingFields.length, 0)
})

test('reviewBookingDraft recomputes pricing instead of trusting client quote fields', async () => {
  const review = await reviewBookingDraft({
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '88 Charlotte St, Brisbane City QLD',
    dropoffCoords: { lat: -27.4682, lng: 153.0277 },
    route: {
      distanceMeters: 6400,
      durationSeconds: 1140,
      path: [],
    },
    pricing: {
      minPrice: 1,
      maxPrice: 2,
      currency: 'AUD',
      estimatedDuration: 60,
      explanation: 'tampered',
    },
    quoteBreakdown: {
      baseFee: 1,
      routeFee: 1,
      routeTimeFee: 1,
      inventoryFee: 1,
      accessFee: 1,
      disposalFee: 1,
      helperFee: 1,
      specialtyFee: 0,
      specialtyLines: [],
      moveSizeMultiplier: 1,
      subtotal: 1,
      spread: 1,
      totalItems: 1,
      autoHelpers: 0,
    },
    detectedItems: ['couch'],
    itemCounts: { couch: 1 },
    inventorySummary: 'couch',
    accessDetails: {
      stairs: false,
      lift: true,
      carryDistance: 10,
      disassembly: false,
    },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    moveSize: null,
    homeBedrooms: null,
    scanConfidence: 0.88,
    bookingId: null,
  })

  assert.notEqual(review.pricing?.maxPrice, 2)
  assert.notEqual(review.quoteBreakdown?.subtotal, 1)
  assert.doesNotMatch(review.pricing?.explanation ?? '', /tampered/i)
})

test('marketplace dispatch rejects unpaid or unconfirmed bookings', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-booking-flow-'))
  const dataFile = path.join(tempDir, 'marketplace-data.json')
  const store = createMarketplaceStore(dataFile)
  const state = await store.readState()

  store.upsertBooking(state, {
    id: 'bk_unpaid',
    status: 'payment_required',
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '88 Charlotte St, Brisbane City QLD',
    dropoffCoords: { lat: -27.4682, lng: 153.0277 },
    route: {
      distanceMeters: 6400,
      durationSeconds: 1140,
      path: [],
    },
    pricing: {
      minPrice: 149,
      maxPrice: 179,
      currency: 'AUD',
      estimatedDuration: 2700,
      explanation: 'pickup job',
    },
    quoteBreakdown: {
      baseFee: 56,
      routeFee: 17,
      routeTimeFee: 9,
      inventoryFee: 0,
      accessFee: 0,
      disposalFee: 0,
      helperFee: 0,
      specialtyFee: 0,
      specialtyLines: [],
      moveSizeMultiplier: 1,
      subtotal: 82,
      spread: 14,
      totalItems: 1,
      autoHelpers: 0,
    },
    aiReview: {
      status: 'ready',
      summary: 'Fetch AI reviewed the booking.',
      confidence: 0.9,
      riskLevel: 'low',
      highlights: ['Job looks straightforward from the current details.'],
      blockers: [],
      suggestedPrompt: 'Quote is ready. Secure payment to confirm the booking.',
      quoteBreakdown: null,
      lastReviewedAt: Date.now(),
      errorMessage: null,
    },
    detectedItems: ['couch'],
    itemCounts: { couch: 1 },
    inventorySummary: 'couch',
    accessDetails: {
      stairs: false,
      lift: true,
      carryDistance: 10,
      disassembly: false,
    },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    paymentIntent: null,
    matchedDriver: null,
    timeline: [],
  })

  const dispatchResult = store.startDispatch(state, 'bk_unpaid')
  assert.equal(dispatchResult.booking, null)
  assert.equal(dispatchResult.error, 'booking_not_dispatchable')

  await fs.rm(tempDir, { recursive: true, force: true })
})

test('reviewBookingDraft still prices with route fallback when route missing but addresses present', async () => {
  const review = await reviewBookingDraft({
    jobType: 'deliveryPickup',
    serviceMode: 'pickup',
    serviceType: 'pickup',
    pickupAddressText: '12 River St, New Farm QLD',
    pickupCoords: { lat: -27.4679, lng: 153.0381 },
    dropoffAddressText: '88 Charlotte St, Brisbane City QLD',
    dropoffCoords: { lat: -27.4682, lng: 153.0277 },
    route: null,
    pricing: null,
    quoteBreakdown: null,
    detectedItems: ['couch'],
    itemCounts: { couch: 1 },
    inventorySummary: 'couch',
    accessDetails: {
      stairs: false,
      lift: true,
      carryDistance: 10,
      disassembly: false,
    },
    disposalRequired: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    moveSize: null,
    homeBedrooms: null,
    scanConfidence: 0.88,
    bookingId: null,
  })

  assert.ok(review.pricing)
  assert.equal(review.pricing.usedRouteFallback, true)
  assert.ok(review.missingFields.includes('route'))
  assert.equal(review.ready, false)
})

test('computePriceForDraft returns error when job type missing', () => {
  const r = computePriceForDraft(
    {
      jobType: null,
      serviceMode: 'pickup',
      serviceType: 'pickup',
      pickupAddressText: 'A',
      pickupCoords: null,
      dropoffAddressText: 'B',
      dropoffCoords: null,
      route: null,
      pricing: null,
      quoteBreakdown: null,
      detectedItems: [],
      itemCounts: {},
      inventorySummary: null,
      accessDetails: {
        stairs: false,
        lift: true,
        carryDistance: 10,
        disassembly: false,
      },
      disposalRequired: null,
      helperHours: null,
      helperType: null,
      helperNotes: null,
      cleaningHours: null,
      cleaningType: null,
      cleaningNotes: null,
      specialItemType: null,
      isHeavyItem: false,
      isBulky: false,
      needsTwoMovers: false,
      needsSpecialEquipment: false,
      accessRisk: null,
      moveSize: null,
      homeBedrooms: null,
      scanConfidence: null,
      bookingId: null,
    },
    { allowRouteFallback: true },
  )
  assert.equal(r.ok, false)
  assert.ok((r.missingFields?.length ?? 0) > 0)
})
