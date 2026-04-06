import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FETCH_AI_CHAT_REPLY_MAX,
  sanitizeBookingPatch,
  parseFetchAiChatModelContent,
  parseSubmitFetchTurnToolArguments,
} from './fetchChatParse.js'

function assertChoicesInteraction(interaction) {
  assert.ok(interaction && typeof interaction === 'object')
  assert.equal(interaction.type, 'choices')
  assert.ok(Array.isArray(interaction.choices))
  assert.equal(interaction.choices.length, 4)
  assert.ok(interaction.choices.every((c) => typeof c === 'string' && c.length > 0))
}

test('golden AU junk removal turn parses from model JSON', () => {
  const raw = JSON.stringify({
    say: 'Got it — rubbish pickup near New Farm.',
    sheet: {
      prompt: 'When works best?',
      choices: ['Today arvo', 'Tomorrow morning', 'This week', 'Tell you in my words'],
    },
    bookingPatch: {
      jobType: 'junkRemoval',
      pickupAddressText: '12 James St, New Farm QLD 4005',
    },
  })
  const p = parseFetchAiChatModelContent(raw)
  assert.ok(p.reply.includes('rubbish') || p.reply.includes('pickup'))
  assertChoicesInteraction(p.interaction)
  assert.equal(p.bookingPatch?.jobType, 'junkRemoval')
  assert.ok((p.bookingPatch?.pickupAddressText || '').includes('New Farm'))
})

test('golden home move turn with pickup and dropoff', () => {
  const raw = JSON.stringify({
    say: 'A household move — I will confirm both ends.',
    sheet: null,
    bookingPatch: {
      jobType: 'homeMoving',
      pickupAddressText: '4/88 Merthyr Rd, New Farm QLD',
      dropoffAddressText: '200 Adelaide St, Brisbane City QLD',
    },
  })
  const p = parseFetchAiChatModelContent(raw)
  assert.equal(p.bookingPatch?.jobType, 'homeMoving')
  assert.ok(p.bookingPatch?.pickupAddressText)
  assert.ok(p.bookingPatch?.dropoffAddressText)
  assert.equal(p.interaction, null)
})

test('sanitizeBookingPatch drops invalid jobType but keeps valid addresses', () => {
  const p = sanitizeBookingPatch({
    jobType: 'invalidJob',
    pickupAddressText: '  10 Eagle St, Brisbane  ',
  })
  assert.equal(p?.jobType, undefined)
  assert.ok(p?.pickupAddressText?.includes('Eagle'))
})

test('sanitizeBookingPatch rejects openBookingOnMap without job or pickup', () => {
  const p = sanitizeBookingPatch({ openBookingOnMap: true })
  assert.equal(p, null)
})

test('submit_fetch_turn tool arguments match JSON mode shape', () => {
  const arg = JSON.stringify({
    say: 'Delivery from South Bank to West End.',
    sheet: {
      choices: ['Van', 'Ute', 'Truck', 'Not sure yet'],
    },
    bookingPatch: { jobType: 'deliveryPickup' },
  })
  const p = parseSubmitFetchTurnToolArguments(arg)
  assert.ok(p.reply.length > 0)
  assertChoicesInteraction(p.interaction)
  assert.equal(p.bookingPatch?.jobType, 'deliveryPickup')
})

test('non-JSON model content falls back to plain reply text', () => {
  const p = parseFetchAiChatModelContent('Sorry — I can only help with Fetch bookings in Australia.')
  assert.ok(p.reply.length > 0)
  assert.equal(p.interaction, null)
  assert.equal(p.bookingPatch, null)
})

test('reply is capped to FETCH_AI_CHAT_REPLY_MAX', () => {
  const long = 'x'.repeat(FETCH_AI_CHAT_REPLY_MAX + 80)
  const p = parseFetchAiChatModelContent(JSON.stringify({ say: long, sheet: null, bookingPatch: null }))
  assert.equal(p.reply.length, FETCH_AI_CHAT_REPLY_MAX)
})
