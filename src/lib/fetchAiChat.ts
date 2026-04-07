import { fetchApiAbsoluteUrl } from './fetchApiBase'
import {
  fetchPerfHeaders,
  fetchPerfMark,
  parseFetchPerfTimingHeader,
  type FetchPerfServerTiming,
} from './fetchPerf'
import { parseFetchAiBookingPatch, type FetchAiBookingPatch } from './fetchAiBookingPatch'

export type FetchAiChatRole = 'user' | 'assistant'

export type FetchAiChatMessage = { role: FetchAiChatRole; content: string }

const CHAT_TIMEOUT_MS = 22_000

/** Thrown message fragments — UI may branch on these. */
export const CHAT_ERROR_NETWORK = 'chat_network'
export const CHAT_ERROR_OPENAI_NOT_CONFIGURED = 'openai_not_configured'
export const CHAT_ERROR_ANTHROPIC_NOT_CONFIGURED = 'anthropic_not_configured'
export const CHAT_ERROR_OPENAI_REQUEST_FAILED = 'openai_request_failed'
export const CHAT_ERROR_LLM_REQUEST_FAILED = 'llm_request_failed'
export const CHAT_ERROR_STREAM_INCOMPLETE = 'chat_stream_incomplete'

export type FetchAiChatClientContext = {
  /** IANA timezone from `Intl` (e.g. Australia/Sydney) */
  timeZone?: string
  latitude?: number
  longitude?: number
  /** Signed-in user profile + saved addresses (server prepends to system context). */
  userMemory?: string
  /** Fetch Brain only: compact local spend/mileage/activity stats (server appends to system context). */
  brainAccountIntel?: string
  /** Fetch Brain: recent place likes/mentions from local learning store. */
  brainLearningMemory?: string
  /** Map explore sheet: vetted nearby place list for the model (server may append). */
  nearbyExploreSummary?: string
  /** Home mic/orb brain entry: voice-led booking; server biases prompts + choice sheets. */
  brainSessionGoal?: 'booking_voice'
  /** Structured facts from the latest booking photo scan (server appendix). */
  brainBookingScanSummary?: string
}

/** Populated when the server resolves a driving route (Google Directions + traffic). */
export type FetchAiChatNavigation = {
  active: boolean
  destinationLabel: string
  destLat: number
  destLng: number
  originLat: number
  originLng: number
  etaSeconds: number
  baseDurationSeconds: number
  distanceMeters: number
  trafficDelaySeconds: number | null
  path: Array<{ lat: number; lng: number }>
  /** First driving step (plain text); set client-side when refreshing routes. */
  nextStepInstruction?: string | null
}

function parseFetchAiChatNavigation(raw: unknown): FetchAiChatNavigation | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.active !== true) return null
  const pathRaw = o.path
  const path =
    Array.isArray(pathRaw) && pathRaw.length >= 2
      ? pathRaw.filter(
          (p): p is { lat: number; lng: number } =>
            !!p &&
            typeof p === 'object' &&
            typeof (p as { lat?: unknown }).lat === 'number' &&
            typeof (p as { lng?: unknown }).lng === 'number',
        )
      : []
  if (path.length < 2) return null
  const num = (k: string) =>
    typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : NaN
  const destLat = num('destLat')
  const destLng = num('destLng')
  const originLat = num('originLat')
  const originLng = num('originLng')
  if (![destLat, destLng, originLat, originLng].every((x) => Number.isFinite(x))) return null
  const label =
    typeof o.destinationLabel === 'string' && o.destinationLabel.trim()
      ? o.destinationLabel.trim().slice(0, 400)
      : 'Destination'
  const nextRaw = o.nextStepInstruction
  const nextStepInstruction =
    typeof nextRaw === 'string' && nextRaw.trim()
      ? nextRaw.trim().slice(0, 500)
      : nextRaw === null
        ? null
        : undefined

  return {
    active: true,
    destinationLabel: label,
    destLat,
    destLng,
    originLat,
    originLng,
    etaSeconds: Math.max(0, Math.round(num('etaSeconds') || 0)),
    baseDurationSeconds: Math.max(0, Math.round(num('baseDurationSeconds') || 0)),
    distanceMeters: Math.max(0, Math.round(num('distanceMeters') || 0)),
    trafficDelaySeconds:
      o.trafficDelaySeconds == null
        ? null
        : typeof o.trafficDelaySeconds === 'number' && Number.isFinite(o.trafficDelaySeconds)
          ? Math.max(0, Math.round(o.trafficDelaySeconds))
          : null,
    path,
    ...(nextStepInstruction !== undefined ? { nextStepInstruction } : {}),
  }
}

