import { completeLlmChatTurn } from './chatProvider.js'
import {
  parseFetchAiChatModelContent,
  parseSubmitFetchTurnToolArguments,
} from './fetchChatParse.js'
import {
  anthropicFetchChatTools,
  BOOKING_FLOW_REFERENCE_TEXT,
  openAiFetchChatTools,
  TOOL_FETCH_BOOKING_FLOW_REFERENCE,
  TOOL_GEOCODE_AU_ADDRESS,
  TOOL_SUBMIT_FETCH_TURN,
} from './fetchChatTools.js'

const MAX_TOOL_ITERATIONS = 8
const DEFAULT_TEMPERATURE = 0.55
const DEFAULT_MAX_TOKENS = 520

/**
 * @param {object} deps
 * @param {string} deps.system
 * @param {Array<{ role: string, content: string }>} deps.nonEmptyMessages
 * @param {'openai' | 'anthropic'} deps.provider
 * @param {string} deps.model
 * @param {boolean} deps.useTools
 * @param {string} [deps.openaiKey]
 * @param {string} [deps.anthropicKey]
 * @param {(address: string) => Promise<object>} [deps.geocodeAddress]
 * @param {boolean} [deps.enableFallback]
 * @returns {Promise<{ ok: boolean, parsed?: import('./fetchChatParse.js').FetchChatTurnParsed, llmMs: number, error?: string, status?: number, providerUsed?: string }>}
 */
export async function runFetchAiChatTurn(deps) {
  const {
    system,
    nonEmptyMessages,
    useTools,
    geocodeAddress,
    enableFallback = false,
  } = deps

  let provider = deps.provider
  let model = deps.model
  let openaiKey = deps.openaiKey || ''
  let anthropicKey = deps.anthropicKey || ''

  const tryRun = () =>
    executeFetchChatLoop({
      system,
      nonEmptyMessages,
      provider,
      model,
      useTools,
      openaiKey,
      anthropicKey,
      geocodeAddress,
    })

  let out = await tryRun()
  if (!out.ok && enableFallback) {
    const alt = provider === 'openai' ? 'anthropic' : 'openai'
    const altKey = alt === 'anthropic' ? anthropicKey : openaiKey
    if (altKey) {
      provider = alt
      model =
        (process.env.FETCH_CHAT_FALLBACK_MODEL || '').trim() ||
        (alt === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o')
      openaiKey = deps.openaiKey || ''
      anthropicKey = deps.anthropicKey || ''
      out = await executeFetchChatLoop({
        system,
        nonEmptyMessages,
        provider,
        model,
        useTools,
        openaiKey,
        anthropicKey,
        geocodeAddress,
      })
    }
  }

  return { ...out, providerUsed: provider }
}

/**
 * @param {object} p
 */
async function executeFetchChatLoop(p) {
  const apiKey = p.provider === 'anthropic' ? p.anthropicKey : p.openaiKey
  if (!apiKey) {
    return {
      ok: false,
      llmMs: 0,
      error: p.provider === 'anthropic' ? 'no_anthropic_key' : 'no_openai_key',
      status: 503,
    }
  }

  let llmMs = 0

  if (!p.useTools) {
    const r = await completeLlmChatTurn({
      provider: p.provider,
      model: p.model,
      apiKey,
      system: p.system,
      messages: p.nonEmptyMessages,
      useTools: false,
      openAiTools: [],
      anthropicTools: [],
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      jsonObjectMode: true,
    })
    llmMs += r.ms
    if (r.error) {
      return { ok: false, llmMs, error: r.error, status: r.status || 502 }
    }
    const raw = r.openaiStyleMessage?.content
    const parsed = parseFetchAiChatModelContent(typeof raw === 'string' ? raw : '')
    if (!parsed.reply) {
      return { ok: false, llmMs, error: 'empty_model_reply', status: 502 }
    }
    return { ok: true, parsed, llmMs }
  }

  /** @type {object[]} */
  const messages = p.nonEmptyMessages.map((m) => ({ role: m.role, content: m.content }))
  const openAiTools = openAiFetchChatTools()
  const anthropicTools = anthropicFetchChatTools()

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const r = await completeLlmChatTurn({
      provider: p.provider,
      model: p.model,
      apiKey,
      system: p.system,
      messages,
      useTools: true,
      openAiTools,
      anthropicTools,
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      jsonObjectMode: false,
    })
    llmMs += r.ms
    if (r.error) {
      return { ok: false, llmMs, error: r.error, status: r.status || 502 }
    }

    const msg = r.openaiStyleMessage
    if (!msg) {
      return { ok: false, llmMs, error: 'empty_model_reply', status: 502 }
    }

    messages.push(msg)

    const toolCalls = msg.tool_calls
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      const parsed = parseFetchAiChatModelContent(
        typeof msg.content === 'string' ? msg.content : '',
      )
      if (parsed.reply) {
        return { ok: true, parsed, llmMs }
      }
      return { ok: false, llmMs, error: 'empty_model_reply', status: 502 }
    }

    const submitTc = toolCalls.find(
      (tc) => tc?.function?.name === TOOL_SUBMIT_FETCH_TURN,
    )
    const otherTcs = toolCalls.filter(
      (tc) => tc?.function?.name !== TOOL_SUBMIT_FETCH_TURN,
    )

    async function runOneTool(tc) {
      const fn = tc?.function
      const name = fn?.name
      const id = tc?.id
      const argStr = typeof fn?.arguments === 'string' ? fn.arguments : '{}'
      if (typeof id !== 'string') {
        return null
      }
      let toolPayload = '{"ok":false,"error":"unknown_tool"}'
      try {
        if (name === TOOL_GEOCODE_AU_ADDRESS && p.geocodeAddress) {
          const args = JSON.parse(argStr)
          const text = typeof args.addressText === 'string' ? args.addressText.trim() : ''
          if (!text) {
            toolPayload = JSON.stringify({ ok: false, error: 'empty_address' })
          } else {
            const geo = await p.geocodeAddress(text)
            toolPayload = JSON.stringify(geo ?? { ok: false, error: 'geocode_failed' })
          }
        } else if (name === TOOL_FETCH_BOOKING_FLOW_REFERENCE) {
          toolPayload = JSON.stringify({ ok: true, text: BOOKING_FLOW_REFERENCE_TEXT })
        }
      } catch {
        toolPayload = JSON.stringify({ ok: false, error: 'tool_execution_error' })
      }
      return { role: 'tool', tool_call_id: id, content: toolPayload }
    }

    for (const tc of otherTcs) {
      const row = await runOneTool(tc)
      if (row) messages.push(row)
    }

    if (submitTc) {
      const argStr =
        typeof submitTc.function?.arguments === 'string' ? submitTc.function.arguments : '{}'
      const parsed = parseSubmitFetchTurnToolArguments(argStr)
      if (!parsed.reply) {
        return { ok: false, llmMs, error: 'empty_model_reply', status: 502 }
      }
      if (typeof submitTc.id === 'string') {
        messages.push({
          role: 'tool',
          tool_call_id: submitTc.id,
          content: JSON.stringify({ ok: true, handled: true }),
        })
      }
      return { ok: true, parsed, llmMs }
    }
  }

  return { ok: false, llmMs, error: 'tool_loop_limit', status: 502 }
}
