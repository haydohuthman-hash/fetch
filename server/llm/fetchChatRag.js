/**
 * Lightweight keyword RAG (no embeddings) — keeps static product facts out of the model’s weights.
 * Extend CHUNKS as the product grows.
 */
const CHUNKS = [
  {
    id: 'au-coverage',
    keywords: ['australia', 'australian', 'suburb', 'state', 'where', 'cover', 'area', 'melbourne', 'sydney', 'brisbane'],
    text: 'Fetch targets Australian logistics: moving, delivery, junk removal, and labour-style help. Always confirm the user’s suburb or address before promising service; never invent service areas.',
  },
  {
    id: 'job-types',
    keywords: ['junk', 'removal', 'moving', 'delivery', 'pickup', 'heavy', 'helper', 'cleaning', 'service', 'job type', 'what do you'],
    text: 'Core job types: junkRemoval, homeMoving, deliveryPickup, heavyItem, helper, cleaning. Match the user’s words to the closest type; if unclear, ask one short clarifying question.',
  },
  {
    id: 'quotes-pricing',
    keywords: ['price', 'cost', 'quote', 'how much', 'cheap', 'expensive', 'pay', 'aud', 'dollar'],
    text: 'Give ballpark guidance only when the app has computed pricing; otherwise explain that Fetch builds quotes from job details (items, distance, access, timing) and offer to walk them through the booking sheet.',
  },
  {
    id: 'safety-refusal',
    keywords: ['illegal', 'dangerous', 'weapon', 'hazard', 'medical', 'legal', 'financial advice'],
    text: 'Refuse unsafe or illegal requests politely. Do not give medical, legal, or financial advice. Steer back to booking logistics.',
  },
]

function scoreChunk(text, chunk) {
  const low = text.toLowerCase()
  let s = 0
  for (const k of chunk.keywords) {
    if (low.includes(k)) s += 1
  }
  return s
}

/**
 * @param {string} lastUserMessage
 * @param {number} [maxChars]
 */
export function retrieveFetchChatRagSnippet(lastUserMessage, maxChars = 900) {
  const t = typeof lastUserMessage === 'string' ? lastUserMessage : ''
  if (t.trim().length < 3) return ''
  const ranked = CHUNKS.map((c) => ({ c, s: scoreChunk(t, c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
  const out = []
  let len = 0
  for (const { c } of ranked) {
    const line = `[${c.id}] ${c.text}`
    if (len + line.length + 1 > maxChars) break
    out.push(line)
    len += line.length + 1
  }
  return out.join('\n')
}
