import { useJsApiLoader } from '@react-google-maps/api'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import {
  CHAT_ERROR_ANTHROPIC_NOT_CONFIGURED,
  CHAT_ERROR_LLM_REQUEST_FAILED,
  CHAT_ERROR_NETWORK,
  CHAT_ERROR_OPENAI_NOT_CONFIGURED,
  CHAT_ERROR_OPENAI_REQUEST_FAILED,
  postFetchAiChatStream,
  type FetchAiChatMessage as ApiFetchAiChatMessage,
  type FetchAiChatNavigation,
} from '../lib/fetchAiChat'
import type { FetchAiBookingPatch } from '../lib/fetchAiBookingPatch'
import {
  createPerfRunId,
  fetchPerfIsEnabled,
  fetchPerfMark,
  fetchPerfSetServerTiming,
} from '../lib/fetchPerf'
import {
  INTENT_COMPOSER_INTENT_LANDING_HINTS,
  INTENT_COMPOSER_PLACEHOLDER_HINTS,
} from '../views/homeConstants'
import { voiceFlowDebug, voiceFlowSttError } from '../voice/voiceFlowDebug'
import { primeVoicePlaybackFromUserGesture } from '../voice/fetchVoice'
import { buildFetchUserMemoryContext } from '../lib/fetchUserMemoryContext'
import { useFetchVoice } from '../voice/FetchVoiceContext'

/**
 * Must match every other `useJsApiLoader` with `id: 'fetch-google-maps'` (e.g. GoogleMapLayer).
 * The shared loader throws if options differ, which blanked the app after composer used `[]`.
 */
const GOOGLE_MAP_LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry']

function isLikelyAddressQuery(s: string): boolean {
  const t = s.trim()
  if (t.length < 3) return false
  if (/\d/.test(t)) return true
  if (
    /\b(st|street|rd|road|ave|avenue|dr|drive|ct|court|way|pl|place|cres|parade|hwy|highway)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/,/.test(t) && t.length >= 6) return true
  return t.length >= 14
}

/** True when the first line looks like a destination (nav arrow / location hint). */
function isAutocompleteAddressInput(s: string): boolean {
  const t = s.trim()
  if (t.length < 3) return false
  if (isLikelyAddressQuery(t)) return true
  if (t.length >= 5 && /\d/.test(t)) return true
  return false
}

function composerIsSingleLineOnly(raw: string): boolean {
  return raw.split('\n').filter((l) => l.trim().length > 0).length <= 1
}

type HomeAiPhoto = { id: string; url: string; file: File }
type HomeChatRole = 'user' | 'assistant' | 'system'
type HomeChatMessage = { role: HomeChatRole; content: string }

