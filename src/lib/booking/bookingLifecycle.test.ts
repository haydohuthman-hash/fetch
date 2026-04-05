import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BookingState } from '../assistant/types'
import { createInitialBookingState } from '../assistant/types'
import {
  canAdvancePersistedJobStatus,
  getNextPersistedJobStatus,
  isLivePipelinePersistedStatus,
  isWizardLockedByPersistedStatus,
  lifecyclePhaseFromPersistedStatus,
} from './bookingLifecycle'
import { getSessionPhaseFromBookingState } from './bookingSessionPhase'

describe('bookingLifecycle', () => {
  it('maps wire statuses to logical phases', () => {
    assert.equal(lifecyclePhaseFromPersistedStatus('dispatching'), 'pending_match')
    assert.equal(lifecyclePhaseFromPersistedStatus('pending_match'), 'pending_match')
    assert.equal(lifecyclePhaseFromPersistedStatus('matched'), 'driver_assigned')
    assert.equal(lifecyclePhaseFromPersistedStatus('in_progress'), 'in_transit')
    assert.equal(lifecyclePhaseFromPersistedStatus('match_failed'), 'match_failed')
    assert.equal(lifecyclePhaseFromPersistedStatus('confirmed'), 'booking_confirmed')
    assert.equal(lifecyclePhaseFromPersistedStatus('payment_required'), 'confirming_booking')
    assert.equal(lifecyclePhaseFromPersistedStatus('draft'), 'reviewing_job')
  })

  it('driver progression is linear', () => {
    assert.equal(getNextPersistedJobStatus('matched'), 'en_route')
    assert.equal(getNextPersistedJobStatus('en_route'), 'arrived')
    assert.equal(getNextPersistedJobStatus('arrived'), 'in_progress')
    assert.equal(getNextPersistedJobStatus('in_progress'), 'completed')
    assert.equal(getNextPersistedJobStatus('completed'), null)
  })

  it('canAdvancePersistedJobStatus allows only single hops', () => {
    assert.equal(canAdvancePersistedJobStatus('matched', 'en_route'), true)
    assert.equal(canAdvancePersistedJobStatus('matched', 'completed'), false)
  })

  it('live pipeline includes completed for poll tail', () => {
    assert.equal(isLivePipelinePersistedStatus('dispatching'), true)
    assert.equal(isLivePipelinePersistedStatus('completed'), true)
    assert.equal(isLivePipelinePersistedStatus('cancelled'), false)
  })

  it('wizard lock matches advanced wire statuses', () => {
    assert.equal(isWizardLockedByPersistedStatus(null), false)
    assert.equal(isWizardLockedByPersistedStatus('draft'), false)
    assert.equal(isWizardLockedByPersistedStatus('payment_required'), true)
    assert.equal(isWizardLockedByPersistedStatus('pending_match'), true)
    assert.equal(isWizardLockedByPersistedStatus('match_failed'), true)
  })

  it('getSessionPhaseFromBookingState: junk pre-pay search shows pending_match', () => {
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

  it('getSessionPhaseFromBookingState: idle on fresh home state (idle mode, no job)', () => {
    const s = createInitialBookingState()
    assert.equal(getSessionPhaseFromBookingState(s), 'idle')
  })

  it('getSessionPhaseFromBookingState: selecting_service once user engages (building mode, no job type)', () => {
    const s = createInitialBookingState()
    s.mode = 'building'
    assert.equal(getSessionPhaseFromBookingState(s), 'selecting_service')
  })
})
