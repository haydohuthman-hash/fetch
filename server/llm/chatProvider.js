/**
 * Multi-provider LLM calls for Fetch chat (OpenAI Chat Completions + Anthropic Messages).
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * @param {object} p
 * @param {'openai' | 'anthropic'} p.provider
 * @param {string} p.model
 * @param {string} p.apiKey
 * @param {string} p.system
 * @param {Array<{ role: string, content: unknown }>} p.messages
 * @param {boolean} p.useTools
 * @param {unknown[]} [p.openAiTools]
 * @param {unknown[]} [p.anthropicTools]
 * @param {number} p.temperature
 * @param {number} p.maxTokens
 * @param {boolean} p.jsonObjectMode
 * @returns {Promise<{ ms: number, openaiStyleMessage?: object, error?: string, status?: number }>}
 */
export async function completeLlmChatTurn(p) {
  const t0 = Date.now()
  if (p.provider === 'anthropic') {
    return completeAnthropicTurn({ ...p, t0 })
  }
  return completeOpenAiTurn({ ...p, t0 })
}

/**
 * @param {object} p
 * @param {number} p.t0
 */
async function completeOpenAiTurn(p) {
  const body = {
    model: p.model,
    temperature: p.temperature,
    max_tokens: p.maxTokens,
    messages: [{ role: 'system', content: p.system }, ...p.messages],
  }
  if (p.useTools && p.openAiTools?.length) {
    body.tools = p.openAiTools
    body.tool_choice = 'auto'
  } else if (p.jsonObjectMode) {
    body.response_format = { type: 'json_object' }
  }

  let res
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return {
      ms: Date.now() - p.t0,
      error: e instanceof Error ? e.message : 'openai_network',
    }
  }

  const ms = Date.now() - p.t0
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { ms, error: t.slice(0, 400), status: res.status }
  }

  const payload = await res.json().catch(() => null)
  const msg = payload?.choices?.[0]?.message
  if (!msg) {
    return { ms, error: 'openai_empty_choices', status: 502 }
  }
  return { ms, openaiStyleMessage: msg }
}

/**
 * Convert OpenAI-style history (incl. tool) to Anthropic messages.
 * @param {Array<{ role: string, content?: unknown, tool_calls?: unknown, tool_call_id?: string, name?: string }>} msgs
 */
function toAnthropicMessages(msgs) {
  /** @type {object[]} */
  const out = []
  for (const m of msgs) {
    if (m.role === 'user') {
      const c = m.content
      if (typeof c === 'string') {
        out.push({ role: 'user', content: [{ type: 'text', text: c }] })
      } else if (Array.isArray(c)) {
        out.push({ role: 'user', content: c })
      }
    } else if (m.role === 'assistant') {
      /** @type {object[]} */
      const blocks = []
      if (typeof m.content === 'string' && m.content.trim()) {
        blocks.push({ type: 'text', text: m.content })
      }
      const tcs = m.tool_calls
      if (Array.isArray(tcs)) {
        for (const tc of tcs) {
          const id = tc?.id
          const fn = tc?.function
          const name = fn?.name
          const args = fn?.arguments
          if (typeof id === 'string' && typeof name === 'string') {
            let input = {}
            if (typeof args === 'string' && args.trim()) {
              try {
                input = JSON.parse(args)
              } catch {
                input = {}
              }
            }
            blocks.push({ type: 'tool_use', id, name, input })
          }
        }
      }
      if (blocks.length) out.push({ role: 'assistant', content: blocks })
    } else if (m.role === 'tool') {
      const id = m.tool_call_id
      const content =
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? {})
      if (typeof id === 'string') {
        out.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: id, content }],
        })
      }
    }
  }
  return out
}

/**
 * @param {object} p
 * @param {number} p.t0
 */
async function completeAnthropicTurn(p) {
  const anthropicMessages = toAnthropicMessages(p.messages)
  const body = {
    model: p.model,
    max_tokens: Math.max(p.maxTokens, 1024),
    system: p.system,
    messages: anthropicMessages,
    temperature: p.temperature,
  }
  if (p.useTools && p.anthropicTools?.length) {
    body.tools = p.anthropicTools
  }

  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': p.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return {
      ms: Date.now() - p.t0,
      error: e instanceof Error ? e.message : 'anthropic_network',
    }
  }

  const ms = Date.now() - p.t0
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { ms, error: t.slice(0, 400), status: res.status }
  }

  const payload = await res.json().catch(() => null)
  const blocks = payload?.content
  if (!Array.isArray(blocks)) {
    return { ms, error: 'anthropic_empty_content', status: 502 }
  }

  /** @type {{ id: string, type: string, function: { name: string, arguments: string } }[]} */
  const tool_calls = []
  let text = ''
  for (const b of blocks) {
    if (b?.type === 'text' && typeof b.text === 'string') {
      text += b.text
    }
    if (b?.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
      tool_calls.push({
        id: b.id,
        type: 'function',
        function: {
          name: b.name,
          arguments: JSON.stringify(b.input ?? {}),
        },
      })
    }
  }

  const openaiStyleMessage = {
    role: 'assistant',
    content: text.trim() || null,
    ...(tool_calls.length ? { tool_calls } : {}),
  }
  return { ms, openaiStyleMessage }
}

export function resolveChatLlmConfig() {
  const raw = (process.env.FETCH_CHAT_PROVIDER || 'openai').trim().toLowerCase()
  const provider = raw === 'anthropic' ? 'anthropic' : 'openai'
  const model = (process.env.FETCH_CHAT_MODEL || '').trim()
  const useTools = !['0', 'false', 'no'].includes(
    String(process.env.FETCH_CHAT_USE_TOOLS ?? '1').toLowerCase(),
  )
  const enableFallback = ['1', 'true', 'yes'].includes(
    String(process.env.FETCH_CHAT_FALLBACK || '').toLowerCase(),
  )
  return {
    provider,
    model:
      model ||
      (provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
    useTools,
    enableFallback,
  }
}

export function openAiApiKeyForChat() {
  const primary = (process.env.OPENAI_API_KEY || '').trim()
  const viteNamed = (process.env.VITE_OPENAI_API_KEY || '').trim()
  return primary || viteNamed || ''
}

export function anthropicApiKeyForChat() {
  return (process.env.ANTHROPIC_API_KEY || '').trim()
}
