import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createInitialBookingState, type BookingState } from '../assistant/types'
import {
  getCustomerMapModeFromPhase,
  getDriverMapStageFromPhase,
  getNextSessionPhase,
  getNextWireStatus,
  getSessionPhaseFromBookingState,
  getSessionPhaseFromRecord,
  getSessionPhaseJobCard,
  isJobActive,
  sessionPhaseFromWireStatus,
} from './bookingSessionPhase'

describe('bookingSessionPhase', () => {
  it('maps wire dispatching and pending_match to pending_match phase', () => {
    assert.equal(sessionPhaseFromWireStatus('dispatching'), 'pending_match')
    assert.equal(sessionPhaseFromWireStatus('pending_match'), 'pending_match')
  })

  it('maps confirmed to booking_confirmed', () => {
    assert.equal(sessionPhaseFromWireStatus('confirmed'), 'booking_confirmed')
    assert.equal(sessionPhaseFromWireStatus('payment_required'), 'confirming_booking')
    assert.equal(sessionPhaseFromWireStatus('draft'), 'reviewing_job')
  })

  it('driver leg transitions match marketplace ordering', () => {
    assert.equal(getNextWireStatus('matched'), 'en_route')
    assert.equal(getNextWireStatus('en_route'), 'arrived')
    assert.equal(getNextWireStatus('arrived'), 'in_progress')
    assert.equal(getNextWireStatus('in_progress'), 'completed')
    assert.equal(getNextWireStatus('completed'), null)
  })

  it('getNextSessionPhase follows ride leg order', () => {
    assert.equal(getNextSessionPhase('driver_assigned'), 'driver_en_route')
    assert.equal(getNextSessionPhase('driver_en_route'), 'arrived_at_pickup')
  })

  it('isJobActive matches ride pipeline (incl. completed tail)', () => {
    assert.equal(isJobActive('pending_match'), true)
    assert.equal(isJobActive('completed'), true)
    assert.equal(isJobActive('booking_confirmed'), false)
    assert.equal(isJobActive('idle'), false)
  })

  it('customer map mode regression: pending_match → searching', () => {
    assert.equal(getCustomerMapModeFromPhase('pending_match'), 'searching')
    assert.equal(getCustomerMapModeFromPhase('driver_assigned'), 'matched')
    assert.equal(getCustomerMapModeFromPhase('completed'), 'idle')
  })

  it('driver map stage regression: pending_match → building', () => {
    assert.equal(getDriverMapStageFromPhase('pending_match'), 'building')
    assert.equal(getDriverMapStageFromPhase('driver_assigned'), 'matched')
    assert.equal(getDriverMapStageFromPhase('arrived_at_pickup'), 'live')
  })

  it('getSessionPhaseFromRecord treats empty draft as idle', () => {
    assert.equal(getSessionPhaseFromRecord({ status: 'draft', jobType: null }), 'idle')
  })

  it('getSessionPhaseJobCard returns title+line for pending_match', () => {
    const card = getSessionPhaseJobCard({ phase: 'pending_match', driver: null })
    assert.equal(card.title, 'Finding a driver')
    assert.ok(card.line.length > 0)
  })

  it('getSessionPhaseFromBookingState uses deriveFlowStep when no bookingStatus', () => {
    const s = createInitialBookingState()
    assert.equal(getSessionPhaseFromBookingState(s), 'idle')
    const withJob = { ...s, jobType: 'junkRemoval' as const }
    assert.equal(getSessionPhaseFromBookingState(withJob), 'entering_pickup')
  })

  it('junk pre-pay driver search overrides payment_required phase', () => {
    const base = createInitialBookingState()
    const s: BookingState = {
      ...base,
      jobType: 'junkRemoval',
      flowStep: 'payment',
      mode: 'searching',
      bookingStatus: 'payment_required',
      pricing: { minPrice: 1, maxPrice: 2, currency: 'AUD', estimatedDuration: 60, explanation: '' },
      quoteBreakdown: null,
    }
    assert.equal(getSessionPhaseFromBookingState(s), 'pending_match')
  })
})
