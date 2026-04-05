import type { BrainMemoryCatalogEntry } from './fetchBrainAccountSnapshot'

export type MemoryFocusResult = { focusId: string; reason: string }

function norm(s: string) {
  return s.trim().toLowerCase()
}

function scoreEntry(utterance: string, e: BrainMemoryCatalogEntry): number {
  const u = norm(utterance)
  if (!u) return 0
  let score = 0
  const label = norm(e.label)
  if (label && u.includes(label)) score += 8
  for (const kw of e.keywords) {
    if (kw.length < 2) continue
    if (u.includes(kw)) score += 3
  }
  if (e.kind === 'activity' && u.includes('junk') && label.includes('junk')) score += 6
  return score
}

/**
 * Client-side matcher for “open that memory” style requests.
 * Returns best catalog id or null.
 */
export function resolveMemoryFocus(
  utterance: string,
  catalog: BrainMemoryCatalogEntry[],
): MemoryFocusResult | null {
  const u = norm(utterance)
  if (!u) return null

  const openish =
    /\b(open|show|display|go to|jump to|scroll to|memory|recall|what was)\b/.test(u)
  if (!openish && !/\b(last|latest|recent|my)\b/.test(u)) {
    // Still allow strong keyword-only matches below
  }

  const activities = catalog.filter((c) => c.kind === 'activity')
  const alerts = catalog.filter((c) => c.kind === 'alert')
  const addresses = catalog.filter((c) => c.kind === 'address')
  const chats = catalog.filter((c) => c.kind === 'chat_turn')

  const byPayment = activities.filter(
    (a) =>
      norm(a.label).includes('payment') &&
      a.keywords.some((k) => k === 'payment' || k === 'paid' || k === 'charge'),
  )
  const byQuote = activities.filter((a) => norm(a.label).includes('quote'))

  if (/\b(last|latest|recent)\s+payment\b/.test(u) || /\bpayment\b.*\b(last|latest)\b/.test(u)) {
    const pick = byPayment.sort((a, b) => b.sortAt - a.sortAt)[0]
    if (pick) return { focusId: pick.id, reason: 'last_payment' }
  }
  if (/\b(last|latest|recent)\s+quote\b/.test(u) || /\bquote\b.*\b(last|latest)\b/.test(u)) {
    const pick = byQuote.sort((a, b) => b.sortAt - a.sortAt)[0]
    if (pick) return { focusId: pick.id, reason: 'last_quote' }
  }

  if (/\bhome\s+address\b/.test(u) || /\baddress\b.*\bhome\b/.test(u)) {
    const pick =
      addresses.find((a) => norm(a.label) === 'home') ??
      addresses.find((a) => a.keywords.includes('home'))
    if (pick) return { focusId: pick.id, reason: 'home_address' }
  }
  if (/\bwork\b/.test(u) && /\baddress|place|office\b/.test(u)) {
    const pick =
      addresses.find((a) => norm(a.label).includes('work')) ??
      addresses.find((a) => a.keywords.includes('work'))
    if (pick) return { focusId: pick.id, reason: 'work_address' }
  }

  if (/\b(unread\s+)?alerts?\b/.test(u) || /\bnotifications?\b/.test(u)) {
    const unread = alerts.filter((a) => a.alertUnread)
    const pool = unread.length > 0 ? unread : alerts
    const pick = pool.sort((a, b) => b.sortAt - a.sortAt)[0]
    if (pick) return { focusId: pick.id, reason: 'alerts' }
  }

  if (/\bchat|conversation|messages?\b/.test(u)) {
    const pick = chats.sort((a, b) => b.sortAt - a.sortAt)[0]
    if (pick) return { focusId: pick.id, reason: 'chats' }
  }

  if (/\b(show|open)\s+(my\s+)?(places?|saved\s+addresses?)\b/.test(u)) {
    return { focusId: 'section:places', reason: 'section_places' }
  }
  if (/\b(show|open)\s+(my\s+)?(spending|payments?|spend)\b/.test(u)) {
    return { focusId: 'section:spending', reason: 'section_spending' }
  }

  const wantsOpen =
    /\b(open|show|display|go to|jump to|scroll to|memories|that memory|this memory|recall)\b/.test(
      u,
    )
  if (wantsOpen) {
    let best: { e: BrainMemoryCatalogEntry; score: number } | null = null
    for (const e of catalog) {
      const sc = scoreEntry(utterance, e)
      if (sc > 0 && (!best || sc > best.score)) best = { e, score: sc }
    }
    if (best && best.score >= 6) {
      return { focusId: best.e.id, reason: 'fuzzy' }
    }
  }

  return null
}
