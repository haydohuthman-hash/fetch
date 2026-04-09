/**
 * Lightweight intent extraction — no ML. Replace or augment with NLU later.
 */
import type { JobLane } from './types'

const JUNK_RE = /\b(junk|rubbish|trash|removal|strip[- ]?out|clear[- ]?out)\b/i
const MOVE_RE = /\b(move|moving|deliver|delivery|transport|relocate|pickup|pick up)\b/i

export type ParsedExtraction = {
  service: 'move' | 'junk' | null
  items: string[]
  homeBedrooms?: number
  accessComplexity?: 'easy' | 'standard' | 'complex'
  stairsCount?: number
  hasLift?: boolean
  carryDistanceM?: number
  pickup?: string
  dropoff?: string
  affirmative: boolean
  negative: boolean
}

export function classifyJobLane(raw: string): JobLane {
  const text = raw.toLowerCase()

  if (
    /\b(moving house|move house|whole house|entire house|whole home|full house|apartment move|house move|bedroom move)\b/.test(
      text,
    )
  ) {
    return 'whole_home_move'
  }

  if (
    /\b(junk|rubbish|trash|tip run|take away|clear out|strip out|dump run|remove old)\b/.test(
      text,
    )
  ) {
    return 'junk_removal'
  }

  if (
    /\b(store|warehouse|shop|marketplace|facebook marketplace|gumtree|pickup from|collect from|delivery)\b/.test(
      text,
    )
  ) {
    return 'delivery_pickup'
  }

  return 'single_item_small_move'
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Deterministic fake route metrics from two place strings (until geocoding exists). */
export function estimateRouteKmDuration(pickup: string, dropoff: string): {
  distanceKm: number
  durationMin: number
} {
  const h = hashString(`${pickup}|${dropoff}`)
  const distanceKm = Math.round((8 + (h % 220) / 10) * 10) / 10
  const durationMin = Math.max(8, Math.round(distanceKm * 2.4 + (h % 15)))
  return { distanceKm, durationMin }
}

export function parseFromText(raw: string): ParsedExtraction {
  const text = raw.trim()

  let service: 'move' | 'junk' | null = null
  if (JUNK_RE.test(text)) service = 'junk'
  else if (
    MOVE_RE.test(text) ||
    /couch|sofa|fridge|furniture|bed|table|items?\b/i.test(text)
  )
    service = 'move'

  let items = extractItems(text)

  let pickup: string | undefined
  let dropoff: string | undefined
  let homeBedrooms: number | undefined
  let accessComplexity: 'easy' | 'standard' | 'complex' | undefined
  let stairsCount: number | undefined
  let hasLift: boolean | undefined
  let carryDistanceM: number | undefined

  /** "Pick up a couch from Kelvin Grove to New Farm" */
  const pickFromTo = text.match(
    /\bpick\s*up\s+(?:a\s+)?(.+?)\s+from\s+(.+?)\s+to\s+(.+?)(?:\.|$)/i,
  )
  if (pickFromTo) {
    const itemBit = tidyPlace(pickFromTo[1])
    if (itemBit) {
      items = [...new Set([...items, itemBit])].slice(0, 6)
    }
    pickup = tidyPlace(pickFromTo[2])
    dropoff = tidyPlace(pickFromTo[3])
  }

  const fromTo = text.match(/\bfrom\s+(.+?)\s+\bto\s+(.+?)(?:\.|$)/i)
  if (fromTo && !pickup) {
    pickup = tidyPlace(fromTo[1])
    dropoff = tidyPlace(fromTo[2])
  }

  const pAt = text.match(/\b(?:pickup|collect|from)\s+(?:at|from)?\s*[-:]?\s*(.+?)(?:\s+(?:to|drop|deliver)|\.|$)/i)
  if (pAt && !pickup) pickup = tidyPlace(pAt[1])

  const dAt = text.match(
    /\b(?:drop(?:[- ]?off)?|deliver(?:y)?|to)\s+(?:at|to)?\s*[-:]?\s*(.+?)(?:\.|$)/i,
  )
  if (dAt && !dropoff) dropoff = tidyPlace(dAt[1])

  const bedrooms = text.match(/\b([1-4])\s*(?:bed|bedroom)s?\b/i)
  if (bedrooms) {
    homeBedrooms = Number.parseInt(bedrooms[1] ?? '0', 10) || undefined
  } else if (/\b(4\+|4 plus|four plus)\s*(?:bed|bedroom)s?\b/i.test(text)) {
    homeBedrooms = 4
  }

  if (/\b(no stairs|ground floor|easy access|street level)\b/i.test(text)) {
    accessComplexity = 'easy'
    stairsCount = 0
  } else if (/\b(tight|awkward|complex|difficult access|narrow stairs)\b/i.test(text)) {
    accessComplexity = 'complex'
  } else if (/\b(apartment|unit|stairs|lift)\b/i.test(text)) {
    accessComplexity = 'standard'
  }

  const stairs = text.match(/\b(\d{1,2})\s*(?:stairs?|steps?)\b/i)
  if (stairs) {
    stairsCount = Number.parseInt(stairs[1] ?? '0', 10) || undefined
  } else if (/\bstairs?\b/i.test(text)) {
    stairsCount = 1
  }

  if (/\b(with lift|lift available|elevator)\b/i.test(text)) hasLift = true
  if (/\b(no lift|without lift)\b/i.test(text)) hasLift = false

  const carry = text.match(/\b(\d{1,3})\s*m(?:eters?)?\s*(?:carry|walk)\b/i)
  if (carry) {
    carryDistanceM = Number.parseInt(carry[1] ?? '0', 10) || undefined
  } else if (/\blong carry\b/i.test(text)) {
    carryDistanceM = 40
  } else if (/\bshort carry\b/i.test(text)) {
    carryDistanceM = 10
  }

  const affirmative = /^(y|yes|yeah|yep|sure|ok|okay|book|go|lock|find|do it|sounds good|sounds right)[\s!.]*$/i.test(
    text,
  )
  const negative = /^(no|nope|nah|wait|hold on|stop)[\s!.]*$/i.test(text)

  return {
    service,
    items,
    homeBedrooms,
    accessComplexity,
    stairsCount,
    hasLift,
    carryDistanceM,
    pickup,
    dropoff,
    affirmative,
    negative,
  }
}

function tidyPlace(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[,.]+$/, '')
    .trim()
}

function extractItems(text: string): string[] {
  const out: string[] = []
  const quoted = text.match(/["“]([^"”]+)["”]/g)
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/["“”]/g, '').trim()
      if (inner.length > 1) out.push(inner)
    }
  }
  const my = text.match(/\bmy\s+([a-z][a-z\s]{2,40}?)(?:\s+(?:from|to|and)\b|\.|,|$)/i)
  if (my) out.push(tidyPlace(my[1]))
  const aAn = text.match(/\b(?:a|an)\s+([a-z][a-z\s]{2,35}?)(?:\s+(?:from|to)\b|\.|,|$)/i)
  if (aAn && !out.includes(tidyPlace(aAn[1]))) out.push(tidyPlace(aAn[1]))
  const runItems = text.match(
    /\b(?:get|grab|pick\s*up)\s+([a-z][a-z\s]{1,30}?)(?:\s+(?:from|at|to)\b|\.|,|$)/i,
  )
  if (runItems && !out.includes(tidyPlace(runItems[1]))) out.push(tidyPlace(runItems[1]))
  return [...new Set(out.map((x) => x.trim()).filter(Boolean))].slice(0, 6)
}

export function serviceLabel(service: 'move' | 'junk'): string {
  return service === 'junk' ? 'junk removal' : 'a move'
}
