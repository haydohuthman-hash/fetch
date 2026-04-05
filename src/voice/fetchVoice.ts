import { fetchApiAbsoluteUrl } from '../lib/fetchApiBase'
import {
  fetchPerfEmitSummary,
  fetchPerfHeaders,
  fetchPerfIsEnabled,
  fetchPerfMark,
  fetchPerfSetServerTiming,
  parseFetchPerfTimingHeader,
} from '../lib/fetchPerf'
import { voiceFlowDebug, voiceFlowFallbackText } from './voiceFlowDebug'
import { patchVoiceSourceDebug } from './voiceSourceDebug'

function voiceDevLog(...args: unknown[]) {
  if (import.meta.env.DEV) console.log(...args)
}
function voiceDevWarn(...args: unknown[]) {
  if (import.meta.env.DEV) console.warn(...args)
}

/** Legacy scan pipeline service hint (voice copy only). */
export type FetchServiceId = 'pickup' | 'moving' | 'junk'

/** Event-based system voice only — not conversational. */
export type VoiceEventType =
  | 'booting_welcome'
  | 'welcome_back'
  | 'scan_complete'
  | 'scan_assistant_intro'
  | 'scan_seen_items'
  | 'scan_choice_move'
  | 'scan_choice_remove'
  | 'location_confirmed'
  | 'driver_found'
  | 'driver_arrived'
  | 'job_started'
  | 'job_completed'

export type VoiceEventOptions = {
  /** Required for `scan_complete` — which job type was inferred. */
  service?: FetchServiceId
  /** Optional short spoken line for detected items. */
  summary?: string
  /** Optional custom assistant intro line. */
  line?: string
  perfRunId?: string
}

export type SpeakLineOptions = {
  debounceKey?: string
  debounceMs?: number
  /** When perf logging is on, ties TTS + playback to `[FetchPerf]` run. */
  perfRunId?: string
}

/**
 * Daniel — ElevenLabs premade: calm, articulate male (assistant / “butler” read).
 * Jarvis-like when paired with measured `voice_settings` below. Override via VITE_ELEVENLABS_VOICE_ID.
 */
const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'

function resolvedVoiceId(): string {
  return import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() ?? DEFAULT_VOICE_ID
}
const VOICE_FETCH_TIMEOUT_MS = 9000

/** `playVoice` system events — short window to block accidental double-fires only */
const EVENT_DEBOUNCE_MS = 320
/** `speakLine` when caller omits `debounceMs` — keep low so voice feels immediate */
const LINE_DEBOUNCE_MS = 45

let lastPlayByEvent = new Map<string, number>()
let currentAudio: HTMLAudioElement | null = null
const phraseBlobUrlCache = new Map<string, string>()

/** Smoothed 0–1 lip-open drive from TTS RMS (or browser-TTS shim). Read by orb each frame. */
let speechAmpSmoothed = 0
let ttsAudioCtx: AudioContext | null = null
let ttsAnalyser: AnalyserNode | null = null
let ttsMediaSource: MediaElementAudioSourceNode | null = null
let ttsAmpRaf = 0
let browserLipShimRaf = 0

function getAudioContextCtor(): typeof AudioContext | null {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/**
 * Resume/create the shared analyser context (used for TTS lip-sync). Safe to call often.
 */
function ensureTtsAudioContextResumed(): void {
  const AC = getAudioContextCtor()
  if (!AC || typeof window === 'undefined') return
  try {
    if (!ttsAudioCtx || ttsAudioCtx.state === 'closed') {
      ttsAudioCtx = new AC()
    }
    void ttsAudioCtx.resume()
  } catch {
    /* ignore */
  }
}

/**
 * Call synchronously from pointerdown/click on mic or orb before STT/TTS.
 * Mobile Safari blocks `HTMLAudioElement.play()` and sometimes `speechSynthesis`
 * when playback starts after async work unless audio was unlocked in a gesture.
 */
export function primeVoicePlaybackFromUserGesture(): void {
  if (typeof window === 'undefined') return

  ensureTtsAudioContextResumed()
  try {
    const ctx = ttsAudioCtx
    if (ctx) {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
      buf.getChannelData(0).fill(0)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
    }
  } catch {
    /* ignore */
  }

  try {
    const silent = new Audio(
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA',
    )
    silent.volume = 0.0001
    void silent.play().then(() => {
      silent.pause()
    })
  } catch {
    /* ignore */
  }

  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.resume()
    const prime = new SpeechSynthesisUtterance('\u200B')
    prime.volume = 0
    prime.rate = 10
    synth.speak(prime)
  } catch {
    /* ignore */
  }
}

