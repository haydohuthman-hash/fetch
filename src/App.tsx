import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { FetchHomeStepOne } from './components/FetchHomeStepOne'
import {
  PlacesAddressAutocomplete,
  type ResolvedPlace,
} from './components/FetchHomeStepOne/PlacesAddressAutocomplete'
import type { FetchOrbExpression } from './components/JarvisNeuralOrb'
import { JarvisNeuralOrb } from './components/JarvisNeuralOrb'
import {
  applyDirectionsToBookingState,
  beginJunkDriverDemo,
  computeBookingPricing,
  computeBookingQuoteBreakdown,
  createInitialBookingState,
  DEMO_DRIVER,
  deriveFlowStep,
  handleUserInput,
  isActiveJunkDriverFlow,
  isJobDetailsPhase,
  isRouteTerminalPhase,
  patchBookingLifecycle,
  requiresDropoff,
  scanBookingPhotos,
  scannerSummaryLine,
  selectHomeJobType,
  type BookingJobType,
  type BookingLifecycleStatus,
  type BookingState,
} from './lib/assistant'
import {
  CHAT_ERROR_NETWORK,
  CHAT_ERROR_OPENAI_NOT_CONFIGURED,
  postFetchAiChat,
  type FetchAiChatMessage as ApiFetchAiChatMessage,
} from './lib/fetchAiChat'
import { getHowItWorksTapLine } from './lib/orbTapLines'
import { suburbCommentaryLine } from './lib/suburbCommentary'
import { FetchVoiceProvider, useFetchVoice } from './voice/FetchVoiceContext'
import { primeVoicePlaybackFromUserGesture } from './voice/fetchVoice'
import { voiceFlowDebug, voiceFlowSttError } from './voice/voiceFlowDebug'
import { FetchVoiceCommandFab } from './components/FetchVoiceCommandFab'
import { FetchSpeechBottomGlow } from './components/FetchHomeFloatingChrome'
import { FetchMindHowItWorksOverlay } from './components/FetchMindHowItWorksOverlay'

type AppPhase = 'splash' | 'fetch' | 'home'

const INTRO_COPY = 'Fetch activated. What can I do for you today?'
/** Spoken only on the fullscreen assistant view — pick at random (sometimes silent) so entries feel autonomous. */
const FULLSCREEN_AI_INTRO_LINES = [
  "Assistant mode. I'm fully online — tap voice when you want to talk, or home to open the map and book.",
  "You're in assistant mode. Chat here, use voice, or hit home when you're ready to book.",
  "I'm live. Type, talk, or jump to the map — whatever fits the moment.",
  "Full assistant online. Voice button if you want to speak, or just message me.",
  "Here and ready. Home takes you to booking; otherwise stay and we'll figure it out together.",
  "Assistant view — I'm not going anywhere. Tap voice, type a note, or open the map when you need it.",
  "Online in assistant mode. No rush — voice, text, or home whenever you like.",
  "All systems go. I can listen, read, or you can switch to the map for a pickup.",
  "Hey — assistant mode. Say something, write something, or head home to start a job.",
  "Standing by. Use the mic, the keyboard, or home for the booking flow.",
  "I'm awake in assistant mode. Mix of voice and typing works great.",
  "Ready when you are. Voice for hands-free, home when you want the map.",
] as const

function pickFullscreenAiIntroLine(): string | null {
  if (Math.random() < 0.2) return null
  const i = Math.floor(Math.random() * FULLSCREEN_AI_INTRO_LINES.length)
  return FULLSCREEN_AI_INTRO_LINES[i]!
}
const SLEEPY_COPY = "Feeling a bit sleepy. If you need anything, wake me up."
const WAKE_COPY = 'Fetch activated. What can I do for you today?'

const SERVICE_OPTIONS = [
  { id: 'junk-removal', label: 'Junk removal', jobType: 'junkRemoval' as const },
  { id: 'delivery-pickup', label: 'Delivery / pickup', jobType: 'deliveryPickup' as const },
  { id: 'heavy-item', label: 'Heavy item', jobType: 'heavyItem' as const },
  { id: 'home-moving', label: 'Home moving', jobType: 'homeMoving' as const },
  { id: 'helper', label: 'Helper', jobType: 'helper' as const },
] as const

const JOB_TYPE_TO_SERVICE_ID: Record<BookingJobType, string> = {
  junkRemoval: 'junk-removal',
  deliveryPickup: 'delivery-pickup',
  heavyItem: 'heavy-item',
  homeMoving: 'home-moving',
  helper: 'helper',
}

function junkLiveJobCopy(
  status: BookingLifecycleStatus,
  driver: BookingState['driver'],
): { title: string; line: string } {
  switch (status) {
    case 'dispatching':
      return { title: 'Finding a driver', line: 'Matching you with someone nearby…' }
    case 'matched':
      return {
        title: 'Driver matched',
        line: driver
          ? `${driver.name} · ~${driver.etaMinutes ?? '—'} min away`
          : 'A driver is on the way.',
      }
    case 'en_route':
      return { title: 'On the way', line: 'Heading to your pickup address.' }
    case 'arrived':
      return { title: 'Arrived', line: 'Your driver is at the pickup.' }
    case 'in_progress':
      return { title: 'In progress', line: 'Loading and clearing your items.' }
    case 'completed':
      return { title: 'Completed', line: 'Thanks for booking with Fetch.' }
    default:
      return { title: 'Job update', line: '' }
  }
}

function SplashScreen() {
  return <div className="min-h-dvh bg-[#0e0f12]" />
}

type FetchAiPhoto = { id: string; url: string; file: File }

type FetchAIChatRole = 'user' | 'assistant' | 'system'
type FetchAIChatMessage = { role: FetchAIChatRole; content: string }

