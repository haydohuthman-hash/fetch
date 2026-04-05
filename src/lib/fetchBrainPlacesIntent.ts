/**
 * Lightweight intent for brain field visuals (v1: nearby restaurant search).
 * Does not replace full NLU; expand with more patterns or model tool-calls later.
 */
export function detectBrainRestaurantIntent(utterance: string): boolean {
  const u = utterance.trim().toLowerCase()
  if (u.length < 4) return false

  const foodish =
    /\b(restaurant|restaurants|eat|eating|dinner|lunch|breakfast|brunch|food|hungry|dining|cafe|café|takeaway|take out)\b/.test(
      u,
    )
  const findish =
    /\b(find|show|list|good|best|near|nearby|around|close|recommend|suggest|where|places?)\b/.test(
      u,
    )

  if (foodish && (findish || /\b(me|us|here)\b/.test(u))) return true
  if (/\bwhat('?s| is)\s+good\s+to\s+eat\b/.test(u)) return true
  if (/\bwhere\s+(should|can)\s+(i|we)\s+eat\b/.test(u)) return true
  return false
}
