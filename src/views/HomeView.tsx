import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import {
  FetchHomeBookingSheet,
  type HomeBookingSheetSnap,
  type HomeBookingSheetSurface,
} from '../components/FetchHomeBookingSheet'
import { FetchHomeStepOne } from '../components/FetchHomeStepOne'
import {
  PlacesAddressAutocomplete,
  type ResolvedPlace,
} from '../components/FetchHomeStepOne/PlacesAddressAutocomplete'
import type { FetchOrbExpression } from '../components/JarvisNeuralOrb'
import { FetchVoiceCommandFab } from '../components/FetchVoiceCommandFab'
import { FetchSpeechBottomGlow } from '../components/FetchHomeFloatingChrome'
import { HomeIntentChatComposer } from '../components/HomeIntentChatComposer'
import type { FetchAiChatNavigation } from '../lib/fetchAiChat'
import { FetchSoundWaveBars } from '../components/FetchSoundWaveBars'
import {
  applyDirectionsToBookingState,
  applyLaborDetailsFromSheet,
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
  refinementDataReady,
  requiresDropoff,
  scanBookingPhotos,
  scannerSummaryLine,
  selectHomeJobType,
  type BookingJobType,
  type BookingState,
} from '../lib/assistant'
import { useFetchTheme } from '../theme/FetchThemeContext'
import { chargeDefaultSavedCard } from '../lib/paymentCheckout'
import {
  createPerfRunId,
  fetchPerfExtra,
  fetchPerfIsEnabled,
  fetchPerfMark,
} from '../lib/fetchPerf'
import { suburbCommentaryLine } from '../lib/suburbCommentary'
import { useFetchVoice } from '../voice/FetchVoiceContext'
import {
  IDLE_TO_SLEEPY_MS,
  INTENT_ORB_PROMPT,
  junkLiveJobCopy,
  LANDING_PRIMARY_SERVICES,
  SLEEPY_COPY,
  WAKE_COPY,
} from './homeConstants'
import { buildHomeWelcomeLine } from '../lib/fetchWelcomeLine'
import { firstNameFromDisplay, loadSession } from '../lib/fetchUserSession'

export type HomeViewProps = {
  /** Sheet account control — open auth or account in parent shell. */
  onAccountNavigate?: () => void
}