function stopBrowserLipShim() {
  if (browserLipShimRaf) {
    window.cancelAnimationFrame(browserLipShimRaf)
    browserLipShimRaf = 0
  }
}

function disconnectTtsAnalyser(resetAmp: boolean) {
  if (ttsAmpRaf) {
    window.cancelAnimationFrame(ttsAmpRaf)
    ttsAmpRaf = 0
  }
  if (resetAmp) speechAmpSmoothed = 0
  try {
    ttsMediaSource?.disconnect()
  } catch {
    /* ignore */
  }
  ttsMediaSource = null
  ttsAnalyser = null
}

function startBrowserLipShim() {
  stopBrowserLipShim()
  const tick = () => {
    const synth = window.speechSynthesis
    if (!synth?.speaking) {
      speechAmpSmoothed *= 0.48
      if (speechAmpSmoothed < 0.02) {
        speechAmpSmoothed = 0
        browserLipShimRaf = 0
        return
      }
      browserLipShimRaf = window.requestAnimationFrame(tick)
      return
    }
    const tt = performance.now() * 0.001
    const raw =
      0.16 +
      0.38 * Math.abs(Math.sin(tt * 6.2)) +
      0.12 * Math.abs(Math.sin(tt * 2.1))
    const tgt = Math.min(1, raw)
    if (tgt > speechAmpSmoothed) {
      speechAmpSmoothed = speechAmpSmoothed * 0.55 + tgt * 0.45
    } else {
      speechAmpSmoothed = speechAmpSmoothed * 0.8 + tgt * 0.2
    }
    browserLipShimRaf = window.requestAnimationFrame(tick)
  }
  browserLipShimRaf = window.requestAnimationFrame(tick)
}

function attachTtsAnalyser(audio: HTMLAudioElement) {
  disconnectTtsAnalyser(true)
  stopBrowserLipShim()
  const AC = getAudioContextCtor()
  if (!AC) return
  try {
    if (!ttsAudioCtx || ttsAudioCtx.state === 'closed') {
      ttsAudioCtx = new AC()
    }
    const ctx = ttsAudioCtx
    ttsAnalyser = ctx.createAnalyser()
    /* Smaller FFT + lower smoothing = lip sync tracks syllables faster */
    ttsAnalyser.fftSize = 256
    ttsAnalyser.smoothingTimeConstant = 0.72
    ttsMediaSource = ctx.createMediaElementSource(audio)
    ttsMediaSource.connect(ttsAnalyser)
    ttsAnalyser.connect(ctx.destination)

    void ctx.resume()

    const floatBuf = new Float32Array(ttsAnalyser.fftSize)
    const byteBuf = new Uint8Array(ttsAnalyser.frequencyBinCount)
    const tick = () => {
      if (currentAudio !== audio || !ttsAnalyser) {
        ttsAmpRaf = 0
        return
      }
      ttsAnalyser.getFloatTimeDomainData(floatBuf)
      let sum = 0
      for (let i = 0; i < floatBuf.length; i += 1) {
        const v = floatBuf[i]!
        sum += v * v
      }
      const rms = Math.sqrt(sum / floatBuf.length)
      const amp = rms * 6.8
      const shapedTime = Math.min(1, Math.pow(amp, 0.52))

      ttsAnalyser.getByteFrequencyData(byteBuf)
      const sr = ctx.sampleRate
      const binHz = sr / ttsAnalyser.fftSize
      const iLo = Math.max(1, Math.floor(280 / binHz))
      const iHi = Math.min(byteBuf.length - 1, Math.ceil(3200 / binHz))
      let band = 0
      let n = 0
      for (let i = iLo; i <= iHi; i += 1) {
        band += byteBuf[i]!
        n += 1
      }
      const bandAvg = n > 0 ? band / n / 255 : 0
      const shapedBand = Math.min(1, Math.pow(bandAvg * 2.4, 0.65))

      const shaped = Math.min(1, shapedTime * 0.52 + shapedBand * 0.48)

      /* Fast attack / slower release so opens hit consonants, closes track pauses */
      if (shaped > speechAmpSmoothed) {
        speechAmpSmoothed = speechAmpSmoothed * 0.58 + shaped * 0.42
      } else {
        speechAmpSmoothed = speechAmpSmoothed * 0.82 + shaped * 0.18
      }
      ttsAmpRaf = window.requestAnimationFrame(tick)
    }
    ttsAmpRaf = window.requestAnimationFrame(tick)
  } catch {
    speechAmpSmoothed = 0
  }
}

