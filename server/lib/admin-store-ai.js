import { completeLlmChatTurn, resolveChatLlmConfig, openAiApiKeyForChat, anthropicApiKeyForChat } from '../llm/chatProvider.js'
import { countLiveVisitors } from './analytics-pg.js'
import { listCategoriesAdminTree } from './store-categories-pg.js'

const ADMIN_MAX_MESSAGES = 24
const ADMIN_MAX_CONTENT = 4000

/**
 * @param {import('pg').Pool | null} sharedPgPool
 * @param {{ listRecent: (n?: number) => Promise<unknown[]> }} storeOrdersStore
 */
export async function buildAdminStoreContextPack(sharedPgPool, storeOrdersStore) {
  const lines = []
  const orders = await storeOrdersStore.listRecent(500)
  const paid = orders.filter((o) => o && typeof o === 'object' && /** @type {{status?:string}} */ (o).status === 'paid')
  const revenue = paid.reduce((s, o) => {
    const sub = Math.round(Number(/** @type {{subtotalAud?:number}} */ (o).subtotalAud) || 0)
    return s + (Number.isFinite(sub) && sub > 0 ? sub : 0)
  }, 0)
  lines.push(`Recent paid orders in sample: ${paid.length}; total subtotal AUD in sample: ${revenue}`)
  const recent = paid.slice(0, 10).map((o) => {
    const rec = /** @type {{ createdAt?: number, subtotalAud?: number }} */ (o)
    const t = Number(rec.createdAt)
    return {
      at: Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16) : '?',
      subtotalAud: Math.round(Number(rec.subtotalAud) || 0),
    }
  })
  lines.push(`Recent paid (timestamp + subtotal only, no PII): ${JSON.stringify(recent)}`)

  if (sharedPgPool) {
    try {
      const live = await countLiveVisitors(sharedPgPool, 5)
      lines.push(`Live visitors (5 min): ${live}`)
    } catch {
      /* ignore */
    }
    try {
      const { rows } = await sharedPgPool.query(
        `SELECT category, COUNT(*)::int AS n FROM products WHERE is_active = true GROUP BY category ORDER BY category`,
      )
      lines.push(`Active DB products by category: ${JSON.stringify(rows)}`)
    } catch {
      /* ignore */
    }
    try {
      const tree = await listCategoriesAdminTree(sharedPgPool)
      const subPreview = (tree.subcategories ?? []).slice(0, 80)
      lines.push(`Subcategories (preview): ${JSON.stringify(subPreview)}`)
    } catch {
      /* ignore */
    }
  }
  return lines.join('\n')
}

/**
 * @param {object} body
 * @param {import('pg').Pool | null} sharedPgPool
 * @param {{ listRecent: (n?: number) => Promise<unknown[]> }} storeOrdersStore
 */
export async function runAdminStoreAiChat(body, sharedPgPool, storeOrdersStore) {
  const rawMessages = Array.isArray(body?.messages) ? body.messages : []
  if (!rawMessages.length) {
    return { ok: false, httpStatus: 400, httpBody: { error: 'messages_required' } }
  }
  /** @type {{ role: string, content: string }[]} */
  const safe = []
  for (const m of rawMessages) {
    if (!m || typeof m !== 'object') continue
    const role = m.role
    if (role !== 'user' && role !== 'assistant') continue
    const content = typeof m.content === 'string' ? m.content.trim() : ''
    if (!content || content.length > ADMIN_MAX_CONTENT) continue
    safe.push({ role, content })
  }
  if (safe.length === 0) {
    return { ok: false, httpStatus: 400, httpBody: { error: 'no_valid_messages' } }
  }
  if (safe.length > ADMIN_MAX_MESSAGES) {
    return { ok: false, httpStatus: 400, httpBody: { error: 'messages_too_many' } }
  }

  const cfg = resolveChatLlmConfig()
  const openaiKey = openAiApiKeyForChat()
  const anthropicKey = anthropicApiKeyForChat()
  const keyFor = (p) => (p === 'anthropic' ? anthropicKey : openaiKey)
  let provider = cfg.provider
  let model = cfg.model
  if (!keyFor(provider)) {
    const alt = provider === 'openai' ? 'anthropic' : 'openai'
    if (keyFor(alt)) {
      provider = alt
      model =
        (process.env.FETCH_CHAT_FALLBACK_MODEL || '').trim() ||
        (alt === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o')
    }
  }
  if (!keyFor(provider)) {
    const err = cfg.provider === 'anthropic' ? 'anthropic_not_configured' : 'openai_not_configured'
    return { ok: false, httpStatus: 503, httpBody: { error: err } }
  }

  const contextPack = await buildAdminStoreContextPack(sharedPgPool, storeOrdersStore)
  const system = `You are Fetch Shop admin assistant. Help with catalog, categories, subcategories, sales trends, and operations. Use only the data in the snapshot and the conversation. Do not invent PII. If data is missing, say so.\n\n--- Store snapshot ---\n${contextPack.slice(0, 8000)}`

  const apiKey = keyFor(provider)
  const llmMessages = safe.map((m) => ({ role: m.role, content: m.content }))

  const r = await completeLlmChatTurn({
    provider,
    model,
    apiKey,
    system,
    messages: llmMessages,
    useTools: false,
    openAiTools: [],
    anthropicTools: [],
    temperature: 0.35,
    maxTokens: 900,
    jsonObjectMode: false,
  })

  if (r.error) {
    return {
      ok: false,
      httpStatus: r.status && r.status >= 400 && r.status < 600 ? r.status : 502,
      httpBody: { error: 'llm_request_failed', detail: String(r.error).slice(0, 400) },
    }
  }

  const msg = r.openaiStyleMessage
  let text = ''
  if (typeof msg?.content === 'string') text = msg.content.trim()
  else if (Array.isArray(msg?.content)) {
    for (const part of msg.content) {
      if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
        text += part.text
      }
    }
    text = text.trim()
  }

  return {
    ok: true,
    message: { role: 'assistant', content: text || '…' },
    llmMs: r.ms,
  }
}