export default function HomeView({ onAccountNavigate }: HomeViewProps = {}) {
  const {
    speakLine,
    isSpeechPlaying,
    playUiEvent,
    voiceHoldCaption,
    voiceHoldPulseNonce,
  } = useFetchVoice()
  const [bookingState, setBookingState] = useState<BookingState>(createInitialBookingState)
  const [mapsJsReady, setMapsJsReady] = useState(false)
  const [orbAwakened, setOrbAwakened] = useState(false)
  const [cardVisible, setCardVisible] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<HomeBookingSheetSnap>('half')
  const [homeOrbBottomPx, setHomeOrbBottomPx] = useState<number | null>(null)
  const [sheetGestureActive, setSheetGestureActive] = useState(false)
  const [confirmNonce, setConfirmNonce] = useState(0)
  const [mapAttention, setMapAttention] = useState<
    'none' | 'pickup' | 'route' | 'driver' | 'navigation'
  >('none')
  const [chatNavRoute, setChatNavRoute] = useState<FetchAiChatNavigation | null>(null)
  const [idleLong, setIdleLong] = useState(false)
  const [wasSleepy, setWasSleepy] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{
    field: 'pickup' | 'dropoff'
    address: string
    coords: { lat: number; lng: number }
    suburb?: string
    place: ResolvedPlace
  } | null>(null)
  const [scanFiles, setScanFiles] = useState<File[]>([])
  const [scanThumbs, setScanThumbs] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  type OrbChatTurn = { id: string; role: 'user' | 'assistant'; text: string }
  const [orbChatTurns, setOrbChatTurns] = useState<OrbChatTurn[]>([])
  /** Fetch “system” line above orb (intent prompt / booking questions); auto-hides after 5s. */
  const [orbEphemeralBubble, setOrbEphemeralBubble] = useState<string | null>(null)
  /** Set on service tap; prepended to pickup orb bubble until that step ends. */
  const [servicePersonalityLine, setServicePersonalityLine] = useState<string | null>(null)
  const pendingServicePersonalityRef = useRef<string | null>(null)
  const [laborHours, setLaborHours] = useState(4)
  const [laborTask, setLaborTask] = useState('')
  const [laborNotes, setLaborNotes] = useState('')
  const [bookNowBusy, setBookNowBusy] = useState(false)
  const [bookNowError, setBookNowError] = useState<string | null>(null)
  const driverFlowTimersRef = useRef<number[]>([])
  const lastInteractRef = useRef(Date.now())
  const lastSpokenStepRef = useRef<string>('')
  const lastDirectionsKeyRef = useRef<string>('')
  const prevFlowStepRef = useRef(bookingState.flowStep)
  const sleepySpokenRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const { resolved: themeResolved } = useFetchTheme()
  const [userMapLocation, setUserMapLocation] = useState<{
    lat: number
    lng: number
  } | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    let cancelled = false
    const read = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return
          setUserMapLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
        },
        () => {
          if (!cancelled) setUserMapLocation(null)
        },
        { enableHighAccuracy: false, maximumAge: 120_000, timeout: 12_000 },
      )
    }
    read()
    try {
      const p = navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      void p?.then((status) => {
        status.addEventListener('change', () => {
          if (status.state === 'granted') read()
          else if (status.state === 'denied') setUserMapLocation(null)
        })
      })
    } catch {
      /* Permissions API unsupported */
    }
    return () => {
      cancelled = true
    }
  }, [])

  const bumpInteraction = useCallback(() => {
    lastInteractRef.current = Date.now()
    setIdleLong(false)
  }, [])

  const pushOrbChatTurn = useCallback((role: 'user' | 'assistant', text: string) => {
    const t = text.trim()
    if (!t) return
    setOrbChatTurns((prev) => {
      const next = [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role,
          text: t,
        },
      ]
      return next.length > 56 ? next.slice(-56) : next
    })
  }, [])

  const clearDriverFlowTimers = useCallback(() => {
    for (const id of driverFlowTimersRef.current) {
      window.clearTimeout(id)
    }
    driverFlowTimersRef.current = []
  }, [])

  const startJunkDriverFlow = useCallback((paymentPatch?: Partial<BookingState>) => {
    clearDriverFlowTimers()
    setBookingState((prev) => beginJunkDriverDemo({ ...prev, ...paymentPatch }))
    playUiEvent('processing_start')
    speakLine('Searching the network for a driver near you.', {
      debounceKey: 'junk_driver_search',
      debounceMs: 0, withVoiceHold: true,
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
        { debounceKey: 'junk_driver_matched', debounceMs: 0, withVoiceHold: true },
      )
    }, 2800)

    push(() => {
      setBookingState((s) => patchBookingLifecycle(s, { bookingStatus: 'en_route', mode: 'live' }))
      speakLine('They are en route to your pickup.', {
        debounceKey: 'junk_driver_enroute',
        debounceMs: 0, withVoiceHold: true,
      })
    }, 5600)

    push(() => {
      setBookingState((s) => patchBookingLifecycle(s, { bookingStatus: 'arrived' }))
      speakLine('They have arrived.', {
        debounceKey: 'junk_driver_arrived',
        debounceMs: 0,
        withVoiceHold: true,
      })
    }, 9600)

    push(() => {
      setBookingState((s) => patchBookingLifecycle(s, { bookingStatus: 'in_progress' }))
      speakLine('Loading your items now.', {
        debounceKey: 'junk_driver_progress',
        debounceMs: 0,
        withVoiceHold: true,
      })
    }, 13600)

    push(() => {
      setBookingState((s) => patchBookingLifecycle(s, { bookingStatus: 'completed' }))
      playUiEvent('success')
      speakLine('All done — job completed. Thanks for choosing Fetch.', {
        debounceKey: 'junk_driver_done',
        debounceMs: 0, withVoiceHold: true,
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
        debounceMs: 0, withVoiceHold: true,
      })
    })
  }, [idleLong, wasSleepy, speakLine, playUiEvent])

  useEffect(() => {
    let cancelled = false
    playUiEvent('activated')
    requestAnimationFrame(() => {
      if (cancelled) return
      setCardVisible(true)
      playUiEvent('card_reveal')
    })
    queueMicrotask(() => {
      void (async () => {
        const u = loadSession()
        const firstName = u ? firstNameFromDisplay(u.displayName) : null
        const line = await buildHomeWelcomeLine({ firstName })
        if (cancelled) return
        void speakLine(line, {
          debounceKey: 'fetch_home_intro',
          debounceMs: 0,
          withVoiceHold: true,
        })
      })()
    })
    return () => {
      cancelled = true
    }
  }, [speakLine, playUiEvent])

  useEffect(() => {
    if (mapAttention === 'none' || mapAttention === 'navigation') return
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
        debounceMs: 0, withVoiceHold: true,
      })
    })
  }, [idleLong, speakLine])

  const flowStep = bookingState.flowStep
  const jobType = bookingState.jobType

  useEffect(() => {
    if (fetchPerfIsEnabled() && prevFlowStepRef.current !== flowStep) {
      fetchPerfMark(undefined, '2_step_visible', {
        from: prevFlowStepRef.current,
        to: flowStep,
        jobType,
      })
      fetchPerfExtra('booking_flow_step_changed', {
        from: prevFlowStepRef.current,
        to: flowStep,
        jobType,
      })
    }
    prevFlowStepRef.current = flowStep
  }, [flowStep, jobType])

  useEffect(() => {
    if (!jobType || flowStep !== 'pickup') return
    const key = `pickup:${jobType}`
    if (lastSpokenStepRef.current === key) return
    lastSpokenStepRef.current = key
    const personality = pendingServicePersonalityRef.current
    pendingServicePersonalityRef.current = null
    const q = bookingState.currentQuestion ?? 'Where are we picking up from?'
    const line =
      personality?.trim() ? `${personality.trim()} ${q}` : q
    speakLine(line, {
      debounceKey: 'fetch_home_pickup_prompt',
      debounceMs: 0,
      withVoiceHold: true,
    })
  }, [jobType, flowStep, bookingState.currentQuestion, speakLine])

  useEffect(() => {
    if (!jobType || flowStep !== 'dropoff') return
    const key = `dropoff:${jobType}`
    if (lastSpokenStepRef.current === key) return
    lastSpokenStepRef.current = key
    const q = bookingState.currentQuestion ?? "Where's it going?"
    speakLine(q, {
      debounceKey: 'fetch_home_dropoff_prompt',
      debounceMs: 0,
      withVoiceHold: true,
    })
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
    const directionsT0 = performance.now()
    if (fetchPerfIsEnabled()) {
      fetchPerfExtra('maps_directions_request', { key })
    }
    const svc = new google.maps.DirectionsService()
    svc.route(
      {
        origin: p,
        destination: d,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (cancelled) return
        if (fetchPerfIsEnabled()) {
          fetchPerfExtra('maps_directions_response', {
            key,
            status,
            ms: Math.round(performance.now() - directionsT0),
          })
        }
        if (status !== 'OK' || !result?.routes[0]) return
        lastDirectionsKeyRef.current = key
        const route = result.routes[0]
        const leg = route.legs?.[0]
        const overview = route.overview_path ?? []
        const path = overview.map((ll) => ({ lat: ll.lat(), lng: ll.lng() }))
        const distanceMeters = leg?.distance?.value ?? 0
        const durationSeconds = leg?.duration?.value ?? 0
        setBookingState((prev) => {
          let next = applyDirectionsToBookingState(prev, path, distanceMeters, durationSeconds)
          if (isRouteTerminalPhase(next) && next.flowStep !== 'route') {
            if (fetchPerfIsEnabled()) {
              fetchPerfMark(undefined, '1_user_action', { action: 'route_next_to_scanner' })
            }
            next = handleUserInput({ text: 'next', source: 'quick_action' }, next).bookingState
            const scanKey = `${next.pickupCoords?.lat}:${next.pickupCoords?.lng}|${next.dropoffCoords?.lat ?? ''}|${next.distanceMeters ?? ''}`
            routeAutoScanKeyRef.current = scanKey
            queueMicrotask(() => {
              speakLine("Snap a photo and I'll figure out what we're working with.", {
                debounceKey: 'scanner_intro',
                debounceMs: 0,
                withVoiceHold: true,
              })
            })
          }
          return next
        })
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
    speakLine,
  ])

  const commitJobTypeSelection = useCallback((jt: BookingJobType) => {
    if (fetchPerfIsEnabled()) {
      fetchPerfMark(undefined, '1_user_action', { action: 'select_job_type', jobType: jt })
    }
    setChatNavRoute(null)
    setOrbChatTurns([])
    setBookingState((prev) => selectHomeJobType(prev, jt).bookingState)
    setConfirmNonce((n) => n + 1)
    setMapAttention('pickup')
    bumpInteraction()
  }, [bumpInteraction])

  useEffect(() => {
    setLaborHours(4)
    setLaborTask('')
    setLaborNotes('')
  }, [jobType])

  const handleLaborContinue = useCallback(() => {
    const task = laborTask.trim()
    if (!task) return
    bumpInteraction()
    setBookingState((prev) =>
      applyLaborDetailsFromSheet(prev, {
        hours: laborHours,
        taskType: task,
        notes: laborNotes,
      }).bookingState,
    )
  }, [laborHours, laborTask, laborNotes, bumpInteraction])

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
      setPendingConfirm({
        field: 'pickup',
        address: place.formattedAddress,
        coords: place.coords,
        suburb: place.suburb,
        place,
      })
      const line = suburbCommentaryLine(place.suburb)
      if (line) {
        speakLine(line, {
          debounceKey: 'suburb_pickup',
          debounceMs: 0,
          withVoiceHold: true,
        })
      } else {
        speakLine('Is this the right spot?', {
          debounceKey: 'confirm_pickup',
          debounceMs: 0,
          withVoiceHold: true,
        })
      }
    },
    [speakLine, playUiEvent],
  )

  const onDropoffResolved = useCallback(
    (place: ResolvedPlace) => {
      playUiEvent('pin_drop')
      setPendingConfirm({
        field: 'dropoff',
        address: place.formattedAddress,
        coords: place.coords,
        suburb: place.suburb,
        place,
      })
      const line = suburbCommentaryLine(place.suburb)
      if (line) {
        speakLine(line, {
          debounceKey: 'suburb_dropoff',
          debounceMs: 0,
          withVoiceHold: true,
        })
      } else {
        speakLine('Drop-off here?', {
          debounceKey: 'confirm_dropoff',
          debounceMs: 0,
          withVoiceHold: true,
        })
      }
    },
    [speakLine, playUiEvent],
  )

  const confirmPendingAddress = useCallback(() => {
    if (!pendingConfirm) return
    if (fetchPerfIsEnabled()) {
      fetchPerfMark(undefined, '1_user_action', {
        action: 'confirm_pin_address',
        field: pendingConfirm.field,
      })
    }
    const { field, place } = pendingConfirm
    applyAddressSelection(field, {
      field,
      formattedAddress: place.formattedAddress,
      placeId: place.placeId,
      coords: place.coords,
      name: place.name,
    })
    if (field === 'pickup') {
      try {
        sessionStorage.setItem(
          'fetch.recentPickup',
          JSON.stringify({
            address: place.formattedAddress,
            lat: place.coords.lat,
            lng: place.coords.lng,
            placeId: place.placeId,
            name: place.name,
          }),
        )
      } catch {
        /* ignore quota / private mode */
      }
    }
    setPendingConfirm(null)
    playUiEvent('success')
    speakLine(field === 'pickup' ? 'Locked in.' : 'Drop-off confirmed.', {
      debounceKey: 'address_confirmed',
      debounceMs: 0, withVoiceHold: true,
    })
  }, [pendingConfirm, applyAddressSelection, playUiEvent, speakLine])

  const cancelPendingAddress = useCallback(() => {
    setPendingConfirm(null)
  }, [])

  /** Prevents double auto-advance to scanner; reset when user rewinds addresses or starts over. */
  const routeAutoScanKeyRef = useRef('')

  const goBackToIntent = useCallback(() => {
    clearDriverFlowTimers()
    lastSpokenStepRef.current = ''
    lastDirectionsKeyRef.current = ''
    routeAutoScanKeyRef.current = ''
    pendingServicePersonalityRef.current = null
    setServicePersonalityLine(null)
    setChatNavRoute(null)
    setOrbChatTurns([])
    setBookingState(createInitialBookingState())
    setMapAttention('none')
    bumpInteraction()
  }, [bumpInteraction, clearDriverFlowTimers])

  const applyChatNavigation = useCallback(
    (nav: FetchAiChatNavigation | null) => {
      if (!nav?.active) return
      setChatNavRoute(nav)
      setMapAttention('navigation')
      setSheetSnap('half')
      bumpInteraction()
    },
    [bumpInteraction],
  )

  const exitChatNavigation = useCallback(() => {
    setChatNavRoute(null)
    setMapAttention('none')
    bumpInteraction()
  }, [bumpInteraction])

  const goBackToPickup = useCallback(() => {
    lastDirectionsKeyRef.current = ''
    routeAutoScanKeyRef.current = ''
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

  const routePathFromState =
    bookingState.route?.path?.map((c) => ({ lat: c.lat, lng: c.lng })) ?? null

  const mapRoutePath = useMemo(() => {
    if (chatNavRoute?.path && chatNavRoute.path.length >= 2) return chatNavRoute.path
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
  }, [
    chatNavRoute?.path,
    routePathFromState,
    jobType,
    bookingState.pickupCoords,
    bookingState.mode,
  ])

  const mapStage = useMemo(() => {
    if (!jobType) return 'idle' as const
    const m = bookingState.mode
    if (m === 'searching') return 'searching' as const
    if (m === 'matched') return 'matched' as const
    if (m === 'live') return 'live' as const
    return 'building' as const
  }, [jobType, bookingState.mode])

  const orbMapAttention = chatNavRoute ? 'navigation' : mapAttention

  const orbExpression: FetchOrbExpression = useMemo(() => {
    if (isSpeechPlaying) return 'speaking'
    if (idleLong) return 'sleepy'
    if (flowStep === 'route' && requiresDropoff(jobType)) return 'focused'
    if (jobType && (flowStep === 'pickup' || flowStep === 'dropoff')) return 'curious'
    if (orbMapAttention === 'driver') return 'excited'
    if (orbMapAttention === 'route' || orbMapAttention === 'navigation') return 'focused'
    if (orbMapAttention === 'pickup' && orbAwakened) return 'curious'
    if (jobType) return 'proud'
    return 'awake'
  }, [isSpeechPlaying, idleLong, jobType, flowStep, orbMapAttention, orbAwakened])

  const orbState = (() => {
    if (isSpeechPlaying) return 'speaking' as const
    if (orbAwakened) return 'aware' as const
    return 'idle' as const
  })()

  const GLOW_WHITE = { r: 232, g: 236, b: 242 }
  /** Day theme idle orb — bright white / glass */
  const GLOW_LIGHT_IDLE = { r: 252, g: 254, b: 255 }
  /** FETCH VISION intent accent when orb is awake */
  const GLOW_VISION = { r: 124, g: 92, b: 255 }
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

    if (orbState === 'idle' && !isSpeechPlaying) {
      return themeResolved === 'light' ? GLOW_LIGHT_IDLE : GLOW_WHITE
    }

    return GLOW_VISION
  }, [
    bookingState.bookingStatus,
    bookingState.mode,
    bookingState.flowStep,
    jobType,
    orbState,
    isSpeechPlaying,
    themeResolved,
  ])

  const orbGlowStyle = useMemo(
    () =>
      ({
        ['--orb-glow' as string]: `${orbGlowColor.r}, ${orbGlowColor.g}, ${orbGlowColor.b}`,
      }) as CSSProperties,
    [orbGlowColor],
  )

  const inputClass =
    'fetch-stage-text-input fetch-home-address-input mt-2 w-full rounded-full border px-4 py-3 text-[13px] font-medium text-fetch-charcoal/95 ring-0 placeholder:text-fetch-muted/38'

  const showConfirm = Boolean(pendingConfirm)
  const showIntent = !showConfirm && (!jobType || flowStep === 'intent')
  const showPickup = !showConfirm && Boolean(jobType && flowStep === 'pickup')
  const showDropoff = !showConfirm && Boolean(jobType && flowStep === 'dropoff')
  const postAddress =
    !showConfirm && Boolean(jobType) && !showIntent && !showPickup && !showDropoff
  const laborJob = jobType === 'helper' || jobType === 'cleaning'
  const showLaborDetails =
    postAddress &&
    laborJob &&
    bookingState.mode === 'building' &&
    !refinementDataReady(bookingState) &&
    bookingState.pricing == null
  const showRouteReady = postAddress && isRouteTerminalPhase(bookingState)
  const showScanner = postAddress && isJobDetailsPhase(bookingState)
  const showBuildingRoute =
    postAddress &&
    flowStep === 'route' &&
    jobType != null &&
    requiresDropoff(jobType)
  const showPostScan =
    postAddress &&
    !showRouteReady &&
    !showScanner &&
    !showBuildingRoute &&
    !showLaborDetails

  useEffect(() => {
    if (!showPickup) setServicePersonalityLine(null)
  }, [showPickup])

  /** Jobs without dropoff (e.g. junk): advance to scanner as soon as address+route checkpoint is met. */
  useLayoutEffect(() => {
    if (!bookingState.jobType) return
    if (bookingState.jobType === 'helper' || bookingState.jobType === 'cleaning') return
    if (!isRouteTerminalPhase(bookingState)) return
    if (bookingState.flowStep === 'route') return
    if (bookingState.jobDetailsStarted) return
    const key = `${bookingState.pickupCoords?.lat}:${bookingState.pickupCoords?.lng}|${bookingState.dropoffCoords?.lat ?? ''}|${bookingState.distanceMeters ?? ''}`
    if (routeAutoScanKeyRef.current === key) return
    routeAutoScanKeyRef.current = key
    if (fetchPerfIsEnabled()) {
      fetchPerfMark(undefined, '1_user_action', { action: 'route_next_to_scanner' })
    }
    setBookingState((prev) =>
      handleUserInput({ text: 'next', source: 'quick_action' }, prev).bookingState,
    )
    speakLine("Snap a photo and I'll figure out what we're working with.", {
      debounceKey: 'scanner_intro',
      debounceMs: 0,
      withVoiceHold: true,
    })
  }, [bookingState, speakLine])

  const peekLabel = chatNavRoute
    ? 'Live navigation'
    : showPickup || showDropoff
      ? 'Where to?'
      : showIntent
        ? 'Pick a service'
        : showLaborDetails
          ? 'Job details'
          : 'Fetch ready'

  const bookingFlowBubble = useMemo((): string | null => {
    if (showConfirm && pendingConfirm) {
      return pendingConfirm.field === 'pickup'
        ? `Is this the pickup?\n${pendingConfirm.address}`
        : `Is this the drop-off?\n${pendingConfirm.address}`
    }
    if (showPickup) {
      const title =
        jobType === 'helper'
          ? 'Where you need help'
          : jobType === 'cleaning'
            ? 'Where to clean'
            : 'Pickup location'
      const body = !mapsApiKey
        ? 'Add a Google Maps API key to search addresses.'
        : bookingState.currentQuestion ?? 'Search for a verified address.'
      const core = `${title}\n${body}`
      return servicePersonalityLine?.trim()
        ? `${servicePersonalityLine.trim()}\n\n${core}`
        : core
    }
    if (showDropoff) {
      if (!mapsApiKey) {
        return `Drop-off location\nAdd a Google Maps API key to search addresses.`
      }
      return `Drop-off location\n${bookingState.currentQuestion ?? 'Where should we deliver?'}`
    }
    if (showLaborDetails) {
      const title = jobType === 'helper' ? 'Helper details' : 'Cleaning details'
      const sub =
        bookingState.currentQuestion ??
        (jobType === 'helper'
          ? 'How long and what kind of help?'
          : 'How long and what type of clean?')
      const at = bookingState.pickupAddressText
        ? `\nAt: ${bookingState.pickupAddressText}`
        : ''
      return `${title}\n${sub}${at}\nChoose hours, then describe the job below.`
    }
    if (showBuildingRoute) {
      const parts = [
        'Building route',
        "We're mapping directions between your pickup and drop-off.",
      ]
      if (bookingState.pickupAddressText) {
        parts.push(`Pickup: ${bookingState.pickupAddressText}`)
      }
      if (bookingState.dropoffAddressText) {
        parts.push(`Drop-off: ${bookingState.dropoffAddressText}`)
      }
      parts.push('Hang tight — almost there.')
      return parts.join('\n')
    }
    if (showRouteReady) {
      const h =
        flowStep === 'route' && jobType != null && requiresDropoff(jobType)
          ? 'Building route'
          : 'Addresses locked in'
      const parts = [h]
      if (bookingState.pickupAddressText) {
        parts.push(`Pickup: ${bookingState.pickupAddressText}`)
      }
      if (bookingState.dropoffAddressText) {
        parts.push(`Drop-off: ${bookingState.dropoffAddressText}`)
      }
      if (bookingState.distanceMeters != null && bookingState.durationSeconds != null) {
        parts.push(
          `Distance: ${(bookingState.distanceMeters / 1000).toFixed(1)} km · ~${Math.round(bookingState.durationSeconds / 60)} min`,
        )
      }
      if (flowStep !== 'route') {
        parts.push("Continue to photo scan when you're ready.")
      } else {
        parts.push('Mapping your route…')
      }
      return parts.join('\n')
    }
    if (showScanner) {
      const title =
        jobType === 'junkRemoval' ? 'Show me the junk' : "Show me what we're moving"
      const base = `${title}\nTake a photo and I'll identify the items.`
      if (scanning) return `${base}\nAnalysing your photos…`
      return base
    }
    if (
      showPostScan &&
      jobType === 'junkRemoval' &&
      bookingState.bookingStatus &&
      isActiveJunkDriverFlow(bookingState.bookingStatus)
    ) {
      const jc = junkLiveJobCopy(bookingState.bookingStatus, bookingState.driver)
      const parts = [jc.title, jc.line]
      if (
        bookingState.driver &&
        (bookingState.bookingStatus === 'matched' ||
          bookingState.bookingStatus === 'en_route' ||
          bookingState.bookingStatus === 'arrived' ||
          bookingState.bookingStatus === 'in_progress')
      ) {
        const d = bookingState.driver
        const bit = [d.vehicle, d.rating != null ? `${d.rating}★` : ''].filter(Boolean).join(' · ')
        if (bit) parts.push(bit)
      }
      if (bookingState.bookingStatus === 'dispatching') {
        parts.push('Searching…')
      }
      return parts.join('\n')
    }
    if (showPostScan && bookingState.pricing) {
      const p = bookingState.pricing
      return [
        'Your quote',
        `$${p.minPrice} – $${p.maxPrice} AUD`,
        p.explanation,
        `~${Math.round(p.estimatedDuration / 60)} min estimated`,
      ].join('\n')
    }
    if (showPostScan) {
      return 'Items confirmed\nCalculating your quote…'
    }
    return null
  }, [
    showConfirm,
    pendingConfirm,
    showPickup,
    showDropoff,
    showLaborDetails,
    showRouteReady,
    showBuildingRoute,
    showScanner,
    scanning,
    showPostScan,
    jobType,
    flowStep,
    mapsApiKey,
    bookingState.currentQuestion,
    bookingState.pickupAddressText,
    bookingState.dropoffAddressText,
    bookingState.distanceMeters,
    bookingState.durationSeconds,
    bookingState.bookingStatus,
    bookingState.driver,
    bookingState.pricing,
    servicePersonalityLine,
  ])

  const orbFetchPromptLine = useMemo(() => {
    if (showIntent) return INTENT_ORB_PROMPT
    const b = bookingFlowBubble?.trim()
    return b && b.length > 0 ? b : null
  }, [showIntent, bookingFlowBubble])

  useEffect(() => {
    const text = orbFetchPromptLine?.trim()
    if (!text) {
      setOrbEphemeralBubble(null)
      return
    }
    let clearTimer: number | undefined
    const debounceMs = showIntent ? 0 : 380
    const debounceTimer = window.setTimeout(() => {
      setOrbEphemeralBubble(text)
      clearTimer = window.setTimeout(() => setOrbEphemeralBubble(null), 5000)
    }, debounceMs)
    return () => {
      window.clearTimeout(debounceTimer)
      if (clearTimer !== undefined) window.clearTimeout(clearTimer)
    }
  }, [orbFetchPromptLine, showIntent])

  const sheetSurface = useMemo((): HomeBookingSheetSurface => {
    if (chatNavRoute && showIntent) return 'route'
    if (showConfirm) return 'confirm'
    if (showPostScan && bookingState.pricing) return 'quote'
    if (
      showPostScan &&
      jobType === 'junkRemoval' &&
      bookingState.bookingStatus &&
      isActiveJunkDriverFlow(bookingState.bookingStatus)
    ) {
      return 'live'
    }
    if (showLaborDetails) return 'working'
    if (showScanner) return 'details'
    if (showRouteReady) return 'route'
    if (showBuildingRoute) return 'route'
    if (showPickup || showDropoff) return 'addresses'
    if (showIntent) return 'intent'
    if (showPostScan) return 'working'
    return 'idle'
  }, [
    showConfirm,
    showPostScan,
    bookingState.pricing,
    bookingState.bookingStatus,
    jobType,
    showScanner,
    showRouteReady,
    showBuildingRoute,
    showPickup,
    showDropoff,
    showIntent,
    showLaborDetails,
    chatNavRoute,
  ])

  const lastAssistantTurnIndex = useMemo(() => {
    for (let i = orbChatTurns.length - 1; i >= 0; i--) {
      if (orbChatTurns[i]!.role === 'assistant') return i
    }
    return -1
  }, [orbChatTurns])

  const orbChatStackBottom = useMemo(
    () =>
      homeOrbBottomPx != null
        ? `calc(${homeOrbBottomPx}px + 6.5rem + 0.85rem)`
        : 'calc(max(1.1rem, env(safe-area-inset-bottom)) + min(62dvh, 36rem) + 8px + 6.5rem * 0.5 + 0.85rem)',
    [homeOrbBottomPx],
  )

  useEffect(() => {
    if (showConfirm || (showPostScan && bookingState.pricing)) {
      setSheetSnap('full')
    }
  }, [showConfirm, showPostScan, bookingState.pricing])

  const onSheetMicClick = useCallback(() => {
    bumpInteraction()
    setOrbAwakened(true)
    setSheetSnap('half')
  }, [bumpInteraction])

  const onAccountsClick = useCallback(() => {
    bumpInteraction()
    onAccountNavigate?.()
  }, [bumpInteraction, onAccountNavigate])

  const onHomeOrbBottomPxChange = useCallback((px: number) => {
    setHomeOrbBottomPx((prev) =>
      prev != null && Math.abs(prev - px) < 0.75 ? prev : px,
    )
  }, [])

  const serviceHint: 'junk' | 'moving' | 'pickup' | 'heavy' | undefined =
    jobType === 'junkRemoval' ? 'junk'
    : jobType === 'homeMoving' ? 'moving'
    : jobType === 'heavyItem' ? 'heavy'
    : jobType === 'deliveryPickup' ? 'pickup'
    : undefined

  const handleRouteNext = useCallback(() => {
    if (fetchPerfIsEnabled()) {
      fetchPerfMark(undefined, '1_user_action', { action: 'route_next_to_scanner' })
    }
    setBookingState((prev) =>
      handleUserInput({ text: 'next', source: 'quick_action' }, prev).bookingState,
    )
    bumpInteraction()
    speakLine("Snap a photo and I'll figure out what we're working with.", {
      debounceKey: 'scanner_intro',
      debounceMs: 0, withVoiceHold: true,
    })
  }, [bumpInteraction, speakLine])

  const handlePhotoAdd = useCallback((e: ChangeEvent<HTMLInputElement>) => {
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
    const perfRunId = fetchPerfIsEnabled() ? createPerfRunId('booking_scan') : undefined
    if (perfRunId) {
      fetchPerfMark(perfRunId, '1_user_action', { action: 'photo_scan_submit' })
      fetchPerfMark(perfRunId, '2_step_visible', { surface: 'scanning' })
    }
    setScanning(true)
    speakLine('Let me take a look...', {
      debounceKey: 'scanning',
      debounceMs: 0,
      withVoiceHold: true,
    })
    try {
      const result = await scanBookingPhotos(scanFiles, serviceHint, { perfRunId })
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
      speakLine(voiceLine, {
        debounceKey: 'scan_result',
        debounceMs: 0,
        withVoiceHold: true,
        perfRunId,
      })
    } catch {
      speakLine("Couldn't process the photos. Try again.", {
        debounceKey: 'scan_error',
        debounceMs: 0,
        withVoiceHold: true,
        perfRunId,
      })
    } finally {
      setScanning(false)
    }
  }, [scanFiles, scanning, serviceHint, speakLine, playUiEvent])

  const handleConfirmItems = useCallback(() => {
    if (fetchPerfIsEnabled()) {
      fetchPerfMark(undefined, '1_user_action', { action: 'confirm_items_to_quote' })
    }
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
          speakLine(line, {
            debounceKey: 'quote_voice',
            debounceMs: 0,
            withVoiceHold: true,
          })
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
      debounceMs: 0, withVoiceHold: true,
    })
  }, [showRouteReady, jobType, speakLine])

  return (
    <div className="fetch-home-vision relative min-h-dvh w-full" style={orbGlowStyle}>
      <FetchSpeechBottomGlow />

      <FetchHomeStepOne
        onMapsJavaScriptReady={setMapsJsReady}
        pickup={
          chatNavRoute
            ? 'Your location'
            : bookingState.pickupAddressText ||
              (pendingConfirm?.field === 'pickup' ? pendingConfirm.address : null)
        }
        dropoff={
          chatNavRoute
            ? chatNavRoute.destinationLabel
            : bookingState.dropoffAddressText ||
              (pendingConfirm?.field === 'dropoff' ? pendingConfirm.address : null)
        }
        pickupCoords={
          chatNavRoute
            ? { lat: chatNavRoute.originLat, lng: chatNavRoute.originLng }
            : bookingState.pickupCoords ?? (pendingConfirm?.field === 'pickup' ? pendingConfirm.coords : null)
        }
        dropoffCoords={
          chatNavRoute
            ? { lat: chatNavRoute.destLat, lng: chatNavRoute.destLng }
            : bookingState.dropoffCoords ?? (pendingConfirm?.field === 'dropoff' ? pendingConfirm.coords : null)
        }
        routePath={mapRoutePath}
        mapStage={mapStage}
        mapAccentRgb={orbGlowColor}
        userLocationCoords={userMapLocation}
      />

      <div
        className={[
          'fetch-orb-ground-glow-layer fetch-orb-ground-glow-layer--home pointer-events-none fixed inset-x-0 bottom-0 z-[36] h-[18vh] min-h-[5.5rem]',
          isSpeechPlaying ? 'fetch-orb-ground-glow-layer--speech' : '',
        ].join(' ')}
        aria-hidden
      >
        <div className="fetch-orb-ground-glow-base" />
        <div className="fetch-orb-ground-glow-fill" />
        <div className="fetch-orb-ground-glow-voice-sheen" />
      </div>

      <FetchHomeBookingSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        peekLabel={peekLabel}
        cardVisible={cardVisible}
        orbAwakened={orbAwakened}
        isSpeechPlaying={isSpeechPlaying}
        voiceHoldCaption={voiceHoldCaption}
        onMicClick={onSheetMicClick}
        onHomeOrbBottomPxChange={onHomeOrbBottomPxChange}
        onSheetGestureActiveChange={setSheetGestureActive}
        onAccountsClick={onAccountsClick}
        surface={sheetSurface}
        contentFitsHeight
        peekAssistantMode={chatNavRoute ? 'nav' : 'mic'}
      >
          {showConfirm && pendingConfirm ? (
            <>
              <div className="overflow-hidden rounded-xl">
                <img
                  src={`https://maps.googleapis.com/maps/api/streetview?size=600x260&location=${pendingConfirm.coords.lat},${pendingConfirm.coords.lng}&fov=90&pitch=5&key=${mapsApiKey}`}
                  alt={`Street view of ${pendingConfirm.address}`}
                  className="h-[120px] w-full object-cover"
                  loading="eager"
                  onLoad={() => {
                    if (fetchPerfIsEnabled()) {
                      fetchPerfExtra('maps_streetview_static_image_loaded', {
                        field: pendingConfirm.field,
                      })
                    }
                  }}
                />
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={cancelPendingAddress}
                  className="fetch-home-secondary-btn flex-1 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.97]"
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

          {showIntent && chatNavRoute ? (
            <div className="fetch-home-landing fetch-home-landing--nav-minimal flex flex-col gap-2">
              <div className="flex items-start gap-2.5 rounded-2xl border border-white/12 bg-black/28 px-3 py-2.5 shadow-sm backdrop-blur-md">
                <span
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/22 text-emerald-100"
                  aria-hidden
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3.5 20 21 12 17 4 21 12 3.5z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/90">
                    Navigation
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-[12px] font-medium leading-snug text-white/92">
                    {chatNavRoute.destinationLabel}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-white/55">
                    ETA about {Math.max(1, Math.round(chatNavRoute.etaSeconds / 60))} min
                    {chatNavRoute.trafficDelaySeconds != null &&
                    chatNavRoute.trafficDelaySeconds >= 60
                      ? ` · traffic +${Math.round(chatNavRoute.trafficDelaySeconds / 60)} min`
                      : chatNavRoute.trafficDelaySeconds != null && chatNavRoute.trafficDelaySeconds > 0
                        ? ' · light traffic'
                        : ''}
                    {' · '}
                    {chatNavRoute.distanceMeters >= 1000
                      ? `${(chatNavRoute.distanceMeters / 1000).toFixed(1)} km`
                      : `${chatNavRoute.distanceMeters} m`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exitChatNavigation}
                  className="shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-white/80 ring-1 ring-white/15 transition-colors hover:bg-white/10 active:scale-[0.97]"
                >
                  Exit
                </button>
              </div>
              <HomeIntentChatComposer
                appendOrbChatTurn={pushOrbChatTurn}
                onChatNavigation={applyChatNavigation}
              />
            </div>
          ) : showIntent ? (
            <div className="fetch-home-landing flex flex-col">
              <section className="fetch-home-landing-section fetch-home-landing-section--intent shrink-0">
                <div
                  className="fetch-home-service-rail"
                  role="group"
                  aria-label="Service types"
                >
                  {LANDING_PRIMARY_SERVICES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      data-tone={opt.tone}
                      aria-label={opt.label}
                      onClick={() => {
                        pendingServicePersonalityRef.current = opt.fetchPersonalityExample
                        setServicePersonalityLine(opt.fetchPersonalityExample)
                        commitJobTypeSelection(opt.jobType)
                      }}
                      className="fetch-home-service-segment"
                    >
                      {opt.tone === 'green' ? (
                        <svg className="fetch-home-service-segment-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                          <path d="M15 18h2" />
                          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
                          <circle cx="6.5" cy="18.5" r="2.5" />
                          <circle cx="16.5" cy="18.5" r="2.5" />
                        </svg>
                      ) : opt.tone === 'orange' ? (
                        <svg className="fetch-home-service-segment-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <path d="M3.27 6.96 12 12.01l8.73-5.05" />
                          <path d="M12 22.08V12" />
                        </svg>
                      ) : opt.tone === 'blue' ? (
                        <svg className="fetch-home-service-segment-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M16.5 9.4 7.55 4.24" />
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
                          <path d="m3.27 6.96 8.73 5.05" />
                          <path d="M12 12 20.73 7.5" />
                          <path d="M12 22.08V12" />
                          <path d="M17 18h5" />
                          <path d="M20 15v6" />
                        </svg>
                      ) : opt.tone === 'purple' ? (
                        <svg className="fetch-home-service-segment-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                          <path d="m4 13 4-4" />
                        </svg>
                      ) : (
                        <svg className="fetch-home-service-segment-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M12 3c-2.5 2-4 4.2-4 7a4 4 0 0 0 8 0c0-2.8-1.5-5-4-7Z" />
                          <path d="M9 14v3a3 3 0 0 0 6 0v-3" />
                          <path d="m5 5 2 2M19 5l-2 2M12 2v2" />
                        </svg>
                      )}
                      <span className="fetch-home-service-segment-label max-w-[4.75rem] text-[10px] font-semibold leading-[1.15] tracking-[-0.02em]">
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
                <HomeIntentChatComposer
                  appendOrbChatTurn={pushOrbChatTurn}
                  onChatNavigation={applyChatNavigation}
                />
              </section>
            </div>
          ) : null}

          {showPickup ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  {jobType === 'helper'
                    ? 'Where you need help'
                    : jobType === 'cleaning'
                      ? 'Where to clean'
                      : 'Pickup location'}
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
                  placeholder={
                    jobType === 'helper'
                      ? 'Search address for this job'
                      : jobType === 'cleaning'
                        ? 'Search address to clean'
                        : 'Search pickup address'
                  }
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

          {showLaborDetails ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  {jobType === 'helper' ? 'Helper details' : 'Cleaning details'}
                </h2>
                <button
                  type="button"
                  onClick={goBackToIntent}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  Start over
                </button>
              </div>
              <p className="mt-1.5 max-w-[18rem] text-[12px] font-medium leading-snug tracking-[-0.01em] text-fetch-muted/90 [text-wrap:pretty]">
                {bookingState.currentQuestion ??
                  (jobType === 'helper'
                    ? 'How long and what kind of help?'
                    : 'How long and what type of clean?')}
              </p>
              {bookingState.pickupAddressText ? (
                <p className="mt-2 text-[11px] leading-snug text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/80">At: </span>
                  {bookingState.pickupAddressText}
                </p>
              ) : null}
              <p className="mt-3 text-[11px] font-semibold text-fetch-charcoal/90">Hours</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {([2, 3, 4, 6, 8] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setLaborHours(h)}
                    className={
                      laborHours === h
                        ? 'rounded-full border border-violet-400/55 bg-violet-500/20 px-3 py-1.5 text-[12px] font-semibold text-fetch-charcoal'
                        : 'rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-fetch-muted'
                    }
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-[11px] font-semibold text-fetch-charcoal/90">
                {jobType === 'helper' ? 'What do you need done?' : 'Type of clean'}
              </label>
              <input
                type="text"
                value={laborTask}
                onChange={(e) => setLaborTask(e.target.value)}
                placeholder={
                  jobType === 'helper' ? 'e.g. Load a truck, assembly' : 'e.g. Deep clean, end of lease'
                }
                className={inputClass}
              />
              <label className="mt-2 block text-[11px] font-semibold text-fetch-charcoal/90">
                Notes (optional)
              </label>
              <input
                type="text"
                value={laborNotes}
                onChange={(e) => setLaborNotes(e.target.value)}
                placeholder="Access info, supplies, pets…"
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleLaborContinue}
                disabled={!laborTask.trim()}
                className="fetch-stage-primary-btn mt-3 w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Get quote
              </button>
            </>
          ) : null}

          {showRouteReady ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  {flowStep === 'route' && requiresDropoff(jobType) ? 'Building route' : 'Addresses locked in'}
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
                  Continue to photo scan
                </button>
              ) : (
                <p className="mt-2 text-[12px] font-medium text-fetch-muted/80">Mapping your route…</p>
              )}
            </>
          ) : null}

          {showBuildingRoute ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  Building route
                </h2>
                <button
                  type="button"
                  onClick={goBackToIntent}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  Start over
                </button>
              </div>
              <p className="mt-1.5 text-[12px] font-medium leading-snug text-fetch-muted/90 [text-wrap:pretty]">
                We&apos;re mapping directions between your pickup and drop-off.
              </p>
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
              <div className="mt-3 flex items-center gap-2">
                <div className="fetch-stage-spinner h-3 w-3 animate-spin rounded-full" />
                <p className="text-[12px] font-medium text-fetch-muted/80">Hang tight — almost there.</p>
              </div>
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
                  className="fetch-home-secondary-btn flex-1 rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50"
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
                        className="fetch-home-pill-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
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
                    .map(([label, value]) => {
                      const displayLabel =
                        label === 'Helpers' && (jobType === 'helper' || jobType === 'cleaning')
                          ? 'Service'
                          : label
                      return (
                        <div key={label} className="flex justify-between text-[11px]">
                          <span className="text-fetch-muted/80">{displayLabel}</span>
                          <span className="font-medium text-fetch-charcoal/80">${value}</span>
                        </div>
                      )
                    })}
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

              {bookNowError ? (
                <p className="mt-2 text-[11px] font-medium leading-snug text-red-300/90">
                  {bookNowError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={bookNowBusy || !bookingState.pricing}
                onClick={() => {
                  if (fetchPerfIsEnabled()) {
                    fetchPerfMark(undefined, '1_user_action', { action: 'book_now_click' })
                  }
                  const pricing = bookingState.pricing
                  if (!pricing) return
                  void (async () => {
                    setBookNowBusy(true)
                    setBookNowError(null)
                    try {
                      const pi = await chargeDefaultSavedCard({
                        amount: pricing.maxPrice,
                        bookingId: bookingState.bookingId,
                      })
                      playUiEvent('success')
                      if (jobType === 'junkRemoval') {
                        startJunkDriverFlow({
                          paymentIntent: pi,
                          selectedPaymentMethodId: pi.paymentMethodId,
                        })
                      } else {
                        setBookingState((prev) => ({
                          ...prev,
                          paymentIntent: pi,
                          selectedPaymentMethodId: pi.paymentMethodId,
                          bookingStatus: 'confirmed',
                        }))
                        speakLine("Booking locked in. We'll match you with a driver shortly.", {
                          debounceKey: 'book_now',
                          debounceMs: 0,
                          withVoiceHold: true,
                        })
                      }
                    } catch (err) {
                      const msg =
                        err instanceof Error ? err.message : 'Payment could not be completed.'
                      setBookNowError(msg)
                      speakLine(
                        'Payment did not go through. Open Account and check your card number, security code, and expiry.',
                        { debounceKey: 'book_now_pay_err', debounceMs: 0, withVoiceHold: true },
                      )
                    } finally {
                      setBookNowBusy(false)
                    }
                  })()
                }}
                className="fetch-stage-primary-btn mt-3 w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bookNowBusy ? 'Processing payment…' : 'Book now'}
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
      </FetchHomeBookingSheet>

      {orbChatTurns.length > 0 ? (
        <div
          className="fetch-home-orb-chat-stack pointer-events-none fixed left-1/2 z-[57] flex w-[min(21rem,calc(100vw-1.75rem))] max-w-[min(21rem,calc(100vw-1.75rem))] -translate-x-1/2 flex-col"
          style={{
            top: 'max(0.5rem, env(safe-area-inset-top))',
            bottom: orbChatStackBottom,
          }}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          <div className="fetch-home-orb-chat-stack__mask flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden pb-1">
            {orbChatTurns.map((turn, index) => (
              <div
                key={turn.id}
                className={[
                  'fetch-home-orb-chat-bubble pointer-events-none max-w-[92%] rounded-[1.05rem] border px-3 py-2.5 shadow-lg backdrop-blur-md',
                  turn.role === 'user'
                    ? 'fetch-home-orb-chat-bubble--user ml-auto'
                    : 'fetch-home-orb-chat-bubble--fetch mr-auto',
                  isSpeechPlaying &&
                  turn.role === 'assistant' &&
                  index === lastAssistantTurnIndex
                    ? 'fetch-home-orb-chat-bubble--speaking'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <p className="min-w-0 whitespace-pre-line text-left text-[12px] font-medium leading-snug [text-wrap:pretty]">
                  {turn.text}
                </p>
                {turn.role === 'assistant' &&
                isSpeechPlaying &&
                index === lastAssistantTurnIndex ? (
                  <div className="mt-2 flex justify-end border-t border-white/10 pt-2">
                    <FetchSoundWaveBars active />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={[
          'fetch-home-orb-sheet-follow pointer-events-none fixed z-[58] flex flex-col items-center will-change-[bottom]',
          sheetGestureActive ? 'fetch-home-orb-sheet-follow--no-transition' : '',
        ].join(' ')}
        style={{
          bottom:
            homeOrbBottomPx != null
              ? `${homeOrbBottomPx}px`
              : 'calc(max(1.1rem, env(safe-area-inset-bottom)) + min(62dvh, 36rem) + 8px - 6.5rem * 0.5)',
        }}
      >
        <div className="relative flex flex-col items-center">
          {orbEphemeralBubble ? (
            <div
              className={[
                'fetch-home-orb-speech-bubble pointer-events-none absolute bottom-[calc(100%+0.65rem)] left-1/2 z-[1] w-[min(20rem,calc(100vw-2.5rem))] max-w-[min(20rem,calc(100vw-2.5rem))] -translate-x-1/2',
                isSpeechPlaying ? 'fetch-home-orb-speech-bubble--speaking' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-3 px-3.5 py-3">
                <p className="min-w-0 flex-1 whitespace-pre-line text-left text-[12px] font-medium leading-snug text-white/92 [text-wrap:pretty]">
                  {orbEphemeralBubble}
                </p>
                <div className="shrink-0 pt-0.5">
                  <FetchSoundWaveBars active={isSpeechPlaying} />
                </div>
              </div>
            </div>
          ) : null}
          {isSpeechPlaying && lastAssistantTurnIndex < 0 && !orbEphemeralBubble ? (
            <div className="fetch-home-orb-floating-waves pointer-events-none mb-1 flex h-8 items-center justify-center">
              <FetchSoundWaveBars active />
            </div>
          ) : null}
          <div
            className="fetch-home-orb-vision-halo pointer-events-none flex h-[6.5rem] w-[6.5rem] items-center justify-center"
            data-orb-idle={orbState === 'idle' && !isSpeechPlaying ? 'true' : undefined}
          >
            <FetchVoiceCommandFab
              homeSheetDock
              onboardingPulse={false}
              expression={orbExpression}
              orbState={orbState}
              pulseNonce={0}
              typingActive={false}
              awakened={orbAwakened}
              confirmationNonce={confirmNonce + voiceHoldPulseNonce}
              mapAttention={orbMapAttention}
              lookAtCard={Boolean(
                (orbChatTurns.length > 0 ||
                  voiceHoldCaption ||
                  orbEphemeralBubble) &&
                  !isSpeechPlaying,
              )}
              glowColor={orbGlowColor}
              orbAppearance={themeResolved === 'light' ? 'day' : 'night'}
              onOpen={() => {
                bumpInteraction()
                setOrbAwakened(true)
              }}
            />
          </div>
        </div>
      </div>

    </div>
  )
}