/** Lip-sync envelope while ElevenLabs (or shim) is driving the mouth. */
export function getSpeechAmplitude(): number {
  return speechAmpSmoothed
}

function phraseForEvent(
  type: VoiceEventType,
  options?: VoiceEventOptions,
): string {
  if (type === 'booting_welcome') {
    return 'What do you need moved?'
  }
  if (type === 'welcome_back') {
    return 'Welcome back. What needs moving?'
  }
  if (type === 'scan_complete') {
    switch (options?.service) {
      case 'pickup':
        return 'Pickup job detected'
      case 'moving':
        return 'Moving job detected'
      case 'junk':
        return 'Junk removal detected'
      default:
        return 'Job detected'
    }
  }
  if (type === 'scan_assistant_intro') {
    return options?.line ?? "Okay, this is looking spicy."
  }
  if (type === 'scan_seen_items') {
    return options?.summary ?? ''
  }
  if (type === 'scan_choice_move') {
    return "Nice, let's get it moved."
  }
  if (type === 'scan_choice_remove') {
    return "Got it, we'll clear it out."
  }
  if (type === 'location_confirmed') {
    return 'Location confirmed'
  }
  switch (type) {
    case 'driver_found':
      return 'Driver on the way'
    case 'driver_arrived':
      return 'Driver has arrived'
    case 'job_started':
      return 'Job in progress'
    case 'job_completed':
      return 'Job complete'
    default:
      return ''
  }
}

function debounceKey(type: VoiceEventType, options?: VoiceEventOptions): string {
  if (type === 'scan_complete' && options?.service) {
    return `${type}:${options.service}`
  }
  return type
}

/** Short pleasant chime — works without ElevenLabs. */
function playLocationConfirmChime() {
  try {
    const AC =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext: typeof AudioContext
        }
      ).webkitAudioContext
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    const t0 = ctx.currentTime
    osc.frequency.setValueAtTime(523.25, t0)
    osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.07)
    gain.gain.setValueAtTime(0.11, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.28)
    osc.addEventListener(
      'ended',
      () => {
        void ctx.close()
      },
      { once: true },
    )
  } catch {
    /* ignore */
  }
}

/** Boot-up startup tone before first spoken line. */
function playBootChime() {
  try {
    const AC =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext: typeof AudioContext
        }
      ).webkitAudioContext
    const ctx = new AC()
    const oscA = ctx.createOscillator()
    const oscB = ctx.createOscillator()
    const gain = ctx.createGain()

    const t0 = ctx.currentTime
    oscA.type = 'triangle'
    oscB.type = 'sine'
    oscA.frequency.setValueAtTime(220, t0)
    oscA.frequency.exponentialRampToValueAtTime(523.25, t0 + 0.22)
    oscB.frequency.setValueAtTime(329.63, t0 + 0.06)
    oscB.frequency.exponentialRampToValueAtTime(659.25, t0 + 0.24)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.035)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.34)

    oscA.connect(gain)
    oscB.connect(gain)
    gain.connect(ctx.destination)
    oscA.start(t0)
    oscB.start(t0 + 0.03)
    oscA.stop(t0 + 0.34)
    oscB.stop(t0 + 0.34)
    oscB.addEventListener(
      'ended',
      () => {
        void ctx.close()
      },
      { once: true },
    )
  } catch {
    /* ignore */
  }
}

type SpeechPlayingListener = (playing: boolean) => void
const speechPlayingListeners = new Set<SpeechPlayingListener>()
/** Mirrors last broadcast value so late subscribers (e.g. after first speakLine) sync immediately. */
let speechPlayingSnapshot = false

function setSpeechPlaying(playing: boolean) {
  speechPlayingSnapshot = playing
  speechPlayingListeners.forEach((fn) => {
    try {
      fn(playing)
    } catch {
      /* ignore */
    }
  })
}

