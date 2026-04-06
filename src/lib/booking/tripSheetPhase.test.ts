import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialBookingState } from '../assistant'
import { deriveTripSheetPhase, mapStageForTripSheetPhase, tripSheetPhasePrefersExpandedSnap } from './tripSheetPhase'

const baseFlags = {
  showConfirm: false,
  showIntent: false,
  showPickup: false,
  showDropoff: false,
  showLaborDetails: false,
  showRouteReady: false,
  showBuildingRoute: false,
  showScanner: false,
  showPostScan: false,
  hasSheetPricing: false,
  stripeCheckoutActive: false,
}

test('deriveTripSheetPhase: pickup wins over post-scan flags', () => {
  const s = createInitialBookingState()
  const phase = deriveTripSheetPhase(s, {
    ...baseFlags,
    showPickup: true,
    showPostScan: true,
    hasSheetPricing: true,
  })
  assert.equal(phase, 'pickup_address')
})

test('deriveTripSheetPhase: live matching from persisted status', () => {
  const s = createInitialBookingState()
  s.bookingStatus = 'pending_match'
  const phase = deriveTripSheetPhase(s, { ...baseFlags, showPostScan: true, hasSheetPricing: true })
  assert.equal(phase, 'matching')
})

test('deriveTripSheetPhase: paid confirmed before driver flow', () => {
  const s = createInitialBookingState()
  s.bookingStatus = 'confirmed'
  s.paymentIntent = {
    id: 'pi_test',
    status: 'succeeded',
    amount: 100,
    currency: 'AUD',
    paymentMethodId: null,
    clientSecret: '',
    lastError: null,
    createdAt: Date.now(),
    confirmedAt: Date.now(),
  }
  const phase = deriveTripSheetPhase(s, { ...baseFlags, showPostScan: true, hasSheetPricing: true })
  assert.equal(phase, 'dispatch_pending')
})

test('mapStageForTripSheetPhase maps live phases', () => {
  assert.equal(mapStageForTripSheetPhase('matching', 'building'), 'searching')
  assert.equal(mapStageForTripSheetPhase('driver_assigned', 'building'), 'matched')
  assert.equal(mapStageForTripSheetPhase('en_route', 'building'), 'live')
})

test('tripSheetPhasePrefersExpandedSnap', () => {
  assert.equal(tripSheetPhasePrefersExpandedSnap('pickup_address'), false)
  assert.equal(tripSheetPhasePrefersExpandedSnap('matching'), true)
})
