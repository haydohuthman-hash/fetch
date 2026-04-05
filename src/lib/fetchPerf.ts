/**
 * Opt-in performance logging for live bottleneck analysis.
 * Enable: VITE_FETCH_PERF_LOGS=1 at build, or localStorage.setItem('fetchPerfLogs','1') + reload.
 */

const LS_KEY = 'fetchPerfLogs'

export const FETCH_PERF_RUN_HEADER = 'x-fetch-perf-run'

export function fetchPerfIsEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage?.getItem(LS_KEY) === '1') {
      return true
    }
  } catch {
    /* ignore */
  }
  return import.meta.env.VITE_FETCH_PERF_LOGS === '1'
}

export function createPerfRunId(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function fetchPerfHeaders(runId: string | undefined): Record<string, string> {
  if (!fetchPerfIsEnabled() || !runId) return {}
  return { [FETCH_PERF_RUN_HEADER]: runId }
}

export type FetchPerfServerTiming = {
  runId?: string
  route?: string
  context_build_ms?: number
  openai_ms?: number
  elevenlabs_fetch_ms?: number
  upload_parse_ms?: number
  server_total_ms?: number
}

export function parseFetchPerfTimingHeader(res: Response): FetchPerfServerTiming | null {
  try {
    const raw = res.headers.get('X-Fetch-Perf-Timing')
    if (!raw) return null
    return JSON.parse(raw) as FetchPerfServerTiming
  } catch {
    return null
  }
}

type RunAccum = {
  t1_user?: number
  t2_step_visible?: number
  t3_client_send?: number
  t4_client_first_byte?: number
  t7_tts_fetch_start?: number
  t7b_tts_blob?: number
  t8_audio_ready?: number
  t9_playback?: number
  /** One entry per backend leg (e.g. chat then TTS proxy). */
  serverTimings?: FetchPerfServerTiming[]
  maps_directions_start?: number
  maps_directions_end?: number
  maps_places_select?: number
  maps_js_loaded?: number
}

const runs = new Map<string, RunAccum>()

function acc(runId: string): RunAccum {
  let a = runs.get(runId)
  if (!a) {
    a = {}
    runs.set(runId, a)
  }
  return a
}

export function fetchPerfMark(
  runId: string | undefined,
  phase: string,
  extra?: Record<string, unknown>,
): void {
  if (!fetchPerfIsEnabled()) return
  const t = Math.round(performance.now())
  const line = { phase, tPerfMs: t, runId: runId ?? null, ...extra }
  console.info('[FetchPerf]', JSON.stringify(line))
  if (!runId) return
  const a = acc(runId)
  switch (phase) {
    case '1_user_action':
      a.t1_user = performance.now()
      break
    case '2_step_visible':
      a.t2_step_visible = performance.now()
      break
    case '3_client_request_sent':
      a.t3_client_send = performance.now()
      break
    case '4_client_response_received':
      a.t4_client_first_byte = performance.now()
      break
    case '7_tts_fetch_start':
      a.t7_tts_fetch_start = performance.now()
      break
    case '7b_tts_blob_ready':
      a.t7b_tts_blob = performance.now()
      break
    case '8_audio_element_ready':
      a.t8_audio_ready = performance.now()
      break
    case '9_first_playback_start':
      a.t9_playback = performance.now()
      break
    case 'maps_directions_request':
      a.maps_directions_start = performance.now()
      break
    case 'maps_directions_response':
      a.maps_directions_end = performance.now()
      break
    case 'maps_places_place_selected':
      a.maps_places_select = performance.now()
      break
    case 'maps_js_api_loaded':
      a.maps_js_loaded = performance.now()
      break
    default:
      break
  }
}

export function fetchPerfSetServerTiming(
  runId: string | undefined,
  timing: FetchPerfServerTiming | null | undefined,
): void {
  if (!fetchPerfIsEnabled() || !runId || !timing) return
  const a = acc(runId)
  if (!a.serverTimings) a.serverTimings = []
  a.serverTimings.push(timing)
}

function ms(a?: number, b?: number): number | undefined {
  if (a == null || b == null) return undefined
  return Math.round(b - a)
}

/**
 * Ranked bottleneck summary for a voice+API run (best-effort from captured phases).
 */
function pickServer(
  timings: FetchPerfServerTiming[] | undefined,
  route: string,
): FetchPerfServerTiming | undefined {
  if (!timings?.length) return undefined
  return timings.find((t) => t.route === route)
}

export function fetchPerfEmitSummary(runId: string, label: string): void {
  if (!fetchPerfIsEnabled() || !runId) return
  const a = runs.get(runId)
  if (!a) return

  const chatS = pickServer(a.serverTimings, 'fetch_ai_chat')
  const ttsS = pickServer(a.serverTimings, 'voice_tts')
  const scanS = pickServer(a.serverTimings, 'scan')

  const openaiMs = chatS?.openai_ms ?? scanS?.openai_ms
  const contextMs = chatS?.context_build_ms
  const elevenMs = ttsS?.elevenlabs_fetch_ms
  const serverTotal = chatS?.server_total_ms ?? scanS?.server_total_ms ?? ttsS?.server_total_ms

  const clientRoundTrip =
    a.t3_client_send != null && a.t4_client_first_byte != null
      ? Math.round(a.t4_client_first_byte - a.t3_client_send)
      : undefined

  const frontendToVisible = ms(a.t1_user, a.t2_step_visible)
  const networkMinusServer =
    clientRoundTrip != null && serverTotal != null
      ? Math.max(0, clientRoundTrip - serverTotal)
      : undefined

  const ttsPipeline =
    a.t7_tts_fetch_start != null && a.t9_playback != null
      ? Math.round(a.t9_playback - a.t7_tts_fetch_start)
      : undefined
  const ttsFetchOnly =
    a.t7_tts_fetch_start != null && a.t7b_tts_blob != null
      ? Math.round(a.t7b_tts_blob - a.t7_tts_fetch_start)
      : undefined
  const audioDecodeWait =
    a.t7b_tts_blob != null && a.t9_playback != null
      ? Math.round(a.t9_playback - a.t7b_tts_blob)
      : undefined

  const mapsDirections =
    a.maps_directions_start != null && a.maps_directions_end != null
      ? Math.round(a.maps_directions_end - a.maps_directions_start)
      : undefined

  const buckets: { name: string; ms: number }[] = []
  const add = (name: string, v: number | undefined) => {
    if (v != null && Number.isFinite(v) && v >= 0) buckets.push({ name, ms: v })
  }

  add('frontend_user_to_step_visible', frontendToVisible)
  add('client_round_trip_chat_or_scan', clientRoundTrip)
  add('network_overhead_estimate', networkMinusServer)
  add('server_context_build_openmeteo', contextMs)
  add('server_openai', openaiMs)
  add('server_total_reported', serverTotal)
  add('server_elevenlabs_proxy', elevenMs)
  add('tts_total_client_to_playback', ttsPipeline)
  add('tts_fetch_to_blob', ttsFetchOnly)
  add('audio_decode_buffer_to_playing', audioDecodeWait)
  add('maps_directions_route', mapsDirections)

  buckets.sort((x, y) => y.ms - x.ms)

  const summary = {
    label,
    runId,
    /** Readable buckets for copy/paste reports. */
    human: {
      frontend_delay_ms: frontendToVisible ?? null,
      backend_roundtrip_ms: clientRoundTrip ?? null,
      backend_server_processing_reported_ms: serverTotal ?? null,
      openai_delay_reported_ms: openaiMs ?? null,
      tts_and_playback_ms: ttsPipeline ?? null,
      maps_directions_ms: mapsDirections ?? null,
      network_overhead_estimate_ms: networkMinusServer ?? null,
    },
    sections_ms: {
      frontend_delay: frontendToVisible,
      backend_roundtrip: clientRoundTrip,
      backend_server_processing_reported: serverTotal,
      openai_delay_reported: openaiMs,
      tts_audio_delay: ttsPipeline,
      maps_delay: mapsDirections,
      network_overhead_estimate: networkMinusServer,
    },
    ranked_worst_to_least: buckets.map((b) => `${b.name}=${b.ms}ms`),
  }

  console.info('[FetchPerf:summary]', JSON.stringify(summary))

  runs.delete(runId)
}

/** Log-only maps / extra API (no run correlation). */
export function fetchPerfExtra(kind: string, detail?: Record<string, unknown>): void {
  if (!fetchPerfIsEnabled()) return
  console.info('[FetchPerf:extra]', JSON.stringify({ kind, tPerfMs: Math.round(performance.now()), ...detail }))
}