/** Fires when ElevenLabs TTS clip starts / ends (not chimes). */
export function subscribeVoiceSpeechPlaying(
  listener: SpeechPlayingListener,
): () => void {
  speechPlayingListeners.add(listener)
  try {
    listener(speechPlayingSnapshot)
  } catch {
    /* ignore */
  }
  return () => speechPlayingListeners.delete(listener)
}

function stopBrowserSpeech() {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}

function stopCurrentPlayback() {
  stopBrowserSpeech()
  stopBrowserLipShim()
  disconnectTtsAnalyser(true)
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  setSpeechPlaying(false)
}

/** Stops ElevenLabs / browser TTS immediately (e.g. leaving brain — do not leak speech to home). */
export function stopFetchAssistantPlayback(): void {
  stopCurrentPlayback()
}

/**
 * When ElevenLabs is unavailable or `HTMLAudioElement.play()` is blocked, use the OS voice.
 * Prefers en-GB with a measured rate/pitch as a rough Jarvis-style fallback.
 * Only call after ElevenLabs fetch or HTML audio playback has definitively failed.
 */
function speakWithBrowserTTS(
  text: string,
  browserFallbackReason: string,
  perfRunId?: string,
): Promise<void> {
  voiceDevWarn('[FetchVoice] using browser fallback', { reason: browserFallbackReason })
  patchVoiceSourceDebug({
    active: { kind: 'browser_fallback', reason: browserFallbackReason },
  })
  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis
    if (!synth) {
      const err = new Error('speechSynthesis unavailable')
      voiceFlowDebug('playback_failed', { reason: 'no_speechSynthesis' })
      voiceFlowFallbackText(text, err.message)
      reject(err)
      return
    }
    try {
      synth.resume()
    } catch {
      /* ignore */
    }
    synth.cancel()

    const run = () => {
      let settled = false
      const settleOk = () => {
        if (settled) return
        settled = true
        stopBrowserLipShim()
        speechAmpSmoothed = 0
        setSpeechPlaying(false)
        resolve()
      }
      const settleErr = (err: Error) => {
        if (settled) return
        settled = true
        stopBrowserLipShim()
        speechAmpSmoothed = 0
        setSpeechPlaying(false)
        voiceFlowDebug('playback_failed', { reason: 'browser_tts', error: err.message })
        voiceFlowFallbackText(text, err.message)
        reject(err)
      }
      try {
        synth.resume()
      } catch {
        /* ignore */
      }
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-GB'
      u.rate = 0.92
      u.pitch = 0.94
      const voices = synth.getVoices()
      const gb =
        voices.find(
          (v) =>
            /^en-gb/i.test(v.lang) &&
            /male|daniel|arthur|oliver|fred|george|thomas|malcolm|gordon/i.test(
              v.name.toLowerCase(),
            ),
        ) || voices.find((v) => /^en-gb/i.test(v.lang))
      if (gb) u.voice = gb
      u.onstart = () => {
        if (perfRunId && fetchPerfIsEnabled()) {
          fetchPerfMark(perfRunId, '8_audio_element_ready', { path: 'browser_tts' })
          fetchPerfMark(perfRunId, '9_first_playback_start', { path: 'browser_tts' })
          fetchPerfEmitSummary(perfRunId, 'voice_browser_tts')
        }
        setSpeechPlaying(true)
        startBrowserLipShim()
      }
      u.onend = () => settleOk()
      u.onerror = (ev) => {
        const se = ev as SpeechSynthesisErrorEvent
        settleErr(new Error(se.error ?? 'utterance_error'))
      }
      try {
        synth.speak(u)
      } catch (e) {
        settleErr(e instanceof Error ? e : new Error(String(e)))
      }
    }

    let started = false
    const start = () => {
      if (started) return
      started = true
      run()
    }
    if (synth.getVoices().length) start()
    else {
      synth.addEventListener('voiceschanged', start, { once: true })
      window.setTimeout(start, 200)
    }
  })
}

/**
 * Tries your server TTS proxy first (keeps the ElevenLabs key off the client), then optional
 * direct ElevenLabs when `VITE_ELEVENLABS_API_KEY` is set in the build.
 * Proxy URL matches chat/booking: `VITE_VOICE_API_BASE` → else `fetchApiAbsoluteUrl('/api/voice/tts')`.
 */
