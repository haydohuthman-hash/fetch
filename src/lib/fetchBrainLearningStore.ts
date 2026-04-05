/** Local-only “learning” events for Fetch Brain (per device; sync later). */

const KEY = 'fetch.brainLearning.v1'
const MAX = 40

export type BrainLearningKind = 'place_mention' | 'place_opinion'

export type BrainLearningEvent = {
  id: string
  at: number
  kind: BrainLearningKind
  placeId?: string
  name?: string
  rating?: 1 | -1
  note?: string
}

function safeParse(raw: string | null): BrainLearningEvent[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter(
      (row): row is BrainLearningEvent =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as BrainLearningEvent).id === 'string' &&
        typeof (row as BrainLearningEvent).at === 'number' &&
        ((row as BrainLearningEvent).kind === 'place_mention' ||
          (row as BrainLearningEvent).kind === 'place_opinion'),
    )
  } catch {
    return []
  }
}

export function loadBrainLearningEvents(): BrainLearningEvent[] {
  try {
    return safeParse(window.localStorage.getItem(KEY)).sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

export function appendBrainLearningEvent(
  partial: Omit<BrainLearningEvent, 'id' | 'at'> & { id?: string },
): BrainLearningEvent[] {
  const row: BrainLearningEvent = {
    id: partial.id ?? `lrn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: Date.now(),
    kind: partial.kind,
    placeId: partial.placeId,
    name: partial.name,
    rating: partial.rating,
    note: partial.note?.slice(0, 200),
  }
  try {
    const next = [row, ...loadBrainLearningEvents()].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
    return next
  } catch {
    return [row]
  }
}

const MAX_CTX = 700

/** Compact block for brain-only AI context. */
export function buildFetchBrainLearningContext(): string {
  const rows = loadBrainLearningEvents().slice(0, 12)
  if (!rows.length) return ''
  const lines = rows.map((r) => {
    const when = new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const nm = r.name?.trim() || r.placeId || 'place'
    if (r.kind === 'place_opinion' && r.rating === 1) return `• ${when}: user liked "${nm}"${r.note ? ` — ${r.note}` : ''}`
    if (r.kind === 'place_opinion' && r.rating === -1) return `• ${when}: user did not prefer "${nm}"${r.note ? ` — ${r.note}` : ''}`
    return `• ${when}: mentioned "${nm}"`
  })
  const block = `Recent place preferences (trust dates; use for follow-ups like "last week"):\n${lines.join('\n')}`
  return block.length > MAX_CTX ? `${block.slice(0, MAX_CTX)}…` : block
}
