import { fetchApiAbsoluteUrl } from './fetchApiBase'

export type FetchAiChatRole = 'user' | 'assistant'

export type FetchAiChatMessage = { role: FetchAiChatRole; content: string }

const CHAT_TIMEOUT_MS = 22_000

/** Thrown message fragments — UI may branch on these. */
export const CHAT_ERROR_NETWORK = 'chat_network'
export const CHAT_ERROR_OPENAI_NOT_CONFIGURED = 'openai_not_configured'

export type FetchAiChatClientContext = {
  /** IANA timezone from `Intl` (e.g. Australia/Sydney) */
  timeZone?: string
  latitude?: number
  longitude?: number
}

export type PostFetchAiChatOptions = {
  signal?: AbortSignal
  /** e.g. en-AU for STT alignment */
  locale?: string
  /** Device time zone and optional coords for server-side time/weather context */
  context?: FetchAiChatClientContext
}

/**
 * Fullscreen Fetch AI voice/chat turn. Calls the Node server directly (CORS), same base as booking API.
 */
export async function postFetchAiChat(
  messages: FetchAiChatMessage[],
  options?: PostFetchAiChatOptions,
): Promise<{ reply: string }> {
  const controller = new AbortController()
  const tid = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  const outer = options?.signal
  const onOuterAbort = () => {
    window.clearTimeout(tid)
    controller.abort()
  }
  if (outer) {
    if (outer.aborted) {
      window.clearTimeout(tid)
      controller.abort()
    } else {
      outer.addEventListener('abort', onOuterAbort, { once: true })
    }
  }

  const url = fetchApiAbsoluteUrl('/api/fetch-ai/chat')

  try {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          locale: options?.locale,
          context: options?.context,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      const msg = err instanceof Error ? err.message : String(err)
      if (name === 'AbortError' || msg.toLowerCase().includes('abort')) {
        throw err instanceof Error ? err : new Error('AbortError')
      }
      throw new Error(CHAT_ERROR_NETWORK)
    }

    let data: { reply?: string; error?: string } = {}
    try {
      data = (await res.json()) as typeof data
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      const errCode =
        typeof data.error === 'string' ? data.error : `chat_http_${res.status}`
      throw new Error(errCode)
    }

    const reply = typeof data.reply === 'string' ? data.reply.trim() : ''
    if (!reply) {
      throw new Error('empty_reply')
    }

    return { reply }
  } finally {
    window.clearTimeout(tid)
    if (outer) {
      outer.removeEventListener('abort', onOuterAbort)
    }
  }
}