async function fetchElevenLabsSpeechDetailed(
  text: string,
  perfRunId?: string,
): Promise<{ blob: Blob | null; failureSummary: string }> {
  const voiceId = resolvedVoiceId()
  if (!text.trim()) {
    return { blob: null, failureSummary: 'empty text' }
  }

  const voiceBaseOverride = import.meta.env.VITE_VOICE_API_BASE?.trim()
  const ttsUrl = voiceBaseOverride
    ? `${voiceBaseOverride.replace(/\/$/, '')}/api/voice/tts`
    : fetchApiAbsoluteUrl('/api/voice/tts')
  const proxyRouteLabel = voiceBaseOverride
    ? 'proxy (VITE_VOICE_API_BASE)'
    : import.meta.env.DEV
      ? 'proxy (dev → 127.0.0.1:8787 via fetchApiBase)'
      : 'proxy (same-origin /api/voice/tts or VITE_FETCH_API_BASE_URL)'

  let proxyError: string | null = null

  voiceDevLog('[FetchVoice] attempting ElevenLabs', {
    route: 'proxy',
    url: ttsUrl,
    proxyRouteLabel,
    voiceId,
  })
  try {
    if (perfRunId) {
      fetchPerfMark(perfRunId, '7_tts_fetch_start', { route: 'proxy' })
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), VOICE_FETCH_TIMEOUT_MS)
    const res = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        ...fetchPerfHeaders(perfRunId),
      },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        voiceId,
      }),
    }).finally(() => {
      window.clearTimeout(timeout)
    })
    if (res.ok) {
      const blob = await res.blob()
      if (perfRunId) {
        fetchPerfMark(perfRunId, '7b_tts_blob_ready', { route: 'proxy' })
        fetchPerfSetServerTiming(perfRunId, parseFetchPerfTimingHeader(res))
      }
      voiceDevLog('[FetchVoice] ElevenLabs request success', { route: 'proxy' })
      return { blob, failureSummary: '' }
    }
    const errBody = await res.text().catch(() => '')
    proxyError = `proxy HTTP ${res.status} ${res.statusText}${errBody ? `: ${errBody.slice(0, 240)}` : ''}`
    voiceDevWarn('[FetchVoice] ElevenLabs request failed', { route: 'proxy', detail: proxyError })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    proxyError = `proxy network/abort: ${msg}`
    voiceDevWarn('[FetchVoice] ElevenLabs request failed', { route: 'proxy', detail: proxyError })
  }

  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY?.trim()
  if (!apiKey) {
    const directSkip =
      'direct route skipped: VITE_ELEVENLABS_API_KEY is missing or empty in this build (Vercel: add to env and redeploy)'
    voiceDevWarn('[FetchVoice] ElevenLabs request failed', { route: 'direct', detail: directSkip })
    return {
      blob: null,
      failureSummary: [proxyError, directSkip].filter(Boolean).join(' | '),
    }
  }

  voiceDevLog('[FetchVoice] attempting ElevenLabs', { route: 'direct', voiceId })
  try {
    if (perfRunId) {
      fetchPerfMark(perfRunId, '7_tts_fetch_start', { route: 'direct' })
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), VOICE_FETCH_TIMEOUT_MS)
    const directUrl = new URL(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    )
    directUrl.searchParams.set('optimize_streaming_latency', '4')
    const res = await fetch(directUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.72,
          similarity_boost: 0.78,
          style: 0.16,
          use_speaker_boost: true,
          speed: 1,
        },
      }),
    }).finally(() => {
      window.clearTimeout(timeout)
    })
    if (res.ok) {
      const blob = await res.blob()
      if (perfRunId) {
        fetchPerfMark(perfRunId, '7b_tts_blob_ready', { route: 'direct' })
      }
      voiceDevLog('[FetchVoice] ElevenLabs request success', { route: 'direct' })
      return { blob, failureSummary: '' }
    }
    const errBody = await res.text().catch(() => '')
    const directErr = `direct HTTP ${res.status} ${res.statusText}${errBody ? `: ${errBody.slice(0, 240)}` : ''}`
    voiceDevWarn('[FetchVoice] ElevenLabs request failed', { route: 'direct', detail: directErr })
    return {
      blob: null,
      failureSummary: [proxyError, directErr].filter(Boolean).join(' | '),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const directErr = `direct network/abort: ${msg}`
    voiceDevWarn('[FetchVoice] ElevenLabs request failed', { route: 'direct', detail: directErr })
    return {
      blob: null,
      failureSummary: [proxyError, directErr].filter(Boolean).join(' | '),
    }
  }
}

