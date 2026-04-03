<<<<<<< HEAD
import { voiceFlowDebug, voiceFlowFallbackText } from './voiceFlowDebug'

=======
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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
}

export type SpeakLineOptions = {
  debounceKey?: string
  debounceMs?: number
}

/**
 * Daniel — ElevenLabs premade: calm, articulate male (assistant / “butler” read).
 * Jarvis-like when paired with measured `voice_settings` below. Override via VITE_ELEVENLABS_VOICE_ID.
 */
const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'
const DEFAULT_VOICE_API_BASE = 'http://127.0.0.1:8787'

function resolvedVoiceId(): string {
  return import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() ?? DEFAULT_VOICE_ID
}
const VOICE_FETCH_TIMEOUT_MS = 9000

const DEBOUNCE_MS = 900

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

<<<<<<< HEAD
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

=======
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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
    speechAmpSmoothed = speechAmpSmoothed * 0.84 + Math.min(1, raw) * 0.16
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
    ttsAnalyser.fftSize = 512
    ttsAnalyser.smoothingTimeConstant = 0.94
    ttsMediaSource = ctx.createMediaElementSource(audio)
    ttsMediaSource.connect(ttsAnalyser)
    ttsAnalyser.connect(ctx.destination)

    void ctx.resume()

    const buf = new Float32Array(ttsAnalyser.fftSize)
    const tick = () => {
      if (currentAudio !== audio || !ttsAnalyser) {
        ttsAmpRaf = 0
        return
      }
      ttsAnalyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i += 1) {
        const v = buf[i]!
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      const shaped = Math.min(1, Math.pow(rms * 5.9, 0.62))
      speechAmpSmoothed = speechAmpSmoothed * 0.91 + shaped * 0.09
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
<<<<<<< HEAD
/** Mirrors last broadcast value so late subscribers (e.g. after first speakLine) sync immediately. */
let speechPlayingSnapshot = false

function setSpeechPlaying(playing: boolean) {
  speechPlayingSnapshot = playing
=======

function setSpeechPlaying(playing: boolean) {
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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
<<<<<<< HEAD
  try {
    listener(speechPlayingSnapshot)
  } catch {
    /* ignore */
  }
=======
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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

/**
 * When ElevenLabs is unavailable or `HTMLAudioElement.play()` is blocked, use the OS voice.
 * Prefers en-GB with a measured rate/pitch as a rough Jarvis-style fallback.
 */
function speakWithBrowserTTS(text: string): Promise<void> {
<<<<<<< HEAD
  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis
    if (!synth) {
      const err = new Error('speechSynthesis unavailable')
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/130c5824-fd41-46de-a33e-be771fe2ae27', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'afe72a',
        },
        body: JSON.stringify({
          sessionId: 'afe72a',
          hypothesisId: 'H_browser_tts',
          location: 'fetchVoice.ts:speakWithBrowserTTS',
          message: 'no_synth',
          data: { textLen: text.length },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/130c5824-fd41-46de-a33e-be771fe2ae27', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'afe72a',
          },
          body: JSON.stringify({
            sessionId: 'afe72a',
            hypothesisId: 'H_browser_tts',
            location: 'fetchVoice.ts:speakWithBrowserTTS',
            message: 'utterance_failed',
            data: { error: err.message, textLen: text.length },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        voiceFlowDebug('playback_failed', { reason: 'browser_tts', error: err.message })
        voiceFlowFallbackText(text, err.message)
        reject(err)
      }
      try {
        synth.resume()
      } catch {
        /* ignore */
      }
=======
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth) {
      resolve()
      return
    }
    synth.cancel()

    const run = () => {
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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
        setSpeechPlaying(true)
        startBrowserLipShim()
      }
<<<<<<< HEAD
      u.onend = () => settleOk()
      u.onerror = (ev) => {
        const se = ev as SpeechSynthesisErrorEvent
        settleErr(new Error(se.error ?? 'utterance_error'))
      }
      try {
        synth.speak(u)
      } catch (e) {
        settleErr(e instanceof Error ? e : new Error(String(e)))
=======
      const done = () => {
        stopBrowserLipShim()
        speechAmpSmoothed = 0
        setSpeechPlaying(false)
        resolve()
      }
      u.onend = done
      u.onerror = done
      try {
        synth.speak(u)
      } catch {
        done()
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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
      window.setTimeout(start, 500)
    }
  })
}

async function fetchElevenLabsSpeech(text: string): Promise<Blob | null> {
  const apiBase = import.meta.env.VITE_VOICE_API_BASE?.trim() || DEFAULT_VOICE_API_BASE
  const voiceId = resolvedVoiceId()
  if (!text) return null

  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), VOICE_FETCH_TIMEOUT_MS)
    const res = await fetch(`${apiBase}/api/voice/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
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
      return res.blob()
    }
  } catch {
    /* fall through to direct browser request */
  }

  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY?.trim()
  if (!apiKey || !text) return null

  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), VOICE_FETCH_TIMEOUT_MS)
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
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
            speed: 0.92,
          },
        }),
      },
    ).finally(() => {
      window.clearTimeout(timeout)
    })
    if (!res.ok) return null
    return res.blob()
  } catch {
    return null
  }
}

async function audioUrlForPhrase(phrase: string): Promise<string | null> {
  const cacheKey = `${resolvedVoiceId()}::${phrase}`
  const hit = phraseBlobUrlCache.get(cacheKey)
  if (hit) return hit
  const blob = await fetchElevenLabsSpeech(phrase)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  phraseBlobUrlCache.set(cacheKey, url)
  return url
}

async function playPhrase(
  phrase: string,
  key: string,
  {
    debounceMs = DEBOUNCE_MS,
    prelude,
    skipSpeechFallback = false,
  }: {
    debounceMs?: number
    prelude?: () => Promise<void> | void
    skipSpeechFallback?: boolean
  } = {},
): Promise<void> {
  const text = phrase.trim()
<<<<<<< HEAD
  if (!text) {
    // eslint-disable-next-line no-console
    console.warn('[Fetch voice flow] playPhrase skipped (empty text)')
    return
  }

  const now = Date.now()
  const last = lastPlayByEvent.get(key) ?? 0
  if (now - last < debounceMs) {
    // eslint-disable-next-line no-console
    console.warn('[Fetch voice flow] playPhrase debounced', { key, deltaMs: now - last })
    return
  }

  /* Reserve immediately so rapid/card-open replays don’t start parallel TTS fetches. */
  lastPlayByEvent.set(key, now)
=======
  if (!text) return

  const now = Date.now()
  const last = lastPlayByEvent.get(key) ?? 0
  if (now - last < debounceMs) return
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69

  if (prelude) {
    await prelude()
  }

  stopCurrentPlayback()

<<<<<<< HEAD
  voiceFlowDebug('sending_request', { key, textLen: text.length })

  let url: string | null = null
  try {
    url = await audioUrlForPhrase(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/130c5824-fd41-46de-a33e-be771fe2ae27', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'afe72a',
      },
      body: JSON.stringify({
        sessionId: 'afe72a',
        hypothesisId: 'H_tts_url',
        location: 'fetchVoice.ts:playPhrase',
        message: 'audioUrlForPhrase_throw',
        data: { error: msg, key },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    voiceFlowDebug('playback_failed', { reason: 'audioUrlForPhrase', error: msg })
    voiceFlowFallbackText(text, msg)
    return
  }

  if (!url) {
    voiceFlowDebug('response_received', { path: 'browser_tts_only', key })
    if (skipSpeechFallback) {
      voiceFlowDebug('playback_failed', { reason: 'skipSpeechFallback_no_url' })
      voiceFlowFallbackText(text, 'TTS unavailable (no URL, fallback disabled)')
      return
    }
    voiceFlowDebug('attempting_playback', { path: 'browser_tts' })
    try {
      await speakWithBrowserTTS(text)
    } catch {
      /* fallback + playback_failed emitted inside speakWithBrowserTTS */
=======
  const url = await audioUrlForPhrase(text)
  lastPlayByEvent.set(key, now)

  if (!url) {
    if (!skipSpeechFallback) {
      await speakWithBrowserTTS(text)
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
    }
    return
  }

<<<<<<< HEAD
  voiceFlowDebug('response_received', { path: 'html_audio', key })

  const audio = new Audio(url)
  audio.volume = 0.8
  audio.preload = 'auto'
  currentAudio = audio
  attachTtsAnalyser(audio)
  ensureTtsAudioContextResumed()
=======
  const audio = new Audio(url)
  audio.volume = 0.8
  currentAudio = audio
  attachTtsAnalyser(audio)
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69

  const onEnded = () => {
    if (currentAudio === audio) {
      disconnectTtsAnalyser(true)
      currentAudio = null
      setSpeechPlaying(false)
    }
  }
  audio.addEventListener('ended', onEnded, { once: true })
  audio.addEventListener(
    'error',
    () => {
<<<<<<< HEAD
      void (async () => {
        if (currentAudio !== audio) return
        disconnectTtsAnalyser(true)
        currentAudio = null
        setSpeechPlaying(false)
        const mediaErr = audio.error
        const code = mediaErr?.code
        const msg = mediaErr?.message ?? `audio error code ${code ?? '?'}`
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/130c5824-fd41-46de-a33e-be771fe2ae27', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'afe72a',
          },
          body: JSON.stringify({
            sessionId: 'afe72a',
            hypothesisId: 'H_html_audio',
            location: 'fetchVoice.ts:playPhrase',
            message: 'audio_element_error',
            data: { msg, code, key },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        voiceFlowDebug('playback_failed', { path: 'html_audio_error', error: msg })
        if (skipSpeechFallback) {
          voiceFlowFallbackText(text, msg)
          return
        }
        voiceFlowDebug('attempting_playback', { path: 'browser_tts_after_audio_error' })
        try {
          await speakWithBrowserTTS(text)
        } catch {
          /* inner handler shows fallback */
        }
      })()
=======
      if (currentAudio === audio) {
        disconnectTtsAnalyser(true)
        currentAudio = null
        setSpeechPlaying(false)
      }
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
    },
    { once: true },
  )

<<<<<<< HEAD
  voiceFlowDebug('attempting_playback', { path: 'html_audio' })
  try {
    await audio.play()
    setSpeechPlaying(true)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/130c5824-fd41-46de-a33e-be771fe2ae27', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'afe72a',
      },
      body: JSON.stringify({
        sessionId: 'afe72a',
        hypothesisId: 'H_html_audio',
        location: 'fetchVoice.ts:playPhrase',
        message: 'audio_play_reject',
        data: { error: msg, key },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    voiceFlowDebug('playback_failed', { path: 'audio_play_throw', error: msg })
    stopCurrentPlayback()
    if (skipSpeechFallback) {
      voiceFlowFallbackText(text, msg)
      return
    }
    voiceFlowDebug('attempting_playback', { path: 'browser_tts_after_play_throw' })
    try {
      await speakWithBrowserTTS(text)
    } catch {
      /* inner handler shows fallback */
=======
  try {
    await audio.play()
    setSpeechPlaying(true)
  } catch {
    stopCurrentPlayback()
    if (!skipSpeechFallback) {
      await speakWithBrowserTTS(text)
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
    }
  }
}

export async function speakLine(text: string, options?: SpeakLineOptions): Promise<void> {
  const phrase = text.trim()
<<<<<<< HEAD
  if (!phrase) {
    // eslint-disable-next-line no-console
    console.warn('[Fetch voice flow] speakLine skipped (empty)')
    return
  }
  const key = options?.debounceKey?.trim() || `line:${phrase}`
  try {
    await playPhrase(phrase, key, { debounceMs: options?.debounceMs })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('[Fetch voice flow] speakLine unexpected error', msg)
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/130c5824-fd41-46de-a33e-be771fe2ae27', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'afe72a',
      },
      body: JSON.stringify({
        sessionId: 'afe72a',
        hypothesisId: 'H_speakLine',
        location: 'fetchVoice.ts:speakLine',
        message: 'unexpected_throw',
        data: { error: msg, key },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    voiceFlowDebug('playback_failed', { reason: 'speakLine_throw', error: msg })
    voiceFlowFallbackText(phrase, msg)
  }
=======
  if (!phrase) return
  const key = options?.debounceKey?.trim() || `line:${phrase}`
  await playPhrase(phrase, key, { debounceMs: options?.debounceMs })
>>>>>>> 0a1a14a0c772938d5e08208a6af0758301c8fa69
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
          window.setTimeout(resolve, 360)
        })
      }
    },
    skipSpeechFallback: type === 'location_confirmed',
  })
}

/** For tests or teardown */
export function __resetVoicePlaybackForTests() {
  stopCurrentPlayback()
  lastPlayByEvent = new Map()
  speechPlayingListeners.clear()
  speechAmpSmoothed = 0
}
