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
  CHAT_ERROR_NETWORK,
  CHAT_ERROR_OPENAI_NOT_CONFIGURED,
  postFetchAiChat,
  type FetchAiChatMessage as ApiFetchAiChatMessage,
  type FetchAiChatNavigation,
} from '../lib/fetchAiChat'
import {
  createPerfRunId,
  fetchPerfIsEnabled,
  fetchPerfMark,
  fetchPerfSetServerTiming,
} from '../lib/fetchPerf'
import { INTENT_COMPOSER_PLACEHOLDER_HINTS } from '../views/homeConstants'
import type { SavedAddress } from '../lib/savedAddresses'
import { voiceFlowDebug, voiceFlowSttError } from '../voice/voiceFlowDebug'
import { primeVoicePlaybackFromUserGesture } from '../voice/fetchVoice'
import { buildFetchUserMemoryContext } from '../lib/fetchUserMemoryContext'
import { FetchSoundWaveBars } from './FetchSoundWaveBars'
import { useFetchVoice } from '../voice/FetchVoiceContext'

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

/** Looser than `isLikelyAddressQuery` so short house numbers still get Places suggestions. */
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
type PlacePredictionRow = { description: string; placeId: string }
type HomeChatRole = 'user' | 'assistant' | 'system'
type HomeChatMessage = { role: HomeChatRole; content: string }