async function audioUrlForPhrase(
  phrase: string,
  perfRunId?: string,
): Promise<{ url: string | null; elevenLabsFailure: string | null }> {
  const cacheKey = `${resolvedVoiceId()}::${phrase}`
  const hit = phraseBlobUrlCache.get(cacheKey)
  if (hit) {
    if (perfRunId && fetchPerfIsEnabled()) {
      fetchPerfMark(perfRunId, '7_tts_fetch_start', { route: 'cache' })
      fetchPerfMark(perfRunId, '7b_tts_blob_ready', { route: 'cache' })
    }
    voiceDevLog('[FetchVoice] ElevenLabs request success', { route: 'cache' })
    return { url: hit, elevenLabsFailure: null }
  }
  const { blob, failureSummary } = await fetchElevenLabsSpeechDetailed(phrase, perfRunId)
  if (!blob) {
    return {
      url: null,
      elevenLabsFailure: failureSummary || 'ElevenLabs returned no audio',
    }
  }
  const url = URL.createObjectURL(blob)
  phraseBlobUrlCache.set(cacheKey, url)
  return { url, elevenLabsFailure: null }
}

async function playPhrase(
  phrase: string,
  key: string,
  {
    debounceMs = EVENT_DEBOUNCE_MS,
    prelude,
    skipSpeechFallback = false,
    perfRunId,
  }: {
    debounceMs?: number
    prelude?: () => Promise<void> | void
    skipSpeechFallback?: boolean
    perfRunId?: string
  } = {},
): Promise<void> {
  const text = phrase.trim()
  if (!text) {
    voiceDevWarn('[Fetch voice flow] playPhrase skipped (empty text)')
    return
  }

  const now = Date.now()
  const last = lastPlayByEvent.get(key) ?? 0
  if (now - last < debounceMs) {
    voiceDevWarn('[Fetch voice flow] playPhrase debounced', { key, deltaMs: now - last })
    return
  }

  /* Reserve immediately so rapid/card-open replays don’t start parallel TTS fetches. */
  lastPlayByEvent.set(key, now)

  if (prelude) {
    await prelude()
  }

  stopCurrentPlayback()

  voiceFlowDebug('sending_request', { key, textLen: text.length })

  let url: string | null = null
  let elevenLabsFailure: string | null = null
  try {
    const out = await audioUrlForPhrase(text, perfRunId)
    url = out.url
    elevenLabsFailure = out.elevenLabsFailure
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('[FetchVoice] ElevenLabs request failed', {
      detail: `audioUrlForPhrase threw: ${msg}`,
    })
    patchVoiceSourceDebug({
      lastElevenLabsError: `audioUrlForPhrase threw: ${msg}`,
      active: { kind: 'idle' },
    })
    voiceFlowDebug('playback_failed', { reason: 'audioUrlForPhrase', error: msg })
    voiceFlowFallbackText(text, msg)
    return
  }

  if (elevenLabsFailure) {
    patchVoiceSourceDebug({
      lastElevenLabsError: elevenLabsFailure,
      active: { kind: 'idle' },
    })
  } else if (url) {
    patchVoiceSourceDebug({
      lastElevenLabsError: null,
      active: { kind: 'elevenlabs' },
    })
  }

  if (!url) {
    voiceFlowDebug('response_received', { path: 'browser_tts_only', key })
    if (skipSpeechFallback) {
      voiceFlowDebug('playback_failed', { reason: 'skipSpeechFallback_no_url' })
      voiceFlowFallbackText(
        text,
        elevenLabsFailure ?? 'TTS unavailable (no URL, fallback disabled)',
      )
      return
    }
    voiceFlowDebug('attempting_playback', { path: 'browser_tts' })
    try {
      await speakWithBrowserTTS(
        text,
        elevenLabsFailure ?? 'ElevenLabs did not return audio (see console for proxy/direct errors)',
        perfRunId,
      )
    } catch {
      /* errors surfaced inside speakWithBrowserTTS */
    }
    return
  }

  voiceFlowDebug('response_received', { path: 'html_audio', key })

  const audio = new Audio(url)
  audio.volume = 0.8
  audio.preload = 'auto'
  if (perfRunId && fetchPerfIsEnabled()) {
    audio.addEventListener(
      'canplaythrough',
      () => {
        fetchPerfMark(perfRunId, '8_audio_element_ready', { path: 'html_audio' })
      },
      { once: true },
    )
    audio.addEventListener(
      'playing',
      () => {
        fetchPerfMark(perfRunId, '9_first_playback_start', { path: 'html_audio' })
        fetchPerfEmitSummary(perfRunId, 'voice_elevenlabs')
      },
      { once: true },
    )
  }
  currentAudio = audio
  ensureTtsAudioContextResumed()
  attachTtsAnalyser(audio)

  const onEnded = () => {
    if (currentAudio === audio) {
      voiceDevLog('[FetchVoice] ElevenLabs audio playback success')
      disconnectTtsAnalyser(true)
      currentAudio = null
      setSpeechPlaying(false)
    }
  }
  audio.addEventListener('ended', onEnded, { once: true })
  audio.addEventListener(
    'error',
    () => {
      void (async () => {
        if (currentAudio !== audio) return
        disconnectTtsAnalyser(true)
        currentAudio = null
        setSpeechPlaying(false)
        const mediaErr = audio.error
        const code = mediaErr?.code
        const msg = mediaErr?.message ?? `audio error code ${code ?? '?'}`
        // eslint-disable-next-line no-console
        console.error('[FetchVoice] ElevenLabs audio playback failed', {
          detail: msg,
          mediaErrorCode: code,
        })
        voiceFlowDebug('playback_failed', { path: 'html_audio_error', error: msg })
        if (skipSpeechFallback) {
          voiceFlowFallbackText(text, msg)
          return
        }
        voiceFlowDebug('attempting_playback', { path: 'browser_tts_after_audio_error' })
        try {
          await speakWithBrowserTTS(
            text,
            `ElevenLabs MP3 decode/playback error (HTMLMediaElement): ${msg}`,
            perfRunId,
          )
        } catch {
          /* inner handler shows fallback */
        }
      })()
    },
    { once: true },
  )

  voiceFlowDebug('attempting_playback', { path: 'html_audio' })
  voiceDevLog('[FetchVoice] attempting ElevenLabs audio playback', { key })
  try {
    await audio.play()
    setSpeechPlaying(true)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('[FetchVoice] ElevenLabs audio playback failed', {
      detail: `audio.play() rejected: ${msg}`,
    })
    voiceFlowDebug('playback_failed', { path: 'audio_play_throw', error: msg })
    stopCurrentPlayback()
    if (skipSpeechFallback) {
      voiceFlowFallbackText(text, msg)
      return
    }
    voiceFlowDebug('attempting_playback', { path: 'browser_tts_after_play_throw' })
    try {
      await speakWithBrowserTTS(
        text,
        `ElevenLabs audio.play() blocked or rejected: ${msg}`,
        perfRunId,
      )
    } catch {
      /* inner handler shows fallback */
    }
  }
}