/** Structured UI affordance from `POST /api/chat` (Neural Field uses `choices`; extend with union later). */
export type FetchAiChatInteraction =
  | {
      type: 'choices'
      choices: [string, string, string, string]
      prompt?: string
      freeformHint?: string
    }
  | { type: 'visual'; heroImageUrl: string; caption?: string }

function parseFetchAiChatInteraction(raw: unknown): FetchAiChatInteraction | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.type !== 'choices') return null
  const choicesRaw = o.choices
  if (!Array.isArray(choicesRaw) || choicesRaw.length !== 4) return null
  const choices = choicesRaw.map((c) =>
    typeof c === 'string' ? c.trim() : '',
  ) as [string, string, string, string]
  if (!choices.every((c) => c.length > 0)) return null
  const prompt =
    typeof o.prompt === 'string' && o.prompt.trim() ? o.prompt.trim() : undefined
  const freeformHint =
    typeof o.freeformHint === 'string' && o.freeformHint.trim()
      ? o.freeformHint.trim()
      : undefined
  return {
    type: 'choices',
    choices,
    ...(prompt ? { prompt } : {}),
    ...(freeformHint ? { freeformHint } : {}),
  }
}

export type PostFetchAiChatOptions = {
  signal?: AbortSignal
  /** e.g. en-AU for STT alignment */
  locale?: string
  /** Device time zone and optional coords for server-side time/weather context */
  context?: FetchAiChatClientContext
  /** Correlate with `[FetchPerf]` logs and server `X-Fetch-Perf-Timing`. */
  perfRunId?: string
}

/**
 * Fullscreen Fetch AI voice/chat turn. `POST /api/chat` on same origin (or `VITE_FETCH_API_BASE_URL`).
 */
export async function postFetchAiChat(
  messages: FetchAiChatMessage[],
  options?: PostFetchAiChatOptions,
): Promise<{
  reply: string
  navigation: FetchAiChatNavigation | null
  interaction: FetchAiChatInteraction | null
  bookingPatch: FetchAiBookingPatch | null
  perfTiming?: FetchPerfServerTiming | null
}> {
  const controller = new AbortController()
  const tid = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
  const perfRunId = options?.perfRunId

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

  const url = fetchApiAbsoluteUrl('/api/chat')

  try {
    let res: Response
    try {
      if (perfRunId) {
        fetchPerfMark(perfRunId, '3_client_request_sent', { route: 'fetch_ai_chat' })
      }
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...fetchPerfHeaders(perfRunId),
        },
        body: JSON.stringify({
          messages,
          locale: options?.locale,
          context: options?.context,
        }),
        signal: controller.signal,
      })
      if (perfRunId) {
        fetchPerfMark(perfRunId, '4_client_response_received', {
          route: 'fetch_ai_chat',
          httpStatus: res.status,
        })
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      const msg = err instanceof Error ? err.message : String(err)
      if (name === 'AbortError' || msg.toLowerCase().includes('abort')) {
        throw err instanceof Error ? err : new Error('AbortError')
      }
      throw new Error(CHAT_ERROR_NETWORK)
    }

    let data: {
      reply?: string
      error?: string
      navigation?: unknown
      interaction?: unknown
      bookingPatch?: unknown
    } = {}
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

    const perfTiming = parseFetchPerfTimingHeader(res)
    const navigation = parseFetchAiChatNavigation(data.navigation)
    const interaction = parseFetchAiChatInteraction(data.interaction)
    const bookingPatch = parseFetchAiBookingPatch(data.bookingPatch)

    return { reply, navigation, interaction, bookingPatch, perfTiming }
  } finally {
    window.clearTimeout(tid)
    if (outer) {
      outer.removeEventListener('abort', onOuterAbort)
    }
  }
}

export type PostFetchAiChatStreamOptions = PostFetchAiChatOptions & {
  /** Called for each `token` SSE chunk (assistant reply text only). */
  onToken?: (chunk: string) => void
}

type FetchAiChatStreamCompletePayload = {
  reply?: string
  navigation?: unknown
  interaction?: unknown
  bookingPatch?: unknown
}