export function HomeIntentChatComposer({
  appendOrbChatTurn,
  onChatNavigation,
  onListeningChange,
  onPlaceSuggestionsOpenChange,
  savedAddresses = [],
  showSavedAddressChips = false,
  onSavedPlaceChipNavigate,
  showGuestAccountHint = false,
  mapsJsReady = false,
  onStartNavigationToPlace,
  onAddressEntryIntentChange,
}: {
  appendOrbChatTurn: (role: 'user' | 'assistant', text: string) => void
  /** Live route from server (Google Directions + traffic) — drives map + minimal nav sheet. */
  onChatNavigation?: (nav: FetchAiChatNavigation | null) => void
  /** STT mic active — optional (e.g. neural brain “listening” mode). */
  onListeningChange?: (listening: boolean) => void
  /** Place prediction list visible — parent can expand the booking sheet. */
  onPlaceSuggestionsOpenChange?: (open: boolean) => void
  /** Quick-fill saved places from Account into the composer. */
  savedAddresses?: readonly SavedAddress[]
  /**
   * Saved-place pills (Home / Work). Off on the landing composer; use live navigation sheet instead.
   */
  showSavedAddressChips?: boolean
  /** When set (e.g. chat navigation), tapping a chip reroutes immediately instead of pasting into the field. */
  onSavedPlaceChipNavigate?: (a: SavedAddress) => void
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
  const convRef = useRef<HomeChatMessage[]>([])
  const [chatPending, setChatPending] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [deviceLocationStatus, setDeviceLocationStatus] = useState<
    'pending' | 'granted' | 'denied'
  >('pending')
  const [placePredictions, setPlacePredictions] = useState<PlacePredictionRow[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)

  const placeSuggestionsVisible = suggestOpen && placePredictions.length > 0
  useEffect(() => {
    onPlaceSuggestionsOpenChange?.(placeSuggestionsVisible)
  }, [placeSuggestionsVisible, onPlaceSuggestionsOpenChange])

  const composerFileInputRef = useRef<HTMLInputElement>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null)
  const chatGeoRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const chatGeoRequestedRef = useRef(false)
  const mountedRef = useRef(true)
  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const predictDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestBlurCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        setDeviceLocationStatus('granted')
      },
      () => {
        setDeviceLocationStatus('denied')
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 10_000 },
    )
  }, [])

  useEffect(() => {
    if (!mapsJsLoaded || typeof google === 'undefined') return
    acServiceRef.current = new google.maps.places.AutocompleteService()
    return () => {
      acServiceRef.current = null
    }
  }, [mapsJsLoaded])

  useEffect(() => {
    if (!mapsJsLoaded || typeof google === 'undefined') return
    const el = document.createElement('div')
    placesServiceRef.current = new google.maps.places.PlacesService(el)
    return () => {
      placesServiceRef.current = null
    }
  }, [mapsJsLoaded])

  const runHomeAiChat = useCallback(
    async (userContent: string, fromStt: boolean) => {
      const trimmed = userContent.trim()
      if (!trimmed) return

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

      try {
        const geo = chatGeoRef.current
        const mem = buildFetchUserMemoryContext()
        const { reply, navigation, perfTiming } = await postFetchAiChat(
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
          },
        )
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
        if (code === CHAT_ERROR_OPENAI_NOT_CONFIGURED) {
          errLine =
            'The assistant is not fully set up yet. The server needs an Open A I key for chat.'
        } else if (code === CHAT_ERROR_NETWORK) {
          errLine =
            "I can't reach the Fetch server. On your machine, run npm run server in another terminal, then try again."
        } else {
          errLine = 'Sorry, something went wrong with that reply. Please try again.'
        }
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
    },
    [speakLine, playUiEvent, appendOrbChatTurn, onChatNavigation],
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

    void runHomeAiChat(userContent, false)
  }, [composerText, composerPhotos, playUiEvent, revokeComposerPhotoUrls, runHomeAiChat])

  const applyPlacePrediction = useCallback(
    (row: PlacePredictionRow) => {
      const svc = placesServiceRef.current
      const finish = (text: string) => {
        setComposerText(text)
        setPlacePredictions([])
        setSuggestOpen(false)
        setActiveSuggestionIndex(-1)
        queueMicrotask(() => resizeComposerTextarea())
      }
      if (!svc || !row.placeId) {
        finish(row.description)
        return
      }
      svc.getDetails(
        {
          placeId: row.placeId,
          fields: ['formatted_address', 'geometry', 'place_id', 'name'],
        },
        (place, status) => {
          if (!mountedRef.current) return
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            finish(row.description)
            return
          }
          const label = place.formatted_address ?? place.name ?? row.description
          const loc = place.geometry?.location
          if (loc && onStartNavigationToPlace) {
            onStartNavigationToPlace({
              lat: loc.lat(),
              lng: loc.lng(),
              label,
            })
          }
          finish(label)
        },
      )
    },
    [resizeComposerTextarea, onStartNavigationToPlace],
  )

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
      setPlacePredictions([])
      setSuggestOpen(false)
      setActiveSuggestionIndex(-1)
    })
  }, [composerText, onStartNavigationToPlace, playUiEvent])

  useEffect(() => {
    if (predictDebounceRef.current) {
      clearTimeout(predictDebounceRef.current)
      predictDebounceRef.current = null
    }
    const line = composerText.split('\n')[0]?.trim() ?? ''
    if (
      !mapsApiKey ||
      !mapsJsLoaded ||
      chatPending ||
      !line ||
      !isAutocompleteAddressInput(line)
    ) {
      setPlacePredictions([])
      setSuggestOpen(false)
      setActiveSuggestionIndex(-1)
      return
    }

    predictDebounceRef.current = window.setTimeout(() => {
      predictDebounceRef.current = null
      const ac = acServiceRef.current
      if (!ac || typeof google === 'undefined') return
      const geo = chatGeoRef.current
      const center = geo
        ? { lat: geo.latitude, lng: geo.longitude }
        : { lat: -27.4705, lng: 153.026 }
      const circle = new google.maps.Circle({
        center,
        radius: geo ? 85_000 : 220_000,
      })
      ac.getPlacePredictions(
        {
          input: line.slice(0, 120),
          componentRestrictions: { country: 'au' },
          locationBias: circle,
        },
        (predictions, status) => {
          if (!mountedRef.current) return
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !predictions?.length
          ) {
            setPlacePredictions([])
            setSuggestOpen(false)
            setActiveSuggestionIndex(-1)
            return
          }
          const rows = predictions
            .slice(0, 6)
            .map((p) => ({
              description: p.description ?? '',
              placeId: p.place_id ?? '',
            }))
            .filter((r) => r.placeId && r.description)
          setPlacePredictions(rows)
          setSuggestOpen(rows.length > 0)
          setActiveSuggestionIndex(-1)
        },
      )
    }, 200)

    return () => {
      if (predictDebounceRef.current) {
        clearTimeout(predictDebounceRef.current)
        predictDebounceRef.current = null
      }
    }
  }, [composerText, mapsApiKey, mapsJsLoaded, chatPending])

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
    onAddressEntryIntentChange(intentNavChrome.addressIntentCore)
  }, [intentNavChrome.addressIntentCore, onAddressEntryIntentChange])

  const onComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (suggestOpen && placePredictions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveSuggestionIndex((i) =>
            i < placePredictions.length - 1 ? i + 1 : 0,
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveSuggestionIndex((i) =>
            i > 0 ? i - 1 : placePredictions.length - 1,
          )
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setSuggestOpen(false)
          setPlacePredictions([])
          setActiveSuggestionIndex(-1)
          return
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          const idx = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0
          const row = placePredictions[idx]
          if (row) {
            e.preventDefault()
            applyPlacePrediction(row)
            return
          }
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (intentNavChrome.showNavGoArrow) {
          startNavFromTypedQuery()
          return
        }
        submitComposer()
      }
    },
    [
      suggestOpen,
      placePredictions,
      activeSuggestionIndex,
      applyPlacePrediction,
      submitComposer,
      intentNavChrome.showNavGoArrow,
      startNavFromTypedQuery,
    ],
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
      if (suggestBlurCloseRef.current) {
        clearTimeout(suggestBlurCloseRef.current)
        suggestBlurCloseRef.current = null
      }
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
    const hints = INTENT_COMPOSER_PLACEHOLDER_HINTS
    if (hints.length < 2) return
    if (composerText.trim().length > 0 || chatPending) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % hints.length)
    }, 4200)
    return () => window.clearInterval(id)
  }, [composerText, chatPending])

  const hasSendableDraft =
    composerText.trim().length > 0 || composerPhotos.length > 0
  const showNavGoArrow = intentNavChrome.showNavGoArrow
  const showSendArrow =
    hasSendableDraft && !showNavGoArrow && !listening && !micPrimed
  const rotatingPlaceholder =
    INTENT_COMPOSER_PLACEHOLDER_HINTS[
      placeholderIndex % Math.max(1, INTENT_COMPOSER_PLACEHOLDER_HINTS.length)
    ] ?? 'Ask Fetch anything…'

  /** Empty while there is text — avoids iOS/WebKit drawing hint on top of typed addresses. */
  const composerPlaceholder = composerText.trim().length > 0 ? '' : rotatingPlaceholder

  const locationHintId = 'fetch-intent-location-hint'
  const showLocationHint =
    deviceLocationStatus === 'denied' &&
    Boolean(mapsApiKey) &&
    Boolean(onStartNavigationToPlace) &&
    isAutocompleteAddressInput(composerText.split('\n')[0]?.trim() ?? '')

  const composerDescribedBy = [showLocationHint ? locationHintId : null].filter(Boolean).join(' ')

  const insertSavedAddress = useCallback((a: SavedAddress) => {
    setComposerText(a.address)
    queueMicrotask(() => resizeComposerTextarea())
  }, [resizeComposerTextarea])

  return (
    <div className="pointer-events-auto mt-1 w-full">
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

      {showGuestAccountHint ? (
        <p className="mb-1.5 px-1 text-[11px] font-medium leading-snug text-white/50 [text-wrap:pretty]">
          Sign in via Account to save places and cards on this device.
        </p>
      ) : null}

      <div className="fetch-ai-composer-shell fetch-home-intent-composer w-full">
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
        {showSavedAddressChips && savedAddresses.length > 0 ? (
          <div
            className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Saved places"
          >
            {savedAddresses.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  onSavedPlaceChipNavigate
                    ? onSavedPlaceChipNavigate(a)
                    : insertSavedAddress(a)
                }
                disabled={chatPending}
                className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/85 transition-colors hover:bg-white/10 disabled:opacity-45"
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
        {showLocationHint ? (
          <p
            id={locationHintId}
            className="fetch-home-intent-location-hint px-3 pt-2.5 pb-1 text-[11px] leading-snug"
            role="note"
          >
            Allow location to route from where you are. You can still browse address suggestions.
          </p>
        ) : null}
        <div className="flex min-h-[3rem] items-center gap-2 px-2 py-2">
          <button
            type="button"
            onClick={() => composerFileInputRef.current?.click()}
            className="fetch-ai-composer-plus flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[transform,color,opacity] active:scale-[0.96]"
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
              onFocus={() => {
                if (suggestBlurCloseRef.current) {
                  clearTimeout(suggestBlurCloseRef.current)
                  suggestBlurCloseRef.current = null
                }
                if (placePredictions.length > 0) setSuggestOpen(true)
              }}
              onBlur={() => {
                suggestBlurCloseRef.current = window.setTimeout(() => {
                  suggestBlurCloseRef.current = null
                  setSuggestOpen(false)
                  setActiveSuggestionIndex(-1)
                }, 200)
              }}
              placeholder={composerPlaceholder}
              className="fetch-ai-composer-input max-h-32 min-h-11 w-full resize-none bg-transparent py-3 text-[16px] leading-5 text-white placeholder:text-neutral-500 focus:outline-none"
              aria-label="Message"
              aria-describedby={composerDescribedBy || undefined}
              aria-autocomplete={suggestOpen ? 'list' : 'none'}
              aria-controls="fetch-intent-place-suggestions"
              aria-expanded={suggestOpen}
              disabled={chatPending}
            />
            {suggestOpen && placePredictions.length > 0 ? (
              <ul
                id="fetch-intent-place-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-52 overflow-auto rounded-xl border border-white/12 bg-[#141416]/96 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
              >
                {placePredictions.map((p, i) => (
                  <li key={p.placeId} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === activeSuggestionIndex}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyPlacePrediction(p)
                      }}
                      className={[
                        'flex w-full px-3 py-2 text-left text-[13px] font-medium leading-snug text-white/88 transition-colors',
                        i === activeSuggestionIndex ? 'bg-white/12' : 'hover:bg-white/[0.07]',
                      ].join(' ')}
                    >
                      {p.description}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
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
            <span className="fetch-ai-voice-btn__core fetch-ai-voice-btn__core--waves flex items-center justify-center">
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
                <FetchSoundWaveBars active={listening || micPrimed || isSpeechPlaying} />
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
