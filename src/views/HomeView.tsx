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
import { createPortal } from 'react-dom'
import {
  FetchHomeBookingSheet,
  type HomeBookingSheetSnap,
  type HomeBookingSheetSurface,
  type HomeShellTab,
} from '../components/FetchHomeBookingSheet'
import { FetchBrainMemoryOverlay } from '../components/FetchBrainMemoryOverlay'
import { FetchHomeStepOne } from '../components/FetchHomeStepOne'
import type { LiveTrackingMapFit } from '../components/FetchHomeStepOne/BookingMapReflection'
import { BRISBANE_CENTER } from '../components/FetchHomeStepOne/brisbaneMap'
import { PlacesAddressGeocodeField } from '../components/FetchHomeStepOne/PlacesAddressGeocodeField'
import type { ResolvedPlace } from '../components/FetchHomeStepOne/PlacesAddressAutocomplete'
import type { FetchOrbExpression } from '../components/JarvisNeuralOrb'
import { FetchVoiceCommandFab } from '../components/FetchVoiceCommandFab'
import { FetchSpeechBottomGlow } from '../components/FetchHomeFloatingChrome'
import { AppleMapsNavRoutePanel } from '../components/AppleMapsNavRoutePanel'
import { HomeIntentChatComposer } from '../components/HomeIntentChatComposer'
import { MapExploreToolbar } from '../components/MapExploreToolbar'
import { MapsExploreSheet } from '../components/MapsExploreSheet'
import { MysteryAdventurePanel } from '../components/MysteryAdventurePanel'
import { FetchStreetViewOverlay } from '../components/FetchStreetViewOverlay'
import { BookingCompletionSummary } from '../components/booking/BookingCompletionSummary'
import { HomeServiceTypeIllustration } from '../components/icons/HomeServiceTypeIllustrations'
import {
  postFetchAiChat,
  CHAT_ERROR_NETWORK,
  CHAT_ERROR_OPENAI_NOT_CONFIGURED,
  type FetchAiChatMessage,
  type FetchAiChatNavigation,
} from '../lib/fetchAiChat'
import {
  appendBrainUserLineEphemeral,
  brainLinesToApiMessages,
  loadBrainChatLines,
  persistBrainChatExchange,
  removeLastBrainLineIfUser,
  type BrainChatStoredLine,
} from '../lib/fetchBrainChatStorage'
import {
  buildBrainAccountIntelForAi,
  buildBrainAccountSnapshot,
  buildBrainAccountSnapshotAsync,
  type BrainAccountSnapshot,
} from '../lib/fetchBrainAccountSnapshot'
import { buildFetchBrainGraph, type BrainNode } from '../lib/fetchBrainGraph'
import { resolveMemoryFocus } from '../lib/fetchBrainMemoryFocus'
import { appendBrainLearningEvent, buildFetchBrainLearningContext } from '../lib/fetchBrainLearningStore'
import { detectBrainRestaurantIntent } from '../lib/fetchBrainPlacesIntent'
import {
  applyDirectionsToBookingState,
  applyLaborDetailsFromSheet,
  beginDriverSearchDemo,
  shouldPollMarketplaceBooking,
  uiModeFromBookingLifecycle,
  computePriceForState,
  createInitialBookingState,
  DEMO_DRIVER,
  deriveFlowStep,
  handleUserInput,
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
import {
  bookingRecordToStatePatch,
  bookingStateToConfirmedUpsertPayload,
  dispatchBooking,
  fetchBooking,
  isLivePipelinePersistedStatus,
  isWireStatusActiveForDriverGps,
  isWireStatusMatching,
  patchBookingStatus,
  resolveLiveTrackingEndpoints,
  shouldHideJobRouteDuringLiveTracking,
  submitCustomerBookingRating,
  upsertBooking,
  useLiveTripDirections,
} from '../lib/booking'
import { useFetchTheme } from '../theme/FetchThemeContext'
import { chargeDefaultSavedCard } from '../lib/paymentCheckout'
import {
  createPerfRunId,
  fetchPerfExtra,
  fetchPerfIsEnabled,
  fetchPerfMark,
  fetchPerfSetServerTiming,
} from '../lib/fetchPerf'
import { suburbCommentaryLine } from '../lib/suburbCommentary'
import { useFetchVoice } from '../voice/FetchVoiceContext'
import {
  ADVANCED_SERVICE_MENU_OPTIONS,
  IDLE_TO_SLEEPY_MS,
  INTENT_ORB_PROMPT,
  junkLiveJobCopy,
  LANDING_PRIMARY_SERVICES,
  SLEEPY_COPY,
  WAKE_COPY,
} from './homeConstants'
import type { FetchBrainMindState } from '../lib/fetchBrainParticles'
import { buildFetchUserMemoryContext } from '../lib/fetchUserMemoryContext'
import {
  fetchBrainNearbyRestaurants,
  fetchPlaceDetailsForMystery,
  pickRandomMysteryPoi,
  runAdventureNearbyBatch,
  type BrainFieldPlaceCard,
  type ExploreMapPoi,
  type MysteryPlaceBundle,
} from '../lib/mapsExplorePlaces'
import { pushRecentNavDestination } from '../lib/recentNavDestinations'
import { buildHomeWelcomeLine } from '../lib/fetchWelcomeLine'
import { firstNameFromDisplay, loadSession } from '../lib/fetchUserSession'
import { appendHomeActivity, appendHomeAlert } from '../lib/homeActivityFeed'
import { useFetchBootstrapping } from '../boot/FetchBootstrappingContext'
import { HARDWARE_PRODUCTS } from '../lib/hardwareCatalog'
import { loadSavedAddresses, type SavedAddress } from '../lib/savedAddresses'
import {
  distancePointToPathMeters,
  distanceToManeuverBannerLabel,
  drivingTrafficDirectionsRequest,
  extractLegStepsFromLeg,
  firstStepPlainInstruction,
  formatArrivalClockFromEtaSeconds,
  legDurationTrafficAndDistance,
  overviewPathFromRoute,
  pickStepIndexAfterPassingEnds,
  type DirectionsStepLite,
} from '../lib/homeDirections'

/** Tunnel camera + CSS `animation-duration` sync (see `--fetch-tunnel-total-ms`). */
const FETCH_TUNNEL_ZOOM_MS = 2900
const FETCH_TUNNEL_PAUSE_AFTER_MS = 280
const FETCH_TUNNEL_TOTAL_MS = FETCH_TUNNEL_ZOOM_MS + FETCH_TUNNEL_PAUSE_AFTER_MS
const FETCH_CLARITY_TO_BRAIN_MS = 880
const DRIVER_GPS_FRESH_MS = 45_000

export type HomeViewProps = {
  /** Sheet account control — open auth or account in parent shell. */
  onAccountNavigate?: () => void
  /** App shell: signal when Maps JS is ready (or no key) so bootstrap overlay can dismiss. */
  onMapsBootReady?: (ready: boolean) => void
}

export default function HomeView({
  onAccountNavigate,
  onMapsBootReady,
}: HomeViewProps = {}) {
  const {
    speakLine,
    isSpeechPlaying,
    playUiEvent,
    voiceHoldCaption,
    voiceHoldPulseNonce,
    stopAssistantPlayback,
  } = useFetchVoice()
  const homeBootstrapping = useFetchBootstrapping()
  const [bookingState, setBookingState] = useState<BookingState>(createInitialBookingState)
  const [mapsJsReady, setMapsJsReady] = useState(false)
  const [orbAwakened, setOrbAwakened] = useState(false)
  const [cardVisible, setCardVisible] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<HomeBookingSheetSnap>('closed')
  const [homeOrbBottomPx, setHomeOrbBottomPx] = useState<number | null>(null)
  /** Orb tap: tunnel → map zoom → clarity reveal → brain page. */
  const [homeBrainFlow, setHomeBrainFlow] = useState<'tunnel' | 'clarity' | 'brain' | null>(null)
  const [brainSkipReveal, setBrainSkipReveal] = useState(false)
  const homeMapRef = useRef<google.maps.Map | null>(null)
  const brainWelcomeRef = useRef(false)
  const brainConvRef = useRef<BrainChatStoredLine[]>(loadBrainChatLines())
  const brainAbortRef = useRef<AbortController | null>(null)
  const [composerListening, setComposerListening] = useState(false)
  const [brainSttListening, setBrainSttListening] = useState(false)
  const [brainLastReply, setBrainLastReply] = useState<string | null>(null)
  const brainVisualObjectUrlRef = useRef<string | null>(null)
  const [brainVisualUrl, setBrainVisualUrl] = useState<string | null>(null)
  /** Brain-only: waiting on Fetch AI (not home composer / voice hold). */
  const [brainAiPending, setBrainAiPending] = useState(false)
  /** Brain-only TTS session — drives particle mind, isolated from home speech. */
  const [brainSurfaceSpeaking, setBrainSurfaceSpeaking] = useState(false)
  const [brainConvRevision, setBrainConvRevision] = useState(0)
  const [homeActivityTick, setHomeActivityTick] = useState(0)
  const [brainFieldPlaces, setBrainFieldPlaces] = useState<{
    title: string
    introLine?: string
    items: BrainFieldPlaceCard[]
  } | null>(null)
  const [brainPlacesLoading, setBrainPlacesLoading] = useState(false)
  const [brainMemoriesSheetOpen, setBrainMemoriesSheetOpen] = useState(false)
  const brainPlacesAbortRef = useRef<AbortController | null>(null)
  const [brainFocusedMemoryId, setBrainFocusedMemoryId] = useState<string | null>(null)
  const [brainAccountSnapshot, setBrainAccountSnapshot] = useState<BrainAccountSnapshot | null>(null)
  const [sheetGestureActive, setSheetGestureActive] = useState(false)
  const [confirmNonce, setConfirmNonce] = useState(0)
  const [mapAttention, setMapAttention] = useState<
    'none' | 'pickup' | 'route' | 'driver' | 'navigation'
  >('none')
  const [chatNavRoute, setChatNavRoute] = useState<FetchAiChatNavigation | null>(null)
  /** Map-forward mode from the sheet maps control (traffic + optional follow) without chat directions. */
  const [homeMapExploreMode, setHomeMapExploreMode] = useState(false)
  const [homeShellTab, setHomeShellTab] = useState<HomeShellTab>('services')
  const [mapsExploreAddressExpanded, setMapsExploreAddressExpanded] = useState(false)
  const [explorePois, setExplorePois] = useState<ExploreMapPoi[]>([])
  const [userDroppedPin, setUserDroppedPin] = useState<google.maps.LatLngLiteral | null>(
    null,
  )
  type MysteryPanelState =
    | { mode: 'closed' }
    | { mode: 'loading' }
    | { mode: 'error'; message: string }
    | { mode: 'ready'; bundle: MysteryPlaceBundle; fetchStory: string }
  const [mysteryPanel, setMysteryPanel] = useState<MysteryPanelState>({ mode: 'closed' })
  const [streetViewPosition, setStreetViewPosition] =
    useState<google.maps.LatLngLiteral | null>(null)
  const mapPlacesSvcRef = useRef<google.maps.places.PlacesService | null>(null)
  const [mapsPeekHost, setMapsPeekHost] = useState<HTMLDivElement | null>(null)
  const mapsPeekInsetRef = useCallback((el: HTMLDivElement | null) => {
    setMapsPeekHost((prev) => (prev === el ? prev : el))
  }, [])
  const [, setIntentAddressEntryActive] = useState(false)
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
  const [bookNowSyncError, setBookNowSyncError] = useState<string | null>(null)
  const [bookNowSyncRetryBusy, setBookNowSyncRetryBusy] = useState(false)
  const [showDemoTimelineOnly, setShowDemoTimelineOnly] = useState(false)
  const [ratingSubmitBusy, setRatingSubmitBusy] = useState(false)
  const [ratingSubmitError, setRatingSubmitError] = useState<string | null>(null)
  const bookNowSyncRetryRef = useRef<{
    payload: ReturnType<typeof bookingStateToConfirmedUpsertPayload>
    paymentIntent: NonNullable<BookingState['paymentIntent']>
  } | null>(null)
  const lastJobCompletionSpokenBookingIdRef = useRef<string | null>(null)
  const [matchRetryBusy, setMatchRetryBusy] = useState(false)
  const [matchRetryError, setMatchRetryError] = useState<string | null>(null)
  const [matchUiTick, setMatchUiTick] = useState(0)
  const [intentPlaceSuggestionsOpen, setIntentPlaceSuggestionsOpen] = useState(false)
  const [advancedServiceMenuOpen, setAdvancedServiceMenuOpen] = useState(false)
  const [driverMapTick, setDriverMapTick] = useState(0)
  const driverRouteStartedAtRef = useRef(0)
  const driverFlowTimersRef = useRef<number[]>([])
  const bookingStateRef = useRef(bookingState)
  bookingStateRef.current = bookingState

  useEffect(() => {
    const st = bookingState.bookingStatus
    if (st !== 'pending_match' && st !== 'dispatching' && st !== 'match_failed') return
    const id = window.setInterval(() => setMatchUiTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [bookingState.bookingStatus])

  const liveDirectionsEnabled =
    mapsJsReady &&
    !!bookingState.bookingId &&
    (bookingState.mode === 'searching' ||
      bookingState.mode === 'matched' ||
      bookingState.mode === 'live') &&
    (bookingState.pickupCoords != null ||
      (bookingState.bookingStatus === 'in_progress' && bookingState.dropoffCoords != null))

  const liveTripDirections = useLiveTripDirections({
    mapsJsReady,
    enabled: liveDirectionsEnabled,
    bookingId: bookingState.bookingId,
    status: bookingState.bookingStatus,
    pickupCoords: bookingState.pickupCoords,
    dropoffCoords: bookingState.dropoffCoords,
    driverLocation: bookingState.driverLocation,
    gpsFreshMs: DRIVER_GPS_FRESH_MS,
    liveDeviceGps: null,
    liveDeviceGpsFresh: false,
    onRouteComputed: () => {
      driverRouteStartedAtRef.current = Date.now()
    },
  })

  const lastInteractRef = useRef(Date.now())
  const lastSpokenStepRef = useRef<string>('')
  const lastDirectionsKeyRef = useRef<string>('')
  const prevFlowStepRef = useRef(bookingState.flowStep)
  const sleepySpokenRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const { resolved: themeResolved } = useFetchTheme()

  useEffect(() => {
    if (!onMapsBootReady) return
    if (!mapsApiKey) {
      onMapsBootReady(true)
      return
    }
    onMapsBootReady(mapsJsReady)
  }, [mapsApiKey, mapsJsReady, onMapsBootReady])
  const [userMapLocation, setUserMapLocation] = useState<{
    lat: number
    lng: number
  } | null>(null)
  const userMapLocationRef = useRef(userMapLocation)
  userMapLocationRef.current = userMapLocation

  const [bookingRouteSteps, setBookingRouteSteps] = useState<DirectionsStepLite[]>([])
  const [chatNavLegSteps, setChatNavLegSteps] = useState<DirectionsStepLite[]>([])
  const [bookingTrafficDelaySeconds, setBookingTrafficDelaySeconds] = useState<number | null>(null)
  const [mapFollowUser, setMapFollowUser] = useState(false)
  const [chatNavRerouteTick, setChatNavRerouteTick] = useState(0)
  const lastChatNavDevRerouteAtRef = useRef(0)

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(() => loadSavedAddresses())
  const quoteActivityKeyRef = useRef<string | null>(null)
  const lastDriverAlertStatusRef = useRef<string | null>(null)
  const chatNavPaintLoggedRef = useRef<string | null>(null)

  const refreshLocalFeeds = useCallback(() => {
    setSavedAddresses(loadSavedAddresses())
    setHomeActivityTick((t) => t + 1)
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshLocalFeeds()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refreshLocalFeeds])

  useEffect(() => {
    const p = bookingState.pricing
    if (!p) return
    const key = `${bookingState.bookingId ?? 'na'}_${p.minPrice}_${p.maxPrice}_${p.totalPrice ?? ''}`
    if (quoteActivityKeyRef.current === key) return
    quoteActivityKeyRef.current = key
    const subtitle =
      p.totalPrice != null
        ? `About $${p.totalPrice} AUD (${p.minPrice}–${p.maxPrice}) · ~${Math.round(p.estimatedDuration / 60)} min`
        : `$${p.minPrice}–$${p.maxPrice} AUD · ~${Math.round(p.estimatedDuration / 60)} min`
    appendHomeActivity({
      title: 'Quote ready',
      subtitle,
      jobType: bookingState.jobType ?? undefined,
      priceMin: p.minPrice,
      priceMax: p.maxPrice,
      distanceMeters:
        bookingState.distanceMeters ??
        bookingState.route?.distanceMeters ??
        undefined,
    })
    appendHomeAlert({
      title: 'Quote ready',
      body: subtitle,
    })
    refreshLocalFeeds()
  }, [bookingState.pricing, bookingState.bookingId, bookingState.jobType, refreshLocalFeeds])

  useEffect(() => {
    const st = bookingState.bookingStatus
    if (!st || !isLivePipelinePersistedStatus(st)) return
    if (lastDriverAlertStatusRef.current === st) return
    lastDriverAlertStatusRef.current = st
    const jc = junkLiveJobCopy(st, bookingState.driver)
    appendHomeAlert({ title: jc.title, body: jc.line })
    refreshLocalFeeds()
  }, [bookingState.bookingStatus, bookingState.driver, refreshLocalFeeds])

  useEffect(() => {
    if (!chatNavRoute?.path || chatNavRoute.path.length < 2) return
    const key = `${chatNavRoute.destLat}_${chatNavRoute.destLng}_${chatNavRoute.path.length}`
    if (chatNavPaintLoggedRef.current === key) return
    chatNavPaintLoggedRef.current = key
    if (fetchPerfIsEnabled()) {
      fetchPerfMark(undefined, '2_step_visible', {
        surface: 'home_chat_nav',
        pathPoints: chatNavRoute.path.length,
      })
    }
  }, [chatNavRoute])

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

  useEffect(() => {
    if (
      (!chatNavRoute && !homeMapExploreMode && homeShellTab !== 'maps') ||
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    )
      return
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        setUserMapLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 25_000 },
    )
    return () => {
      navigator.geolocation.clearWatch(wid)
    }
  }, [chatNavRoute, homeMapExploreMode, homeShellTab])

  useEffect(() => {
    if (!chatNavRoute) setChatNavLegSteps([])
  }, [chatNavRoute])

  useEffect(() => {
    if (!mapsJsReady || typeof google === 'undefined' || !chatNavRoute) return
    let cancelled = false
    const destLat = chatNavRoute.destLat
    const destLng = chatNavRoute.destLng
    const dest = { lat: destLat, lng: destLng }

    const run = () => {
      if (cancelled || document.visibilityState === 'hidden') return
      const origin = userMapLocationRef.current
      if (!origin) return
      const svc = new google.maps.DirectionsService()
      svc.route(drivingTrafficDirectionsRequest(origin, dest), (result, status) => {
        if (cancelled) return
        if (status !== 'OK' || !result?.routes[0]) return
        const route = result.routes[0]
        const leg = route.legs?.[0]
        const { distanceMeters, durationSeconds, trafficDelaySeconds } =
          legDurationTrafficAndDistance(leg)
        const path = overviewPathFromRoute(route)
        const steps = extractLegStepsFromLeg(leg)
        const nextStep =
          steps[0]?.instruction ?? firstStepPlainInstruction(route) ?? null
        setChatNavLegSteps(steps)
        setChatNavRoute((prev) => {
          if (!prev || prev.destLat !== destLat || prev.destLng !== destLng) return prev
          return {
            ...prev,
            originLat: origin.lat,
            originLng: origin.lng,
            etaSeconds: durationSeconds,
            baseDurationSeconds: leg?.duration?.value ?? durationSeconds,
            distanceMeters,
            trafficDelaySeconds,
            path: path.length >= 2 ? path : prev.path,
            nextStepInstruction: nextStep ?? prev.nextStepInstruction ?? null,
          }
        })
      })
    }

    run()
    const iv = window.setInterval(run, 90_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [mapsJsReady, chatNavRoute?.destLat, chatNavRoute?.destLng, chatNavRerouteTick])

  useEffect(() => {
    if (!chatNavRoute?.path?.length || userMapLocation == null) return
    const d = distancePointToPathMeters(userMapLocation, chatNavRoute.path)
    if (d < 130) return
    const now = Date.now()
    if (now - lastChatNavDevRerouteAtRef.current < 45_000) return
    lastChatNavDevRerouteAtRef.current = now
    setChatNavRerouteTick((t) => t + 1)
  }, [
    userMapLocation?.lat,
    userMapLocation?.lng,
    chatNavRoute?.path,
    chatNavRoute?.destLat,
    chatNavRoute?.destLng,
  ])

  const bumpInteraction = useCallback(() => {
    lastInteractRef.current = Date.now()
    setIdleLong(false)
  }, [])

  const clearBrainVisual = useCallback(() => {
    if (brainVisualObjectUrlRef.current) {
      URL.revokeObjectURL(brainVisualObjectUrlRef.current)
      brainVisualObjectUrlRef.current = null
    }
    setBrainVisualUrl(null)
  }, [])

  useEffect(() => {
    return () => {
      if (brainVisualObjectUrlRef.current) {
        URL.revokeObjectURL(brainVisualObjectUrlRef.current)
        brainVisualObjectUrlRef.current = null
      }
    }
  }, [])

  const closeFetchBrain = useCallback(() => {
    stopAssistantPlayback()
    brainAbortRef.current?.abort()
    brainAbortRef.current = null
    brainPlacesAbortRef.current?.abort()
    brainPlacesAbortRef.current = null
    setBrainSttListening(false)
    setBrainLastReply(null)
    setBrainAiPending(false)
    setBrainSurfaceSpeaking(false)
    clearBrainVisual()
    setHomeBrainFlow(null)
    setBrainSkipReveal(false)
    setBrainFocusedMemoryId(null)
    setBrainFieldPlaces(null)
    setBrainPlacesLoading(false)
    setBrainMemoriesSheetOpen(false)
  }, [clearBrainVisual, stopAssistantPlayback])

  useEffect(() => {
    if (homeBrainFlow == null) {
      setBrainFocusedMemoryId(null)
      setBrainFieldPlaces(null)
      setBrainPlacesLoading(false)
      setBrainMemoriesSheetOpen(false)
    }
  }, [homeBrainFlow])

  useEffect(() => {
    if (homeBrainFlow !== 'brain' && homeBrainFlow !== 'clarity') return
    const catalogLines = brainConvRef.current.map((l) => ({
      id: l.id,
      role: l.role,
      text: l.content,
      sortAt: l.at,
    }))
    setBrainAccountSnapshot(buildBrainAccountSnapshot({ brainChatLines: catalogLines }))
    let cancelled = false
    void buildBrainAccountSnapshotAsync(catalogLines).then((s) => {
      if (!cancelled) setBrainAccountSnapshot(s)
    })
    return () => {
      cancelled = true
    }
  }, [homeBrainFlow, brainConvRevision, homeActivityTick, savedAddresses])

  const brainGraphNodes = useMemo((): BrainNode[] => {
    if (!brainAccountSnapshot) return []
    const flowStep = deriveFlowStep(bookingState)
    const chatTurns = brainConvRef.current.map((l) => ({
      id: l.id,
      role: l.role,
      text: l.content,
    }))
    const nodes = buildFetchBrainGraph({
      chatTurns,
      jobType: bookingState.jobType,
      flowStep,
      navActive: Boolean(chatNavRoute),
      pickupLine: bookingState.pickupAddressText || null,
      dropoffLine: bookingState.dropoffAddressText || null,
      snapshot: brainAccountSnapshot,
      focusedCatalogId: brainFocusedMemoryId,
    }).nodes
    if (brainFieldPlaces && brainFieldPlaces.items.length > 0) {
      return [
        ...nodes,
        {
          id: 'web-field-places',
          kind: 'web',
          label: 'Live maps',
          subtitle: `${brainFieldPlaces.items.length} nearby`,
          body: brainFieldPlaces.title,
          x: 648,
          y: 300,
          radius: 14,
        },
      ]
    }
    return nodes
  }, [
    brainAccountSnapshot,
    brainConvRevision,
    brainFocusedMemoryId,
    bookingState,
    chatNavRoute,
    brainFieldPlaces,
  ])

  const onComposerListeningChange = useCallback((v: boolean) => {
    setComposerListening(v)
  }, [])

  const onBrainListeningChange = useCallback((v: boolean) => {
    setBrainSttListening(v)
  }, [])

  const handleHomeMapInstance = useCallback((m: google.maps.Map | null) => {
    homeMapRef.current = m
  }, [])

  const orbTunnelTarget = useMemo(() => {
    if (chatNavRoute) {
      return { lat: chatNavRoute.originLat, lng: chatNavRoute.originLng }
    }
    const pc =
      bookingState.pickupCoords ??
      (pendingConfirm?.field === 'pickup' ? pendingConfirm.coords : null)
    if (pc) return pc
    const dc =
      bookingState.dropoffCoords ??
      (pendingConfirm?.field === 'dropoff' ? pendingConfirm.coords : null)
    if (dc) return dc
    if (userMapLocation) return userMapLocation
    return BRISBANE_CENTER
  }, [
    chatNavRoute,
    bookingState.pickupCoords,
    bookingState.dropoffCoords,
    pendingConfirm,
    userMapLocation,
  ])

  /** Brain tunnel: prefer device “you are here”, then booking/nav, then city default. */
  const brainTunnelPanTarget = useMemo(() => {
    if (userMapLocation) return userMapLocation
    return orbTunnelTarget
  }, [userMapLocation, orbTunnelTarget])

  const fetchBrainMind = useMemo((): FetchBrainMindState => {
    const immersive =
      homeBrainFlow === 'clarity' || homeBrainFlow === 'brain'
    if (immersive) {
      if (brainSttListening) return 'listening'
      if (brainAiPending) return 'thinking'
      if (brainSurfaceSpeaking || isSpeechPlaying) return 'speaking'
      return 'idle'
    }
    if (isSpeechPlaying) return 'speaking'
    if (voiceHoldCaption) return 'thinking'
    if (composerListening) return 'listening'
    return 'idle'
  }, [
    homeBrainFlow,
    brainSttListening,
    brainAiPending,
    brainSurfaceSpeaking,
    isSpeechPlaying,
    voiceHoldCaption,
    composerListening,
  ])

  useEffect(() => {
    if (homeBrainFlow == null) {
      brainWelcomeRef.current = false
      return
    }
    if (homeBrainFlow !== 'clarity' && homeBrainFlow !== 'brain') return
    if (brainWelcomeRef.current) return
    brainWelcomeRef.current = true
    setBrainSurfaceSpeaking(true)
    void speakLine(
      "You're inside the field now—stay as long as you like. Tap when you're ready to talk.",
      { debounceKey: 'fetch_brain_welcome', debounceMs: 10_000 },
    ).finally(() => setBrainSurfaceSpeaking(false))
  }, [homeBrainFlow, speakLine])

  useEffect(() => {
    if (homeBrainFlow !== 'tunnel') return

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduceMotion) {
      setHomeBrainFlow('clarity')
      return
    }

    if (!mapsApiKey) {
      const t = window.setTimeout(() => setHomeBrainFlow('clarity'), 500)
      return () => window.clearTimeout(t)
    }

    let cancelled = false
    let idleListener: google.maps.MapsEventListener | null = null
    let fallbackTimer: number | null = null
    let pollTimer: number | null = null
    let pauseAfterZoomTimer: number | null = null
    let zoomRaf = 0
    let attempts = 0

    const ZOOM_MS = FETCH_TUNNEL_ZOOM_MS
    const easeInOutCubic = (u: number) =>
      u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2

    const finishZoom = () => {
      if (cancelled) return
      setHomeBrainFlow('clarity')
    }

    const runFlight = () => {
      const map = homeMapRef.current
      if (!map || cancelled) return
      try {
        map.setTilt(0)
        map.setHeading(0)
      } catch {
        /* optional */
      }
      const zMaxRaw = map.get('maxZoom')
      const zMax = typeof zMaxRaw === 'number' && Number.isFinite(zMaxRaw) ? zMaxRaw : 20
      const targetZ = Math.min(20, zMax)
      const dest = brainTunnelPanTarget

      const startCenter = map.getCenter()
      const startZoom = map.getZoom()
      if (!startCenter || startZoom == null) {
        map.panTo(dest)
        map.setZoom(targetZ)
        pauseAfterZoomTimer = window.setTimeout(() => {
          pauseAfterZoomTimer = null
          if (!cancelled) finishZoom()
        }, 420)
        return
      }

      const t0 = performance.now()
      const sLat = startCenter.lat()
      const sLng = startCenter.lng()
      const dLat = dest.lat - sLat
      const dLng = dest.lng - sLng
      const dz = targetZ - startZoom

      const step = (now: number) => {
        if (cancelled) return
        const u = Math.min(1, (now - t0) / ZOOM_MS)
        const e = easeInOutCubic(u)
        map.setCenter({
          lat: sLat + dLat * e,
          lng: sLng + dLng * e,
        })
        map.setZoom(startZoom + dz * e)
        if (u < 1) {
          zoomRaf = requestAnimationFrame(step)
        } else {
          zoomRaf = 0
          pauseAfterZoomTimer = window.setTimeout(() => {
            pauseAfterZoomTimer = null
            if (cancelled) return
            idleListener = google.maps.event.addListenerOnce(map, 'idle', finishZoom)
            fallbackTimer = window.setTimeout(() => {
              fallbackTimer = null
              if (idleListener) {
                google.maps.event.removeListener(idleListener)
                idleListener = null
              }
              finishZoom()
            }, 900)
          }, FETCH_TUNNEL_PAUSE_AFTER_MS)
        }
      }

      zoomRaf = requestAnimationFrame(step)
    }

    const tryFly = () => {
      if (cancelled) return
      if (homeMapRef.current) {
        requestAnimationFrame(runFlight)
        return
      }
      attempts++
      if (attempts > 50) {
        finishZoom()
        return
      }
      pollTimer = window.setTimeout(tryFly, 28)
    }

    tryFly()

    return () => {
      cancelled = true
      if (zoomRaf) cancelAnimationFrame(zoomRaf)
      if (pollTimer != null) window.clearTimeout(pollTimer)
      if (pauseAfterZoomTimer != null) window.clearTimeout(pauseAfterZoomTimer)
      if (idleListener) google.maps.event.removeListener(idleListener)
      if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
    }
  }, [homeBrainFlow, brainTunnelPanTarget, mapsApiKey, mapsJsReady])

  useEffect(() => {
    if (homeBrainFlow !== 'clarity') return
    const t = window.setTimeout(() => setHomeBrainFlow('brain'), FETCH_CLARITY_TO_BRAIN_MS)
    return () => window.clearTimeout(t)
  }, [homeBrainFlow])

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

  const retryMarketplaceSync = useCallback(async () => {
    const r = bookNowSyncRetryRef.current
    if (!r) return
    setBookNowSyncRetryBusy(true)
    setBookNowSyncError(null)
    try {
      const saved = await upsertBooking({ ...r.payload, paymentIntent: r.paymentIntent })
      await dispatchBooking(saved.id)
      bookNowSyncRetryRef.current = null
      setShowDemoTimelineOnly(false)
      clearDriverFlowTimers()
      const row = await fetchBooking(saved.id)
      setBookingState((prev) => {
        const patch = bookingRecordToStatePatch(row)
        const next: BookingState = { ...prev, ...patch }
        if (row.status && isLivePipelinePersistedStatus(row.status)) {
          next.mode = uiModeFromBookingLifecycle(row.status)
        } else if (row.status === 'completed' || row.status === 'cancelled') {
          next.mode = 'idle'
        }
        next.flowStep = deriveFlowStep(next)
        return next
      })
      appendHomeAlert({
        title: 'Booking saved',
        body: 'Your job is live on Fetch servers. Driver updates will sync automatically.',
      })
      refreshLocalFeeds()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save booking.'
      setBookNowSyncError(msg)
      appendHomeAlert({ title: 'Could not save booking', body: msg })
      refreshLocalFeeds()
    } finally {
      setBookNowSyncRetryBusy(false)
    }
  }, [clearDriverFlowTimers, refreshLocalFeeds])

  const handleSubmitCompletionRating = useCallback(
    async (stars: 1 | 2 | 3 | 4 | 5, note: string | null) => {
      const id = bookingStateRef.current.bookingId
      if (!id || id.startsWith('demo-')) {
        setRatingSubmitError('This preview booking cannot be rated on the server.')
        return
      }
      setRatingSubmitBusy(true)
      setRatingSubmitError(null)
      try {
        const row = await submitCustomerBookingRating(id, { stars, note })
        setBookingState((prev) => ({ ...prev, ...bookingRecordToStatePatch(row) }))
        appendHomeAlert({ title: 'Thanks', body: 'Your rating was saved.' })
        refreshLocalFeeds()
      } catch (e) {
        setRatingSubmitError(e instanceof Error ? e.message : 'Could not save rating.')
      } finally {
        setRatingSubmitBusy(false)
      }
    },
    [refreshLocalFeeds],
  )

  const handleRetryDispatchAfterMatchFail = useCallback(async () => {
    const id = bookingStateRef.current.bookingId
    if (!id || id.startsWith('demo-')) return
    setMatchRetryBusy(true)
    setMatchRetryError(null)
    try {
      const row = await dispatchBooking(id)
      setBookingState((prev) => {
        const patch = bookingRecordToStatePatch(row)
        const next: BookingState = { ...prev, ...patch }
        if (row.status && isLivePipelinePersistedStatus(row.status)) {
          next.mode = uiModeFromBookingLifecycle(row.status)
        } else if (row.status === 'completed' || row.status === 'cancelled') {
          next.mode = 'idle'
        }
        next.flowStep = deriveFlowStep(next)
        return next
      })
      speakLine('Searching again for a driver near you.', {
        debounceKey: 'match_retry_search',
        debounceMs: 0,
        withVoiceHold: true,
      })
      appendHomeAlert({
        title: 'Searching again',
        body: 'We are contacting drivers for your job.',
      })
      refreshLocalFeeds()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not restart search.'
      setMatchRetryError(msg)
      appendHomeAlert({ title: 'Retry failed', body: msg })
      refreshLocalFeeds()
    } finally {
      setMatchRetryBusy(false)
    }
  }, [refreshLocalFeeds, speakLine])

  const startPostPaymentDriverFlow = useCallback(
    (paymentPatch?: Partial<BookingState>, options?: { serverLive?: boolean }) => {
    clearDriverFlowTimers()
    setShowDemoTimelineOnly(!options?.serverLive)
    setBookingState((prev) => beginDriverSearchDemo({ ...prev, ...paymentPatch }))
    playUiEvent('processing_start')
    speakLine('Searching the network for a driver near you.', {
      debounceKey: 'junk_driver_search',
      debounceMs: 0, withVoiceHold: true,
    })

    if (options?.serverLive) {
      return
    }

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
    if (homeBootstrapping) return
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
  }, [homeBootstrapping, speakLine, playUiEvent])

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
    svc.route(drivingTrafficDirectionsRequest(p, d), (result, status) => {
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
        const path = overviewPathFromRoute(route)
        const { distanceMeters, durationSeconds, trafficDelaySeconds } =
          legDurationTrafficAndDistance(leg)
        setBookingRouteSteps(extractLegStepsFromLeg(leg))
        setBookingTrafficDelaySeconds(trafficDelaySeconds)
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
      })
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

  useEffect(() => {
    if (!mapsJsReady || typeof google === 'undefined') {
      mapPlacesSvcRef.current = null
      return
    }
    const el = document.createElement('div')
    mapPlacesSvcRef.current = new google.maps.places.PlacesService(el)
    return () => {
      mapPlacesSvcRef.current = null
    }
  }, [mapsJsReady])

  useEffect(() => {
    if (homeShellTab !== 'maps') {
      setUserDroppedPin(null)
      setMysteryPanel({ mode: 'closed' })
      setStreetViewPosition(null)
    }
  }, [homeShellTab])

  useEffect(() => {
    if (chatNavRoute) setSheetSnap('closed')
  }, [chatNavRoute])

  const commitJobTypeSelection = useCallback((jt: BookingJobType) => {
    if (fetchPerfIsEnabled()) {
      fetchPerfMark(undefined, '1_user_action', { action: 'select_job_type', jobType: jt })
    }
    setChatNavRoute(null)
    setHomeMapExploreMode(false)
    setIntentAddressEntryActive(false)
    setOrbChatTurns([])
    setBookingRouteSteps([])
    setBookingTrafficDelaySeconds(null)
    setMapFollowUser(false)
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
    quoteActivityKeyRef.current = null
    lastDriverAlertStatusRef.current = null
    chatNavPaintLoggedRef.current = null
    pendingServicePersonalityRef.current = null
    setServicePersonalityLine(null)
    setChatNavRoute(null)
    setHomeMapExploreMode(false)
    setIntentAddressEntryActive(false)
    setOrbChatTurns([])
    setBookingRouteSteps([])
    setBookingTrafficDelaySeconds(null)
    setMapFollowUser(false)
    setBookingState(createInitialBookingState())
    setMapAttention('none')
    setIntentPlaceSuggestionsOpen(false)
    setBookNowError(null)
    setBookNowBusy(false)
    setBookNowSyncError(null)
    setBookNowSyncRetryBusy(false)
    bookNowSyncRetryRef.current = null
    setShowDemoTimelineOnly(false)
    setRatingSubmitBusy(false)
    setRatingSubmitError(null)
    lastJobCompletionSpokenBookingIdRef.current = null
    bumpInteraction()
  }, [bumpInteraction, clearDriverFlowTimers])

  const applyChatNavigation = useCallback(
    (nav: FetchAiChatNavigation | null) => {
      if (!nav?.active) return
      setHomeMapExploreMode(false)
      setIntentAddressEntryActive(false)
      setChatNavRoute(nav)
      setMapAttention('navigation')
      setSheetSnap('closed')
      bumpInteraction()
    },
    [bumpInteraction],
  )

  const runBrainAiUtterance = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      brainAbortRef.current?.abort()
      brainPlacesAbortRef.current?.abort()
      brainPlacesAbortRef.current = null
      const ac = new AbortController()
      brainAbortRef.current = ac

      playUiEvent('processing_start')

      const toCatalogLines = (lines: BrainChatStoredLine[]) =>
        lines.map((l) => ({ id: l.id, role: l.role, text: l.content, sortAt: l.at }))

      const preSnap = buildBrainAccountSnapshot({
        brainChatLines: toCatalogLines(brainConvRef.current),
      })
      const memFocus = resolveMemoryFocus(trimmed, preSnap.catalog)
      if (memFocus) {
        setBrainMemoriesSheetOpen(true)
        setBrainFocusedMemoryId(memFocus.focusId)
        void speakLine('Opening your memories.', {
          debounceKey: 'brain_mem_focus',
          debounceMs: 3500,
        })
      }

      const prior = brainConvRef.current
      brainConvRef.current = appendBrainUserLineEphemeral(prior, trimmed)
      setBrainConvRevision((n) => n + 1)

      const messages: FetchAiChatMessage[] = brainLinesToApiMessages(brainConvRef.current).slice(-10)

      const intelSnap = buildBrainAccountSnapshot({
        brainChatLines: toCatalogLines(brainConvRef.current),
      })

      const wantRestaurants = detectBrainRestaurantIntent(trimmed)
      let placesSummaryBlock = ''
      if (wantRestaurants) {
        const pac = new AbortController()
        brainPlacesAbortRef.current = pac
        if (!mapsJsReady || !mapPlacesSvcRef.current || userMapLocation == null) {
          void speakLine(
            'Turn on location and wait for the map to finish loading so I can search nearby restaurants.',
            {
              debounceKey: 'brain_places_need_loc',
              debounceMs: 4500,
            },
          )
        } else {
          setBrainPlacesLoading(true)
          try {
            const cards = await fetchBrainNearbyRestaurants(mapPlacesSvcRef.current, userMapLocation, {
              signal: pac.signal,
              maxResults: 10,
              detailEnrichCount: 3,
            })
            if (!pac.signal.aborted) {
              setBrainFieldPlaces({
                title: 'Restaurants near you',
                introLine:
                  cards.length > 0
                    ? 'Here are up to 10 restaurants from Google Maps, sorted by rating.'
                    : 'No restaurants matched nearby.',
                items: cards,
              })
              if (cards.length) {
                placesSummaryBlock = cards
                  .map((p, i) => `${i + 1}. ${p.title} — ${p.summary}`)
                  .join('\n')
                  .slice(0, 1600)
              }
            }
          } finally {
            if (brainPlacesAbortRef.current === pac) brainPlacesAbortRef.current = null
            setBrainPlacesLoading(false)
          }
        }
      }

      const perfRunId = fetchPerfIsEnabled() ? createPerfRunId('fetch_ai_brain') : undefined
      if (perfRunId) fetchPerfMark(perfRunId, '1_user_action', { surface: 'fetch_brain' })

      try {
        const geo =
          userMapLocation != null
            ? { latitude: userMapLocation.lat, longitude: userMapLocation.lng }
            : undefined
        const mem = buildFetchUserMemoryContext()
        const learn = buildFetchBrainLearningContext()
        setBrainAiPending(true)
        const { reply, navigation, perfTiming } = await postFetchAiChat(messages, {
          signal: ac.signal,
          locale: 'en-AU',
          context: {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...(geo ? geo : {}),
            ...(mem ? { userMemory: mem } : {}),
            brainAccountIntel: buildBrainAccountIntelForAi(intelSnap),
            ...(learn ? { brainLearningMemory: learn } : {}),
            ...(placesSummaryBlock ? { nearbyExploreSummary: placesSummaryBlock } : {}),
          },
          perfRunId,
        })
        setBrainAiPending(false)
        if (ac.signal.aborted) return
        if (navigation?.active) applyChatNavigation(navigation)
        if (perfRunId && perfTiming) fetchPerfSetServerTiming(perfRunId, perfTiming)

        brainConvRef.current = persistBrainChatExchange(prior, trimmed, reply)
        setBrainConvRevision((n) => n + 1)
        setBrainLastReply(reply)
        setBrainSurfaceSpeaking(true)
        try {
          await speakLine(reply, { debounceKey: 'fetch_ai_brain', debounceMs: 0, perfRunId })
        } finally {
          setBrainSurfaceSpeaking(false)
        }
      } catch (e) {
        setBrainAiPending(false)
        if (ac.signal.aborted) return
        brainConvRef.current = removeLastBrainLineIfUser(brainConvRef.current)
        setBrainConvRevision((n) => n + 1)
        const code = e instanceof Error ? e.message : ''
        let errLine: string
        if (code === CHAT_ERROR_OPENAI_NOT_CONFIGURED) {
          errLine = 'The assistant needs server configuration before I can help from here.'
        } else if (code === CHAT_ERROR_NETWORK) {
          errLine = "I can't reach the Fetch server from the brain view."
        } else {
          errLine = 'Something went wrong. Try again or close to return home.'
        }
        setBrainLastReply(errLine)
        setBrainSurfaceSpeaking(true)
        try {
          await speakLine(errLine, { debounceKey: 'fetch_ai_brain_err', debounceMs: 0 })
        } finally {
          setBrainSurfaceSpeaking(false)
        }
      } finally {
        if (brainAbortRef.current === ac) brainAbortRef.current = null
      }
    },
    [applyChatNavigation, mapsJsReady, playUiEvent, speakLine, userMapLocation],
  )

  const dismissBrainFieldPlaces = useCallback(() => setBrainFieldPlaces(null), [])

  const onBrainFieldPlaceMaps = useCallback((card: BrainFieldPlaceCard) => {
    window.open(card.mapsUrl, '_blank', 'noopener,noreferrer')
  }, [])

  const onBrainFieldPlaceLiked = useCallback(
    (card: BrainFieldPlaceCard) => {
      appendBrainLearningEvent({
        kind: 'place_opinion',
        placeId: card.placeId,
        name: card.title,
        rating: 1,
      })
      void speakLine("Noted — I'll remember you liked this one.", {
        debounceKey: 'brain_place_like',
        debounceMs: 3000,
      })
    },
    [speakLine],
  )

  const onBrainFieldPlacePass = useCallback((card: BrainFieldPlaceCard) => {
    appendBrainLearningEvent({
      kind: 'place_opinion',
      placeId: card.placeId,
      name: card.title,
      rating: -1,
    })
  }, [])

  const exitChatNavigation = useCallback(() => {
    setChatNavRoute(null)
    setHomeMapExploreMode(false)
    setIntentAddressEntryActive(false)
    setMapFollowUser(false)
    setMapAttention('none')
    bumpInteraction()
  }, [bumpInteraction])

  const startChatNavigationToPlace = useCallback(
    (dest: { lat: number; lng: number; label: string; placeId?: string }) => {
      if (!mapsJsReady || typeof google === 'undefined') return
      const origin =
        userMapLocation ??
        (chatNavRoute
          ? { lat: chatNavRoute.originLat, lng: chatNavRoute.originLng }
          : null)
      if (!origin) {
        void speakLine('Turn on location so we can route from where you are.', {
          debounceKey: 'nav_need_location',
          debounceMs: 2500,
          withVoiceHold: true,
        })
        playUiEvent('error')
        return
      }
      bumpInteraction()
      playUiEvent('pin_drop')
      setExplorePois([])
      setHomeMapExploreMode(false)
      setIntentAddressEntryActive(false)
      setMapAttention('navigation')
      setMapFollowUser(true)
      setSheetSnap('closed')
      const svc = new google.maps.DirectionsService()
      svc.route(drivingTrafficDirectionsRequest(origin, dest), (result, status) => {
        if (status !== 'OK' || !result?.routes[0]) {
          void speakLine("Couldn't plot a driving route to that place. Try another address.", {
            debounceKey: 'nav_route_fail',
            debounceMs: 2000,
            withVoiceHold: true,
          })
          playUiEvent('error')
          return
        }
        pushRecentNavDestination({
          label: dest.label,
          lat: dest.lat,
          lng: dest.lng,
          ...(dest.placeId ? { placeId: dest.placeId } : {}),
        })
        const route = result.routes[0]
        const leg = route.legs?.[0]
        const path = overviewPathFromRoute(route)
        if (path.length < 2) return
        const { distanceMeters, durationSeconds, trafficDelaySeconds } =
          legDurationTrafficAndDistance(leg)
        const steps = extractLegStepsFromLeg(leg)
        const nextStep =
          steps[0]?.instruction ?? firstStepPlainInstruction(route) ?? null
        setChatNavLegSteps(steps)
        setChatNavRoute({
          active: true,
          destinationLabel: dest.label,
          destLat: dest.lat,
          destLng: dest.lng,
          originLat: origin.lat,
          originLng: origin.lng,
          etaSeconds: durationSeconds,
          baseDurationSeconds: leg?.duration?.value ?? durationSeconds,
          distanceMeters,
          trafficDelaySeconds,
          path,
          nextStepInstruction: nextStep ?? null,
        })
      })
    },
    [
      mapsJsReady,
      userMapLocation,
      chatNavRoute,
      bumpInteraction,
      playUiEvent,
      speakLine,
    ],
  )

  const applyChatNavToBooking = useCallback(
    (nav: FetchAiChatNavigation) => {
      const pickupSel = {
        field: 'pickup' as const,
        formattedAddress: 'Trip start (from chat)',
        placeId: `chat_nav_o_${nav.originLat.toFixed(5)}_${nav.originLng.toFixed(5)}`,
        coords: { lat: nav.originLat, lng: nav.originLng },
      }
      const dropSel = {
        field: 'dropoff' as const,
        formattedAddress: nav.destinationLabel,
        placeId: `chat_nav_d_${nav.destLat.toFixed(5)}_${nav.destLng.toFixed(5)}`,
        coords: { lat: nav.destLat, lng: nav.destLng },
      }
      setBookingState((prev) => {
        let s = selectHomeJobType(prev, 'deliveryPickup').bookingState
        s = handleUserInput(
          { text: '', source: 'quick_action', addressSelection: pickupSel },
          s,
        ).bookingState
        s = handleUserInput(
          { text: '', source: 'quick_action', addressSelection: dropSel },
          s,
        ).bookingState
        return s
      })
      setChatNavRoute(null)
      setBookingRouteSteps([])
      setBookingTrafficDelaySeconds(null)
      setMapFollowUser(false)
      setSheetSnap('half')
      setMapAttention('route')
      setConfirmNonce((n) => n + 1)
      bumpInteraction()
      playUiEvent('success')
      void speakLine(
        'Delivery is set from your chat route. Continue in the sheet to finish the booking.',
        { debounceKey: 'chat_nav_handoff', debounceMs: 0, withVoiceHold: true },
      )
    },
    [bumpInteraction, playUiEvent, speakLine],
  )

  const savedPlaceToResolved = useCallback((a: SavedAddress): ResolvedPlace => {
    return {
      formattedAddress: a.address,
      placeId: `saved_${a.id}`,
      coords: { lat: a.lat, lng: a.lng },
      name: a.label,
    }
  }, [])

  const onMapsIconClick = useCallback(() => {
    bumpInteraction()
    setHomeShellTab('maps')
    if (chatNavRoute) {
      setHomeMapExploreMode(false)
      setMapAttention('navigation')
      setMapFollowUser(true)
      setSheetSnap('half')
      return
    }
    const bookingNavStripActive =
      flowStep === 'route' &&
      (bookingState.route?.path?.length ?? 0) >= 2 &&
      bookingState.durationSeconds != null
    if (bookingNavStripActive) {
      setHomeMapExploreMode(false)
      setMapAttention('route')
      setMapFollowUser(userMapLocation != null)
      setSheetSnap('closed')
      return
    }
    setHomeMapExploreMode(true)
    setMapFollowUser(userMapLocation != null)
    setSheetSnap('closed')
  }, [
    bumpInteraction,
    chatNavRoute,
    flowStep,
    bookingState.route?.path,
    bookingState.durationSeconds,
    userMapLocation,
  ])

  const onHomeShellTabChange = useCallback(
    (tab: HomeShellTab) => {
      bumpInteraction()
      setHomeShellTab(tab)
      if (tab === 'maps') {
        if (!chatNavRoute) {
          setHomeMapExploreMode(true)
          setSheetSnap('closed')
        } else {
          setSheetSnap('half')
        }
      } else {
        if (!chatNavRoute) setHomeMapExploreMode(false)
        setSheetSnap((s) => (s === 'closed' ? 'compact' : s))
      }
    },
    [bumpInteraction, chatNavRoute],
  )

  const onShowPlaceOnMap = useCallback((lat: number, lng: number) => {
    const m = homeMapRef.current
    if (!m) return
    m.panTo({ lat, lng })
    const z = m.getZoom()
    if ((z ?? 0) < 14) m.setZoom(14)
  }, [])

  const openMapStreetView = useCallback(() => {
    bumpInteraction()
    const m = homeMapRef.current
    let lat: number | undefined
    let lng: number | undefined
    if (m) {
      const c = m.getCenter()
      if (c) {
        lat = c.lat()
        lng = c.lng()
      }
    }
    if (
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      if (userMapLocation) {
        lat = userMapLocation.lat
        lng = userMapLocation.lng
      }
    }
    if (lat == null || lng == null) {
      void speakLine('Pan the map or turn on location to open Street View.', {
        debounceKey: 'map_sv_no_pos',
        debounceMs: 2200,
      })
      playUiEvent('error')
      return
    }
    setStreetViewPosition({ lat, lng })
  }, [bumpInteraction, playUiEvent, speakLine, userMapLocation])

  const dropPinAtMapCenter = useCallback(() => {
    bumpInteraction()
    playUiEvent('pin_drop')
    const m = homeMapRef.current
    if (m) {
      const c = m.getCenter()
      if (c) {
        setUserDroppedPin({ lat: c.lat(), lng: c.lng() })
        return
      }
    }
    if (userMapLocation) {
      setUserDroppedPin({ lat: userMapLocation.lat, lng: userMapLocation.lng })
      return
    }
    void speakLine('Pan the map to choose where to drop the pin.', {
      debounceKey: 'map_pin_need_center',
      debounceMs: 2000,
    })
  }, [bumpInteraction, playUiEvent, speakLine, userMapLocation])

  const handleMysteryAdventure = useCallback(async () => {
    const loc = userMapLocation
    const svc = mapPlacesSvcRef.current
    if (!loc || !svc) {
      void speakLine('Turn on location for a mystery adventure nearby.', {
        debounceKey: 'mystery_need_loc',
        debounceMs: 2200,
      })
      playUiEvent('error')
      return
    }
    bumpInteraction()
    playUiEvent('success')
    setMysteryPanel({ mode: 'loading' })
    const preferAdventure = (list: ExploreMapPoi[]) => {
      const adv = list.filter((p) =>
        p.kind === 'park' || p.kind === 'natural' || p.kind === 'adventure',
      )
      return adv.length ? adv : list
    }
    let candidates = preferAdventure(explorePois.filter((p) => p.placeId))
    if (candidates.length < 2) {
      const batch = await runAdventureNearbyBatch(svc, loc)
      if (batch.length) setExplorePois(batch)
      candidates = preferAdventure(batch.filter((p) => p.placeId))
    }
    const seed = pickRandomMysteryPoi(candidates)
    if (!seed?.placeId) {
      setMysteryPanel({
        mode: 'error',
        message:
          'No adventure spots nearby. Open the sheet and tap Parks or Find nearby, then try again.',
      })
      return
    }
    onShowPlaceOnMap(seed.lat, seed.lng)
    const bundle = await fetchPlaceDetailsForMystery(svc, seed.placeId)
    if (!bundle) {
      setMysteryPanel({
        mode: 'error',
        message: 'Could not load that place from Google. Try again.',
      })
      return
    }
    const messages: FetchAiChatMessage[] = [
      {
        role: 'user',
        content: `You are Fetch. In 3–6 short sentences, describe what makes this place worth a spontaneous local visit or mini adventure. Only build on the facts in the summary and address — do not invent opening hours, prices, or features not implied there.\n\nPlace name: ${bundle.name}\nSummary: ${bundle.placeSummary || bundle.formattedAddress || 'Unknown'}`,
      },
    ]
    try {
      const mem = buildFetchUserMemoryContext()
      const { reply } = await postFetchAiChat(messages, {
        locale: 'en-AU',
        context: {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          latitude: bundle.lat,
          longitude: bundle.lng,
          ...(mem ? { userMemory: mem } : {}),
        },
      })
      setMysteryPanel({ mode: 'ready', bundle, fetchStory: reply })
    } catch {
      setMysteryPanel({
        mode: 'ready',
        bundle,
        fetchStory:
          bundle.placeSummary ||
          'A mystery spot on your map — head over and see what you find.',
      })
    }
  }, [bumpInteraction, explorePois, onShowPlaceOnMap, playUiEvent, speakLine, userMapLocation])

  const goBackToPickup = useCallback(() => {
    lastDirectionsKeyRef.current = ''
    routeAutoScanKeyRef.current = ''
    setBookingRouteSteps([])
    setBookingTrafficDelaySeconds(null)
    setMapFollowUser(false)
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
    const pc = bookingState.pickupCoords
    if (pc && bookingState.mode === 'searching') {
      const d = 0.0022
      return [
        { lat: pc.lat + d, lng: pc.lng - d * 0.4 },
        { lat: pc.lat, lng: pc.lng },
        { lat: pc.lat - d * 0.55, lng: pc.lng + d * 0.65 },
      ]
    }
    const hideFullJob = shouldHideJobRouteDuringLiveTracking(
      bookingState.bookingStatus,
      bookingState.bookingId,
    )
    if (routePathFromState && routePathFromState.length >= 2 && !hideFullJob) {
      return routePathFromState
    }
    return hideFullJob ? null : routePathFromState
  }, [
    chatNavRoute?.path,
    routePathFromState,
    jobType,
    bookingState.pickupCoords,
    bookingState.mode,
    bookingState.bookingStatus,
    bookingState.bookingId,
  ])

  const mapStage = useMemo(() => {
    if (!jobType) return 'idle' as const
    const m = bookingState.mode
    if (m === 'searching') return 'searching' as const
    if (m === 'matched') return 'matched' as const
    if (m === 'live') return 'live' as const
    return 'building' as const
  }, [jobType, bookingState.mode])

  /** Coarse grid so step index / banner throttles ~10m moves instead of every GPS tick. */
  const navUserCoarseKey = useMemo(() => {
    if (!userMapLocation) return 'noloc'
    return `${userMapLocation.lat.toFixed(4)}_${userMapLocation.lng.toFixed(4)}`
  }, [userMapLocation?.lat, userMapLocation?.lng])

  const navUserCoarseLatLng = useMemo((): google.maps.LatLngLiteral | null => {
    if (!userMapLocation) return null
    return {
      lat: Number(userMapLocation.lat.toFixed(4)),
      lng: Number(userMapLocation.lng.toFixed(4)),
    }
  }, [navUserCoarseKey, userMapLocation])

  const mapNavStrip = useMemo(() => {
    if (chatNavRoute) {
      let nextTurn = chatNavRoute.nextStepInstruction ?? null
      let distanceToManeuverLabel: string | null = null
      let stepIdx = 0
      if (chatNavLegSteps.length > 0) {
        const approx = navUserCoarseLatLng ?? {
          lat: chatNavRoute.originLat,
          lng: chatNavRoute.originLng,
        }
        stepIdx = pickStepIndexAfterPassingEnds(approx, chatNavLegSteps)
        const step = chatNavLegSteps[stepIdx]!
        nextTurn = step.instruction
        distanceToManeuverLabel = distanceToManeuverBannerLabel(userMapLocation, step)
      }
      const arrivalClock = formatArrivalClockFromEtaSeconds(chatNavRoute.etaSeconds)
      return {
        layout: 'route' as const,
        navChrome: 'apple' as const,
        tripDistanceMeters: chatNavRoute.distanceMeters,
        nextTurn,
        distanceToManeuverLabel,
        etaMinutes: Math.max(1, Math.round(chatNavRoute.etaSeconds / 60)),
        arrivalClock,
        trafficDelaySeconds: chatNavRoute.trafficDelaySeconds,
        liveRegionKey: `cn-${chatNavRoute.etaSeconds}-${stepIdx}-${(nextTurn ?? '').slice(0, 40)}-${navUserCoarseKey}`,
      }
    }
    if (
      (bookingState.mode === 'searching' ||
        bookingState.mode === 'matched' ||
        bookingState.mode === 'live') &&
      liveTripDirections.etaSeconds != null &&
      liveTripDirections.phase != null
    ) {
      const eta = liveTripDirections.etaSeconds
      const arrivalClock = formatArrivalClockFromEtaSeconds(eta)
      const phase = liveTripDirections.phase
      return {
        layout: 'route' as const,
        tripDistanceMeters: liveTripDirections.distanceMeters,
        nextTurn: liveTripDirections.nextStep,
        etaMinutes: Math.max(1, Math.round(eta / 60)),
        arrivalClock,
        trafficDelaySeconds: liveTripDirections.trafficDelaySeconds,
        secondaryLine:
          phase === 'to_dropoff'
            ? 'Heading to drop-off'
            : phase === 'to_pickup'
              ? 'Driver heading to pickup'
              : null,
        liveRegionKey: `drv-${eta}-${(liveTripDirections.nextStep ?? '').slice(0, 48)}-${navUserCoarseKey}`,
      }
    }
    if (
      flowStep === 'route' &&
      (bookingState.route?.path?.length ?? 0) >= 2 &&
      bookingState.durationSeconds != null
    ) {
      let nextTurn: string | null = null
      let distanceToManeuverLabel: string | null = null
      let stepIdx = 0
      if (bookingRouteSteps.length > 0) {
        const approx = navUserCoarseLatLng ?? bookingState.pickupCoords ?? null
        if (approx) {
          stepIdx = pickStepIndexAfterPassingEnds(approx, bookingRouteSteps)
          const step = bookingRouteSteps[stepIdx]!
          nextTurn = step.instruction
          distanceToManeuverLabel = distanceToManeuverBannerLabel(
            userMapLocation,
            step,
          )
        } else {
          nextTurn = bookingRouteSteps[0]!.instruction
        }
      }
      const arrivalClock = formatArrivalClockFromEtaSeconds(
        bookingState.durationSeconds,
      )
      return {
        layout: 'route' as const,
        nextTurn,
        distanceToManeuverLabel,
        etaMinutes: Math.max(1, Math.round(bookingState.durationSeconds / 60)),
        arrivalClock,
        trafficDelaySeconds: bookingTrafficDelaySeconds,
        liveRegionKey: `bk-${bookingState.durationSeconds}-${stepIdx}-${(nextTurn ?? '').slice(0, 40)}-${navUserCoarseKey}`,
      }
    }
    if (homeMapExploreMode && homeShellTab !== 'maps') {
      return {
        layout: 'explore' as const,
        nextTurn: null,
        etaMinutes: 0,
        trafficDelaySeconds: null,
        liveRegionKey: `explore-${navUserCoarseKey}-${homeShellTab}`,
        exploreTitle: 'Map',
        exploreSubtitle: userMapLocation
          ? 'Following your location'
          : null,
      }
    }
    return null
  }, [
    chatNavRoute,
    chatNavLegSteps,
    flowStep,
    bookingState.route?.path,
    bookingState.durationSeconds,
    bookingState.mode,
    bookingState.pickupCoords,
    bookingRouteSteps,
    bookingTrafficDelaySeconds,
    liveTripDirections.distanceMeters,
    liveTripDirections.etaSeconds,
    liveTripDirections.nextStep,
    liveTripDirections.phase,
    liveTripDirections.trafficDelaySeconds,
    homeMapExploreMode,
    homeShellTab,
    navUserCoarseKey,
    navUserCoarseLatLng,
    userMapLocation,
  ])

  const driverMapLivePosition = useMemo((): google.maps.LatLngLiteral | null => {
    if (
      bookingState.mode !== 'searching' &&
      bookingState.mode !== 'matched' &&
      bookingState.mode !== 'live'
    ) {
      return null
    }
    const loc = bookingState.driverLocation
    if (loc && Date.now() - loc.updatedAt < DRIVER_GPS_FRESH_MS) {
      return { lat: loc.lat, lng: loc.lng }
    }
    const path = liveTripDirections.path
    if (!path || path.length < 2) return null
    const dur = Math.max(60, liveTripDirections.durationSeconds ?? 120)
    const u = Math.min(
      0.94,
      (Date.now() - driverRouteStartedAtRef.current) / 1000 / dur,
    )
    const n = path.length - 1
    const f = u * n
    const i = Math.floor(f)
    const frac = f - i
    const a = path[i]!
    const b = path[Math.min(i + 1, n)]!
    return {
      lat: a.lat + (b.lat - a.lat) * frac,
      lng: a.lng + (b.lng - a.lng) * frac,
    }
  }, [
    driverMapTick,
    liveTripDirections.path,
    liveTripDirections.durationSeconds,
    bookingState.mode,
    bookingState.driverLocation?.lat,
    bookingState.driverLocation?.lng,
    bookingState.driverLocation?.updatedAt,
  ])

  const homeLiveTrackingFit = useMemo((): LiveTrackingMapFit | null => {
    if (!bookingState.bookingId || !mapsJsReady) return null
    const loc = bookingState.driverLocation
    const fresh =
      loc && Date.now() - loc.updatedAt < DRIVER_GPS_FRESH_MS
        ? { lat: loc.lat, lng: loc.lng }
        : null
    const ep = resolveLiveTrackingEndpoints({
      status: bookingState.bookingStatus,
      bookingId: bookingState.bookingId,
      pickupCoords: bookingState.pickupCoords,
      dropoffCoords: bookingState.dropoffCoords,
      driverLocation: loc ?? null,
      gpsFreshMs: DRIVER_GPS_FRESH_MS,
    })
    if (!ep) return null
    const driver = fresh ?? driverMapLivePosition ?? ep.origin
    const pickup = bookingState.pickupCoords
      ? { lat: bookingState.pickupCoords.lat, lng: bookingState.pickupCoords.lng }
      : null
    const dropoff = bookingState.dropoffCoords
      ? { lat: bookingState.dropoffCoords.lat, lng: bookingState.dropoffCoords.lng }
      : null
    return { driver, pickup, dropoff, phase: ep.phase }
  }, [
    mapsJsReady,
    bookingState.bookingId,
    bookingState.bookingStatus,
    bookingState.pickupCoords?.lat,
    bookingState.pickupCoords?.lng,
    bookingState.dropoffCoords?.lat,
    bookingState.dropoffCoords?.lng,
    bookingState.driverLocation?.lat,
    bookingState.driverLocation?.lng,
    bookingState.driverLocation?.updatedAt,
    driverMapLivePosition?.lat,
    driverMapLivePosition?.lng,
    driverMapTick,
  ])

  useEffect(() => {
    const m = bookingState.mode
    if (m !== 'searching' && m !== 'matched' && m !== 'live') return
    const id = window.setInterval(() => setDriverMapTick((x) => x + 1), 1400)
    return () => window.clearInterval(id)
  }, [bookingState.mode])

  useEffect(() => {
    const id = bookingState.bookingId
    const st = bookingState.bookingStatus
    if (!shouldPollMarketplaceBooking(id, st)) return
    let cancelled = false
    const poll = async () => {
      try {
        const row = await fetchBooking(id!)
        if (cancelled) return
        setBookingState((prev) => {
          const patch = bookingRecordToStatePatch(row)
          const next: BookingState = { ...prev, ...patch }
          if (row.status && isLivePipelinePersistedStatus(row.status)) {
            next.mode = uiModeFromBookingLifecycle(row.status)
          } else if (row.status === 'completed' || row.status === 'cancelled') {
            next.mode = 'idle'
          }
          next.flowStep = deriveFlowStep(next)
          return next
        })
        if (
          row.status === 'matched' ||
          row.status === 'en_route' ||
          row.status === 'arrived' ||
          row.status === 'in_progress'
        ) {
          setMapAttention('driver')
        }
      } catch {
        /* ignore */
      }
    }
    void poll()
    const iv = window.setInterval(poll, 5000)
    return () => {
      cancelled = true
      window.clearInterval(iv)
    }
  }, [bookingState.bookingId, bookingState.bookingStatus])

  useEffect(() => {
    if (bookingState.bookingStatus !== 'completed') return
    const id = bookingState.bookingId
    if (!id) return
    if (lastJobCompletionSpokenBookingIdRef.current === id) return
    lastJobCompletionSpokenBookingIdRef.current = id
    void speakLine('All done — job completed. Thanks for choosing Fetch.', {
      debounceKey: `job_done_${id}`,
      debounceMs: 0,
      withVoiceHold: true,
    })
  }, [bookingState.bookingStatus, bookingState.bookingId, speakLine])

  const navStripActive = mapNavStrip != null
  /** Tighter sheet chrome, Fetch mark, frosted top, 25/50/80 snaps — maps tab + real nav strip, not explore-only. */
  const homeSheetNavMapChrome =
    homeShellTab === 'maps' &&
    (chatNavRoute != null || (!homeMapExploreMode && navStripActive))
  useEffect(() => {
    if (!navStripActive && !homeMapExploreMode) setMapFollowUser(false)
  }, [navStripActive, homeMapExploreMode])

  useEffect(() => {
    if (sheetSnap !== 'closed' && homeShellTab !== 'maps') setHomeMapExploreMode(false)
  }, [sheetSnap, homeShellTab])

  useEffect(() => {
    if (homeShellTab !== 'maps') setExplorePois([])
  }, [homeShellTab])

  const orbMapAttention =
    chatNavRoute != null || homeMapExploreMode || homeShellTab === 'maps'
      ? 'navigation'
      : mapAttention

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

    if ((isWireStatusMatching(status) || status === 'match_failed') && mode === 'searching') {
      return GLOW_BLUE
    }

    if (status === 'confirmed' || isWireStatusMatching(status)) {
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

  const homeVisionStyle = useMemo((): CSSProperties => {
    return {
      ['--orb-glow' as string]: `${orbGlowColor.r}, ${orbGlowColor.g}, ${orbGlowColor.b}`,
      ...(homeBrainFlow === 'tunnel'
        ? {
            ['--fetch-tunnel-flight-ms' as string]: String(FETCH_TUNNEL_ZOOM_MS),
            ['--fetch-tunnel-total-ms' as string]: String(FETCH_TUNNEL_TOTAL_MS),
          }
        : {}),
    } as CSSProperties
  }, [orbGlowColor, homeBrainFlow])

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

  const quoteLive = useMemo(
    () => computePriceForState(bookingState, { allowRouteFallback: true }),
    [bookingState],
  )
  const sheetDisplayPricing = quoteLive.ok ? quoteLive.pricing : bookingState.pricing
  const sheetDisplayBreakdown = quoteLive.ok ? quoteLive.breakdown : bookingState.quoteBreakdown
  const sheetQuoteError = !quoteLive.ok ? quoteLive.message : null

  useEffect(() => {
    if (!showPickup) setServicePersonalityLine(null)
  }, [showPickup])

  useEffect(() => {
    if (!showIntent) setAdvancedServiceMenuOpen(false)
  }, [showIntent])

  useEffect(() => {
    if (!advancedServiceMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAdvancedServiceMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [advancedServiceMenuOpen])

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
        ? 'Add a Google Maps API key to use addresses.'
        : bookingState.currentQuestion ??
          'Type your full address and confirm — no suggestions while you type.'
      const core = `${title}\n${body}`
      return servicePersonalityLine?.trim()
        ? `${servicePersonalityLine.trim()}\n\n${core}`
        : core
    }
    if (showDropoff) {
      if (!mapsApiKey) {
        return `Drop-off location\nAdd a Google Maps API key to use addresses.`
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
    if (showPostScan && bookingState.bookingStatus && isLivePipelinePersistedStatus(bookingState.bookingStatus)) {
      const jc = junkLiveJobCopy(bookingState.bookingStatus, bookingState.driver)
      const parts = [jc.title, jc.line]
      if (bookingState.driver && isWireStatusActiveForDriverGps(bookingState.bookingStatus)) {
        const d = bookingState.driver
        const bit = [d.vehicle, d.rating != null ? `${d.rating}★` : ''].filter(Boolean).join(' · ')
        if (bit) parts.push(bit)
      }
      if (isWireStatusMatching(bookingState.bookingStatus)) {
        void matchUiTick
        const meta = bookingState.matchingMeta
        const start = meta?.matchStartedAt
        if (start != null) {
          const sec = Math.max(0, Math.floor((Date.now() - start) / 1000))
          parts.push(sec >= 60 ? `Searching · ${Math.floor(sec / 60)}m ${sec % 60}s` : `Searching · ${sec}s`)
        } else {
          parts.push('Searching…')
        }
        const contacted = meta?.driversContacted
        if (contacted != null && contacted > 0) {
          parts.push(`Drivers contacted: ${contacted}`)
        }
      }
      if (bookingState.bookingStatus === 'match_failed') {
        parts.push('No driver confirmed in time — use Try again on the card to search again.')
      }
      return parts.join('\n')
    }
    if (showPostScan && sheetDisplayPricing) {
      const p = sheetDisplayPricing
      const totalBit =
        p.totalPrice != null ? `About $${p.totalPrice} AUD` : `$${p.minPrice} – $${p.maxPrice} AUD`
      const rangeBit =
        p.totalPrice != null ? ` (${p.minPrice}–${p.maxPrice} band)` : ''
      const lines = [
        'Your quote',
        `${totalBit}${rangeBit}`,
        p.explanation,
        `~${Math.round(p.estimatedDuration / 60)} min estimated`,
      ]
      if (p.usedRouteFallback) {
        lines.push('Route is estimated until navigation finalizes.')
      }
      return lines.join('\n')
    }
    if (showPostScan && sheetQuoteError) {
      return ['Items confirmed', sheetQuoteError].join('\n')
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
    bookingState.matchingMeta,
    bookingState.pricing,
    sheetDisplayPricing,
    sheetQuoteError,
    servicePersonalityLine,
    matchUiTick,
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
    if (showConfirm) return 'confirm'
    if (showPostScan && sheetDisplayPricing) return 'quote'
    if (
      showPostScan &&
      bookingState.bookingStatus &&
      isLivePipelinePersistedStatus(bookingState.bookingStatus)
    ) {
      return 'live'
    }
    if (showLaborDetails) return 'working'
    if (showScanner) return 'details'
    if (showRouteReady) return 'route'
    if (showBuildingRoute) return 'route'
    if (showPickup || showDropoff) return 'addresses'
    if (homeShellTab === 'maps') return 'maps'
    if ((chatNavRoute || homeMapExploreMode) && showIntent) return 'route'
    if (showIntent) return 'intent'
    if (showPostScan) return 'working'
    return 'idle'
  }, [
    showConfirm,
    showPostScan,
    sheetDisplayPricing,
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
    homeMapExploreMode,
    homeShellTab,
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
    if (sheetGestureActive) return
    if (showConfirm) setSheetSnap('half')
  }, [showConfirm, sheetGestureActive])

  useEffect(() => {
    if (sheetGestureActive) return
    if (showPostScan && sheetDisplayPricing && !showScanner) setSheetSnap('half')
  }, [showPostScan, sheetDisplayPricing, showScanner, sheetGestureActive])

  useEffect(() => {
    if (sheetGestureActive) return
    const suggestionsWantFull =
      (homeShellTab === 'maps' && mapsExploreAddressExpanded) ||
      (showIntent && intentPlaceSuggestionsOpen)
    if (suggestionsWantFull) {
      setSheetSnap('full')
      return
    }
    if (homeShellTab === 'maps') return
    if (showIntent && !intentPlaceSuggestionsOpen) setSheetSnap('compact')
    if (showPickup || showDropoff) setSheetSnap('half')
  }, [
    sheetGestureActive,
    homeShellTab,
    mapsExploreAddressExpanded,
    showIntent,
    showPickup,
    showDropoff,
    intentPlaceSuggestionsOpen,
  ])

  const onPeekHomeClick = useCallback(() => {
    bumpInteraction()
    setHomeShellTab('services')
    setSheetSnap('closed')
    setHomeMapExploreMode(false)
    setIntentAddressEntryActive(false)
    exitChatNavigation()
  }, [bumpInteraction, exitChatNavigation])

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

  const runBrainPhotoScan = useCallback(
    async (file: File) => {
      setBrainAiPending(true)
      setBrainLastReply('Taking a look…')
      const perfRunId = fetchPerfIsEnabled() ? createPerfRunId('brain_scan') : undefined
      try {
        const result = await scanBookingPhotos([file], serviceHint, { perfRunId })
        const summaryText = scannerSummaryLine(result.detectedItems)
        const voiceLine = result.detailedDescription?.trim() || summaryText
        setBrainLastReply(summaryText)
        playUiEvent('success')
        void speakLine(voiceLine, {
          debounceKey: 'brain_scan_result',
          debounceMs: 0,
          ...(perfRunId ? { perfRunId } : {}),
        })
      } catch {
        const line = "Couldn't read that photo. Try another."
        setBrainLastReply(line)
        void speakLine(line, {
          debounceKey: 'brain_scan_error',
          debounceMs: 0,
          ...(perfRunId ? { perfRunId } : {}),
        })
      } finally {
        setBrainAiPending(false)
      }
    },
    [playUiEvent, serviceHint, speakLine],
  )

  const onBrainPhotoSelected = useCallback(
    (file: File) => {
      clearBrainVisual()
      const url = URL.createObjectURL(file)
      brainVisualObjectUrlRef.current = url
      setBrainVisualUrl(url)
      void runBrainPhotoScan(file)
    },
    [clearBrainVisual, runBrainPhotoScan],
  )

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

      const qr = computePriceForState(next, { allowRouteFallback: true })
      if (qr.ok) {
        next.quoteBreakdown = qr.breakdown
        next.pricing = qr.pricing
      } else {
        next.quoteBreakdown = null
        next.pricing = null
      }
      if (next.pricing) next.mode = 'pricing'
      next.flowStep = deriveFlowStep(next)
      if (next.pricing) {
        const t = next.pricing.totalPrice
        const line =
          t != null
            ? `Here's what I'm seeing. About $${t} AUD for this job.`
            : `Here's what I'm seeing. $${next.pricing.minPrice} to $${next.pricing.maxPrice} for this job.`
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

  const brainImmersive =
    homeBrainFlow === 'clarity' || homeBrainFlow === 'brain'

  return (
    <div
      className="fetch-home-vision relative min-h-dvh w-full"
      style={homeVisionStyle}
      data-orb-tunnel={
        homeBrainFlow === 'tunnel' ? 'tunnel' : homeBrainFlow ? 'brain' : 'idle'
      }
    >
      {!brainImmersive ? <FetchSpeechBottomGlow /> : null}

      {homeBrainFlow === 'tunnel' ? (
        <>
          <div
            className="fetch-home-orb-tunnel-vignette pointer-events-none fixed inset-0 z-[37]"
            data-phase="tunnel"
            aria-hidden
          />
          <div
            className="fetch-home-tunnel-sonic-overlay pointer-events-none fixed inset-0 z-[38]"
            aria-hidden
          />
        </>
      ) : null}

      {homeBrainFlow == null || homeBrainFlow === 'tunnel' ? (
        <>
        <FetchHomeStepOne
          onMapsJavaScriptReady={setMapsJsReady}
          mapTunnelPhase={homeBrainFlow === 'tunnel' ? 'tunnel' : null}
          suspendMapCameraAutomation={homeBrainFlow != null}
          onMapInstance={handleHomeMapInstance}
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
          mapNavStrip={mapNavStrip}
          driverToPickupPath={liveTripDirections.path}
          driverLivePosition={driverMapLivePosition}
          mapFollowUser={mapFollowUser}
          onMapFollowUserChange={setMapFollowUser}
          suppressTrafficLayer={
            !!chatNavRoute || homeMapExploreMode || homeShellTab === 'maps'
          }
          explorePois={homeShellTab === 'maps' ? explorePois : []}
          navigationRouteActive={!!chatNavRoute}
          droppedPinCoords={homeShellTab === 'maps' ? userDroppedPin : null}
          onHomeMapMenuAccount={onAccountNavigate}
          homeMapHardwareCatalog={HARDWARE_PRODUCTS}
          liveTrackingFit={chatNavRoute ? null : homeLiveTrackingFit}
        />
        {homeShellTab === 'maps' &&
        !chatNavRoute &&
        homeBrainFlow == null &&
        !streetViewPosition ? (
          <MapExploreToolbar
            onStreetView={openMapStreetView}
            onDropPin={dropPinAtMapCenter}
            onMystery={() => void handleMysteryAdventure()}
            mysteryLoading={mysteryPanel.mode === 'loading'}
          />
        ) : null}
        </>
      ) : null}

      {!brainImmersive ? (
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
      ) : null}

      {!brainImmersive ? (
      <FetchHomeBookingSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        cardVisible={cardVisible && homeBrainFlow == null}
        orbAwakened={orbAwakened}
        isSpeechPlaying={isSpeechPlaying}
        voiceHoldCaption={voiceHoldCaption}
        onPeekHomeClick={onPeekHomeClick}
        onHomeOrbBottomPxChange={onHomeOrbBottomPxChange}
        onSheetGestureActiveChange={setSheetGestureActive}
        onAccountsClick={onAccountsClick}
        surface={sheetSurface}
        onMapsIconClick={
          cardVisible && homeBrainFlow == null && !brainImmersive
            ? undefined
            : onMapsIconClick
        }
        homeShellTab={homeShellTab}
        onHomeShellTabChange={onHomeShellTabChange}
        showHomeShellTabs={Boolean(
          cardVisible && homeBrainFlow == null && !brainImmersive,
        )}
        mapsPeekInsetRef={mapsPeekInsetRef}
        mapsCompactPeek={
          homeShellTab === 'maps' &&
          chatNavRoute == null &&
          sheetSnap === 'closed'
        }
        navMapChrome={homeSheetNavMapChrome}
      >
        {homeShellTab === 'maps' ? (
          chatNavRoute ? (
            <div className="fetch-home-landing fetch-home-landing--nav-minimal flex flex-col gap-2.5 px-0.5">
              <AppleMapsNavRoutePanel
                destinationLabel={chatNavRoute.destinationLabel}
                etaMinutes={Math.max(1, Math.round(chatNavRoute.etaSeconds / 60))}
                distanceMeters={chatNavRoute.distanceMeters}
                onClose={exitChatNavigation}
                onGo={() => {
                  bumpInteraction()
                  playUiEvent('success')
                  setSheetSnap('closed')
                  setMapFollowUser(true)
                }}
                onFromMyLocation={() => {
                  bumpInteraction()
                  setMapFollowUser(true)
                }}
                footerLink={
                  <button
                    type="button"
                    onClick={() => {
                      if (chatNavRoute) applyChatNavToBooking(chatNavRoute)
                    }}
                    className="w-full py-1.5 text-center text-[12px] font-semibold text-[#007AFF] transition-opacity hover:opacity-80"
                  >
                    Use for booking
                  </button>
                }
              />
            </div>
          ) : (
            <MapsExploreSheet
              mapsJsReady={mapsJsReady}
              userMapLocation={userMapLocation}
              savedAddresses={savedAddresses}
              onStartNavigationToPlace={startChatNavigationToPlace}
              onExplorePoisChange={setExplorePois}
              onMapsAddressFieldExpandedChange={setMapsExploreAddressExpanded}
              onShowPlaceOnMap={onShowPlaceOnMap}
              sheetSnap={sheetSnap}
              mapsPeekHost={mapsPeekHost}
            />
          )
        ) : (
          <>
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
            <div className="fetch-home-landing fetch-home-landing--nav-minimal flex flex-col gap-2.5 px-0.5">
              <AppleMapsNavRoutePanel
                destinationLabel={chatNavRoute.destinationLabel}
                etaMinutes={Math.max(1, Math.round(chatNavRoute.etaSeconds / 60))}
                distanceMeters={chatNavRoute.distanceMeters}
                onClose={exitChatNavigation}
                onGo={() => {
                  bumpInteraction()
                  playUiEvent('success')
                  setSheetSnap('closed')
                  setMapFollowUser(true)
                }}
                onFromMyLocation={() => {
                  bumpInteraction()
                  setMapFollowUser(true)
                }}
                footerLink={
                  <button
                    type="button"
                    onClick={() => {
                      if (chatNavRoute) applyChatNavToBooking(chatNavRoute)
                    }}
                    className="w-full py-1.5 text-center text-[12px] font-semibold text-[#007AFF] transition-opacity hover:opacity-80"
                  >
                    Use for booking
                  </button>
                }
              >
                <div className="pointer-events-auto -mx-1 w-[calc(100%+0.5rem)] max-w-none" data-sheet-no-drag>
                  <HomeIntentChatComposer
                    appendOrbChatTurn={pushOrbChatTurn}
                    onChatNavigation={applyChatNavigation}
                    onListeningChange={onComposerListeningChange}
                    onPlaceSuggestionsOpenChange={setIntentPlaceSuggestionsOpen}
                    showGuestAccountHint={!loadSession()}
                    mapsJsReady={mapsJsReady}
                    onStartNavigationToPlace={startChatNavigationToPlace}
                    onAddressEntryIntentChange={setIntentAddressEntryActive}
                  />
                </div>
              </AppleMapsNavRoutePanel>
            </div>
          ) : showIntent ? (
            <div className="fetch-home-landing flex flex-col">
              <section className="fetch-home-landing-section fetch-home-landing-section--intent shrink-0">
                <HomeIntentChatComposer
                  appendOrbChatTurn={pushOrbChatTurn}
                  onChatNavigation={applyChatNavigation}
                  onListeningChange={onComposerListeningChange}
                  onPlaceSuggestionsOpenChange={setIntentPlaceSuggestionsOpen}
                  showGuestAccountHint={!loadSession()}
                  mapsJsReady={mapsJsReady}
                  onStartNavigationToPlace={startChatNavigationToPlace}
                  onAddressEntryIntentChange={setIntentAddressEntryActive}
                />
                <div className="fetch-home-service-rail-row">
                  <div className="fetch-home-service-rail-headline-row">
                    <h3
                      id="fetch-home-intent-service-headline"
                      className="fetch-home-service-rail-headline"
                    >
                      Choose a service
                    </h3>
                    <button
                      type="button"
                      className="fetch-home-service-advanced-trigger"
                      aria-label="All service types"
                      aria-expanded={advancedServiceMenuOpen}
                      aria-haspopup="dialog"
                      aria-controls="fetch-home-advanced-service-menu"
                      onClick={() => setAdvancedServiceMenuOpen(true)}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </div>
                  <div
                    className="fetch-home-service-carousel-clip"
                    role="presentation"
                  >
                    <div
                      className="fetch-home-service-carousel"
                      role="group"
                      aria-labelledby="fetch-home-intent-service-headline"
                    >
                      <div className="fetch-home-service-carousel-track">
                        {LANDING_PRIMARY_SERVICES.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            data-tone={opt.tone}
                            aria-label={opt.label}
                            onClick={() => {
                              pendingServicePersonalityRef.current =
                                opt.fetchPersonalityExample
                              setServicePersonalityLine(
                                opt.fetchPersonalityExample,
                              )
                              commitJobTypeSelection(opt.jobType)
                            }}
                            className="fetch-home-service-segment"
                          >
                            <HomeServiceTypeIllustration
                              jobType={opt.jobType}
                              className="fetch-home-service-segment-icon"
                            />
                            <span className="fetch-home-service-segment-label font-semibold leading-tight tracking-[-0.02em]">
                              {opt.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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
                {bookingState.currentQuestion ??
                  'Type your full address, then confirm — no address suggestions while you type.'}
              </p>
              {savedAddresses.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Saved places">
                  {savedAddresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPickupResolved(savedPlaceToResolved(a))}
                      className="rounded-full border border-fetch-charcoal/12 bg-fetch-charcoal/[0.04] px-2.5 py-1 text-[11px] font-semibold text-fetch-charcoal/90 transition-colors hover:bg-fetch-charcoal/[0.07] active:scale-[0.98]"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {mapsApiKey ? (
                <PlacesAddressGeocodeField
                  key="pickup"
                  apiKey={mapsApiKey}
                  field="pickup"
                  placeholder={
                    jobType === 'helper'
                      ? 'Enter address for this job'
                      : jobType === 'cleaning'
                        ? 'Enter address to clean'
                        : 'Enter pickup address'
                  }
                  autoFocus
                  onResolved={onPickupResolved}
                  className={inputClass}
                />
              ) : (
                <p className="mt-2 text-[12px] text-fetch-muted">Add a Google Maps API key to use addresses.</p>
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
              {savedAddresses.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Saved places">
                  {savedAddresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onDropoffResolved(savedPlaceToResolved(a))}
                      className="rounded-full border border-fetch-charcoal/12 bg-fetch-charcoal/[0.04] px-2.5 py-1 text-[11px] font-semibold text-fetch-charcoal/90 transition-colors hover:bg-fetch-charcoal/[0.07] active:scale-[0.98]"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {mapsApiKey ? (
                <PlacesAddressGeocodeField
                  key="dropoff"
                  apiKey={mapsApiKey}
                  field="dropoff"
                  placeholder="Enter drop-off address"
                  autoFocus
                  onResolved={onDropoffResolved}
                  className={inputClass}
                />
              ) : (
                <p className="mt-2 text-[12px] text-fetch-muted">Add a Google Maps API key to use addresses.</p>
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
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 text-[13px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                  {flowStep === 'route' && requiresDropoff(jobType) ? 'Route' : 'Ready'}
                </h2>
                <button
                  type="button"
                  onClick={goBackToPickup}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-fetch-muted ring-1 ring-fetch-muted/20 transition-colors hover:bg-fetch-muted/10 active:scale-[0.97]"
                  aria-label="Cancel route and change drop-off"
                >
                  Cancel route
                </button>
              </div>
              {bookingState.pickupAddressText ? (
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/80">A </span>
                  {bookingState.pickupAddressText}
                </p>
              ) : null}
              {bookingState.dropoffAddressText ? (
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/80">B </span>
                  {bookingState.dropoffAddressText}
                </p>
              ) : null}
              {bookingState.distanceMeters != null && bookingState.durationSeconds != null ? (
                <p className="mt-1 text-[11px] tabular-nums text-fetch-muted">
                  {(bookingState.distanceMeters / 1000).toFixed(1)} km · ~{Math.round(bookingState.durationSeconds / 60)} min
                </p>
              ) : null}
              {flowStep !== 'route' ? (
                <button
                  type="button"
                  onClick={handleRouteNext}
                  className="fetch-stage-primary-btn mt-2.5 w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97]"
                >
                  Continue to photo scan
                </button>
              ) : (
                <p className="mt-2 text-[11px] font-medium text-fetch-muted/80">Mapping route…</p>
              )}
            </>
          ) : null}

          {showBuildingRoute ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold leading-tight text-fetch-charcoal">Route</h2>
                <button
                  type="button"
                  onClick={goBackToPickup}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-fetch-muted ring-1 ring-fetch-muted/20 transition-colors hover:bg-fetch-muted/10 active:scale-[0.97]"
                  aria-label="Cancel route and change drop-off"
                >
                  Cancel route
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="fetch-stage-spinner h-3 w-3 shrink-0 animate-spin rounded-full" />
                <p className="text-[11px] font-medium text-fetch-muted/85">Mapping pickup to drop-off…</p>
              </div>
              {bookingState.pickupAddressText ? (
                <p className="mt-1.5 line-clamp-1 text-[11px] text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/75">A </span>
                  {bookingState.pickupAddressText}
                </p>
              ) : null}
              {bookingState.dropoffAddressText ? (
                <p className="line-clamp-1 text-[11px] text-fetch-muted">
                  <span className="font-semibold text-fetch-charcoal/75">B </span>
                  {bookingState.dropoffAddressText}
                </p>
              ) : null}
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

          {showPostScan && bookingState.bookingStatus && isLivePipelinePersistedStatus(bookingState.bookingStatus)
            ? (() => {
                const jc = junkLiveJobCopy(bookingState.bookingStatus!, bookingState.driver)
                return (
                  <>
                    {bookNowSyncError ? (
                      <div className="mb-3 rounded-xl border border-red-200/50 bg-red-50/90 px-3 py-2.5">
                        <p className="text-[11px] font-semibold leading-snug text-red-900/90">
                          Payment succeeded, but Fetch could not save your booking.
                        </p>
                        <p className="mt-1 text-[11px] leading-snug text-red-800/85">{bookNowSyncError}</p>
                        <button
                          type="button"
                          disabled={bookNowSyncRetryBusy}
                          onClick={() => {
                            void retryMarketplaceSync()
                          }}
                          className="fetch-stage-primary-btn mt-2 w-full rounded-xl px-3 py-2 text-center text-[12px] font-semibold transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {bookNowSyncRetryBusy ? 'Retrying…' : 'Retry save'}
                        </button>
                      </div>
                    ) : null}
                    {showDemoTimelineOnly && !bookNowSyncError ? (
                      <p className="mb-2 text-[10px] font-medium leading-snug text-amber-900/85 [text-wrap:pretty]">
                        Demo driver timeline on this device only — your booking is not on Fetch servers
                        until sync succeeds.
                      </p>
                    ) : null}
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
                    {bookingState.driver && isWireStatusActiveForDriverGps(bookingState.bookingStatus) ? (
                      <p className="mt-2 text-[11px] font-medium text-fetch-charcoal/85">
                        {bookingState.driver.vehicle ? `${bookingState.driver.vehicle} · ` : ''}
                        {bookingState.driver.rating != null ? `${bookingState.driver.rating}★` : ''}
                      </p>
                    ) : null}
                    {isWireStatusMatching(bookingState.bookingStatus) ? (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="fetch-stage-spinner h-3 w-3 animate-spin rounded-full" />
                          <p className="text-[12px] font-medium text-fetch-muted/80">
                            {(() => {
                              void matchUiTick
                              const start = bookingState.matchingMeta?.matchStartedAt
                              if (start == null) return 'Searching…'
                              const sec = Math.max(0, Math.floor((Date.now() - start) / 1000))
                              return sec >= 60
                                ? `Searching · ${Math.floor(sec / 60)}m ${sec % 60}s`
                                : `Searching · ${sec}s`
                            })()}
                          </p>
                        </div>
                        {bookingState.matchingMeta != null &&
                        (bookingState.matchingMeta.driversContacted ?? 0) > 0 ? (
                          <p className="pl-5 text-[11px] font-medium text-fetch-muted/70">
                            Drivers contacted: {bookingState.matchingMeta.driversContacted}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {bookingState.bookingStatus === 'match_failed' ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-[12px] font-medium leading-snug text-amber-900/85 [text-wrap:pretty]">
                          We could not lock in a driver. Your payment is still valid — try the search again
                          whenever you are ready.
                        </p>
                        {matchRetryError ? (
                          <p className="text-[11px] font-medium text-red-600/90">{matchRetryError}</p>
                        ) : null}
                        <button
                          type="button"
                          disabled={
                            matchRetryBusy ||
                            !bookingState.bookingId ||
                            bookingState.bookingId.startsWith('demo-')
                          }
                          onClick={() => void handleRetryDispatchAfterMatchFail()}
                          className="fetch-stage-primary-btn w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {matchRetryBusy ? 'Searching…' : 'Try finding a driver again'}
                        </button>
                        <button
                          type="button"
                          disabled={
                            matchRetryBusy ||
                            !bookingState.bookingId ||
                            bookingState.bookingId.startsWith('demo-')
                          }
                          onClick={() => {
                            const id = bookingState.bookingId
                            if (!id || id.startsWith('demo-')) return
                            void (async () => {
                              setMatchRetryBusy(true)
                              setMatchRetryError(null)
                              try {
                                const row = await patchBookingStatus(id, { status: 'cancelled' })
                                setBookingState((prev) => {
                                  const next = { ...prev, ...bookingRecordToStatePatch(row) }
                                  next.mode = 'idle'
                                  next.flowStep = deriveFlowStep(next)
                                  return next
                                })
                                speakLine('Booking cancelled.', {
                                  debounceKey: 'match_fail_cancel',
                                  debounceMs: 0,
                                  withVoiceHold: true,
                                })
                                appendHomeAlert({
                                  title: 'Booking cancelled',
                                  body: 'You can start a new job anytime.',
                                })
                                refreshLocalFeeds()
                              } catch (e) {
                                setMatchRetryError(
                                  e instanceof Error ? e.message : 'Could not cancel booking.',
                                )
                              } finally {
                                setMatchRetryBusy(false)
                              }
                            })()
                          }}
                          className="fetch-home-secondary-btn w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Cancel booking
                        </button>
                      </div>
                    ) : null}
                    {bookingState.bookingStatus === 'completed' ? (
                      <>
                        <BookingCompletionSummary
                          jobType={bookingState.jobType}
                          pickupAddressText={bookingState.pickupAddressText}
                          dropoffAddressText={bookingState.dropoffAddressText}
                          pricing={bookingState.pricing}
                          paymentIntent={bookingState.paymentIntent}
                          timeline={bookingState.timeline}
                          driver={bookingState.driver}
                          customerRating={bookingState.customerRating}
                          canPersistRating={Boolean(
                            bookingState.bookingId && !bookingState.bookingId.startsWith('demo-'),
                          )}
                          onSubmitRating={handleSubmitCompletionRating}
                          ratingBusy={ratingSubmitBusy}
                          ratingError={ratingSubmitError}
                        />
                        <button
                          type="button"
                          onClick={goBackToIntent}
                          className="fetch-stage-primary-btn mt-3 w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97]"
                        >
                          Book another job
                        </button>
                      </>
                    ) : null}
                  </>
                )
              })()
            : showPostScan && sheetDisplayPricing ? (
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

              {sheetQuoteError && !quoteLive.ok ? (
                <p className="mt-2 text-[11px] font-medium leading-snug text-amber-200/90">
                  {sheetQuoteError}
                </p>
              ) : null}

              {sheetDisplayPricing.totalPrice != null ? (
                <div className="mt-2">
                  <p className="text-[11px] font-medium text-fetch-muted/75">Total (estimate)</p>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fetch-charcoal">
                      ${sheetDisplayPricing.totalPrice}
                    </span>
                    <span className="ml-1 text-[11px] font-medium text-fetch-muted/70">AUD</span>
                  </div>
                  <p className="mt-1 text-[10px] text-fetch-muted/65">
                    Typical band ${sheetDisplayPricing.minPrice}–${sheetDisplayPricing.maxPrice} AUD
                  </p>
                </div>
              ) : (
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fetch-charcoal">
                    ${sheetDisplayPricing.minPrice}
                  </span>
                  <span className="text-[16px] font-semibold text-fetch-muted/60">–</span>
                  <span className="text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fetch-charcoal">
                    ${sheetDisplayPricing.maxPrice}
                  </span>
                  <span className="ml-1 text-[11px] font-medium text-fetch-muted/70">AUD</span>
                </div>
              )}

              {sheetDisplayPricing.usedRouteFallback ? (
                <p className="mt-1.5 text-[10px] font-medium text-fetch-muted/70">
                  Route distance is estimated from your addresses until navigation finalizes.
                </p>
              ) : null}

              <p className="mt-1.5 text-[11px] font-medium leading-snug text-fetch-muted/80">
                {sheetDisplayPricing.explanation}
              </p>
              <p className="mt-0.5 text-[11px] text-fetch-muted/65">
                ~{Math.round(sheetDisplayPricing.estimatedDuration / 60)} min estimated
              </p>

              {sheetDisplayPricing.depositDueNow != null &&
              sheetDisplayPricing.balanceRemaining != null &&
              sheetDisplayPricing.balanceRemaining > 0 ? (
                <p className="mt-1 text-[10px] text-fetch-muted/70">
                  Due now ${sheetDisplayPricing.depositDueNow} AUD · Balance ${sheetDisplayPricing.balanceRemaining}{' '}
                  AUD
                </p>
              ) : null}

              {sheetDisplayBreakdown ? (
                <div className="mt-2.5 space-y-1 border-t border-white/[0.08] pt-2">
                  {([
                    ['Base fee', sheetDisplayBreakdown.baseFee],
                    ['Route', sheetDisplayBreakdown.routeFee],
                    ['Route time', sheetDisplayBreakdown.routeTimeFee],
                    ['Items', sheetDisplayBreakdown.inventoryFee],
                    ['Access', sheetDisplayBreakdown.accessFee],
                    ['Disposal', sheetDisplayBreakdown.disposalFee],
                    ['Helpers', sheetDisplayBreakdown.helperFee],
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
                  {sheetDisplayBreakdown.moveSizeMultiplier > 1 ? (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-fetch-muted/80">Size multiplier</span>
                      <span className="font-medium text-fetch-charcoal/80">
                        x{sheetDisplayBreakdown.moveSizeMultiplier}
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
              {bookNowSyncError ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] font-medium leading-snug text-amber-200/90">{bookNowSyncError}</p>
                  <button
                    type="button"
                    disabled={bookNowSyncRetryBusy || !bookNowSyncRetryRef.current}
                    onClick={() => void retryMarketplaceSync()}
                    className="fetch-stage-primary-btn w-full rounded-2xl px-3 py-2 text-center text-[12px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bookNowSyncRetryBusy ? 'Saving…' : 'Retry save to Fetch'}
                  </button>
                </div>
              ) : null}
              <p className="mt-2 text-[10px] leading-snug text-fetch-muted/75 [text-wrap:pretty]">
                Book now creates a payment intent on the Fetch server and confirms it with your default
                card from Account (demo storage on this device — see Account for details).
              </p>
              <button
                type="button"
                disabled={bookNowBusy || !sheetDisplayPricing}
                onClick={() => {
                  if (fetchPerfIsEnabled()) {
                    fetchPerfMark(undefined, '1_user_action', { action: 'book_now_click' })
                  }
                  const live = computePriceForState(bookingStateRef.current, {
                    allowRouteFallback: true,
                  })
                  const pricing = live.ok ? live.pricing : bookingStateRef.current.pricing
                  if (!pricing) return
                  const payAmount =
                    pricing.depositDueNow ?? pricing.totalPrice ?? pricing.maxPrice
                  void (async () => {
                    setBookNowBusy(true)
                    setBookNowError(null)
                    setBookNowSyncError(null)
                    bookNowSyncRetryRef.current = null
                    let marketplaceSynced = false
                    try {
                      const pi = await chargeDefaultSavedCard({
                        amount: payAmount,
                        bookingId: bookingState.bookingId,
                      })
                      if (pi.status !== 'succeeded') {
                        throw new Error(
                          `Payment did not complete (status: ${pi.status}).${
                            pi.lastError ? ` ${pi.lastError}` : ''
                          }`,
                        )
                      }
                      playUiEvent('success')
                      appendHomeActivity({
                        title: 'Payment confirmed',
                        subtitle: `$${payAmount} AUD charged · intent ${pi.id} (${pi.status})`,
                        jobType: jobType ?? undefined,
                        priceMin: pricing.minPrice,
                        priceMax: pricing.maxPrice,
                        paymentIntentId: pi.id,
                        paymentStatus: pi.status,
                        distanceMeters:
                          bookingStateRef.current.distanceMeters ??
                          bookingStateRef.current.route?.distanceMeters ??
                          undefined,
                      })
                      appendHomeAlert({
                        title: 'Payment confirmed',
                        body: `Charged $${payAmount} AUD. Reference ${pi.id}.`,
                      })
                      refreshLocalFeeds()
                      const bs = bookingStateRef.current
                      let nextBookingId =
                        bs.bookingId && !bs.bookingId.startsWith('demo-')
                          ? bs.bookingId
                          : `bk_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
                      try {
                        const liveAtPay = computePriceForState(bs, { allowRouteFallback: true })
                        const merged: BookingState = {
                          ...bs,
                          paymentIntent: pi,
                          selectedPaymentMethodId: pi.paymentMethodId,
                          ...(liveAtPay.ok
                            ? { pricing: liveAtPay.pricing, quoteBreakdown: liveAtPay.breakdown }
                            : {}),
                        }
                        const payload = bookingStateToConfirmedUpsertPayload(merged, nextBookingId)
                        const saved = await upsertBooking({ ...payload, paymentIntent: pi })
                        nextBookingId = saved.id
                        await dispatchBooking(saved.id)
                        marketplaceSynced = true
                        bookNowSyncRetryRef.current = null
                      } catch (syncErr) {
                        const msg =
                          syncErr instanceof Error
                            ? syncErr.message
                            : 'Could not save booking to Fetch servers.'
                        setBookNowSyncError(msg)
                        const liveAtPay = computePriceForState(bs, { allowRouteFallback: true })
                        const merged: BookingState = {
                          ...bs,
                          paymentIntent: pi,
                          selectedPaymentMethodId: pi.paymentMethodId,
                          ...(liveAtPay.ok
                            ? { pricing: liveAtPay.pricing, quoteBreakdown: liveAtPay.breakdown }
                            : {}),
                        }
                        const payload = bookingStateToConfirmedUpsertPayload(merged, nextBookingId)
                        bookNowSyncRetryRef.current = { payload, paymentIntent: pi }
                        appendHomeActivity({
                          title: 'Booking sync failed',
                          subtitle: msg,
                          jobType: jobType ?? undefined,
                          priceMin: pricing.minPrice,
                          priceMax: pricing.maxPrice,
                        })
                        appendHomeAlert({
                          title: 'Payment went through — booking sync failed',
                          body: `${msg} Use Retry save below.`,
                        })
                        refreshLocalFeeds()
                      }
                      startPostPaymentDriverFlow(
                        {
                          paymentIntent: pi,
                          selectedPaymentMethodId: pi.paymentMethodId,
                          bookingId: nextBookingId,
                        },
                        { serverLive: marketplaceSynced },
                      )
                    } catch (err) {
                      const msg =
                        err instanceof Error ? err.message : 'Payment could not be completed.'
                      setBookNowError(msg)
                      appendHomeActivity({
                        title: 'Payment failed',
                        subtitle: msg,
                        jobType: jobType ?? undefined,
                        priceMin: pricing.minPrice,
                        priceMax: pricing.maxPrice,
                      })
                      appendHomeAlert({ title: 'Payment failed', body: msg })
                      refreshLocalFeeds()
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
          </>
        )}
      </FetchHomeBookingSheet>
      ) : null}

      {!brainImmersive && orbChatTurns.length > 0 ? (
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
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!brainImmersive ? (
      <div
        className={[
          'fetch-home-orb-sheet-follow pointer-events-none fixed z-[58] flex flex-col items-center will-change-[bottom]',
          sheetGestureActive ? 'fetch-home-orb-sheet-follow--no-transition' : '',
          homeBrainFlow === 'tunnel' ? 'fetch-home-orb-tunnel-drop' : '',
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
              </div>
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
                setSheetSnap('closed')
                if (
                  typeof window !== 'undefined' &&
                  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
                ) {
                  setBrainSkipReveal(true)
                  setHomeBrainFlow('brain')
                  return
                }
                setBrainSkipReveal(false)
                setHomeBrainFlow('tunnel')
              }}
            />
          </div>
        </div>
      </div>
      ) : null}

      {homeBrainFlow === 'clarity' || homeBrainFlow === 'brain' ? (
        <FetchBrainMemoryOverlay
          flowPhase={homeBrainFlow}
          onClose={closeFetchBrain}
          theme={themeResolved}
          mind={fetchBrainMind}
          glowRgb={orbGlowColor}
          instantReveal={brainSkipReveal}
          onBrainUtterance={runBrainAiUtterance}
          onBrainListeningChange={onBrainListeningChange}
          lastAssistantLine={brainLastReply}
          visualSrc={brainVisualUrl}
          onBrainPhotoSelected={onBrainPhotoSelected}
          onClearVisual={clearBrainVisual}
          snapshot={brainAccountSnapshot}
          brainGraphNodes={brainGraphNodes}
          focusedMemoryId={brainFocusedMemoryId}
          onFocusedMemoryIdChange={setBrainFocusedMemoryId}
          fieldPlaces={brainFieldPlaces}
          onDismissFieldPlaces={dismissBrainFieldPlaces}
          onFieldPlaceOpenMaps={onBrainFieldPlaceMaps}
          onFieldPlaceLiked={onBrainFieldPlaceLiked}
          onFieldPlacePass={onBrainFieldPlacePass}
          memoriesSheetOpen={brainMemoriesSheetOpen}
          onMemoriesSheetClose={() => setBrainMemoriesSheetOpen(false)}
          thinkingUi={
            brainPlacesLoading
              ? {
                  show: true,
                  title: 'Fetch is finding places…',
                  subtitle: 'Live from Google Maps',
                  feedback: 'Pulling restaurants near your location.',
                }
              : brainAiPending
                ? {
                    show: true,
                    title: 'Fetch is thinking…',
                    subtitle: 'Building the best plan for your move',
                    feedback:
                      "I'll find the best options, estimate your cost, and keep you moving.",
                  }
                : null
          }
        />
      ) : null}

      <MysteryAdventurePanel
        open={mysteryPanel.mode !== 'closed'}
        loading={mysteryPanel.mode === 'loading'}
        title={mysteryPanel.mode === 'ready' ? mysteryPanel.bundle.name : ''}
        formattedAddress={
          mysteryPanel.mode === 'ready'
            ? mysteryPanel.bundle.formattedAddress
            : undefined
        }
        placeSummary={
          mysteryPanel.mode === 'ready' ? mysteryPanel.bundle.placeSummary : ''
        }
        fetchStory={
          mysteryPanel.mode === 'ready' ? mysteryPanel.fetchStory : ''
        }
        photoUrls={
          mysteryPanel.mode === 'ready' ? mysteryPanel.bundle.photoUrls : []
        }
        error={mysteryPanel.mode === 'error' ? mysteryPanel.message : null}
        onClose={() => setMysteryPanel({ mode: 'closed' })}
        onNavigate={() => {
          if (mysteryPanel.mode !== 'ready') return
          const b = mysteryPanel.bundle
          startChatNavigationToPlace({
            lat: b.lat,
            lng: b.lng,
            label: b.formattedAddress ?? b.name,
            placeId: b.placeId,
          })
          setMysteryPanel({ mode: 'closed' })
        }}
        onAnother={() => void handleMysteryAdventure()}
      />

      {streetViewPosition && mapsJsReady ? (
        <FetchStreetViewOverlay
          position={streetViewPosition}
          onClose={() => setStreetViewPosition(null)}
        />
      ) : null}

      {typeof document !== 'undefined' &&
      advancedServiceMenuOpen &&
      createPortal(
        <div className="fetch-home-advanced-service-root">
          <button
            type="button"
            className="fetch-home-advanced-service-backdrop"
            aria-label="Close menu"
            onClick={() => setAdvancedServiceMenuOpen(false)}
          />
          <div
            id="fetch-home-advanced-service-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fetch-home-advanced-service-title"
            className="fetch-home-advanced-service-panel"
          >
            <div className="fetch-home-advanced-service-panel__header">
              <h2 id="fetch-home-advanced-service-title" className="fetch-home-advanced-service-title">
                All services
              </h2>
              <button
                type="button"
                className="fetch-home-advanced-service-close"
                aria-label="Close"
                onClick={() => setAdvancedServiceMenuOpen(false)}
              >
                Done
              </button>
            </div>
            <ul className="fetch-home-advanced-service-list" role="list">
              {ADVANCED_SERVICE_MENU_OPTIONS.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    className="fetch-home-advanced-service-row"
                    onClick={() => {
                      pendingServicePersonalityRef.current = opt.personalityLine
                      setServicePersonalityLine(opt.personalityLine)
                      commitJobTypeSelection(opt.jobType)
                      setAdvancedServiceMenuOpen(false)
                    }}
                  >
                    <HomeServiceTypeIllustration
                      jobType={opt.jobType}
                      className="fetch-home-advanced-service-row__icon"
                    />
                    <span className="fetch-home-advanced-service-row__label">{opt.label}</span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="fetch-home-advanced-service-row__chev"
                      aria-hidden
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}

    </div>
  )
}