export function HomeIntentChatComposer({
  variant = 'default',
  appendOrbChatTurn,
  onChatNavigation,
  onBookingPatch,
  onListeningChange,
  onPlaceSuggestionsOpenChange,
  showGuestAccountHint = false,
  mapsJsReady = false,
  onStartNavigationToPlace,
  onAddressEntryIntentChange,
}: {
  /** `intentLanding`: below service chips, darker field, service-only placeholders. */
  variant?: 'default' | 'intentLanding'
  appendOrbChatTurn: (role: 'user' | 'assistant', text: string) => void
  /** Live route from server (Google Directions + traffic) — drives map + minimal nav sheet. */
  onChatNavigation?: (nav: FetchAiChatNavigation | null) => void
  /** Structured booking hints from the same chat turn (client geocodes addresses). */
  onBookingPatch?: (patch: FetchAiBookingPatch | null) => void
  /** STT mic active — optional (e.g. neural brain “listening” mode). */
  onListeningChange?: (listening: boolean) => void
  /** Legacy: predictions removed; parent always receives `false`. */
  onPlaceSuggestionsOpenChange?: (open: boolean) => void
  /** Signed-out nudge to save places and cards in Account. */
  showGuestAccountHint?: boolean
  /** Parent maps bootstrap — required with `onStartNavigationToPlace` for instant routes. */
  mapsJsReady?: boolean
  /** Client-side Directions: start turn-by-turn immediately (suggestion tap or nav arrow). */
  onStartNavigationToPlace?: (place: {
    lat: number
    lng: number
    label: string
  }) => void
  /** User is typing a destination — parent can switch peek chrome to nav. */
  onAddressEntryIntentChange?: (active: boolean) => void
}) {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const { isLoaded: mapsJsLoaded } = useJsApiLoader({
    id: 'fetch-google-maps',
    googleMapsApiKey: mapsApiKey,
    version: 'weekly',
    libraries: GOOGLE_MAP_LIBRARIES,
    preventGoogleFontsLoading: true,
  })

  const { speakLine, playUiEvent, isSpeechPlaying } = useFetchVoice()
  const [listening, setListening] = useState(false)

  useEffect(() => {
    onListeningChange?.(listening)
  }, [listening, onListeningChange])

  const [micPrimed, setMicPrimed] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [composerPhotos, setComposerPhotos] = useState<HomeAiPhoto[]>([])
  const recognitionRef = useRef<unknown>(null)
  const sttSpeakPendingRef = useRef(false)
  const chatAbortRef = useRef<AbortController | null>(null)
  /** Blocks overlapping home chat turns before `chatPending` re-renders (double send / Enter spam). */
  const homeAiChatInFlightRef = useRef(false)
  const convRef = useRef<HomeChatMessage[]>([])
  const [chatPending, setChatPending] = useState(false)
  /** Incremental assistant text while SSE tokens arrive (cleared after the turn completes). */
  const [streamAssistantText, setStreamAssistantText] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  const placeholderHints = useMemo(
    () =>
      variant === 'intentLanding'
        ? INTENT_COMPOSER_INTENT_LANDING_HINTS
        : INTENT_COMPOSER_PLACEHOLDER_HINTS,
    [variant],
  )

  useEffect(() => {
    setPlaceholderIndex(0)
  }, [variant])
  const [deviceLocationStatus, setDeviceLocationStatus] = useState<
    'pending' | 'granted' | 'denied'
  >('pending')
  useEffect(() => {
    onPlaceSuggestionsOpenChange?.(false)
  }, [onPlaceSuggestionsOpenChange])

  const composerFileInputRef = useRef<HTMLInputElement>(null)
  const composerDateInputRef = useRef<HTMLInputElement>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null)
  const chatGeoRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const chatGeoRequestedRef = useRef(false)
  const mountedRef = useRef(true)
  const revokeComposerPhotoUrls = useCallback((items: HomeAiPhoto[]) => {
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
    const minPx = variant === 'intentLanding' ? 38 : 44
    el.style.height = `${Math.max(minPx, next)}px`
  }, [variant])

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
        setDeviceLocationStatus('granted')
      },
      () => {
        setDeviceLocationStatus('denied')
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 10_000 },
    )
  }, [])

  const runHomeAiChat = useCallback(
    async (userContent: string, fromStt: boolean) => {
      const trimmed = userContent.trim()
      if (!trimmed) return
      if (homeAiChatInFlightRef.current) return
      homeAiChatInFlightRef.current = true
      try {
      const perfRunId = fetchPerfIsEnabled() ? createPerfRunId('fetch_ai_turn') : undefined
      if (perfRunId) {
        fetchPerfMark(perfRunId, '1_user_action', { fromStt, surface: 'home_intent_chat' })
      }

      if (fromStt) {
        sttSpeakPendingRef.current = true
      }
      appendOrbChatTurn('user', trimmed)
      playUiEvent('processing_start')

      const userMsg: HomeChatMessage = { role: 'user' as const, content: trimmed }
      const messagesForApi: HomeChatMessage[] = [...convRef.current, userMsg].slice(-10)
      convRef.current = messagesForApi

      chatAbortRef.current?.abort()
      const ac = new AbortController()
      chatAbortRef.current = ac
      setChatPending(true)
      setStreamAssistantText('')

      try {
        const geo = chatGeoRef.current
        const mem = buildFetchUserMemoryContext()
        const { reply, navigation, bookingPatch, perfTiming } = await postFetchAiChatStream(
          messagesForApi as ApiFetchAiChatMessage[],
          {
            signal: ac.signal,
            locale: 'en-AU',
            context: {
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {}),
              ...(mem ? { userMemory: mem } : {}),
            },
            perfRunId,
            onToken: (t) => {
              setStreamAssistantText((s) => s + t)
            },
          },
        )
        if (bookingPatch) {
          onBookingPatch?.(bookingPatch)
        }
        if (navigation?.active) {
          onChatNavigation?.(navigation)
          if (perfRunId) {
            fetchPerfMark(perfRunId, '2_step_visible', {
              surface: 'home_intent_chat',
              chat_nav_active: true,
            })
          }
        }
        if (perfRunId && perfTiming) {
          fetchPerfSetServerTiming(perfRunId, perfTiming)
        }
        if (ac.signal.aborted) return
        setStreamAssistantText('')
        const assistantMsg: HomeChatMessage = {
          role: 'assistant' as const,
          content: reply,
        }
        convRef.current = [...convRef.current, assistantMsg].slice(-10)
        appendOrbChatTurn('assistant', reply)
        setChatPending(false)
        void speakLine(reply, {
          debounceKey: 'fetch_ai_home_intent',
          debounceMs: 0,
          perfRunId,
        })
      } catch (e) {
        if (ac.signal.aborted) return
        const code = e instanceof Error ? e.message : ''

        let errLine: string
        if (
          code === CHAT_ERROR_OPENAI_NOT_CONFIGURED ||
          code === CHAT_ERROR_ANTHROPIC_NOT_CONFIGURED
        ) {
          errLine =
            'The assistant is not fully set up yet. The server needs a configured chat model API key.'
        } else if (
          code === CHAT_ERROR_OPENAI_REQUEST_FAILED ||
          code === CHAT_ERROR_LLM_REQUEST_FAILED
        ) {
          errLine = 'The chat service had a problem. Please try again in a moment.'
        } else if (code === CHAT_ERROR_NETWORK) {
          errLine =
            "I can't reach the Fetch server. On your machine, run npm run server in another terminal, then try again."
        } else {
          errLine = 'Sorry, something went wrong with that reply. Please try again.'
        }
        setStreamAssistantText('')
        appendOrbChatTurn('assistant', errLine)
        setChatPending(false)
        void speakLine(errLine, {
          debounceKey: 'fetch_ai_home_intent',
          debounceMs: 0,
          perfRunId,
        })
      } finally {
        if (chatAbortRef.current === ac) {
          chatAbortRef.current = null
        }
        setChatPending(false)
        if (fromStt) {
          sttSpeakPendingRef.current = false
          if (!ac.signal.aborted && mountedRef.current) {
            setMicPrimed(false)
          }
        }
      }
      } finally {
        homeAiChatInFlightRef.current = false
      }
    },
    [speakLine, playUiEvent, appendOrbChatTurn, onChatNavigation, onBookingPatch],
  )

  const onComposerPhotosSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (!list?.length) return
      const next: HomeAiPhoto[] = []
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

  const openComposerDatePicker = useCallback(() => {
    const el = composerDateInputRef.current
    if (!el) return
    const withPicker = el as HTMLInputElement & { showPicker?: () => void }
    if (typeof withPicker.showPicker === 'function') {
      try {
        withPicker.showPicker()
        return
      } catch {
        /* fall through */
      }
    }
    el.click()
  }, [])

  const onComposerDateChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (!v) return
      const d = new Date(`${v}T12:00:00`)
      if (Number.isNaN(d.getTime())) return
      const label = d.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      setComposerText((t) => {
        const s = t.trim()
        return s ? `${s} — ${label}` : label
      })
      playUiEvent('success')
      e.target.value = ''
      window.requestAnimationFrame(() => resizeComposerTextarea())
    },
    [playUiEvent, resizeComposerTextarea],
  )

  const submitComposer = useCallback(() => {
    if (homeAiChatInFlightRef.current) return
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

    void runHomeAiChat(userContent, false)
  }, [composerText, composerPhotos, playUiEvent, revokeComposerPhotoUrls, runHomeAiChat])

  const startNavFromTypedQuery = useCallback(() => {
    if (!onStartNavigationToPlace || typeof google === 'undefined') return
    const line = composerText.split('\n')[0]?.trim() ?? ''
    if (!line) return
    playUiEvent('processing_start')
    const geocoder = new google.maps.Geocoder()
    geocoder.geocode({ address: `${line}, Australia`, region: 'AU' }, (results, status) => {
      if (!mountedRef.current) return
      if (status !== 'OK' || !results?.[0]?.geometry?.location) {
        playUiEvent('error')
        return
      }
      const loc = results[0].geometry.location
      onStartNavigationToPlace({
        lat: loc.lat(),
        lng: loc.lng(),
        label: results[0].formatted_address ?? line,
      })
    })
  }, [composerText, onStartNavigationToPlace, playUiEvent])

  const intentNavChrome = useMemo(() => {
    const line = composerText.split('\n')[0]?.trim() ?? ''
    const single = composerIsSingleLineOnly(composerText)
    const addressIntentCore =
      Boolean(
        mapsJsReady &&
          mapsJsLoaded &&
          mapsApiKey &&
          onStartNavigationToPlace &&
          single &&
          isAutocompleteAddressInput(line),
      )
    const showNavGoArrow =
      addressIntentCore &&
      line.length >= 3 &&
      !listening &&
      !micPrimed &&
      composerPhotos.length === 0
    return { line, addressIntentCore, showNavGoArrow }
  }, [
    composerText,
    mapsJsReady,
    mapsJsLoaded,
    mapsApiKey,
    onStartNavigationToPlace,
    listening,
    micPrimed,
    composerPhotos.length,
  ])

  useEffect(() => {
    if (!onAddressEntryIntentChange) return
    /* Step-1 sheet: no address / nav chrome from this field */
    onAddressEntryIntentChange(
      variant === 'intentLanding' ? false : intentNavChrome.addressIntentCore,
    )
  }, [variant, intentNavChrome.addressIntentCore, onAddressEntryIntentChange])

  const onComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (e.repeat) return
        if (e.nativeEvent.isComposing) return
        e.preventDefault()
        if (homeAiChatInFlightRef.current) return
        if (variant !== 'intentLanding' && intentNavChrome.showNavGoArrow) {
          startNavFromTypedQuery()
          return
        }
        submitComposer()
      }
    },
    [variant, submitComposer, intentNavChrome.showNavGoArrow, startNavFromTypedQuery],
  )

  const onComposerVoicePointerDown = useCallback(() => {
    primeVoicePlaybackFromUserGesture()
    if (listening) return
    setMicPrimed(true)
  }, [listening])

  const startListening = useCallback(() => {
    voiceFlowDebug('tap_detected', { source: 'home_intent_mic' })
    primeVoicePlaybackFromUserGesture()
    chatAbortRef.current?.abort()
    chatAbortRef.current = null
    setChatPending(false)
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
        debounceKey: 'no_stt_home',
        debounceMs: 3000,
      })
      return
    }

    if (recognitionRef.current) {
      try {
        ;(recognitionRef.current as { abort: () => void }).abort()
      } catch {
        /* ignore */
      }
    }

    const rec = new SpeechRec()
    rec.lang = 'en-AU'
    rec.interimResults = false
    rec.maxAlternatives = 1
    recognitionRef.current = rec

    rec.onstart = () => {
      voiceFlowDebug('listening', { source: 'home_intent_stt' })
      setListening(true)
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
      playUiEvent('listening_end')
      if (!trimmed) {
        return
      }

      void runHomeAiChat(trimmed, true)
    }

    rec.onerror = (ev) => {
      const e = ev as { error?: string }
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
  }, [speakLine, playUiEvent, runHomeAiChat])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      onAddressEntryIntentChange?.(false)
      chatAbortRef.current?.abort()
      chatAbortRef.current = null
      if (recognitionRef.current) {
        try {
          ;(recognitionRef.current as { abort: () => void }).abort()
        } catch {
          /* ignore */
        }
      }
    }
  }, [onAddressEntryIntentChange])

  useEffect(() => {
    const hints = placeholderHints
    if (hints.length < 2) return
    if (composerText.trim().length > 0 || chatPending) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % hints.length)
    }, 4200)
    return () => window.clearInterval(id)
  }, [composerText, chatPending, placeholderHints])

  const hasSendableDraft =
    composerText.trim().length > 0 || composerPhotos.length > 0
  const showNavGoArrow =
    variant !== 'intentLanding' && intentNavChrome.showNavGoArrow
  const showSendArrow =
    hasSendableDraft && !showNavGoArrow && !listening && !micPrimed
  const rotatingPlaceholder =
    placeholderHints[placeholderIndex % Math.max(1, placeholderHints.length)] ??
    'Ask Fetch anything…'

  /** Empty while there is text — avoids iOS/WebKit drawing hint on top of typed addresses. */
  const composerPlaceholder = composerText.trim().length > 0 ? '' : rotatingPlaceholder

  const locationHintId = 'fetch-intent-location-hint'
  const showLocationHint =
    variant !== 'intentLanding' &&
    deviceLocationStatus === 'denied' &&
    Boolean(mapsApiKey) &&
    Boolean(onStartNavigationToPlace) &&
    isAutocompleteAddressInput(composerText.split('\n')[0]?.trim() ?? '')

  const composerDescribedBy = [showLocationHint ? locationHintId : null].filter(Boolean).join(' ')

  return (
    <div
      className={[
        'pointer-events-auto w-full',
        variant === 'intentLanding' ? 'mt-2' : 'mt-1',
      ].join(' ')}
    >
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
      <input
        ref={composerDateInputRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onComposerDateChange}
      />

      {showGuestAccountHint ? (
        <p
          className={[
            'mb-1.5 px-1 text-[11px] font-medium leading-snug [text-wrap:pretty]',
            variant === 'intentLanding'
              ? 'text-slate-500'
              : 'text-white/50',
          ].join(' ')}
        >
          Sign in via Account to save places and cards on this device.
        </p>
      ) : null}

      <div
        className={[
          'fetch-ai-composer-shell fetch-home-intent-composer w-full',
          variant === 'intentLanding' ? 'fetch-home-intent-composer--intent-landing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
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
        {showLocationHint ? (
          <p
            id={locationHintId}
            className="fetch-home-intent-location-hint px-3 pt-2.5 pb-1 text-[11px] leading-snug"
            role="note"
          >
            Allow location to route from where you are. Type an address and tap the go arrow to
            navigate.
          </p>
        ) : null}
        {streamAssistantText.trim().length > 0 ? (
          <p
            className={[
              'fetch-home-intent-stream-preview px-3 pt-1 pb-0.5 text-[12px] font-medium leading-snug [text-wrap:pretty]',
              variant === 'intentLanding' ? 'text-slate-600' : 'text-white/75',
            ].join(' ')}
            aria-live="polite"
          >
            {streamAssistantText}
          </p>
        ) : null}
        <div
          className={[
            'fetch-intent-composer-control-row flex min-h-0 items-center',
            variant === 'intentLanding' ? 'w-full px-0 py-0' : 'gap-1.5 px-2 py-1.5',
          ].join(' ')}
        >
          {variant === 'intentLanding' ? (
            <div className="fetch-intent-composer-inline-shell flex w-full min-h-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => composerFileInputRef.current?.click()}
                className="fetch-ai-composer-plus fetch-intent-composer-inline-icon-btn flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full transition-[transform,colors] active:scale-[0.96]"
                aria-label="Add photos"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <div className="relative flex min-h-[2.375rem] min-w-0 flex-1 items-stretch self-stretch">
                <textarea
                  ref={composerTextareaRef}
                  rows={1}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder={composerPlaceholder}
                  className="fetch-ai-composer-input fetch-ai-composer-input--intent-landing-light max-h-32 min-h-0 w-full flex-1 resize-none border-0 bg-transparent text-[15px] font-bold tracking-[-0.015em] focus:outline-none focus:ring-0 focus-visible:ring-0"
                  aria-label="Describe the service you need"
                  aria-describedby={composerDescribedBy || undefined}
                  aria-autocomplete="none"
                  disabled={chatPending}
                />
              </div>
              <button
                type="button"
                onClick={openComposerDatePicker}
                disabled={chatPending}
                className="fetch-intent-composer-inline-icon-btn fetch-intent-composer-inline-date-btn flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full transition-[transform,colors] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Add date"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </button>
              <button
                type="button"
                onPointerDown={
                  showSendArrow || showNavGoArrow ? undefined : onComposerVoicePointerDown
                }
                onClick={() => {
                  if (showNavGoArrow) {
                    primeVoicePlaybackFromUserGesture()
                    startNavFromTypedQuery()
                  } else if (showSendArrow) {
                    submitComposer()
                  } else {
                    startListening()
                  }
                }}
                disabled={
                  showNavGoArrow
                    ? chatPending
                    : showSendArrow
                      ? chatPending
                      : listening || chatPending
                }
                className={[
                  'fetch-ai-voice-btn fetch-intent-composer-inline-voice shrink-0',
                  showSendArrow ? 'fetch-ai-voice-btn--send-draft' : '',
                  showNavGoArrow ? 'fetch-ai-voice-btn--nav-go' : '',
                  !showSendArrow && !showNavGoArrow ? 'fetch-ai-voice-btn--plain-mic' : '',
                  !showSendArrow &&
                  !showNavGoArrow &&
                  (listening || micPrimed)
                    ? 'fetch-ai-voice-btn--listening'
                    : '',
                  !showSendArrow &&
                  !showNavGoArrow &&
                  isSpeechPlaying
                    ? 'fetch-ai-voice-btn--speaking'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={
                  showNavGoArrow
                    ? 'Start directions to this address'
                    : showSendArrow
                      ? 'Send message'
                      : 'Voice'
                }
              >
                <span className="fetch-ai-voice-btn__ring" aria-hidden />
                <span className="fetch-ai-voice-btn__glow" aria-hidden />
                <span
                  className={[
                    'fetch-ai-voice-btn__core flex items-center justify-center',
                    showSendArrow || showNavGoArrow ? '' : 'fetch-ai-voice-btn__core--plain-mic',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {showNavGoArrow ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="fetch-ai-voice-btn__nav-icon"
                      aria-hidden
                    >
                      <path d="M12 3v10.5" />
                      <path d="M7.5 8.5L12 3l4.5 5.5" />
                      <path d="M8 21h8" />
                      <path d="M12 13.5V21" />
                    </svg>
                  ) : showSendArrow ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="fetch-ai-voice-btn__send-icon"
                      aria-hidden
                    >
                      <path d="M12 19V6M6 11l6-6 6 6" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={[
                        'fetch-ai-voice-btn__mic-icon',
                        listening || micPrimed ? 'fetch-ai-voice-btn__mic-icon--active' : '',
                        isSpeechPlaying && !listening && !micPrimed
                          ? 'fetch-ai-voice-btn__mic-icon--speaking'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden
                    >
                      <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z" />
                      <path d="M19 11a7 7 0 0 1-14 0" />
                      <path d="M12 18v3" />
                      <path d="M8 21h8" />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => composerFileInputRef.current?.click()}
                className="fetch-ai-composer-plus flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[transform,color,opacity] active:scale-[0.96]"
                aria-label="Add photos"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <div className="relative min-w-0 flex-1">
                <textarea
                  ref={composerTextareaRef}
                  rows={1}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder={composerPlaceholder}
                  className="fetch-ai-composer-input max-h-32 min-h-[2.5rem] w-full resize-none bg-transparent py-2 text-[16px] font-semibold leading-snug tracking-[-0.01em] text-white placeholder:text-neutral-400 focus:outline-none"
                  aria-label="Message"
                  aria-describedby={composerDescribedBy || undefined}
                  aria-autocomplete="none"
                  disabled={chatPending}
                />
              </div>
              <button
                type="button"
                onPointerDown={
                  showSendArrow || showNavGoArrow ? undefined : onComposerVoicePointerDown
                }
                onClick={() => {
                  if (showNavGoArrow) {
                    primeVoicePlaybackFromUserGesture()
                    startNavFromTypedQuery()
                  } else if (showSendArrow) {
                    submitComposer()
                  } else {
                    startListening()
                  }
                }}
                disabled={
                  showNavGoArrow
                    ? chatPending
                    : showSendArrow
                      ? chatPending
                      : listening || chatPending
                }
                className={[
                  'fetch-ai-voice-btn',
                  showSendArrow ? 'fetch-ai-voice-btn--send-draft' : '',
                  showNavGoArrow ? 'fetch-ai-voice-btn--nav-go' : '',
                  !showSendArrow && !showNavGoArrow ? 'fetch-ai-voice-btn--plain-mic' : '',
                  !showSendArrow &&
                  !showNavGoArrow &&
                  (listening || micPrimed)
                    ? 'fetch-ai-voice-btn--listening'
                    : '',
                  !showSendArrow &&
                  !showNavGoArrow &&
                  isSpeechPlaying
                    ? 'fetch-ai-voice-btn--speaking'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={
                  showNavGoArrow
                    ? 'Start directions to this address'
                    : showSendArrow
                      ? 'Send message'
                      : 'Voice'
                }
              >
                <span className="fetch-ai-voice-btn__ring" aria-hidden />
                <span className="fetch-ai-voice-btn__glow" aria-hidden />
                <span
                  className={[
                    'fetch-ai-voice-btn__core flex items-center justify-center',
                    showSendArrow || showNavGoArrow ? '' : 'fetch-ai-voice-btn__core--plain-mic',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {showNavGoArrow ? (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="fetch-ai-voice-btn__nav-icon"
                      aria-hidden
                    >
                      <path d="M12 3v10.5" />
                      <path d="M7.5 8.5L12 3l4.5 5.5" />
                      <path d="M8 21h8" />
                      <path d="M12 13.5V21" />
                    </svg>
                  ) : showSendArrow ? (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="fetch-ai-voice-btn__send-icon"
                      aria-hidden
                    >
                      <path d="M12 19V6M6 11l6-6 6 6" />
                    </svg>
                  ) : (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={[
                        'fetch-ai-voice-btn__mic-icon',
                        listening || micPrimed ? 'fetch-ai-voice-btn__mic-icon--active' : '',
                        isSpeechPlaying && !listening && !micPrimed
                          ? 'fetch-ai-voice-btn__mic-icon--speaking'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden
                    >
                      <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z" />
                      <path d="M19 11a7 7 0 0 1-14 0" />
                      <path d="M12 18v3" />
                      <path d="M8 21h8" />
                    </svg>
                  )}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