function FetchAIView({ onGoHome }: { onGoHome: () => void }) {
  const { speakLine, isSpeechPlaying, playUiEvent } = useFetchVoice()
  const [orbVisible, setOrbVisible] = useState(false)
  const [listening, setListening] = useState(false)
  /** True from mic press until STT ends — orb reacts before `recognition.onstart` (mobile latency). */
  const [micPrimed, setMicPrimed] = useState(false)
  const [listeningPulseNonce, setListeningPulseNonce] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [composerText, setComposerText] = useState('')
  const [composerPhotos, setComposerPhotos] = useState<FetchAiPhoto[]>([])
  const recognitionRef = useRef<unknown>(null)
  /** True while an STT→TTS line is scheduled or playing — avoids clearing micPrimed before speakLine runs (mobile). */
  const sttSpeakPendingRef = useRef(false)
  const chatAbortRef = useRef<AbortController | null>(null)
  const convRef = useRef<FetchAIChatMessage[]>([])
  const [chatPending, setChatPending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [mindTourOpen, setMindTourOpen] = useState(false)
  const [mindTourPulseNonce, setMindTourPulseNonce] = useState(0)
  const fetchAiMountedRef = useRef(true)
  const composerFileInputRef = useRef<HTMLInputElement>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null)
  /** Cached device position for server-side weather (Open-Meteo); optional. */
  const chatGeoRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const chatGeoRequestedRef = useRef(false)

  const revokeComposerPhotoUrls = useCallback((items: FetchAiPhoto[]) => {
    for (const p of items) {
      try {
        URL.revokeObjectURL(p.url)
      } catch {
        /* ignore */
      }
    }
  }, [])

  const composerPhotosRef = useRef(composerPhotos)
  composerPhotosRef.current = composerPhotos
  useEffect(() => {
    return () => {
      revokeComposerPhotoUrls(composerPhotosRef.current)
    }
  }, [revokeComposerPhotoUrls])

  const resizeComposerTextarea = useCallback(() => {
    const el = composerTextareaRef.current
    if (!el) return
    el.style.height = '0px'
    const next = Math.min(el.scrollHeight, 128)
    el.style.height = `${Math.max(44, next)}px`
  }, [])

  useEffect(() => {
    resizeComposerTextarea()
  }, [composerText, resizeComposerTextarea])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    if (chatGeoRequestedRef.current) return
    chatGeoRequestedRef.current = true
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        chatGeoRef.current = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }
      },
      () => {
        /* denied or timeout — time-only context */
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 10_000 },
    )
  }, [])

  const onComposerPhotosSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (!list?.length) return
      const next: FetchAiPhoto[] = []
      for (let i = 0; i < list.length; i++) {
        const file = list.item(i)
        if (!file || !file.type.startsWith('image/')) continue
        next.push({
          id: `${Date.now()}-${i}-${file.name}`,
          url: URL.createObjectURL(file),
          file,
        })
      }
      if (next.length) {
        setComposerPhotos((prev) => [...prev, ...next])
        playUiEvent('success')
      }
      e.target.value = ''
    },
    [playUiEvent],
  )

  const removeComposerPhoto = useCallback((id: string) => {
    setComposerPhotos((prev) => {
      const removed = prev.filter((p) => p.id === id)
      for (const p of removed) {
        try {
          URL.revokeObjectURL(p.url)
        } catch {
          /* ignore */
        }
      }
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const runFullscreenAiChat = useCallback(
    async (userContent: string, fromStt: boolean) => {
      const trimmed = userContent.trim()
      if (!trimmed) return

      if (fromStt) {
        sttSpeakPendingRef.current = true
      }
      setChatError(null)

      const userMsg: FetchAIChatMessage = { role: 'user' as const, content: trimmed }
      const messagesForApi: FetchAIChatMessage[] = [...convRef.current, userMsg].slice(-10)
      convRef.current = messagesForApi

      chatAbortRef.current?.abort()
      const ac = new AbortController()
      chatAbortRef.current = ac
      setChatPending(true)

      try {
        const geo = chatGeoRef.current
        const { reply } = await postFetchAiChat(
          messagesForApi as ApiFetchAiChatMessage[],
          {
            signal: ac.signal,
            locale: 'en-AU',
            context: {
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              ...(geo
                ? { latitude: geo.latitude, longitude: geo.longitude }
                : {}),
            },
          },
        )
        if (ac.signal.aborted) return
        const assistantMsg: FetchAIChatMessage = {
          role: 'assistant' as const,
          content: reply,
        }
        convRef.current = [...convRef.current, assistantMsg].slice(-10)
        setChatError(null)
        await speakLine(reply, {
          debounceKey: 'fetch_ai_chat',
          debounceMs: 0,
        })
      } catch (e) {
        if (ac.signal.aborted) return
        const code = e instanceof Error ? e.message : ''

        let errLine: string
        let errUi: string
        if (code === CHAT_ERROR_OPENAI_NOT_CONFIGURED) {
          errUi = 'Server needs OPENAI_API_KEY for chat.'
          errLine =
            'The assistant is not fully set up yet. The server needs an Open A I key for chat.'
        } else if (code === CHAT_ERROR_NETWORK) {
          errUi = 'Cannot reach the API server. Run npm run server (port 8787).'
          errLine =
            "I can't reach the Fetch server. On your machine, run npm run server in another terminal, then try again."
        } else {
          errUi = 'Could not get a reply. Try again.'
          errLine = "Sorry, something went wrong with that reply. Please try again."
        }
        setChatError(errUi)
        await speakLine(errLine, {
          debounceKey: 'fetch_ai_chat',
          debounceMs: 0,
        })
      } finally {
        if (chatAbortRef.current === ac) {
          chatAbortRef.current = null
        }
        setChatPending(false)
        if (fromStt) {
          sttSpeakPendingRef.current = false
          if (!ac.signal.aborted && fetchAiMountedRef.current) {
            setMicPrimed(false)
          }
        }
      }
    },
    [speakLine, postFetchAiChat],
  )

  const submitComposer = useCallback(() => {
    const t = composerText.trim()
    const photos = composerPhotos
    const n = photos.length
    if (!t && n === 0) return
    playUiEvent('orb_tap')
    primeVoicePlaybackFromUserGesture()

    let userContent: string
    if (t && n > 0) {
      userContent = `${t} (${n} photo${n > 1 ? 's' : ''} attached in the app.)`
    } else if (t) {
      userContent = t
    } else {
      userContent = `I shared ${n} photo${n > 1 ? 's' : ''} in the chat with no message text.`
    }

    setComposerText('')
    revokeComposerPhotoUrls(photos)
    setComposerPhotos([])

    void runFullscreenAiChat(userContent, false)
  }, [composerText, composerPhotos, playUiEvent, revokeComposerPhotoUrls, runFullscreenAiChat])

  const onComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submitComposer()
      }
    },
    [submitComposer],
  )

  useEffect(() => {
    const show = window.setTimeout(() => setOrbVisible(true), 200)
    const pulse = window.setTimeout(() => playUiEvent('activated'), 500)
    const speak = window.setTimeout(() => {
      const line = pickFullscreenAiIntroLine()
      if (line) {
        void speakLine(line, {
          debounceKey: 'fetch_ai_intro',
          debounceMs: 4000,
        })
      }
    }, 800)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(pulse)
      window.clearTimeout(speak)
    }
  }, [speakLine, playUiEvent])

  const orbAttentive = listening || micPrimed

  const orbExpression: FetchOrbExpression = useMemo(() => {
    if (isSpeechPlaying) return 'speaking'
    if (orbAttentive) return 'listening'
    if (chatPending) return 'thinking'
    return 'awake'
  }, [isSpeechPlaying, orbAttentive, chatPending])

  /** Muted tints so UI halos stay subtle on near-black fullscreen void. */
  const glowColor = useMemo(() => {
    if (orbAttentive) return { r: 38, g: 82, b: 138 }
    return { r: 34, g: 36, b: 40 }
  }, [orbAttentive])

  const fullscreenOrbActivity = useMemo(() => {
    if (isSpeechPlaying) return 0.96
    if (listening) return 0.96
    if (chatPending) return 0.92
    if (micPrimed) return 0.88
    return 0.52
  }, [isSpeechPlaying, listening, micPrimed, chatPending])

  const fullscreenOrbScaleClass = useMemo(() => {
    if (!orbVisible) return 'scale-[0.82]'
    if (mindTourOpen) return 'scale-[0.94]'
    if (orbAttentive || isSpeechPlaying) return 'scale-[1.06]'
    return 'scale-100'
  }, [orbVisible, mindTourOpen, orbAttentive, isSpeechPlaying])

  const onFullscreenVoicePointerDown = useCallback(() => {
    primeVoicePlaybackFromUserGesture()
    if (listening) return
    setMicPrimed(true)
    setListeningPulseNonce((n) => n + 1)
  }, [listening])

  const openMindTour = useCallback(() => {
    if (listening) return
    primeVoicePlaybackFromUserGesture()
    playUiEvent('orb_tap')
    setMindTourPulseNonce((n) => n + 1)
    setMindTourOpen(true)
    queueMicrotask(() => {
      void speakLine(getHowItWorksTapLine(), {
        debounceKey: 'fetch_ai_mind_tour',
        debounceMs: 1200,
      })
    })
  }, [listening, playUiEvent, speakLine])

  const closeMindTour = useCallback(() => {
    setMindTourOpen(false)
  }, [])

  const aiGlowStyle = useMemo(
    () =>
      ({
        ['--orb-glow' as string]: `${glowColor.r}, ${glowColor.g}, ${glowColor.b}`,
      }) as CSSProperties,
    [glowColor],
  )

  const startListening = useCallback(() => {
    voiceFlowDebug('tap_detected', { source: 'fetch_ai_mic' })
    primeVoicePlaybackFromUserGesture()
    chatAbortRef.current?.abort()
    chatAbortRef.current = null
    setChatPending(false)
    setChatError(null)
    setMicPrimed(true)
    const w = window as unknown as Record<string, unknown>
    const SpeechRec = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => {
          lang: string
          interimResults: boolean
          maxAlternatives: number
          onstart: (() => void) | null
          onresult: ((e: {
            resultIndex: number
            results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
          }) => void) | null
          onerror: ((e: Event) => void) | null
          onend: (() => void) | null
          start: () => void
          abort: () => void
        })
      | undefined
    if (!SpeechRec) {
      setMicPrimed(false)
      voiceFlowSttError('SpeechRecognition API missing')
      void speakLine("Voice isn't available on this browser.", {
        debounceKey: 'no_stt',
        debounceMs: 3000,
      })
      return
    }

    if (recognitionRef.current) {
      try { (recognitionRef.current as { abort: () => void }).abort() } catch { /* ignore */ }
    }

    const rec = new SpeechRec()
    rec.lang = 'en-AU'
    rec.interimResults = false
    rec.maxAlternatives = 1
    recognitionRef.current = rec

    rec.onstart = () => {
      voiceFlowDebug('listening', { source: 'fetch_ai_stt' })
      setListening(true)
      setTranscript('')
      playUiEvent('listening_start')
    }

    rec.onresult = (event) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const row = event.results[i]
        if (row?.isFinal) {
          text += row[0]?.transcript ?? ''
        }
      }
      if (!text.trim() && event.results.length > 0) {
        const last = event.results[event.results.length - 1]
        text = last?.[0]?.transcript ?? ''
      }
      const trimmed = text.trim()
      setTranscript(trimmed)
      playUiEvent('listening_end')
      voiceFlowDebug('heard_transcript', {
        source: 'fetch_ai_stt',
        charCount: trimmed.length,
        resultIndex: event.resultIndex,
        resultCount: event.results.length,
      })
      if (!trimmed) {
        return
      }

      void runFullscreenAiChat(trimmed, true)
    }

    rec.onerror = (ev) => {
      const e = ev as any
      const code = e.error ?? 'unknown'
      voiceFlowSttError(`Speech recognition: ${code}`, { error: code })
      setListening(false)
      setMicPrimed(false)
      sttSpeakPendingRef.current = false
      playUiEvent('error')
    }

    rec.onend = () => {
      setListening(false)
      window.setTimeout(() => {
        if (!sttSpeakPendingRef.current) setMicPrimed(false)
      }, 100)
    }

    try {
      rec.start()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      voiceFlowSttError(`rec.start failed: ${msg}`)
      setListening(false)
      setMicPrimed(false)
      sttSpeakPendingRef.current = false
    }
  }, [speakLine, playUiEvent, runFullscreenAiChat])

  useEffect(() => {
    fetchAiMountedRef.current = true
    return () => {
      fetchAiMountedRef.current = false
      chatAbortRef.current?.abort()
      chatAbortRef.current = null
      if (recognitionRef.current) {
        try { (recognitionRef.current as { abort: () => void }).abort() } catch { /* ignore */ }
      }
    }
  }, [])

  return (
    <div
      className="relative flex min-h-dvh min-h-[100dvh] flex-col overflow-visible bg-[#020203]"
      style={aiGlowStyle}
    >
      <FetchSpeechBottomGlow variant="void" />

      <button
        type="button"
        onClick={onGoHome}
        className="fetch-stage-back-btn fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-50 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-sm transition-all hover:bg-black/50 active:scale-[0.92]"
        aria-label="Home"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </button>

      <div className="flex min-h-0 flex-1 flex-col overflow-visible px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6">
        <div
          className={[
            'flex min-h-0 flex-1 flex-col items-center transition-all duration-700 ease-out',
            mindTourOpen ? 'justify-start pt-1 sm:pt-2' : 'justify-center',
          ].join(' ')}
        >
          <div
            className={[
              'flex shrink-0 flex-col items-center justify-center transition-all duration-[700ms] ease-out',
              fullscreenOrbScaleClass,
              orbVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={openMindTour}
              disabled={listening}
              className="relative rounded-full border-0 bg-transparent p-0 outline-none ring-offset-2 ring-offset-[#020203] focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-60"
              aria-label="How Fetch works"
            >
              <JarvisNeuralOrb
                expression={orbExpression}
                speaking={isSpeechPlaying}
                state={
                  isSpeechPlaying
                    ? 'speaking'
                    : orbAttentive
                      ? 'listening'
                      : chatPending
                        ? 'thinking'
                        : 'idle'
                }
                activity={fullscreenOrbActivity}
                voiceLevel={orbAttentive ? 0.62 : 0}
                awakened
                confirmationNonce={listeningPulseNonce + mindTourPulseNonce}
                glowColor={glowColor}
                surface="faceOnly"
                size="xxl"
                lookDown={mindTourOpen}
                autonomous
                suspendAutonomous={
                  listening ||
                  micPrimed ||
                  isSpeechPlaying ||
                  chatPending ||
                  mindTourOpen
                }
              />
            </button>
            {transcript ? (
              <p className="mt-5 max-w-[18rem] text-center text-[13px] font-medium leading-snug text-fetch-muted/80">
                "{transcript}"
              </p>
            ) : null}
            {chatError ? (
              <p className="mt-2 max-w-[18rem] text-center text-[12px] leading-snug text-red-300/85">
                {chatError}
              </p>
            ) : null}
          </div>
          {mindTourOpen ? (
            <FetchMindHowItWorksOverlay
              accentRgb={glowColor}
              onDismiss={closeMindTour}
              autoDismissMs={5600}
            />
          ) : null}
        </div>
      </div>

      <input
        ref={composerFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        tabIndex={-1}
        onChange={onComposerPhotosSelected}
        aria-hidden
      />

      <div className="relative z-40 mx-auto w-full max-w-[min(36rem,calc(100vw-2rem))] shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        <div
          className={[
            'fetch-ai-composer-shell w-full',
            mindTourOpen ? 'fetch-ai-composer-shell--mind-dim' : '',
          ].join(' ')}
        >
          {composerPhotos.length > 0 ? (
            <div className="fetch-ai-composer-attachments flex gap-2 overflow-x-auto px-3 pt-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {composerPhotos.map((p) => (
                <div
                  key={p.id}
                  className="relative h-[3.25rem] w-[3.25rem] shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10"
                >
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeComposerPhoto(p.id)}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white shadow-sm backdrop-blur-sm transition-transform active:scale-90"
                    aria-label="Remove photo"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex min-h-[3rem] items-center gap-2 px-2 pb-2 pl-2 pr-2 pt-1.5">
            <button
              type="button"
              onClick={() => composerFileInputRef.current?.click()}
              className="fetch-ai-composer-plus flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-200 transition-colors hover:bg-white/10 active:bg-white/[0.14]"
              aria-label="Add photos"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <textarea
              ref={composerTextareaRef}
              rows={1}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Message Fetch…"
              className="fetch-ai-composer-input max-h-32 min-h-[2.75rem] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-normal text-white placeholder:text-neutral-500 focus:outline-none"
              aria-label="Message"
            />
            <button
              type="button"
              onPointerDown={onFullscreenVoicePointerDown}
              onClick={startListening}
              disabled={listening}
              className={[
                'fetch-ai-voice-btn',
                listening || micPrimed ? 'fetch-ai-voice-btn--listening' : '',
                isSpeechPlaying ? 'fetch-ai-voice-btn--speaking' : '',
              ].join(' ')}
              aria-label="Voice"
            >
              <span className="fetch-ai-voice-btn__ring" aria-hidden />
              <span className="fetch-ai-voice-btn__glow" aria-hidden />
              <span className="fetch-ai-voice-btn__core">
                <svg
                  className="fetch-ai-voice-btn__icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const IDLE_TO_SLEEPY_MS = 60_000

function HomeView({ onGoBack }: { onGoBack: () => void }) {
  const { speakLine, isSpeechPlaying, playUiEvent } = useFetchVoice()
  const [bookingState, setBookingState] = useState<BookingState>(createInitialBookingState)
  const [mapsJsReady, setMapsJsReady] = useState(false)
  const [orbAwakened, setOrbAwakened] = useState(false)
  const [homeMindTourOpen, setHomeMindTourOpen] = useState(false)
  const [fabMindTourPulseNonce, setFabMindTourPulseNonce] = useState(0)
  const [cardVisible, setCardVisible] = useState(false)
  const [confirmNonce, setConfirmNonce] = useState(0)
  const [mapAttention, setMapAttention] = useState<'none' | 'pickup' | 'route' | 'driver'>(
    'none',
  )
  const [idleLong, setIdleLong] = useState(false)
  const [wasSleepy, setWasSleepy] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{
    field: 'pickup' | 'dropoff'
    address: string
    coords: { lat: number; lng: number }
    suburb?: string
    place: ResolvedPlace
  } | null>(null)
  const [pinDropBannerNonce, setPinDropBannerNonce] = useState(0)
  const [scanFiles, setScanFiles] = useState<File[]>([])
  const [scanThumbs, setScanThumbs] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const driverFlowTimersRef = useRef<number[]>([])
  const lastInteractRef = useRef(Date.now())
  const lastSpokenStepRef = useRef<string>('')
  const lastDirectionsKeyRef = useRef<string>('')
  const sleepySpokenRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''

  const bumpInteraction = useCallback(() => {
    lastInteractRef.current = Date.now()
    setIdleLong(false)
  }, [])

  const closeHomeMindTour = useCallback(() => {
    setHomeMindTourOpen(false)
  }, [])

  const clearDriverFlowTimers = useCallback(() => {
    for (const id of driverFlowTimersRef.current) {
      window.clearTimeout(id)
    }
    driverFlowTimersRef.current = []
  }, [])

  const startJunkDriverFlow = useCallback(() => {
    clearDriverFlowTimers()
    setBookingState((prev) => beginJunkDriverDemo(prev))
    playUiEvent('processing_start')
    speakLine('Searching the network for a driver near you.', {
      debounceKey: 'junk_driver_search',
      debounceMs: 0,
    })

    const push = (fn: () => void, delay: number) => {
      const id = window.setTimeout(fn, delay)
      driverFlowTimersRef.current.push(id)
    }

    push(() => {
      setBookingState((s) =>
        patchBookingLifecycle(s, {
          bookingStatus: 'matched',
          mode: 'matched',
          driver: DEMO_DRIVER,
        }),
      )
      setMapAttention('driver')
      playUiEvent('driver_found')
      speakLine(
        `${DEMO_DRIVER.name} is heading your way — about ${DEMO_DRIVER.etaMinutes} minutes.`,
        { debounceKey: 'junk_driver_matched', debounceMs: 0 },
      )
    }, 2800)

    push(() => {
      setBookingState((s) => patchBookingLifecycle(s, { bookingStatus: 'en_route', mode: 'live' }))
      speakLine('They are en route to your pickup.', {
        debounceKey: 'junk_driver_enroute',
        debounceMs: 0,
      })
    }, 5600)

    push(() => {
      setBookingState((s) => patchBookingLifecycle(s, { bookingStatus: 'arrived' }))
      speakLine('They have arrived.', { debounceKey: 'junk_driver_arrived', debounceMs: 0 })
    }, 9600)

    push(() => {
      setBookingState((s) => patchBookingLifecycle(s, { bookingStatus: 'in_progress' }))
      speakLine('Loading your items now.', { debounceKey: 'junk_driver_progress', debounceMs: 0 })
    }, 13600)

    push(() => {
      setBookingState((s) => patchBookingLifecycle(s, { bookingStatus: 'completed' }))
      playUiEvent('success')
      speakLine('All done — job completed. Thanks for choosing Fetch.', {
        debounceKey: 'junk_driver_done',
        debounceMs: 0,
      })
    }, 19600)
  }, [clearDriverFlowTimers, playUiEvent, speakLine])

  useEffect(() => () => clearDriverFlowTimers(), [clearDriverFlowTimers])

  useEffect(() => {
    if (idleLong || !wasSleepy) return
    setWasSleepy(false)
    sleepySpokenRef.current = false
    playUiEvent('activated')
    queueMicrotask(() => {
      speakLine(WAKE_COPY, {
        debounceKey: 'fetch_wake_line',
        debounceMs: 0,
      })
    })
  }, [idleLong, wasSleepy, speakLine, playUiEvent])

  useEffect(() => {
    let cancelled = false
    playUiEvent('activated')
    queueMicrotask(() => {
      if (cancelled) return
      setCardVisible(true)
      playUiEvent('card_reveal')
      speakLine(INTRO_COPY, {
        debounceKey: 'fetch_home_intro',
        debounceMs: 0,
      })
    })
    return () => {
      cancelled = true
    }
  }, [speakLine, playUiEvent])

  useEffect(() => {
    if (mapAttention === 'none') return
    const t = window.setTimeout(() => setMapAttention('none'), 2200)
    return () => window.clearTimeout(t)
  }, [mapAttention])

  useEffect(() => {
    lastInteractRef.current = Date.now()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      const isLong = Date.now() - lastInteractRef.current > IDLE_TO_SLEEPY_MS
      setIdleLong(isLong)
      if (isLong) setWasSleepy(true)
    }, 4000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!idleLong || sleepySpokenRef.current) return
    sleepySpokenRef.current = true
    queueMicrotask(() => {
      speakLine(SLEEPY_COPY, {
        debounceKey: 'fetch_sleepy_line',
        debounceMs: 0,
      })
    })
  }, [idleLong, speakLine])

  const flowStep = bookingState.flowStep
  const jobType = bookingState.jobType

  useEffect(() => {
    if (!jobType || flowStep !== 'pickup') return
    const key = `pickup:${jobType}`
    if (lastSpokenStepRef.current === key) return
    lastSpokenStepRef.current = key
    const q = bookingState.currentQuestion ?? 'Where are we picking up from?'
    speakLine(q, { debounceKey: 'fetch_home_pickup_prompt', debounceMs: 0 })
  }, [jobType, flowStep, bookingState.currentQuestion, speakLine])

  useEffect(() => {
    if (!jobType || flowStep !== 'dropoff') return
    const key = `dropoff:${jobType}`
    if (lastSpokenStepRef.current === key) return
    lastSpokenStepRef.current = key
    const q = bookingState.currentQuestion ?? "Where's it going?"
    speakLine(q, { debounceKey: 'fetch_home_dropoff_prompt', debounceMs: 0 })
  }, [jobType, flowStep, bookingState.currentQuestion, speakLine])

  useEffect(() => {
    if (!mapsJsReady || typeof google === 'undefined') return
    if (!requiresDropoff(bookingState.jobType)) return
    const p = bookingState.pickupCoords
    const d = bookingState.dropoffCoords
    if (!p || !d) return

    const key = `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}|${d.lat.toFixed(5)}:${d.lng.toFixed(5)}`
    if (lastDirectionsKeyRef.current === key) return

    let cancelled = false
    const svc = new google.maps.DirectionsService()
    svc.route(
      {
        origin: p,
        destination: d,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (cancelled) return
        if (status !== 'OK' || !result?.routes[0]) return
        lastDirectionsKeyRef.current = key
        const route = result.routes[0]
        const leg = route.legs?.[0]
        const overview = route.overview_path ?? []
        const path = overview.map((ll) => ({ lat: ll.lat(), lng: ll.lng() }))
        const distanceMeters = leg?.distance?.value ?? 0
        const durationSeconds = leg?.duration?.value ?? 0
        setBookingState((prev) =>
          applyDirectionsToBookingState(prev, path, distanceMeters, durationSeconds),
        )
        setMapAttention('route')
      },
    )
    return () => {
      cancelled = true
    }
  }, [
    mapsJsReady,
    bookingState.jobType,
    bookingState.pickupCoords?.lat,
    bookingState.pickupCoords?.lng,
    bookingState.dropoffCoords?.lat,
    bookingState.dropoffCoords?.lng,
  ])

  const handleServiceSelect = useCallback((jt: BookingJobType) => {
    setBookingState((prev) => selectHomeJobType(prev, jt).bookingState)
    setConfirmNonce((n) => n + 1)
    setMapAttention('pickup')
    bumpInteraction()
  }, [bumpInteraction])

  const applyAddressSelection = useCallback(
    (field: 'pickup' | 'dropoff', sel: NonNullable<Parameters<typeof handleUserInput>[0]['addressSelection']>) => {
      setBookingState((prev) => handleUserInput(
        { text: '', source: 'quick_action', addressSelection: sel },
        prev,
      ).bookingState)
      setConfirmNonce((n) => n + 1)
      if (field === 'pickup') setMapAttention('pickup')
      else setMapAttention('route')
      bumpInteraction()
    },
    [bumpInteraction],
  )

  const onPickupResolved = useCallback(
    (place: ResolvedPlace) => {
      playUiEvent('pin_drop')
      setPinDropBannerNonce((n) => n + 1)
      setPendingConfirm({
        field: 'pickup',
        address: place.formattedAddress,
        coords: place.coords,
        suburb: place.suburb,
        place,
      })
      const line = suburbCommentaryLine(place.suburb)
      if (line) {
        speakLine(line, { debounceKey: 'suburb_pickup', debounceMs: 0 })
      } else {
        speakLine('Is this the right spot?', { debounceKey: 'confirm_pickup', debounceMs: 0 })
      }
    },
    [speakLine, playUiEvent],
  )

  const onDropoffResolved = useCallback(
    (place: ResolvedPlace) => {
      playUiEvent('pin_drop')
      setPinDropBannerNonce((n) => n + 1)
      setPendingConfirm({
        field: 'dropoff',
        address: place.formattedAddress,
        coords: place.coords,
        suburb: place.suburb,
        place,
      })
      const line = suburbCommentaryLine(place.suburb)
      if (line) {
        speakLine(line, { debounceKey: 'suburb_dropoff', debounceMs: 0 })
      } else {
        speakLine('Drop-off here?', { debounceKey: 'confirm_dropoff', debounceMs: 0 })
      }
    },
    [speakLine, playUiEvent],
  )

  const confirmPendingAddress = useCallback(() => {
    if (!pendingConfirm) return
    const { field, place } = pendingConfirm
    applyAddressSelection(field, {
      field,
      formattedAddress: place.formattedAddress,
      placeId: place.placeId,
      coords: place.coords,
      name: place.name,
    })
    setPendingConfirm(null)
    playUiEvent('success')
    speakLine(field === 'pickup' ? 'Locked in.' : 'Drop-off confirmed.', {
      debounceKey: 'address_confirmed',
      debounceMs: 0,
    })
  }, [pendingConfirm, applyAddressSelection, playUiEvent, speakLine])

  const cancelPendingAddress = useCallback(() => {
    setPendingConfirm(null)
  }, [])

  const goBackToIntent = useCallback(() => {
    clearDriverFlowTimers()
    lastSpokenStepRef.current = ''
    lastDirectionsKeyRef.current = ''
    setBookingState(createInitialBookingState())
    setMapAttention('none')
    bumpInteraction()
  }, [bumpInteraction, clearDriverFlowTimers])

  const goBackToPickup = useCallback(() => {
    lastDirectionsKeyRef.current = ''
    setBookingState((prev) => {
      const next = {
        ...prev,
        dropoffAddressText: '',
        dropoffPlace: null,
        dropoffCoords: null,
        route: null,
        distanceMeters: null,
        durationSeconds: null,
      }
      next.flowStep = deriveFlowStep(next)
      return next
    })
    setMapAttention('pickup')
    bumpInteraction()
  }, [bumpInteraction])

  const selectedServiceId = jobType ? JOB_TYPE_TO_SERVICE_ID[jobType] : null

  const routePathFromState =
    bookingState.route?.path?.map((c) => ({ lat: c.lat, lng: c.lng })) ?? null

  const mapRoutePath = useMemo(() => {
    if (routePathFromState && routePathFromState.length >= 2) return routePathFromState
    const pc = bookingState.pickupCoords
    if (jobType === 'junkRemoval' && pc && bookingState.mode === 'searching') {
      const d = 0.0022
      return [
        { lat: pc.lat + d, lng: pc.lng - d * 0.4 },
        { lat: pc.lat, lng: pc.lng },
        { lat: pc.lat - d * 0.55, lng: pc.lng + d * 0.65 },
      ]
    }
    return routePathFromState
  }, [routePathFromState, jobType, bookingState.pickupCoords, bookingState.mode])

  const mapStage = useMemo(() => {
    if (!jobType) return 'idle' as const
    const m = bookingState.mode
    if (m === 'searching') return 'searching' as const
    if (m === 'matched') return 'matched' as const
    if (m === 'live') return 'live' as const
    return 'building' as const
  }, [jobType, bookingState.mode])

  const orbExpression: FetchOrbExpression = useMemo(() => {
    if (isSpeechPlaying) return 'speaking'
    if (idleLong) return 'sleepy'
    if (flowStep === 'route' && requiresDropoff(jobType)) return 'focused'
    if (jobType && (flowStep === 'pickup' || flowStep === 'dropoff')) return 'curious'
    if (mapAttention === 'driver') return 'excited'
    if (mapAttention === 'route') return 'focused'
    if (mapAttention === 'pickup' && orbAwakened) return 'curious'
    if (jobType) return 'proud'
    return 'awake'
  }, [isSpeechPlaying, idleLong, jobType, flowStep, mapAttention, orbAwakened])

  const orbState = (() => {
    if (isSpeechPlaying) return 'speaking' as const
    if (orbAwakened) return 'aware' as const
    return 'idle' as const
  })()

  const GLOW_WHITE = { r: 220, g: 225, b: 235 }
  const GLOW_BLUE = { r: 60, g: 130, b: 246 }
  const GLOW_PURPLE = { r: 168, g: 85, b: 247 }
  const GLOW_RED = { r: 225, g: 25, b: 45 }
  const GLOW_GREEN = { r: 34, g: 197, b: 94 }

  /** Matches booking stages: blue pending/search, purple payment, red live job, green done. */
  const orbGlowColor = useMemo(() => {
    const status = bookingState.bookingStatus
    const fs = bookingState.flowStep
    const mode = bookingState.mode

    if (status === 'completed') return GLOW_GREEN

    if (
      status === 'in_progress' ||
      status === 'arrived' ||
      status === 'en_route' ||
      status === 'matched'
    ) {
      return GLOW_RED
    }

    if (status === 'payment_required' || fs === 'payment') {
      return GLOW_PURPLE
    }

    if (status === 'dispatching' && mode === 'searching') {
      return GLOW_BLUE
    }

    if (status === 'confirmed' || status === 'dispatching') {
      return GLOW_BLUE
    }

    if (jobType && fs !== 'intent') {
      return GLOW_BLUE
    }

    return GLOW_WHITE
  }, [bookingState.bookingStatus, bookingState.mode, bookingState.flowStep, jobType])

  const orbGlowStyle = useMemo(
    () =>
      ({
        ['--orb-glow' as string]: `${orbGlowColor.r}, ${orbGlowColor.g}, ${orbGlowColor.b}`,
      }) as CSSProperties,
    [orbGlowColor],
  )

  const inputClass =
    'fetch-stage-text-input mt-2 w-full rounded-xl border border-white/[0.1] bg-[#222328] px-3 py-2.5 text-[13px] font-medium text-fetch-charcoal shadow-[0_6px_16px_rgba(0,0,0,0.2)] ring-0 placeholder:text-fetch-muted/55'

  const showConfirm = Boolean(pendingConfirm)
  const showIntent = !showConfirm && (!jobType || flowStep === 'intent')
  const showPickup = !showConfirm && Boolean(jobType && flowStep === 'pickup')
  const showDropoff = !showConfirm && Boolean(jobType && flowStep === 'dropoff')
  const postAddress =
    !showConfirm && Boolean(jobType) && !showIntent && !showPickup && !showDropoff
  const showRouteReady = postAddress && isRouteTerminalPhase(bookingState)
  const showScanner = postAddress && isJobDetailsPhase(bookingState)
  const showPostScan = postAddress && !showRouteReady && !showScanner

  const serviceHint: 'junk' | 'moving' | 'pickup' | 'heavy' | undefined =
    jobType === 'junkRemoval' ? 'junk'
    : jobType === 'homeMoving' ? 'moving'
    : jobType === 'heavyItem' ? 'heavy'
    : jobType === 'deliveryPickup' ? 'pickup'
    : undefined

  const handleRouteNext = useCallback(() => {
    setBookingState((prev) =>
      handleUserInput({ text: 'next', source: 'quick_action' }, prev).bookingState,
    )
    bumpInteraction()
    speakLine("Snap a photo and I'll figure out what we're working with.", {
      debounceKey: 'scanner_intro',
      debounceMs: 0,
    })
  }, [bumpInteraction, speakLine])

  const handlePhotoAdd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    setScanFiles((prev) => [...prev, ...files])
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setScanThumbs((prev) => [...prev, reader.result as string])
        }
      }
      reader.readAsDataURL(file)
    }
    setBookingState((prev) => ({
      ...prev,
      scan: {
        ...prev.scan,
        images: [...prev.scan.images, ...files.map((f) => f.name)],
      },
    }))
    bumpInteraction()
    if (e.target) e.target.value = ''
  }, [bumpInteraction])

  const handleScan = useCallback(async () => {
    if (scanFiles.length === 0 || scanning) return
    setScanning(true)
    speakLine('Let me take a look...', { debounceKey: 'scanning', debounceMs: 0 })
    try {
      const result = await scanBookingPhotos(scanFiles, serviceHint)
      const summaryText = scannerSummaryLine(result.detectedItems)
      const voiceLine = result.detailedDescription || summaryText
      setBookingState((prev) => {
        const withScan: BookingState = {
          ...prev,
          scan: { ...prev.scan, result, confidence: result.confidence },
        }
        return handleUserInput(
          { text: summaryText, source: 'scan' },
          withScan,
        ).bookingState
      })
      playUiEvent('success')
      speakLine(voiceLine, { debounceKey: 'scan_result', debounceMs: 0 })
    } catch {
      speakLine("Couldn't process the photos. Try again.", {
        debounceKey: 'scan_error',
        debounceMs: 0,
      })
    } finally {
      setScanning(false)
    }
  }, [scanFiles, scanning, serviceHint, speakLine, playUiEvent])

  const handleConfirmItems = useCallback(() => {
    setBookingState((prev) => {
      let next: BookingState
      if (prev.jobType === 'junkRemoval') {
        next = handleUserInput({ text: 'next', source: 'quick_action' }, prev).bookingState
      } else {
        const confirmed = handleUserInput(
          { text: 'confirm job items', source: 'quick_action' },
          prev,
        ).bookingState
        next = handleUserInput(
          { text: 'next', source: 'quick_action' },
          confirmed,
        ).bookingState
      }

      next = {
        ...next,
        accessDetails: {
          stairs: next.accessDetails.stairs ?? false,
          lift: next.accessDetails.lift ?? false,
          carryDistance: next.accessDetails.carryDistance ?? 10,
          disassembly: next.accessDetails.disassembly ?? false,
        },
      }

      if (next.jobType === 'junkRemoval') {
        next.junkAccessStepComplete = true
        next.disposalRequired = next.disposalRequired ?? true
        next.internalDisposalDestination =
          next.internalDisposalDestination ?? 'Licensed disposal facility'
        next.junkQuoteAcknowledged = true
        next.junkConfirmStepComplete = true
      }

      next.quoteBreakdown = computeBookingQuoteBreakdown(next)
      next.pricing = computeBookingPricing(next)
      if (next.pricing) next.mode = 'pricing'
      next.flowStep = deriveFlowStep(next)
      if (next.pricing) {
        const line = `Here's what I'm seeing. $${next.pricing.minPrice} to $${next.pricing.maxPrice} for this job.`
        queueMicrotask(() => {
          speakLine(line, { debounceKey: 'quote_voice', debounceMs: 0 })
        })
      }
      return next
    })
    playUiEvent('success')
    bumpInteraction()
  }, [playUiEvent, speakLine, bumpInteraction])

  useEffect(() => {
    if (!showRouteReady) return
    const key = `route_ready:${jobType}`
    if (lastSpokenStepRef.current === key) return
    lastSpokenStepRef.current = key
    speakLine("Route's looking good. Let's see what needs moving.", {
      debounceKey: 'route_ready_voice',
      debounceMs: 0,
    })
  }, [showRouteReady, jobType, speakLine])

  return (
    <div className="relative min-h-dvh w-full" style={orbGlowStyle}>
      <FetchSpeechBottomGlow />
      <button
        type="button"
        onClick={onGoBack}
        className="fetch-stage-back-btn fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-50 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-sm transition-all hover:bg-black/50 active:scale-[0.92]"
        aria-label="Back to Fetch AI"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <FetchHomeStepOne
        onMapsJavaScriptReady={setMapsJsReady}
        pickup={bookingState.pickupAddressText || (pendingConfirm?.field === 'pickup' ? pendingConfirm.address : null)}
        dropoff={bookingState.dropoffAddressText || (pendingConfirm?.field === 'dropoff' ? pendingConfirm.address : null)}
        pickupCoords={bookingState.pickupCoords ?? (pendingConfirm?.field === 'pickup' ? pendingConfirm.coords : null)}
        dropoffCoords={bookingState.dropoffCoords ?? (pendingConfirm?.field === 'dropoff' ? pendingConfirm.coords : null)}
        routePath={mapRoutePath}
        mapStage={mapStage}
        mapAccentRgb={orbGlowColor}
      />

      <div
        className={[
          'fetch-orb-ground-glow-layer pointer-events-none fixed inset-x-0 bottom-0 z-[40] h-[22vh] min-h-[6.75rem]',
          isSpeechPlaying ? 'fetch-orb-ground-glow-layer--speech' : '',
        ].join(' ')}
        aria-hidden
      >
        <div className="fetch-orb-ground-glow-base" />
        <div className="fetch-orb-ground-glow-fill" />
        <div className="fetch-orb-ground-glow-voice-sheen" />
      </div>

      <div
        className="pointer-events-none absolute bottom-[calc(max(1.1rem,env(safe-area-inset-bottom))+9rem+2.85rem)] left-1/2 z-[44] flex w-[min(300px,calc(100%-2rem))] -translate-x-1/2 flex-col items-center gap-2"
        aria-label="Booking assistant"
        aria-hidden={!cardVisible}
      >
        {showConfirm && pendingConfirm ? (
          <div
            key={pinDropBannerNonce}
            className="fetch-pin-drop-banner pointer-events-none w-full overflow-hidden rounded-2xl px-3 py-2.5 text-center"
            role="status"
            aria-live="polite"
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/55">
              {pendingConfirm.field === 'pickup' ? 'Pickup placed' : 'Drop-off placed'}
            </p>
            <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-snug text-white/95 [text-wrap:pretty]">
              {pendingConfirm.address}
            </p>
          </div>
        ) : null}
        <article
          className={[
            'fetch-assistant-premium-card fetch-assistant-card-orb-surface pointer-events-auto rounded-[1.35rem] border border-white/[0.08] bg-[#1a1b1f] px-3 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.04]',
            cardVisible
              ? 'fetch-assistant-card-entry--visible'
              : 'fetch-assistant-card-entry--hidden',
            orbAwakened
              ? 'fetch-assistant-card-orb-surface--awake'
              : 'fetch-assistant-card-orb-surface--dormant',
            isSpeechPlaying ? 'fetch-fetch-ai-assistant-card--speaking' : '',
          ].join(' ')}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/60 shadow-[0_0_0_2px_rgba(255,255,255,0.1)]"
              aria-hidden
            />
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-fetch-muted/75">
              Fetch AI
            </p>
          </div>

          {showConfirm && pendingConfirm ? (
            <>
              <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                {pendingConfirm.field === 'pickup' ? 'Is this the pickup?' : 'Is this the drop-off?'}
              </h2>
              <div className="mt-2 overflow-hidden rounded-xl">
                <img
                  src={`https://maps.googleapis.com/maps/api/streetview?size=600x260&location=${pendingConfirm.coords.lat},${pendingConfirm.coords.lng}&fov=90&pitch=5&key=${mapsApiKey}`}
                  alt={`Street view of ${pendingConfirm.address}`}
                  className="h-[120px] w-full object-cover"
                  loading="eager"
                />
              </div>
              <p className="mt-2 text-[12px] font-medium leading-snug text-fetch-muted/90 [text-wrap:pretty]">
                {pendingConfirm.address}
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={cancelPendingAddress}
                  className="flex-1 rounded-2xl bg-[#222328] px-3 py-2.5 text-[13px] font-semibold text-fetch-charcoal ring-1 ring-white/[0.1] transition-transform active:scale-[0.97]"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={confirmPendingAddress}
                  className="fetch-stage-primary-btn flex-1 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.97]"
                >
                  Confirm
                </button>
              </div>
            </>
          ) : null}

          {showIntent ? (
            <>
              <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                What type of job is this?
              </h2>
              <p className="fetch-home-intro-line mt-2 max-w-[18rem] text-[12px] font-medium leading-snug tracking-[-0.01em] text-fetch-muted/90 [text-wrap:pretty]">
                {INTRO_COPY}
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {SERVICE_OPTIONS.map((opt) => {
                  const selected = selectedServiceId === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleServiceSelect(opt.jobType)}
                      className={[
                        'min-h-[3.1rem] rounded-2xl px-3 py-2 text-left text-[13px] font-semibold shadow-[0_10px_24px_rgba(12,16,22,0.08)] transition-transform active:scale-[0.98]',
                        opt.id === 'helper' ? 'col-span-2 w-full' : '',
                        selected
                          ? 'fetch-stage-chip-selected text-white'
                          : 'bg-[#222328] text-fetch-charcoal ring-1 ring-white/[0.08]',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}

          {showPickup ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  Pickup location
                </h2>
                <button
                  type="button"
                  onClick={goBackToIntent}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  Back
                </button>
              </div>
              <p className="mt-1.5 max-w-[18rem] text-[12px] font-medium leading-snug tracking-[-0.01em] text-fetch-muted/90 [text-wrap:pretty]">
                {bookingState.currentQuestion ?? 'Search for a verified address.'}
              </p>
              {mapsApiKey ? (
                <PlacesAddressAutocomplete
                  key="pickup"
                  apiKey={mapsApiKey}
                  field="pickup"
                  placeholder="Search pickup address"
                  autoFocus
                  onResolved={onPickupResolved}
                  className={inputClass}
                />
              ) : (
                <p className="mt-2 text-[12px] text-fetch-muted">Add a Google Maps API key to search addresses.</p>
              )}
            </>
          ) : null}

          {showDropoff ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  Drop-off location
                </h2>
                <button
                  type="button"
                  onClick={goBackToPickup}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  Back
                </button>
              </div>
              <p className="mt-1.5 max-w-[18rem] text-[12px] font-medium leading-snug tracking-[-0.01em] text-fetch-muted/90 [text-wrap:pretty]">
                {bookingState.currentQuestion ?? 'Where should we deliver?'}
              </p>
              {mapsApiKey ? (
                <PlacesAddressAutocomplete
                  key="dropoff"
                  apiKey={mapsApiKey}
                  field="dropoff"
                  placeholder="Search drop-off address"
                  autoFocus
                  onResolved={onDropoffResolved}
                  className={inputClass}
                />
              ) : (
                <p className="mt-2 text-[12px] text-fetch-muted">Add a Google Maps API key to search addresses.</p>
              )}
            </>
          ) : null}

          {showRouteReady ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  {flowStep === 'route' && requiresDropoff(jobType) ? 'Building route' : 'Route ready'}
                </h2>
                <button
                  type="button"
                  onClick={goBackToIntent}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  Start over
                </button>
              </div>
              {bookingState.pickupAddressText ? (
                <p className="mt-2 text-[11px] leading-snug text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/80">Pickup: </span>
                  {bookingState.pickupAddressText}
                </p>
              ) : null}
              {bookingState.dropoffAddressText ? (
                <p className="mt-1 text-[11px] leading-snug text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/80">Drop-off: </span>
                  {bookingState.dropoffAddressText}
                </p>
              ) : null}
              {bookingState.distanceMeters != null && bookingState.durationSeconds != null ? (
                <p className="mt-1 text-[11px] leading-snug text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/80">Distance: </span>
                  {(bookingState.distanceMeters / 1000).toFixed(1)} km
                  <span className="mx-1.5 text-fetch-muted/40">|</span>
                  ~{Math.round(bookingState.durationSeconds / 60)} min
                </p>
              ) : null}
              {flowStep !== 'route' ? (
                <button
                  type="button"
                  onClick={handleRouteNext}
                  className="fetch-stage-primary-btn mt-3 w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97]"
                >
                  Next
                </button>
              ) : (
                <p className="mt-2 text-[12px] font-medium text-fetch-muted/80">Mapping your route…</p>
              )}
            </>
          ) : null}

          {showScanner ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  {jobType === 'junkRemoval' ? 'Show me the junk' : 'Show me what we\'re moving'}
                </h2>
                <button
                  type="button"
                  onClick={goBackToIntent}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  Start over
                </button>
              </div>
              <p className="mt-1.5 text-[12px] font-medium leading-snug text-fetch-muted/90">
                Take a photo and I'll identify the items.
              </p>

              {scanThumbs.length > 0 ? (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {scanThumbs.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`Photo ${i + 1}`}
                      className="h-[56px] w-[56px] shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]"
                    />
                  ))}
                </div>
              ) : null}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handlePhotoAdd}
                className="hidden"
              />

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={scanning}
                  className="flex-1 rounded-2xl bg-[#222328] px-3 py-2.5 text-center text-[13px] font-semibold text-fetch-charcoal ring-1 ring-white/[0.1] transition-transform active:scale-[0.97] disabled:opacity-50"
                >
                  {scanThumbs.length > 0 ? 'Add more' : 'Take photo'}
                </button>
                {scanFiles.length > 0 && !bookingState.scan.result ? (
                  <button
                    type="button"
                    onClick={handleScan}
                    disabled={scanning}
                    className="fetch-stage-primary-btn flex-1 rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-60"
                  >
                    {scanning ? 'Scanning…' : 'Scan'}
                  </button>
                ) : null}
              </div>

              {bookingState.scan.result && Object.keys(bookingState.itemCounts).length > 0 ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(bookingState.itemCounts).map(([item, qty]) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 rounded-full bg-[#222328] px-2.5 py-1 text-[11px] font-medium text-fetch-charcoal ring-1 ring-white/[0.08]"
                      >
                        {qty > 1 ? `${qty}x ` : ''}{item}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmItems}
                    className="fetch-stage-primary-btn mt-3 w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97]"
                  >
                    Confirm items
                  </button>
                </>
              ) : null}

              {scanning ? (
                <div className="mt-3 flex items-center gap-2">
                  <div className="fetch-stage-spinner h-3 w-3 animate-spin rounded-full" />
                  <p className="text-[12px] font-medium text-fetch-muted/80">Analysing your photos…</p>
                </div>
              ) : null}
            </>
          ) : null}

          {showPostScan &&
          jobType === 'junkRemoval' &&
          bookingState.bookingStatus &&
          isActiveJunkDriverFlow(bookingState.bookingStatus)
            ? (() => {
                const jc = junkLiveJobCopy(bookingState.bookingStatus!, bookingState.driver)
                return (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                        {jc.title}
                      </h2>
                      <button
                        type="button"
                        onClick={goBackToIntent}
                        className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                      >
                        Start over
                      </button>
                    </div>
                    <p className="mt-1.5 text-[12px] font-medium leading-snug text-fetch-muted/90">
                      {jc.line}
                    </p>
                    {bookingState.driver &&
                    (bookingState.bookingStatus === 'matched' ||
                      bookingState.bookingStatus === 'en_route' ||
                      bookingState.bookingStatus === 'arrived' ||
                      bookingState.bookingStatus === 'in_progress') ? (
                      <p className="mt-2 text-[11px] font-medium text-fetch-charcoal/85">
                        {bookingState.driver.vehicle ? `${bookingState.driver.vehicle} · ` : ''}
                        {bookingState.driver.rating != null ? `${bookingState.driver.rating}★` : ''}
                      </p>
                    ) : null}
                    {bookingState.bookingStatus === 'dispatching' ? (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="fetch-stage-spinner h-3 w-3 animate-spin rounded-full" />
                        <p className="text-[12px] font-medium text-fetch-muted/80">Searching…</p>
                      </div>
                    ) : null}
                    {bookingState.bookingStatus === 'completed' ? (
                      <button
                        type="button"
                        onClick={goBackToIntent}
                        className="fetch-stage-primary-btn mt-3 w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97]"
                      >
                        Book another job
                      </button>
                    ) : null}
                  </>
                )
              })()
            : showPostScan && bookingState.pricing ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  Your quote
                </h2>
                <button
                  type="button"
                  onClick={goBackToIntent}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  Start over
                </button>
              </div>

              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fetch-charcoal">
                  ${bookingState.pricing.minPrice}
                </span>
                <span className="text-[16px] font-semibold text-fetch-muted/60">–</span>
                <span className="text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fetch-charcoal">
                  ${bookingState.pricing.maxPrice}
                </span>
                <span className="ml-1 text-[11px] font-medium text-fetch-muted/70">AUD</span>
              </div>

              <p className="mt-1.5 text-[11px] font-medium leading-snug text-fetch-muted/80">
                {bookingState.pricing.explanation}
              </p>
              <p className="mt-0.5 text-[11px] text-fetch-muted/65">
                ~{Math.round(bookingState.pricing.estimatedDuration / 60)} min estimated
              </p>

              {bookingState.quoteBreakdown ? (
                <div className="mt-2.5 space-y-1 border-t border-white/[0.08] pt-2">
                  {([
                    ['Base fee', bookingState.quoteBreakdown.baseFee],
                    ['Route', bookingState.quoteBreakdown.routeFee],
                    ['Route time', bookingState.quoteBreakdown.routeTimeFee],
                    ['Items', bookingState.quoteBreakdown.inventoryFee],
                    ['Access', bookingState.quoteBreakdown.accessFee],
                    ['Disposal', bookingState.quoteBreakdown.disposalFee],
                    ['Helpers', bookingState.quoteBreakdown.helperFee],
                  ] as const)
                    .filter(([, v]) => v > 0)
                    .map(([label, value]) => (
                      <div key={label} className="flex justify-between text-[11px]">
                        <span className="text-fetch-muted/80">{label}</span>
                        <span className="font-medium text-fetch-charcoal/80">${value}</span>
                      </div>
                    ))}
                  {bookingState.quoteBreakdown.moveSizeMultiplier > 1 ? (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-fetch-muted/80">Size multiplier</span>
                      <span className="font-medium text-fetch-charcoal/80">
                        x{bookingState.quoteBreakdown.moveSizeMultiplier}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {bookingState.inventorySummary ? (
                <p className="mt-2 text-[11px] leading-snug text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/80">Items: </span>
                  {bookingState.inventorySummary}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  playUiEvent('success')
                  if (jobType === 'junkRemoval') {
                    startJunkDriverFlow()
                  } else {
                    speakLine("Booking locked in. We'll match you with a driver shortly.", {
                      debounceKey: 'book_now',
                      debounceMs: 0,
                    })
                  }
                }}
                className="fetch-stage-primary-btn mt-3 w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97]"
              >
                Book now
              </button>
            </>
          ) : showPostScan ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  Items confirmed
                </h2>
                <button
                  type="button"
                  onClick={goBackToIntent}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  Start over
                </button>
              </div>
              <p className="mt-1.5 text-[12px] font-medium leading-snug text-fetch-muted/90">
                Calculating your quote…
              </p>
            </>
          ) : null}
        </article>
      </div>

      <div className="pointer-events-none fixed bottom-[calc(max(1.1rem,env(safe-area-inset-bottom))+0.75rem)] left-1/2 z-[42] -translate-x-1/2">
        <div className="pointer-events-auto relative flex h-[9rem] w-[9rem] items-center justify-center">
          <FetchVoiceCommandFab
            onboardingPulse={false}
            expression={orbExpression}
            orbState={orbState}
            pulseNonce={0}
            typingActive={false}
            awakened={orbAwakened}
            confirmationNonce={confirmNonce + fabMindTourPulseNonce}
            mapAttention={mapAttention}
            lookAtCard
            lookDown={homeMindTourOpen}
            glowColor={orbGlowColor}
            onOpen={() => {
              bumpInteraction()
              setOrbAwakened(true)
              setFabMindTourPulseNonce((n) => n + 1)
              setHomeMindTourOpen(true)
              queueMicrotask(() => {
                void speakLine(getHowItWorksTapLine(), {
                  debounceKey: 'home_mind_tour',
                  debounceMs: 1200,
                })
              })
            }}
          />
        </div>
      </div>

      {homeMindTourOpen ? (
        <div
          className="fixed inset-0 z-[46] flex items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Dismiss how it works"
            onClick={closeHomeMindTour}
          />
          <div
            className="relative z-[1] w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <FetchMindHowItWorksOverlay
              layout="modal"
              accentRgb={orbGlowColor}
              onDismiss={closeHomeMindTour}
              autoDismissMs={5600}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function App() {
  const [phase, setPhase] = useState<AppPhase>('splash')

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setPhase('fetch'), 900)
    return () => {
      window.clearTimeout(readyTimer)
    }
  }, [])

  return (
    <FetchVoiceProvider>
      <div
        className={[
          'flex min-h-dvh min-h-[100dvh] w-full justify-center',
          phase === 'fetch' ? 'bg-[#010102]' : 'bg-[#0e0f12]',
        ].join(' ')}
      >
        <div
          className={[
            'relative mx-auto min-h-dvh min-h-[100dvh] w-full overflow-x-clip overflow-y-visible',
            phase === 'fetch'
              ? 'max-w-none bg-[#010102]'
              : 'max-w-[1024px] bg-[#0e0f12] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]',
          ].join(' ')}
        >
          {phase === 'splash' ? (
            <SplashScreen />
          ) : phase === 'fetch' ? (
            <FetchAIView onGoHome={() => setPhase('home')} />
          ) : (
            <HomeView onGoBack={() => setPhase('fetch')} />
          )}
        </div>
      </div>
    </FetchVoiceProvider>
  )
}

export default App