export async function speakLine(text: string, options?: SpeakLineOptions): Promise<void> {
  const phrase = text.trim()
  if (!phrase) {
    voiceDevWarn('[Fetch voice flow] speakLine skipped (empty)')
    return
  }
  const key = options?.debounceKey?.trim() || `line:${phrase}`
  try {
    await playPhrase(phrase, key, {
      debounceMs: options?.debounceMs ?? LINE_DEBOUNCE_MS,
      perfRunId: options?.perfRunId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('[Fetch voice flow] speakLine unexpected error', msg)
    voiceFlowDebug('playback_failed', { reason: 'speakLine_throw', error: msg })
    voiceFlowFallbackText(phrase, msg)
  }
}

/**
 * Plays a short system confirmation line. No overlap: stops any current clip.
 * Debounces repeated identical events. Uses ElevenLabs when API key is set.
 */
export async function playVoice(
  type: VoiceEventType,
  options?: VoiceEventOptions,
): Promise<void> {
  const phrase = phraseForEvent(type, options)
  if (!phrase) return

  const key = debounceKey(type, options)
  await playPhrase(phrase, key, {
    prelude: async () => {
      if (type === 'location_confirmed') {
        playLocationConfirmChime()
      }
      if (type === 'booting_welcome') {
        playBootChime()
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 55)
        })
      }
    },
    skipSpeechFallback: type === 'location_confirmed',
    perfRunId: options?.perfRunId,
  })
}

/** For tests or teardown */
export function __resetVoicePlaybackForTests() {
  stopCurrentPlayback()
  lastPlayByEvent = new Map()
  speechPlayingListeners.clear()
  speechAmpSmoothed = 0
}