function splitSseBlocks(buffer: string): { rest: string; blocks: string[] } {
  const blocks: string[] = []
  let rest = buffer
  for (;;) {
    const sep = rest.indexOf('\n\n')
    if (sep === -1) break
    blocks.push(rest.slice(0, sep))
    rest = rest.slice(sep + 2)
  }
  return { rest, blocks }
}

function parseSseBlock(block: string): { event: string; data: string } {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    const l = line.replace(/\r$/, '')
    if (l.startsWith('event:')) {
      event = l.slice(6).trim()
    } else if (l.startsWith('data:')) {
      dataLines.push(l.slice(5).trimStart())
    }
  }
  return { event, data: dataLines.join('\n') }
}

/**
 * Same contract as `postFetchAiChat`, but uses `POST /api/chat/stream` (SSE).
 * Structured fields (`navigation`, `interaction`, `bookingPatch`) arrive only on the final `complete` event.
 */
export async function postFetchAiChatStream(
  messages: FetchAiChatMessage[],
  options?: PostFetchAiChatStreamOptions,
): Promise<{
  reply: string
  navigation: FetchAiChatNavigation | null
  interaction: FetchAiChatInteraction | null
  bookingPatch: FetchAiBookingPatch | null
  perfTiming?: FetchPerfServerTiming | null
}> {
  const controller = new AbortController()
  const tid = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
  const perfRunId = options?.perfRunId
  const onToken = options?.onToken

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

  const url = fetchApiAbsoluteUrl('/api/chat/stream')

  try {
    let res: Response
    try {
      if (perfRunId) {
        fetchPerfMark(perfRunId, '3_client_request_sent', { route: 'fetch_ai_chat_stream' })
      }
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...fetchPerfHeaders(perfRunId),
        },
        body: JSON.stringify({
          messages,
          locale: options?.locale,
          context: options?.context,
        }),
        signal: controller.signal,
      })
      if (perfRunId) {
        fetchPerfMark(perfRunId, '4_client_response_received', {
          route: 'fetch_ai_chat_stream',
          httpStatus: res.status,
        })
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      const msg = err instanceof Error ? err.message : String(err)
      if (name === 'AbortError' || msg.toLowerCase().includes('abort')) {
        throw err instanceof Error ? err : new Error('AbortError')
      }
      throw new Error(CHAT_ERROR_NETWORK)
    }

    const perfTiming = parseFetchPerfTimingHeader(res)
    const ct = res.headers.get('content-type') || ''

    if (!res.ok) {
      let data: { error?: string } = {}
      try {
        data = (await res.json()) as { error?: string }
      } catch {
        /* ignore */
      }
      const errCode =
        typeof data.error === 'string' ? data.error : `chat_http_${res.status}`
      throw new Error(errCode)
    }

    if (!ct.includes('text/event-stream') || !res.body) {
      throw new Error(CHAT_ERROR_STREAM_INCOMPLETE)
    }

    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let carry = ''
    let completePayload: FetchAiChatStreamCompletePayload | null = null

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      carry += dec.decode(value, { stream: true })
      const { rest, blocks } = splitSseBlocks(carry)
      carry = rest
      for (const block of blocks) {
        const { event, data } = parseSseBlock(block)
        if (!data) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(data) as unknown
        } catch {
          continue
        }
        if (event === 'token' && parsed && typeof parsed === 'object') {
          const t = (parsed as { t?: unknown }).t
          if (typeof t === 'string' && t.length > 0) {
            onToken?.(t)
          }
        } else if (event === 'complete' && parsed && typeof parsed === 'object') {
          completePayload = parsed as FetchAiChatStreamCompletePayload
        } else if (event === 'error' && parsed && typeof parsed === 'object') {
          const err = (parsed as { error?: unknown }).error
          throw new Error(typeof err === 'string' ? err : CHAT_ERROR_LLM_REQUEST_FAILED)
        }
      }
    }

    if (!completePayload) {
      throw new Error(CHAT_ERROR_STREAM_INCOMPLETE)
    }

    const reply = typeof completePayload.reply === 'string' ? completePayload.reply.trim() : ''
    if (!reply) {
      throw new Error('empty_reply')
    }

    const navigation = parseFetchAiChatNavigation(completePayload.navigation)
    const interaction = parseFetchAiChatInteraction(completePayload.interaction)
    const bookingPatch = parseFetchAiBookingPatch(completePayload.bookingPatch)

    return { reply, navigation, interaction, bookingPatch, perfTiming }
  } finally {
    window.clearTimeout(tid)
    if (outer) {
      outer.removeEventListener('abort', onOuterAbort)
    }
  }
}
