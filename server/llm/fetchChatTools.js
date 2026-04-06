/** @typedef {{ name: string, arguments: string, id: string }} NormalizedToolCall */

/** Must match `src/lib/booking/specialtyItemCatalog.ts` SPECIALTY_SLUGS. */
export const BOOKING_PATCH_SPECIALTY_SLUGS = [
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
]

export const TOOL_SUBMIT_FETCH_TURN = 'submit_fetch_turn'
export const TOOL_GEOCODE_AU_ADDRESS = 'geocode_au_address'
export const TOOL_FETCH_BOOKING_FLOW_REFERENCE = 'fetch_booking_flow_reference'

const submitTurnParametersSchema = {
  type: 'object',
  properties: {
    say: {
      type: 'string',
      description:
        'Spoken/chat reply for the user: one to four short sentences, no markdown, suitable for TTS.',
    },
    sheet: {
      description:
        'Null for casual replies, or exactly four tap choices for a decision sheet.',
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            choices: {
              type: 'array',
              items: { type: 'string' },
              minItems: 4,
              maxItems: 4,
            },
            freeformHint: { type: 'string' },
          },
          required: ['choices'],
        },
      ],
    },
    bookingPatch: {
      description: 'Null unless updating booking draft with user-stated job type or addresses.',
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            jobType: {
              type: 'string',
              enum: ['junkRemoval', 'homeMoving', 'deliveryPickup', 'heavyItem', 'helper', 'cleaning'],
            },
            pickupAddressText: { type: 'string' },
            dropoffAddressText: { type: 'string' },
            openBookingOnMap: { type: 'boolean' },
            schedulePreference: {
              type: 'string',
              enum: ['asap', 'scheduled'],
              description: 'Whether they want the earliest crew or a planned window.',
            },
            scheduledWindowText: {
              type: 'string',
              description: 'Short text when scheduled, e.g. “Friday 2–4pm”.',
            },
            extraStopsNote: {
              type: 'string',
              description:
                'Multi-stop or multi-job narrative: list extra pickups/dropoffs or separate jobs the primary pickup/dropoff pair does not capture.',
            },
            specialtyItems: {
              type: 'array',
              maxItems: 12,
              description:
                'Only when the user clearly mentioned bulky/specialty goods (pool table, spa, piano, etc.). Use whitelist slugs only; never invent items. Omit if unsure.',
              items: {
                type: 'object',
                properties: {
                  slug: { type: 'string', enum: BOOKING_PATCH_SPECIALTY_SLUGS },
                  quantity: { type: 'integer', minimum: 1, maximum: 5 },
                },
                required: ['slug'],
              },
            },
          },
        },
      ],
    },
  },
  required: ['say'],
}

export function openAiFetchChatTools() {
  return [
    {
      type: 'function',
      function: {
        name: TOOL_SUBMIT_FETCH_TURN,
        description:
          'Submit the final user-visible turn: spoken reply, optional four-choice sheet, optional booking draft patch. Call exactly once to finish.',
        parameters: submitTurnParametersSchema,
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_GEOCODE_AU_ADDRESS,
        description:
          'Geocode a free-text Australian address via Google (country restricted). Use before quoting distances when the user gave a street address.',
        parameters: {
          type: 'object',
          properties: {
            addressText: { type: 'string', description: 'AU address string from the user' },
          },
          required: ['addressText'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_FETCH_BOOKING_FLOW_REFERENCE,
        description:
          'Load compact official Fetch booking job types and flow rules (deterministic). Call when unsure which jobType to use.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ]
}

export function anthropicFetchChatTools() {
  return [
    {
      name: TOOL_SUBMIT_FETCH_TURN,
      description:
        'Submit the final user-visible turn: spoken reply, optional four-choice sheet, optional booking draft patch. Call exactly once to finish.',
      input_schema: submitTurnParametersSchema,
    },
    {
      name: TOOL_GEOCODE_AU_ADDRESS,
      description:
        'Geocode a free-text Australian address via Google (country restricted). Use before quoting distances when the user gave a street address.',
      input_schema: {
        type: 'object',
        properties: {
          addressText: { type: 'string', description: 'AU address string from the user' },
        },
        required: ['addressText'],
      },
    },
    {
      name: TOOL_FETCH_BOOKING_FLOW_REFERENCE,
      description:
        'Load compact official Fetch booking job types and flow rules (deterministic). Call when unsure which jobType to use.',
      input_schema: { type: 'object', properties: {} },
    },
  ]
}

export const BOOKING_FLOW_REFERENCE_TEXT = `Fetch booking job types (use exact jobType strings in bookingPatch when applicable):
- junkRemoval: junk / rubbish / tip run / collection from one place.
- homeMoving: household move, usually pickup + dropoff.
- deliveryPickup: courier-style A-to-B delivery.
- heavyItem: single large item move.
- helper: labour / muscle / task help (hours-based flow in app).
- cleaning: cleaning service (hours-based flow in app).

Multi-stop / multi-job: put the main routed pickup + drop-off in address fields; describe extra stops or a second job in extraStopsNote. Ask timing: bookingPatch.schedulePreference asap vs scheduled, plus scheduledWindowText when they pick a window.

Rules: Never invent addresses. Confirm suburbs. Use submit_fetch_turn for every user-visible reply.`
