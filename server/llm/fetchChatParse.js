/** @typedef {{ reply: string, interaction: object | null, bookingPatch: object | null }} FetchChatTurnParsed */

import { BOOKING_PATCH_SPECIALTY_SLUGS } from './fetchChatTools.js'

export const FETCH_AI_CHAT_REPLY_MAX = 1200
export const FETCH_AI_CHAT_CHOICE_MAX = 200
export const FETCH_AI_CHAT_SHEET_PROMPT_MAX = 200
export const FETCH_AI_CHAT_FREEFORM_HINT_MAX = 120

const BOOKING_PATCH_JOB_TYPES = new Set([
  'junkRemoval',
  'homeMoving',
  'deliveryPickup',
  'heavyItem',
  'helper',
  'cleaning',
])
const BOOKING_PATCH_ADDR_MAX = 220
const SPECIALTY_SLUG_SET = new Set(BOOKING_PATCH_SPECIALTY_SLUGS)

/**
 * @param {unknown} raw
 * @returns {Array<{ slug: string, quantity: number }>|undefined}
 */
function sanitizeSpecialtyItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out = []
  for (const row of raw.slice(0, 12)) {
    if (row == null || typeof row !== 'object') continue
    const slugRaw = typeof row.slug === 'string' ? row.slug.trim().toLowerCase().replace(/-/g, '_') : ''
    if (!SPECIALTY_SLUG_SET.has(slugRaw)) continue
    let qty = 1
    if (typeof row.quantity === 'number' && Number.isFinite(row.quantity)) {
      qty = Math.max(1, Math.min(5, Math.floor(row.quantity)))
    }
    out.push({ slug: slugRaw, quantity: qty })
  }
  return out.length > 0 ? out : undefined
}

export function sanitizeBookingPatch(raw) {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw
  const out = {}
  if (typeof o.jobType === 'string' && BOOKING_PATCH_JOB_TYPES.has(o.jobType)) {
    out.jobType = o.jobType
  }
  if (typeof o.pickupAddressText === 'string') {
    const t = o.pickupAddressText.trim().slice(0, BOOKING_PATCH_ADDR_MAX)
    if (t.length > 0) out.pickupAddressText = t
  }
  if (typeof o.dropoffAddressText === 'string') {
    const t = o.dropoffAddressText.trim().slice(0, BOOKING_PATCH_ADDR_MAX)
    if (t.length > 0) out.dropoffAddressText = t
  }
  if (o.openBookingOnMap === true) out.openBookingOnMap = true
  if (o.schedulePreference === 'asap' || o.schedulePreference === 'scheduled') {
    out.schedulePreference = o.schedulePreference
  }
  if (typeof o.scheduledWindowText === 'string') {
    const t = o.scheduledWindowText.trim().slice(0, 200)
    if (t.length > 0) out.scheduledWindowText = t
  }
  if (typeof o.extraStopsNote === 'string') {
    const t = o.extraStopsNote.trim().slice(0, 500)
    if (t.length > 0) out.extraStopsNote = t
  }
  const spec = sanitizeSpecialtyItems(o.specialtyItems)
  if (spec) out.specialtyItems = spec
  if (
    !out.jobType &&
    !out.pickupAddressText &&
    !out.dropoffAddressText &&
    !out.schedulePreference &&
    !out.scheduledWindowText &&
    !out.extraStopsNote &&
    !out.specialtyItems
  ) {
    return null
  }
  if (out.openBookingOnMap === true && !out.jobType && !out.pickupAddressText) return null
  return out
}

/**
 * @param {unknown} obj
 * @returns {FetchChatTurnParsed}
 */
export function parseFetchAiChatTurnPayload(obj) {
  if (!obj || typeof obj !== 'object') {
    return { reply: '', interaction: null, bookingPatch: null }
  }
  const say = typeof obj.say === 'string' ? obj.say.trim() : ''
  if (!say) {
    return { reply: '', interaction: null, bookingPatch: null }
  }
  let interaction = null
  const sheet = obj.sheet
  if (sheet && typeof sheet === 'object') {
    const choicesRaw = sheet.choices
    if (Array.isArray(choicesRaw) && choicesRaw.length === 4) {
      const choices = choicesRaw.map((c) =>
        typeof c === 'string' ? c.trim().slice(0, FETCH_AI_CHAT_CHOICE_MAX) : '',
      )
      if (choices.every((c) => c.length > 0)) {
        const prompt =
          typeof sheet.prompt === 'string' && sheet.prompt.trim()
            ? sheet.prompt.trim().slice(0, FETCH_AI_CHAT_SHEET_PROMPT_MAX)
            : undefined
        const freeformHint =
          typeof sheet.freeformHint === 'string' && sheet.freeformHint.trim()
            ? sheet.freeformHint.trim().slice(0, FETCH_AI_CHAT_FREEFORM_HINT_MAX)
            : undefined
        interaction = {
          type: 'choices',
          choices,
          ...(prompt ? { prompt } : {}),
          ...(freeformHint ? { freeformHint } : {}),
        }
      }
    }
  }
  const bookingPatch =
    obj.bookingPatch != null && typeof obj.bookingPatch === 'object'
      ? sanitizeBookingPatch(obj.bookingPatch)
      : null
  return { reply: say.slice(0, FETCH_AI_CHAT_REPLY_MAX), interaction, bookingPatch }
}

/**
 * @param {string} raw
 * @returns {FetchChatTurnParsed}
 */
export function parseFetchAiChatModelContent(raw) {
  if (typeof raw !== 'string') return { reply: '', interaction: null, bookingPatch: null }
  const trimmed = raw.trim()
  if (!trimmed) return { reply: '', interaction: null, bookingPatch: null }
  let obj
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return { reply: trimmed.slice(0, FETCH_AI_CHAT_REPLY_MAX), interaction: null, bookingPatch: null }
  }
  if (!obj || typeof obj !== 'object') {
    return { reply: trimmed.slice(0, FETCH_AI_CHAT_REPLY_MAX), interaction: null, bookingPatch: null }
  }
  return parseFetchAiChatTurnPayload(obj)
}

/**
 * Parse `submit_fetch_turn` tool arguments (same shape as JSON mode body).
 * @param {string} jsonStr
 * @returns {FetchChatTurnParsed}
 */
export function parseSubmitFetchTurnToolArguments(jsonStr) {
  if (typeof jsonStr !== 'string' || !jsonStr.trim()) {
    return { reply: '', interaction: null, bookingPatch: null }
  }
  try {
    const obj = JSON.parse(jsonStr)
    return parseFetchAiChatTurnPayload(obj)
  } catch {
    return { reply: '', interaction: null, bookingPatch: null }
  }
}
