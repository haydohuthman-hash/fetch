import { fetchApiAbsoluteUrl } from './fetchApiBase'
import {
  fetchPerfHeaders,
  fetchPerfMark,
  parseFetchPerfTimingHeader,
  type FetchPerfServerTiming,
} from './fetchPerf'

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
  /** Signed-in user profile + saved addresses (server prepends to system context). */
  userMemory?: string
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
 * Fullscreen Fetch AI voice/chat turn. Calls the Node server directly (CORS), same base as booking API.
 */
export async function postFetchAiChat(
  messages: FetchAiChatMessage[],
  options?: PostFetchAiChatOptions,
): Promise<{
  reply: string
  navigation: FetchAiChatNavigation | null
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

  const url = fetchApiAbsoluteUrl('/api/fetch-ai/chat')

  try {
    let res: Response
    try {
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '59c911',
        },
        body: JSON.stringify({
          sessionId: '59c911',
          hypothesisId: 'H3',
          location: 'fetchAiChat.ts:pre-fetch',
          message: 'postFetchAiChat request',
          data: {
            urlHost: (() => {
              try {
                return new URL(url, window.location.origin).origin
              } catch {
                return 'parse_err'
              }
            })(),
            path: '/api/fetch-ai/chat',
            msgCount: messages.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '59c911',
        },
        body: JSON.stringify({
          sessionId: '59c911',
          hypothesisId: 'H3',
          location: 'fetchAiChat.ts:fetch-catch',
          message: 'fetch threw',
          data: { name, msg },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      if (name === 'AbortError' || msg.toLowerCase().includes('abort')) {
        throw err instanceof Error ? err : new Error('AbortError')
      }
      throw new Error(CHAT_ERROR_NETWORK)
    }

    let data: { reply?: string; error?: string; navigation?: unknown } = {}
    try {
      data = (await res.json()) as typeof data
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      const errCode =
        typeof data.error === 'string' ? data.error : `chat_http_${res.status}`
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '59c911',
        },
        body: JSON.stringify({
          sessionId: '59c911',
          hypothesisId: 'H1-H4',
          location: 'fetchAiChat.ts:!res.ok',
          message: 'chat HTTP error body',
          data: {
            status: res.status,
            errCode,
            detail:
              typeof (data as { detail?: unknown }).detail === 'string'
                ? (data as { detail: string }).detail.slice(0, 160)
                : null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      throw new Error(errCode)
    }

    const reply = typeof data.reply === 'string' ? data.reply.trim() : ''
    if (!reply) {
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '59c911',
        },
        body: JSON.stringify({
          sessionId: '59c911',
          hypothesisId: 'H2',
          location: 'fetchAiChat.ts:empty_reply',
          message: '200 but empty reply',
          data: { keys: Object.keys(data) },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      throw new Error('empty_reply')
    }

    const perfTiming = parseFetchPerfTimingHeader(res)
    const navigation = parseFetchAiChatNavigation(data.navigation)

    return { reply, navigation, perfTiming }
  } finally {
    window.clearTimeout(tid)
    if (outer) {
      outer.removeEventListener('abort', onOuterAbort)
    }
  }
}
