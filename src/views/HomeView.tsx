import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type RefObject,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FetchHomeBookingSheet,
  type HomeBookingSheetSnap,
  type HomeBookingSheetSurface,
  type HomeShellTab,
} from '../components/FetchHomeBookingSheet'
import type { FetchBrainChoiceSheetModel } from '../components/FetchBrainChoiceSheet'
import { FetchBrainMemoryOverlay } from '../components/FetchBrainMemoryOverlay'
import { FetchHomeStepOne } from '../components/FetchHomeStepOne'
import type { LiveTrackingMapFit } from '../components/FetchHomeStepOne/BookingMapReflection'
import {
  BRISBANE_CENTER,
  PICKUP_DROPOFF_SHEET_FIT_PADDING,
} from '../components/FetchHomeStepOne/brisbaneMap'
import {
  PlacesAddressAutocomplete,
  type ResolvedPlace,
} from '../components/FetchHomeStepOne/PlacesAddressAutocomplete'
import {
  useFetchOrbVoiceLevel,
  type FetchOrbExpression,
} from '../components/JarvisNeuralOrb'
import { FetchStripePaymentElement } from '../components/FetchStripePaymentElement'
import { FetchVoiceCommandFab } from '../components/FetchVoiceCommandFab'
import { AppleMapsNavRoutePanel } from '../components/AppleMapsNavRoutePanel'
import { MysteryAdventurePanel } from '../components/MysteryAdventurePanel'
import { FetchStreetViewOverlay } from '../components/FetchStreetViewOverlay'
import { HomeServiceInfoSheet } from '../components/HomeServiceInfoSheet'
import { HomeShellChatHubPage } from '../components/HomeShellChatHubPage'
import { HomeShellMarketplacePage } from '../components/HomeShellMarketplacePage'
import type { BuySellDropsListingHandoff } from '../components/HomeShellBuySellPage'
import type { MarketplaceDropsProductHandoff } from '../components/HomeShellMarketplacePage'
import { HomeShellReelsPage } from '../components/HomeShellReelsPage'
import type { DropsCommerceTarget } from '../lib/drops/types'
import { BookingCompletionSummary } from '../components/booking/BookingCompletionSummary'
import { TripSheetCard } from '../components/booking/TripSheetCard'
import { TripDriverStatusStrip } from '../components/booking/TripDriverStatusStrip'
import { TripPriceEstimateStrip } from '../components/booking/TripPriceEstimateStrip'
import {
  AccountNavIconFilled,
  NotificationsNavIconFilled,
  FetchEyesHomeIcon,
  MarketplaceNavIconFilled,
  ReelsNavIconFilled,
} from '../components/icons/HomeShellNavIcons'
import {
  postFetchAiChat,
  postFetchAiChatStream,
  CHAT_ERROR_ANTHROPIC_NOT_CONFIGURED,
  CHAT_ERROR_LLM_REQUEST_FAILED,
  CHAT_ERROR_NETWORK,
  CHAT_ERROR_OPENAI_NOT_CONFIGURED,
  CHAT_ERROR_OPENAI_REQUEST_FAILED,
  type FetchAiChatMessage,
  type FetchAiChatNavigation,
} from '../lib/fetchAiChat'
import { mergeSpecialtyItemSlugs, type FetchAiBookingPatch } from '../lib/fetchAiBookingPatch'
import { geocodeAddressTextAu } from '../lib/mapsGeocodeAu'
import {
  appendBrainAssistantLinePersisted,
  appendBrainUserLineEphemeral,
  appendBrainUserPhotoMessage,
  brainLinesToApiMessages,
  brainStoredToCatalogLine,
  loadBrainChatLines,
  persistBrainChatExchange,
  removeBrainScanningBubbles,
  removeLastBrainLineIfUser,
  revokeBrainChatLineBlobs,
  saveBrainChatLines,
  type BrainChatStoredLine,
} from '../lib/fetchBrainChatStorage'
import { buildBrainBookingScanSummaryFromPhoto } from '../lib/brainBookingScanContext'
import { FIELD_VOICE_PRICE_CHOICES } from '../lib/brainFieldVoiceConstants'
import {
  buildBrainAccountIntelForAi,
  buildBrainAccountSnapshot,
  buildBrainAccountSnapshotAsync,
  type BrainAccountSnapshot,
} from '../lib/fetchBrainAccountSnapshot'
import { resolveMemoryFocus } from '../lib/fetchBrainMemoryFocus'
import { appendBrainLearningEvent, buildFetchBrainLearningContext } from '../lib/fetchBrainLearningStore'
import type { HomeServiceLandingId } from '../lib/homeServiceInfoContent'
import { detectBrainRestaurantIntent } from '../lib/fetchBrainPlacesIntent'
import {
  applyDirectionsToBookingState,
  applyProvisionalRouteIfNeeded,
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
  type PhotoScanResult,
} from '../lib/assistant'
import {
  bookingRecordToStatePatch,
  bookingStateToConfirmedUpsertPayload,
  createPaymentIntent,
  dispatchBooking,
  fetchBooking,
  isLivePipelinePersistedStatus,
  isWireStatusActiveForDriverGps,
  isWireStatusMatching,
  isWireStatusTreatedAsPaid,
  patchBookingStatus,
  resolveLiveTrackingEndpoints,
  shouldHideJobRouteDuringLiveTracking,
  submitCustomerBookingRating,
  subscribeMarketplaceStream,
  upsertBooking,
  useLiveTripDirections,
  waitForPaymentIntentServerConfirmed,
  deriveTripSheetPhase,
  mapStageForTripSheetPhase,
  tripSheetPhasePrefersExpandedSnap,
  tripSheetPhaseSuppressesHomeOrb,
  type TripSheetPhase,
} from '../lib/booking'
import { computeIntentJunkRemovalEstimate } from '../lib/booking/intentScanEstimate'
import { useFetchTheme } from '../theme/FetchThemeContext'
import { syncCustomerSessionCookie } from '../lib/fetchServerSession'
import { confirmDemoPaymentIntent, isStripePublishableConfigured } from '../lib/paymentCheckout'
import {
  createPerfRunId,
  fetchPerfExtra,
  fetchPerfIsEnabled,
  fetchPerfMark,
  fetchPerfSetServerTiming,
} from '../lib/fetchPerf'
import { formatSequentialOfferCountdownLine } from '../lib/booking/bookingFlowUi'
import { suburbCommentaryLine } from '../lib/suburbCommentary'
import { useFetchVoice } from '../voice/FetchVoiceContext'
import {
  ADVANCED_SERVICE_MENU_OPTIONS,
  HOME_INTENT_ORB_BUBBLE_HINT,
  FETCH_IDLE_REMINDER_COPY,
  IDLE_TO_FETCH_REMINDER_MS,
  IDLE_TO_SLEEPY_MS,
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
  runRestaurantNearbyBatch,
  type BrainFieldPlaceCard,
  type ExploreMapPoi,
  type MysteryPlaceBundle,
} from '../lib/mapsExplorePlaces'
import { pushRecentNavDestination } from '../lib/recentNavDestinations'
import { buildHomeWelcomeLine } from '../lib/fetchWelcomeLine'
import type { BookingPaymentIntent } from '../lib/assistant'
import { firstNameFromDisplay, loadSession } from '../lib/fetchUserSession'
import { appendHomeActivity, appendHomeAlert } from '../lib/homeActivityFeed'
import { HARDWARE_PRODUCTS } from '../lib/hardwareCatalog'
import { createMessageThread, useMessagesUnreadPolling } from '../lib/messagesApi'
import { fetchListing, listingImageAbsoluteUrl, type PeerListing } from '../lib/listingsApi'
import { FETCH_MARKETPLACE_LIST_PATH } from '../lib/fetchRoutes'
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

/** `VITE_BOOKING_MATCHING_MODE=sequential` sends timed offers to drivers; default is open pool. */
const DEFAULT_BOOKING_DISPATCH_MATCHING: 'pool' | 'sequential' =
  import.meta.env.VITE_BOOKING_MATCHING_MODE === 'sequential' ? 'sequential' : 'pool'

function sessionCustomerEmailForBooking(): string | undefined {
  const e = loadSession()?.email?.trim().toLowerCase()
  return e || undefined
}

type ChatBookingHintSource = 'brain' | 'home'

function buildChatBookingHintLine(
  state: BookingState,
  source: ChatBookingHintSource | null,
  liveEtaSeconds: number | null | undefined,
): string | null {
  if (!source) return null
  const from = source === 'brain' ? 'From Fetch chat' : 'From chat'
  const st = state.bookingStatus
  const mode = state.mode
  if (st === 'completed' || st === 'cancelled') return null

  const etaMin =
    liveEtaSeconds != null && Number.isFinite(liveEtaSeconds) && liveEtaSeconds > 0
      ? Math.max(1, Math.round(liveEtaSeconds / 60))
      : null

  if (mode === 'searching' || st === 'dispatching' || st === 'pending_match') {
    return `Searching for drivers — ${from}`
  }
  if (mode === 'matched' || st === 'matched') {
    return `Driver matched — ${from}`
  }
  if (st === 'en_route' || mode === 'live') {
    const eta = etaMin != null ? `En route — ETA ~${etaMin} min` : 'En route'
    return `${eta} — ${from}`
  }
  if (st === 'arrived') return `Driver arrived — ${from}`
  if (st === 'in_progress') return `Job in progress — ${from}`
  if (mode === 'pricing') return `Review pricing — ${from}`
  if (mode === 'building') {
    const needsDrop = state.jobType != null && requiresDropoff(state.jobType)
    if (state.pickupCoords && (!needsDrop || state.dropoffCoords)) {
      return `Route preview — ${from}`
    }
    return `Continue your booking — ${from}`
  }
  return `Booking in progress — ${from}`
}

/** True once driver matching/search is active and deposit/payment is satisfied (not junk pre-pay demo search). */
function isPostDepositDriverSearchPhase(state: BookingState): boolean {
  const st = state.bookingStatus
  const inMatchingOrSearch =
    state.mode === 'searching' ||
    isWireStatusMatching(st) ||
    st === 'match_failed'

  if (!inMatchingOrSearch) return false

  if (state.jobType === 'junkRemoval') {
    return state.paymentIntent?.status === 'succeeded'
  }
  if (state.mode === 'searching') return true
  if (st == null) return false
  if (!isWireStatusTreatedAsPaid(st)) return false
  if (st === 'confirmed') return false
  return true
}

function brainFieldJobLabel(jt: BookingJobType | null): string {
  if (!jt) return 'Job'
  const m: Record<BookingJobType, string> = {
    junkRemoval: 'Junk removal',
    homeMoving: 'Home move',
    deliveryPickup: 'Pick & drop',
    heavyItem: 'Heavy item',
    helper: 'Helper / labour',
    cleaning: 'Cleaning',
  }
  return m[jt] ?? jt
}

function buildNeuralFieldStaticMapUrl(
  center: { lat: number; lng: number } | null,
  apiKey: string,
): string | null {
  if (!center || !apiKey.trim()) return null
  const c = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`
  return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(c)}&zoom=14&size=480x240&scale=2&maptype=roadmap&markers=color:0x2563eb%7C${encodeURIComponent(c)}&key=${encodeURIComponent(apiKey.trim())}`
}

function mockAsapEtaMinutes(center: { lat: number; lng: number } | null): number {
  if (!center) return 12
  const s = Math.abs(Math.sin(center.lat * 12 + center.lng * 9))
  return Math.round(8 + s * 7)
}

/** Uber-style schedule + rider row above map-first address fields. */
function HomeBookingAddressUberChrome({
  scheduleDate,
  onScheduleDate,
  forWhom,
  onForWhom,
}: {
  scheduleDate: string
  onScheduleDate: (next: string) => void
  forWhom: 'me' | 'other'
  onForWhom: (next: 'me' | 'other') => void
}) {
  const dateInputRef = useRef<HTMLInputElement>(null)

  const scheduleLabel = useMemo(() => {
    const t = new Date()
    const y = t.getFullYear()
    const m = String(t.getMonth() + 1).padStart(2, '0')
    const d = String(t.getDate()).padStart(2, '0')
    const today = `${y}-${m}-${d}`
    if (scheduleDate === today) return 'Today'
    const parsed = new Date(`${scheduleDate}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) return 'Pick date'
    return parsed.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }, [scheduleDate])

  return (
    <div className="fetch-home-booking-address-uber -mt-1.5 space-y-2">
      <h2 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.035em] text-zinc-900 dark:text-zinc-50">
        Where we going?
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const el = dateInputRef.current
            if (!el) return
            try {
              el.showPicker()
            } catch {
              el.click()
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 text-[13px] font-semibold text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:shadow-none"
        >
          <span className="tabular-nums">{scheduleLabel}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            className="opacity-55"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          Now
        </span>
        <input
          ref={dateInputRef}
          type="date"
          value={scheduleDate}
          onChange={(e) => onScheduleDate(e.target.value)}
          className="sr-only"
          aria-label="Schedule date"
        />
      </div>
      <div
        className="flex max-w-[20rem] rounded-full bg-zinc-100 p-0.5 dark:bg-zinc-800/90"
        role="group"
        aria-label="Who is this for"
      >
        {(['me', 'other'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onForWhom(key)}
            className={[
              'min-w-0 flex-1 rounded-full px-3 py-1.5 text-center text-[12px] font-semibold transition-all',
              forWhom === key
                ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-300',
            ].join(' ')}
          >
            {key === 'me' ? 'For me' : 'Someone else'}
          </button>
        ))}
      </div>
    </div>
  )
}

function AddressSuggestionsPanel({
  mountRef,
}: {
  mountRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="fetch-address-suggestions-section">
      <p className="fetch-address-suggestions-section__label">Suggestions</p>
      <div ref={mountRef} className="fetch-address-suggestions-mount" />
    </div>
  )
}

function HomeAddressWaypointRows({
  values,
  onChangeValue,
  onRemove,
  fieldClassName,
  keyPrefix,
}: {
  values: string[]
  onChangeValue: (index: number, value: string) => void
  onRemove: (index: number) => void
  fieldClassName: string
  keyPrefix: string
}) {
  if (values.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {values.map((stop, wi) => (
        <div
          key={`${keyPrefix}-${wi}`}
          className="flex min-w-0 items-center gap-1.5"
        >
          <input
            value={stop}
            onChange={(e) => onChangeValue(wi, e.target.value)}
            placeholder={`Stop ${wi + 1}`}
            className={`${fieldClassName} min-w-0 flex-1`}
            aria-label={`Stop ${wi + 1}`}
            autoComplete="off"
            autoCorrect="off"
          />
          <button
            type="button"
            aria-label={`Remove stop ${wi + 1}`}
            onClick={() => onRemove(wi)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-600/90 bg-white text-[1.15rem] font-light leading-none text-zinc-700 transition-colors hover:bg-zinc-50 active:scale-[0.97] dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export type HomeViewProps = {
  /** Sheet account control — open auth or drops setup in parent shell. */
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
  const navigate = useNavigate()
  const [bookingState, setBookingState] = useState<BookingState>(createInitialBookingState)
  const [mapsJsReady, setMapsJsReady] = useState(false)
  const [orbAwakened, setOrbAwakened] = useState(false)
  const [cardVisible, setCardVisible] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<HomeBookingSheetSnap>('closed')
  const [homeOrbBottomPx, setHomeOrbBottomPx] = useState<number | null>(null)
  /** Orb tap: tunnel → map zoom → clarity reveal → brain page. */
  const [homeBrainFlow, setHomeBrainFlow] = useState<'tunnel' | 'clarity' | 'brain' | null>(null)
  const [brainSkipReveal, setBrainSkipReveal] = useState(false)
  /** Bumped when opening brain from home mic/orb — overlay auto-starts STT once. */
  const [brainAutoVoiceEpoch, setBrainAutoVoiceEpoch] = useState(0)
  const [brainComposerFocusNonce, setBrainComposerFocusNonce] = useState(0)
  /** After each assistant TTS turn in booking-voice mode, overlay opens mic again (unless a sheet is up). */
  const [brainVoiceRelistenEpoch, setBrainVoiceRelistenEpoch] = useState(0)
  const brainBookingVoiceActiveRef = useRef(false)
  /** One-time photo nudge per field session (booking voice). */
  const brainFieldPhotoPromptedRef = useRef(false)
  const lastBrainFieldPriceKeyRef = useRef('')
  const lastBrainAddressEchoKeyRef = useRef('')
  const homeMapRef = useRef<google.maps.Map | null>(null)
  const brainWelcomeRef = useRef(false)
  const brainConvRef = useRef<BrainChatStoredLine[]>(loadBrainChatLines())
  const brainAbortRef = useRef<AbortController | null>(null)
  /** Blocks overlapping brain sends (Enter spam / double tap before `brainAiPending` paints). */
  const brainUtteranceInFlightRef = useRef(false)
  /** Tracks post-deposit search gate so we only auto-surface home once per phase (see isPostDepositDriverSearchPhase). */
  const brainSearchSurfaceGateSyncedRef = useRef(false)
  const [brainSttListening, setBrainSttListening] = useState(false)
  /** Mic level for orb reactivity only while brain dictation is active (user already granted mic). */
  const homeOrbVoiceLevel = useFetchOrbVoiceLevel(brainSttListening)
  const [brainLastReply, setBrainLastReply] = useState<string | null>(null)
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
  const [brainInteractionSheet, setBrainInteractionSheet] = useState<FetchBrainChoiceSheetModel | null>(
    null,
  )
  const [brainPlacesLoading, setBrainPlacesLoading] = useState(false)
  const [brainMemoriesSheetOpen, setBrainMemoriesSheetOpen] = useState(false)
  const brainPlacesAbortRef = useRef<AbortController | null>(null)
  const [brainFocusedMemoryId, setBrainFocusedMemoryId] = useState<string | null>(null)
  const [brainAccountSnapshot, setBrainAccountSnapshot] = useState<BrainAccountSnapshot | null>(null)
  const [sheetGestureActive, setSheetGestureActive] = useState(false)
  const [confirmNonce, setConfirmNonce] = useState(0)
  /** Short-lived expression overlay (success / concern micro-reactions). */
  const [orbBurstExpression] = useState<FetchOrbExpression | null>(null)
  const [mapAttention, setMapAttention] = useState<
    'none' | 'pickup' | 'route' | 'driver' | 'navigation'
  >('none')
  const [chatNavRoute, setChatNavRoute] = useState<FetchAiChatNavigation | null>(null)
  /** Map-forward mode from the sheet maps control (traffic + optional follow) without chat directions. */
  const [homeMapExploreMode, setHomeMapExploreMode] = useState(false)
  const [homeShellTab, setHomeShellTab] = useState<HomeShellTab>('services')
  useEffect(() => {
    try {
      const rawListing = sessionStorage.getItem('fetch.pendingPeerListingHandoff')
      if (rawListing) {
        sessionStorage.removeItem('fetch.pendingPeerListingHandoff')
        const p = JSON.parse(rawListing) as { listingId?: string; mode?: string }
        if (typeof p?.listingId === 'string' && p.listingId.trim()) {
          const mode = p.mode === 'buyNow' || p.mode === 'bid' ? p.mode : 'sheet'
          setDropsListingHandoff({ listingId: p.listingId.trim(), mode })
          setHomeShellTab('marketplace')
        }
        sessionStorage.removeItem('fetch.pendingHomeShellTab')
        return
      }
      const raw = sessionStorage.getItem('fetch.pendingHomeShellTab')
      if (raw === 'chat' || raw === 'services' || raw === 'marketplace' || raw === 'reels') {
        sessionStorage.removeItem('fetch.pendingHomeShellTab')
        setHomeShellTab(raw as HomeShellTab)
      }
      if (raw === 'buySell') {
        sessionStorage.removeItem('fetch.pendingHomeShellTab')
        setHomeShellTab('marketplace')
      }
    } catch {
      /* ignore */
    }
  }, [])
  const [dropsProductHandoff, setDropsProductHandoff] = useState<MarketplaceDropsProductHandoff | null>(
    null,
  )
  const [dropsListingHandoff, setDropsListingHandoff] = useState<BuySellDropsListingHandoff | null>(null)
  /** Increment while already on Drops to reopen the menu (upload / go live). */
  const [dropsNavRepeatTick, setDropsNavRepeatTick] = useState(0)
  const shellShopOrChat =
    homeShellTab === 'reels' ||
    homeShellTab === 'marketplace' ||
    homeShellTab === 'chat'
  const [messagesUnread, setMessagesUnread] = useState({ listing: 0, support: 0, total: 0 })
  const [pendingChatThreadId, setPendingChatThreadId] = useState<string | null>(null)
  const [chatBrainHandoff, setChatBrainHandoff] = useState<{ listingId: string; title: string } | null>(
    null,
  )
  const [serviceInfoLandingId, setServiceInfoLandingId] = useState<HomeServiceLandingId | null>(
    null,
  )
  const [chatBookingHintSource, setChatBookingHintSource] =
    useState<ChatBookingHintSource | null>(null)
  const [bookingAddressSuggestOpen, setBookingAddressSuggestOpen] = useState(false)
  /** Inline Google Places suggestions mount (map-first address flow). */
  const addressSuggestionsMountRef = useRef<HTMLDivElement>(null)
  const [rideScheduleDate, setRideScheduleDate] = useState(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  })
  const [rideForWhom, setRideForWhom] = useState<'me' | 'other'>('me')
  const [addressWaypointDrafts, setAddressWaypointDrafts] = useState<string[]>([])
  const [explorePois, setExplorePois] = useState<ExploreMapPoi[]>([])
  const [userDroppedPin, setUserDroppedPin] = useState<google.maps.LatLngLiteral | null>(
    null,
  )
  type MysteryPanelState =
    | { mode: 'closed' }
    | { mode: 'loading'; flavor: 'adventure' | 'restaurant' }
    | { mode: 'error'; flavor: 'adventure' | 'restaurant'; message: string }
    | {
        mode: 'ready'
        flavor: 'adventure' | 'restaurant'
        bundle: MysteryPlaceBundle
        fetchStory: string
      }
  const [mysteryPanel, setMysteryPanel] = useState<MysteryPanelState>({ mode: 'closed' })
  const [streetViewPosition, setStreetViewPosition] =
    useState<google.maps.LatLngLiteral | null>(null)
  const mapPlacesSvcRef = useRef<google.maps.places.PlacesService | null>(null)
  const mapsPeekInsetRef = useCallback((el: HTMLDivElement | null) => {
    void el
  }, [])
  const [, setIntentAddressEntryActive] = useState(false)
  const [idleRemindLong, setIdleRemindLong] = useState(false)
  const [idleLong, setIdleLong] = useState(false)
  /** Arms dog ears for the 1m reminder; ears render only while that line is actually speaking. */
  const [reminderLineEarsArmed, setReminderLineEarsArmed] = useState(false)
  const [wasSleepy, setWasSleepy] = useState(false)
  const [scanFiles, setScanFiles] = useState<File[]>([])
  /** Drops reel → Fetch it (peer listing): in-sheet load + vision scan before address step. */
  const [reelFetchItDelivery, setReelFetchItDelivery] = useState<{
    listingId: string
    phase: 'loading' | 'scanning' | 'done'
    title?: string
    imageUrl?: string
  } | null>(null)
  const [scanThumbs, setScanThumbs] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  type OrbChatTurn = { id: string; role: 'user' | 'assistant'; text: string }
  const [orbChatTurns, setOrbChatTurns] = useState<OrbChatTurn[]>([])
  /** Fetch “system” line above orb (intent prompt / booking questions); auto-hides after 5s. */
  const [orbEphemeralBubble, setOrbEphemeralBubble] = useState<string | null>(null)
  /** Short hint above orb on intent step; auto-hides ~10s. */
  const [intentOrbHintBubble, setIntentOrbHintBubble] = useState(false)
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
  const [stripeBookCheckout, setStripeBookCheckout] = useState<{
    clientSecret: string
    paymentIntent: BookingPaymentIntent
    payAmount: number
  } | null>(null)
  const [driverMapTick, setDriverMapTick] = useState(0)
  const driverRouteStartedAtRef = useRef(0)
  const driverFlowTimersRef = useRef<number[]>([])
  const bookingStateRef = useRef(bookingState)
  bookingStateRef.current = bookingState

  const pushBrainFieldPriceUi = useCallback(
    (state: BookingState) => {
      if (!brainBookingVoiceActiveRef.current) return
      const qr = computePriceForState(state, { allowRouteFallback: true })
      if (!qr.ok) return
      const total =
        qr.totalPrice ??
        qr.pricing.totalPrice ??
        Math.round((qr.pricing.minPrice + qr.pricing.maxPrice) / 2)
      const deposit =
        qr.depositDueNow ??
        qr.pricing.depositDueNow ??
        Math.min(total, qr.pricing.maxPrice)
      const key = `${state.jobType}|${total}|${deposit}|d${state.fieldVoiceDiscountPercent}|t${state.fieldVoiceSchedulePreference ?? 'x'}|i${(state.fieldVoiceItineraryNote ?? '').slice(0, 48)}`
      if (key === lastBrainFieldPriceKeyRef.current) return
      lastBrainFieldPriceKeyRef.current = key

      const pu = state.pickupPlace?.formattedAddress || state.pickupAddressText?.trim() || '—'
      const du = state.dropoffPlace?.formattedAddress || state.dropoffAddressText?.trim() || '—'
      const jt = state.jobType
      const summaryLines: string[] = [`Service: ${brainFieldJobLabel(jt)}`, `Pickup: ${pu}`]
      if (jt && requiresDropoff(jt)) summaryLines.push(`Drop-off: ${du}`)
      if (state.fieldVoiceItineraryNote?.trim()) {
        summaryLines.push(`Stops / plan: ${state.fieldVoiceItineraryNote.trim()}`)
      }
      if (state.fieldVoiceSchedulePreference === 'asap') {
        summaryLines.push('Timing: ASAP — next available crew')
      } else if (state.fieldVoiceSchedulePreference === 'scheduled') {
        const w = state.fieldVoiceScheduledWindow?.trim()
        summaryLines.push(w ? `Timing: ${w}` : 'Timing: scheduled window (confirm in chat)')
      } else {
        summaryLines.push('Timing: confirm ASAP or a date/window in chat')
      }

      const line = `Here’s your locked quote from the Fetch engine — totals below. Pay the deposit to secure the job.`
      const center = state.pickupCoords ?? state.dropoffCoords ?? null
      const mapPreviewUrl = buildNeuralFieldStaticMapUrl(
        center,
        import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '',
      )
      const showAsap = state.fieldVoiceSchedulePreference === 'asap'
      const asapEta = mockAsapEtaMinutes(center)

      brainConvRef.current = appendBrainAssistantLinePersisted(brainConvRef.current, line, {
        kind: 'price_preview',
        headline: 'Quoted total (engine)',
        totalAud: total,
        depositAud: deposit,
        summaryLines,
        payCtaLabel: 'Pay deposit & secure booking',
        ...(state.fieldVoiceDiscountPercent === 0
          ? { courtesyLabel: 'Apply 5% courtesy to this quote' }
          : {}),
        showAsapPreview: showAsap,
        asapEtaMinutes: asapEta,
        asapDriverLabel: 'Crew en route (preview)',
        mapPreviewUrl,
      })
      setBrainConvRevision((n) => n + 1)
      appendBrainLearningEvent({
        kind: 'field_voice_step',
        note: `exact quote total ${total} AUD deposit ${deposit}${state.fieldVoiceDiscountPercent ? ` (${state.fieldVoiceDiscountPercent}% courtesy)` : ''}`,
      })
    },
    [],
  )

  const onBrainFieldPriceCourtesy = useCallback(() => {
    lastBrainFieldPriceKeyRef.current = ''
    setBookingState((prev) => {
      const next = { ...prev, fieldVoiceDiscountPercent: 5 }
      queueMicrotask(() => {
        pushBrainFieldPriceUi(next)
      })
      return next
    })
  }, [pushBrainFieldPriceUi])

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

  const chatBookingHintLabel = useMemo(
    () =>
      buildChatBookingHintLine(
        bookingState,
        chatBookingHintSource,
        liveTripDirections.etaSeconds,
      ),
    [bookingState, chatBookingHintSource, liveTripDirections.etaSeconds],
  )

  useEffect(() => {
    const st = bookingState.bookingStatus
    if (!chatBookingHintSource) return
    if (st === 'completed' || st === 'cancelled') setChatBookingHintSource(null)
  }, [bookingState.bookingStatus, chatBookingHintSource])

  const lastInteractRef = useRef(Date.now())
  const lastSpokenStepRef = useRef<string>('')
  const lastDirectionsKeyRef = useRef<string>('')
  const prevFlowStepRef = useRef(bookingState.flowStep)
  const sleepySpokenRef = useRef(false)
  const idleReminderSpokenRef = useRef(false)
  const reminderLineSpeechHeardRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const intentCameraInputRef = useRef<HTMLInputElement>(null)
  const intentScanFileCountRef = useRef(0)
  const prevIntentAiScannerOverlayRef = useRef(false)
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
  const [pickupLockInCelebrateKey, setPickupLockInCelebrateKey] = useState(0)
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
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setUserMapLocation(null)
      return
    }
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
          if (!cancelled) {
            setUserMapLocation(null)
          }
        },
        { enableHighAccuracy: false, maximumAge: 120_000, timeout: 12_000 },
      )
    }
    try {
      const pq = navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      if (pq) {
        void pq
          .then((status) => {
            if (cancelled) return
            status.addEventListener('change', () => {
              if (cancelled) return
              if (status.state === 'granted') read()
              else if (status.state === 'denied') {
                setUserMapLocation(null)
              }
            })
            if (status.state === 'denied') {
              setUserMapLocation(null)
            } else {
              read()
            }
          })
          .catch(() => {
            if (!cancelled) read()
          })
      } else {
        read()
      }
    } catch {
      read()
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (
      shellShopOrChat ||
      (!chatNavRoute && !homeMapExploreMode) ||
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
  }, [chatNavRoute, homeMapExploreMode, shellShopOrChat])

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
    setIdleRemindLong(false)
    setIdleLong(false)
    idleReminderSpokenRef.current = false
    setReminderLineEarsArmed(false)
    reminderLineSpeechHeardRef.current = false
  }, [])

  useEffect(() => {
    return () => {
      revokeBrainChatLineBlobs(brainConvRef.current)
    }
  }, [])

  const closeFetchBrain = useCallback(() => {
    stopAssistantPlayback()
    brainBookingVoiceActiveRef.current = false
    brainAbortRef.current?.abort()
    brainAbortRef.current = null
    brainPlacesAbortRef.current?.abort()
    brainPlacesAbortRef.current = null
    setBrainSttListening(false)
    setBrainLastReply(null)
    setBrainAiPending(false)
    setBrainSurfaceSpeaking(false)
    setHomeBrainFlow(null)
    setBrainSkipReveal(false)
    setBrainFocusedMemoryId(null)
    setBrainFieldPlaces(null)
    setBrainInteractionSheet(null)
    setBrainPlacesLoading(false)
    setBrainMemoriesSheetOpen(false)
  }, [stopAssistantPlayback])

  useEffect(() => {
    const gate = isPostDepositDriverSearchPhase(bookingState)
    const brainOpen = homeBrainFlow === 'brain' || homeBrainFlow === 'clarity'

    if (!gate) {
      brainSearchSurfaceGateSyncedRef.current = false
      return
    }

    if (brainOpen && !brainSearchSurfaceGateSyncedRef.current) {
      brainSearchSurfaceGateSyncedRef.current = true
      closeFetchBrain()
      setChatNavRoute(null)
      setHomeMapExploreMode(false)
      setIntentAddressEntryActive(false)
      setHomeShellTab('services')
      setSheetSnap('full')
      const needsDrop =
        bookingState.jobType != null && requiresDropoff(bookingState.jobType)
      setMapAttention(
        bookingState.pickupCoords && (!needsDrop || bookingState.dropoffCoords)
          ? 'route'
          : 'pickup',
      )
      setChatBookingHintSource((prev) => prev ?? 'brain')
      bumpInteraction()
    } else if (gate) {
      brainSearchSurfaceGateSyncedRef.current = true
    }
  }, [
    bookingState,
    homeBrainFlow,
    closeFetchBrain,
    bumpInteraction,
  ])

  const startNewBrainChat = useCallback(() => {
    bumpInteraction()
    brainAbortRef.current?.abort()
    brainAbortRef.current = null
    brainPlacesAbortRef.current?.abort()
    brainPlacesAbortRef.current = null
    setBrainAiPending(false)
    setBrainPlacesLoading(false)
    brainUtteranceInFlightRef.current = false
    revokeBrainChatLineBlobs(brainConvRef.current)
    brainConvRef.current = []
    saveBrainChatLines([])
    lastBrainFieldPriceKeyRef.current = ''
    lastBrainAddressEchoKeyRef.current = ''
    brainFieldPhotoPromptedRef.current = false
    setBookingState((s) => ({
      ...s,
      fieldVoiceDiscountPercent: 0,
      fieldVoiceSchedulePreference: null,
      fieldVoiceScheduledWindow: null,
      fieldVoiceItineraryNote: null,
    }))
    setBrainConvRevision((n) => n + 1)
    setBrainLastReply(null)
    setBrainInteractionSheet(null)
    setBrainFieldPlaces(null)
    setBrainFocusedMemoryId(null)
    setBrainMemoriesSheetOpen(false)
    stopAssistantPlayback()
    playUiEvent('orb_tap')
  }, [bumpInteraction, playUiEvent, stopAssistantPlayback])

  useEffect(() => {
    if (homeBrainFlow == null) {
      setBrainFocusedMemoryId(null)
      setBrainFieldPlaces(null)
      setBrainInteractionSheet(null)
      setBrainPlacesLoading(false)
      setBrainMemoriesSheetOpen(false)
    }
  }, [homeBrainFlow])

  useEffect(() => {
    if (homeBrainFlow !== 'brain' && homeBrainFlow !== 'clarity') return
    const catalogLines = brainConvRef.current.map(brainStoredToCatalogLine)
    setBrainAccountSnapshot(buildBrainAccountSnapshot({ brainChatLines: catalogLines }))
    let cancelled = false
    void buildBrainAccountSnapshotAsync(catalogLines).then((s) => {
      if (!cancelled) setBrainAccountSnapshot(s)
    })
    return () => {
      cancelled = true
    }
  }, [homeBrainFlow, brainConvRevision, homeActivityTick, savedAddresses])

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
    if (bookingState.pickupCoords) return bookingState.pickupCoords
    if (bookingState.dropoffCoords) return bookingState.dropoffCoords
    if (userMapLocation) return userMapLocation
    return BRISBANE_CENTER
  }, [chatNavRoute, bookingState.pickupCoords, bookingState.dropoffCoords, userMapLocation])

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
    return 'idle'
  }, [
    homeBrainFlow,
    brainSttListening,
    brainAiPending,
    brainSurfaceSpeaking,
    isSpeechPlaying,
    voiceHoldCaption,
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
      const saved = await upsertBooking({
        ...r.payload,
        paymentIntent: r.paymentIntent,
        customerEmail: sessionCustomerEmailForBooking(),
      })
      await dispatchBooking(saved.id, { matchingMode: DEFAULT_BOOKING_DISPATCH_MATCHING })
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
      const row = await dispatchBooking(id, { matchingMode: DEFAULT_BOOKING_DISPATCH_MATCHING })
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

  const finalizePaidBookingAfterCharge = useCallback(
    async (pi: BookingPaymentIntent, payAmount: number) => {
      let marketplaceSynced = false
      playUiEvent('success')
      const bs = bookingStateRef.current
      const liveAtIntro = computePriceForState(bs, { allowRouteFallback: true })
      const pricing = liveAtIntro.ok ? liveAtIntro.pricing : bs.pricing
      if (!pricing) return

      appendHomeActivity({
        title: 'Payment confirmed',
        subtitle: `$${payAmount} AUD charged · intent ${pi.id} (${pi.status})`,
        jobType: bookingStateRef.current.jobType ?? undefined,
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
          ...(liveAtPay.ok ? { pricing: liveAtPay.pricing, quoteBreakdown: liveAtPay.breakdown } : {}),
        }
        const payload = bookingStateToConfirmedUpsertPayload(merged, nextBookingId)
        const saved = await upsertBooking({
          ...payload,
          paymentIntent: pi,
          customerEmail: sessionCustomerEmailForBooking(),
        })
        nextBookingId = saved.id
        await dispatchBooking(saved.id, {
          matchingMode: DEFAULT_BOOKING_DISPATCH_MATCHING,
        })
        marketplaceSynced = true
        bookNowSyncRetryRef.current = null
      } catch (syncErr) {
        const msg =
          syncErr instanceof Error ? syncErr.message : 'Could not save booking to Fetch servers.'
        setBookNowSyncError(msg)
        const liveAtPay = computePriceForState(bs, { allowRouteFallback: true })
        const merged: BookingState = {
          ...bs,
          paymentIntent: pi,
          selectedPaymentMethodId: pi.paymentMethodId,
          ...(liveAtPay.ok ? { pricing: liveAtPay.pricing, quoteBreakdown: liveAtPay.breakdown } : {}),
        }
        const payload = bookingStateToConfirmedUpsertPayload(merged, nextBookingId)
        bookNowSyncRetryRef.current = { payload, paymentIntent: pi }
        appendHomeActivity({
          title: 'Booking sync failed',
          subtitle: msg,
          jobType: bs.jobType ?? undefined,
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
    },
    [
      appendHomeActivity,
      appendHomeAlert,
      dispatchBooking,
      playUiEvent,
      refreshLocalFeeds,
      startPostPaymentDriverFlow,
    ],
  )

  const beginBrainFieldSecurePayment = useCallback(() => {
    closeFetchBrain()
    setHomeShellTab('services')
    setSheetSnap('full')
    const bs = bookingStateRef.current
    const needsDrop = bs.jobType != null && requiresDropoff(bs.jobType)
    setMapAttention(
      bs.pickupCoords && (!needsDrop || bs.dropoffCoords) ? 'route' : 'pickup',
    )
    bumpInteraction()
    if (fetchPerfIsEnabled()) {
      fetchPerfMark(undefined, '1_user_action', { action: 'brain_field_pay_deposit' })
    }
    const live = computePriceForState(bs, { allowRouteFallback: true })
    const pricing = live.ok ? live.pricing : bs.pricing
    if (!pricing) return
    const payAmount = pricing.depositDueNow ?? pricing.totalPrice ?? pricing.maxPrice
    void (async () => {
      setBookNowBusy(true)
      setBookNowError(null)
      setBookNowSyncError(null)
      bookNowSyncRetryRef.current = null
      try {
        const pi0 = await createPaymentIntent({
          amount: payAmount,
          bookingId: bookingStateRef.current.bookingId,
        })
        if (pi0.provider === 'stripe') {
          if (!isStripePublishableConfigured()) {
            throw new Error(
              'Stripe is enabled on the server. Set VITE_STRIPE_PUBLISHABLE_KEY for the app.',
            )
          }
          if (!pi0.clientSecret) {
            throw new Error('Stripe payment intent is missing clientSecret.')
          }
          setStripeBookCheckout({
            clientSecret: pi0.clientSecret,
            paymentIntent: pi0,
            payAmount,
          })
          return
        }
        const pi = await confirmDemoPaymentIntent(pi0)
        if (pi.status !== 'succeeded') {
          throw new Error(
            `Payment did not complete (status: ${pi.status}).${pi.lastError ? ` ${pi.lastError}` : ''}`,
          )
        }
        await finalizePaidBookingAfterCharge(pi, payAmount)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Payment could not be completed.'
        setBookNowError(msg)
        appendHomeActivity({
          title: 'Payment failed',
          subtitle: msg,
          jobType: bookingStateRef.current.jobType ?? undefined,
          priceMin: pricing.minPrice,
          priceMax: pricing.maxPrice,
        })
        appendHomeAlert({ title: 'Payment failed', body: msg })
        refreshLocalFeeds()
        void speakLine(
          'Payment did not go through. Check your card details or try again from the booking sheet.',
          { debounceKey: 'brain_field_pay_err', debounceMs: 0, withVoiceHold: true },
        )
      } finally {
        setBookNowBusy(false)
      }
    })()
  }, [
    appendHomeActivity,
    appendHomeAlert,
    bumpInteraction,
    closeFetchBrain,
    finalizePaidBookingAfterCharge,
    refreshLocalFeeds,
    speakLine,
  ])

  useEffect(() => () => clearDriverFlowTimers(), [clearDriverFlowTimers])

  useEffect(() => {
    void syncCustomerSessionCookie()
  }, [])

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

  /**
   * Reveal the booking sheet as soon as Home mounts — do not wait for map bootstrap.
   * The bootstrap overlay sits above (z-200); keeping `cardVisible` false until bootstrap
   * ended left the sheet `visibility:hidden` + `opacity:0`, which reads as a blank app
   * if map-ready never fires or bootstrap stalls.
   */
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
      const elapsed = Date.now() - lastInteractRef.current
      setIdleRemindLong(elapsed > IDLE_TO_FETCH_REMINDER_MS)
      const isSleepy = elapsed > IDLE_TO_SLEEPY_MS
      setIdleLong(isSleepy)
      if (isSleepy) setWasSleepy(true)
    }, 4000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!idleRemindLong || idleLong) return
    if (idleReminderSpokenRef.current) return
    if (isSpeechPlaying || voiceHoldCaption) return
    idleReminderSpokenRef.current = true
    setReminderLineEarsArmed(true)
    queueMicrotask(() => {
      speakLine(FETCH_IDLE_REMINDER_COPY, {
        debounceKey: 'fetch_idle_reminder_line',
        debounceMs: 0,
        withVoiceHold: true,
      })
    })
  }, [
    idleRemindLong,
    idleLong,
    isSpeechPlaying,
    voiceHoldCaption,
    speakLine,
  ])

  /** Dog ears only during the reminder TTS; disarm after it finishes (or if speech never starts). */
  useEffect(() => {
    if (!reminderLineEarsArmed) {
      reminderLineSpeechHeardRef.current = false
      return
    }
    if (isSpeechPlaying) {
      reminderLineSpeechHeardRef.current = true
    } else if (reminderLineSpeechHeardRef.current) {
      setReminderLineEarsArmed(false)
      reminderLineSpeechHeardRef.current = false
    }
  }, [isSpeechPlaying, reminderLineEarsArmed])

  useEffect(() => {
    if (!reminderLineEarsArmed) return
    const t = window.setTimeout(() => {
      if (!reminderLineSpeechHeardRef.current) {
        setReminderLineEarsArmed(false)
      }
    }, 15_000)
    return () => window.clearTimeout(t)
  }, [reminderLineEarsArmed])

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
    const needsDrop = requiresDropoff(jobType)
    const q = needsDrop
      ? (bookingState.currentQuestion ?? 'Add pickup and drop-off on the card.')
      : (bookingState.currentQuestion ?? 'Where are we picking up from?')
    const line = personality?.trim() ? `${personality.trim()} ${q}` : q
    speakLine(line, {
      debounceKey: 'fetch_home_pickup_prompt',
      debounceMs: 0,
      withVoiceHold: true,
    })
  }, [jobType, flowStep, bookingState.currentQuestion, speakLine])

  useEffect(() => {
    if (!jobType || flowStep !== 'dropoff') return
    if (requiresDropoff(jobType)) return
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
    setBookingState((prev) => {
      const next = applyProvisionalRouteIfNeeded(prev)
      return next === prev ? prev : next
    })
  }, [
    bookingState.jobType,
    bookingState.pickupCoords?.lat,
    bookingState.pickupCoords?.lng,
    bookingState.dropoffCoords?.lat,
    bookingState.dropoffCoords?.lng,
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
    if (shellShopOrChat) {
      setUserDroppedPin(null)
      setMysteryPanel({ mode: 'closed' })
      setStreetViewPosition(null)
    }
  }, [shellShopOrChat])

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

  const onServiceInfoConfirmBooking = useCallback(
    (jt: BookingJobType) => {
      const line = ADVANCED_SERVICE_MENU_OPTIONS.find((o) => o.jobType === jt)?.personalityLine
      if (line) {
        pendingServicePersonalityRef.current = line
        setServicePersonalityLine(line)
      }
      commitJobTypeSelection(jt)
      setSheetSnap('compact')
    },
    [commitJobTypeSelection],
  )

  const openIntentCameraPicker = useCallback(() => {
    bumpInteraction()
    requestAnimationFrame(() => intentCameraInputRef.current?.click())
  }, [bumpInteraction])

  const onIntentFetchIt = useCallback(() => {
    bumpInteraction()
    const junkOpt = LANDING_PRIMARY_SERVICES.find((o) => o.jobType === 'junkRemoval')
    if (junkOpt) {
      pendingServicePersonalityRef.current = junkOpt.fetchPersonalityExample
      setServicePersonalityLine(junkOpt.fetchPersonalityExample)
    }
    commitJobTypeSelection('junkRemoval')
    setSheetSnap('compact')
  }, [bumpInteraction, commitJobTypeSelection])

  const onIntentSheetPullExpand = useCallback(() => {
    bumpInteraction()
    setSheetSnap((s) => {
      if (s === 'closed') return 'compact'
      if (s === 'compact') return 'half'
      if (s === 'half') return 'full'
      return s
    })
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
      if (fetchPerfIsEnabled()) {
        fetchPerfMark(undefined, '1_user_action', {
          action: 'confirm_pin_address',
          field: 'pickup',
        })
      }
      playUiEvent('pin_drop')
      applyAddressSelection('pickup', {
        field: 'pickup',
        formattedAddress: place.formattedAddress,
        placeId: place.placeId,
        coords: place.coords,
        name: place.name,
      })
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
      setPickupLockInCelebrateKey((k) => k + 1)
      const line = suburbCommentaryLine(place.suburb)
      if (line) {
        speakLine(line, {
          debounceKey: 'suburb_pickup',
          debounceMs: 0,
          withVoiceHold: true,
        })
      }
    },
    [applyAddressSelection, playUiEvent, speakLine],
  )

  const onDropoffResolved = useCallback(
    (place: ResolvedPlace) => {
      if (fetchPerfIsEnabled()) {
        fetchPerfMark(undefined, '1_user_action', {
          action: 'confirm_pin_address',
          field: 'dropoff',
        })
      }
      playUiEvent('success')
      applyAddressSelection('dropoff', {
        field: 'dropoff',
        formattedAddress: place.formattedAddress,
        placeId: place.placeId,
        coords: place.coords,
        name: place.name,
      })
      const line = suburbCommentaryLine(place.suburb)
      if (line) {
        speakLine(line, {
          debounceKey: 'suburb_dropoff',
          debounceMs: 0,
          withVoiceHold: true,
        })
      }
    },
    [applyAddressSelection, playUiEvent, speakLine],
  )

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
    setScanFiles([])
    setScanThumbs([])
    intentScanFileCountRef.current = 0
    setMapAttention('none')
    setBookNowError(null)
    setBookNowBusy(false)
    setBookNowSyncError(null)
    setBookNowSyncRetryBusy(false)
    bookNowSyncRetryRef.current = null
    setShowDemoTimelineOnly(false)
    setRatingSubmitBusy(false)
    setRatingSubmitError(null)
    lastJobCompletionSpokenBookingIdRef.current = null
    setChatBookingHintSource(null)
    setReelFetchItDelivery(null)
    bumpInteraction()
  }, [bumpInteraction, clearDriverFlowTimers])

  /** Brain header back / Escape: leave neural chat and land on default service selector (booking reset + sheet). */
  const exitBrainChatToServiceSelector = useCallback(() => {
    closeFetchBrain()
    goBackToIntent()
    setHomeShellTab('services')
    setSheetSnap('full')
  }, [closeFetchBrain, goBackToIntent])

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

  const applyFetchAiBookingPatch = useCallback(
    async (patch: FetchAiBookingPatch | null, source: ChatBookingHintSource) => {
      if (!patch) return
      const geoPu =
        patch.pickupAddressText && mapsJsReady
          ? await geocodeAddressTextAu(patch.pickupAddressText)
          : null
      const geoDo =
        patch.dropoffAddressText && mapsJsReady
          ? await geocodeAddressTextAu(patch.dropoffAddressText)
          : null

      const merged = (() => {
        let s = bookingStateRef.current
        if (patch.jobType) {
          s = selectHomeJobType(s, patch.jobType).bookingState
        }
        if (geoPu) {
          s = handleUserInput(
            {
              text: '',
              source: 'quick_action',
              addressSelection: {
                field: 'pickup',
                formattedAddress: geoPu.formattedAddress,
                placeId: geoPu.placeId,
                coords: geoPu.coords,
                ...(geoPu.name ? { name: geoPu.name } : {}),
              },
            },
            s,
          ).bookingState
        } else if (patch.pickupAddressText?.trim()) {
          s = { ...s, pickupAddressText: patch.pickupAddressText.trim() }
          s.flowStep = deriveFlowStep(s)
        }
        const jt = s.jobType
        if (jt && requiresDropoff(jt)) {
          if (geoDo) {
            s = handleUserInput(
              {
                text: '',
                source: 'quick_action',
                addressSelection: {
                  field: 'dropoff',
                  formattedAddress: geoDo.formattedAddress,
                  placeId: geoDo.placeId,
                  coords: geoDo.coords,
                  ...(geoDo.name ? { name: geoDo.name } : {}),
                },
              },
              s,
            ).bookingState
          } else if (patch.dropoffAddressText?.trim()) {
            s = { ...s, dropoffAddressText: patch.dropoffAddressText.trim() }
            s.flowStep = deriveFlowStep(s)
          }
        }
        if (patch.schedulePreference) {
          s = {
            ...s,
            fieldVoiceSchedulePreference: patch.schedulePreference,
            ...(patch.schedulePreference === 'asap' ? { fieldVoiceScheduledWindow: null } : {}),
          }
        }
        if (patch.scheduledWindowText) {
          s = { ...s, fieldVoiceScheduledWindow: patch.scheduledWindowText }
        }
        if (patch.extraStopsNote) {
          s = { ...s, fieldVoiceItineraryNote: patch.extraStopsNote }
        }
        if (patch.specialtyItems?.length) {
          s = {
            ...s,
            specialtyItemSlugs: mergeSpecialtyItemSlugs(s.specialtyItemSlugs, patch.specialtyItems),
          }
        }
        return s
      })()

      setBookingState(merged)

      setConfirmNonce((n) => n + 1)
      setChatBookingHintSource(source)

      if (patch.openBookingOnMap && source !== 'brain') {
        setChatNavRoute(null)
        setHomeMapExploreMode(false)
        setIntentAddressEntryActive(false)
        setHomeShellTab('services')
        setSheetSnap('full')
        const needsDrop = merged.jobType != null && requiresDropoff(merged.jobType)
        setMapAttention(
          merged.pickupCoords && (!needsDrop || merged.dropoffCoords) ? 'route' : 'pickup',
        )
      }
      bumpInteraction()

      if (source === 'brain' && brainBookingVoiceActiveRef.current) {
        const pu = merged.pickupPlace?.formattedAddress || merged.pickupAddressText?.trim()
        const du = merged.dropoffPlace?.formattedAddress || merged.dropoffAddressText?.trim()
        if (patch.pickupAddressText || patch.dropoffAddressText) {
          const key = `${pu}|${du}`
          if (key && key !== lastBrainAddressEchoKeyRef.current) {
            lastBrainAddressEchoKeyRef.current = key
            brainConvRef.current = appendBrainAssistantLinePersisted(
              brainConvRef.current,
              'I’ve dropped these addresses into your draft — please confirm they match what you said.',
              {
                kind: 'address_confirm',
                ...(pu ? { pickup: pu } : {}),
                ...(du ? { dropoff: du } : {}),
              },
            )
            setBrainConvRevision((n) => n + 1)
            appendBrainLearningEvent({
              kind: 'field_voice_step',
              note: `address card: ${[pu, du].filter(Boolean).join(' → ')}`.slice(0, 120),
            })
          }
        }
        pushBrainFieldPriceUi(merged)
      }
    },
    [mapsJsReady, bumpInteraction, pushBrainFieldPriceUi],
  )

  const runBrainAiUtterance = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (brainUtteranceInFlightRef.current) return
      brainUtteranceInFlightRef.current = true
      try {
      setBrainInteractionSheet(null)
      brainAbortRef.current?.abort()
      brainPlacesAbortRef.current?.abort()
      brainPlacesAbortRef.current = null
      const ac = new AbortController()
      brainAbortRef.current = ac

      playUiEvent('processing_start')

      const preSnap = buildBrainAccountSnapshot({
        brainChatLines: brainConvRef.current.map(brainStoredToCatalogLine),
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
        brainChatLines: brainConvRef.current.map(brainStoredToCatalogLine),
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
        setBrainLastReply(null)
        const { reply, navigation, interaction, bookingPatch, perfTiming } = await postFetchAiChatStream(
          messages,
          {
            signal: ac.signal,
            locale: 'en-AU',
            context: {
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              ...(geo ? geo : {}),
              ...(mem ? { userMemory: mem } : {}),
              brainAccountIntel: buildBrainAccountIntelForAi(intelSnap),
              ...(learn ? { brainLearningMemory: learn } : {}),
              ...(placesSummaryBlock ? { nearbyExploreSummary: placesSummaryBlock } : {}),
              ...(brainBookingVoiceActiveRef.current
                ? { brainSessionGoal: 'booking_voice' as const }
                : {}),
              ...(brainBookingVoiceActiveRef.current && bookingStateRef.current.scan?.result
                ? {
                    brainBookingScanSummary: buildBrainBookingScanSummaryFromPhoto(
                      bookingStateRef.current.scan.result as unknown as PhotoScanResult,
                    ).slice(0, 1200),
                  }
                : {}),
            },
            perfRunId,
            onToken: (t) => {
              setBrainLastReply((prev) => (prev == null ? '' : prev) + t)
            },
          },
        )
        setBrainAiPending(false)
        if (ac.signal.aborted) return
        if (navigation?.active) applyChatNavigation(navigation)
        if (perfRunId && perfTiming) fetchPerfSetServerTiming(perfRunId, perfTiming)

        if (interaction?.type === 'choices') {
          setBrainFieldPlaces(null)
          setBrainInteractionSheet({
            choices: interaction.choices,
            ...(interaction.prompt ? { prompt: interaction.prompt } : {}),
            ...(interaction.freeformHint ? { freeformHint: interaction.freeformHint } : {}),
          })
        }

        brainConvRef.current = persistBrainChatExchange(prior, trimmed, reply)
        setBrainConvRevision((n) => n + 1)
        setBrainLastReply(reply)
        if (bookingPatch) {
          await applyFetchAiBookingPatch(bookingPatch, 'brain')
        } else if (brainBookingVoiceActiveRef.current) {
          pushBrainFieldPriceUi(bookingStateRef.current)
        }
        setBrainSurfaceSpeaking(true)
        try {
          await speakLine(reply, {
            debounceKey: 'fetch_ai_brain',
            debounceMs: 0,
            perfRunId,
            withVoiceHold: true,
          })
        } finally {
          setBrainSurfaceSpeaking(false)
        }
        if (
          brainBookingVoiceActiveRef.current &&
          interaction?.type !== 'choices' &&
          !wantRestaurants
        ) {
          setBrainVoiceRelistenEpoch((n) => n + 1)
        }
      } catch (e) {
        setBrainAiPending(false)
        if (ac.signal.aborted) return
        brainConvRef.current = removeLastBrainLineIfUser(brainConvRef.current)
        setBrainConvRevision((n) => n + 1)
        const code = e instanceof Error ? e.message : ''
        let errLine: string
        if (
          code === CHAT_ERROR_OPENAI_NOT_CONFIGURED ||
          code === CHAT_ERROR_ANTHROPIC_NOT_CONFIGURED
        ) {
          errLine = 'The assistant needs server configuration before I can help from here.'
        } else if (
          code === CHAT_ERROR_OPENAI_REQUEST_FAILED ||
          code === CHAT_ERROR_LLM_REQUEST_FAILED
        ) {
          errLine = 'The chat service had a problem. Try again in a moment.'
        } else if (code === CHAT_ERROR_NETWORK) {
          errLine = "I can't reach the Fetch server from the brain view."
        } else {
          errLine = 'Something went wrong. Try again or close to return home.'
        }
        setBrainLastReply(errLine)
        setBrainSurfaceSpeaking(true)
        try {
          await speakLine(errLine, {
            debounceKey: 'fetch_ai_brain_err',
            debounceMs: 0,
            allowBrowserFallback: true,
          })
        } finally {
          setBrainSurfaceSpeaking(false)
        }
      } finally {
        if (brainAbortRef.current === ac) brainAbortRef.current = null
      }
      } finally {
        brainUtteranceInFlightRef.current = false
      }
    },
    [
      applyChatNavigation,
      applyFetchAiBookingPatch,
      mapsJsReady,
      playUiEvent,
      pushBrainFieldPriceUi,
      speakLine,
      userMapLocation,
    ],
  )

  const runBrainFieldScanFollowUp = useCallback(
    async (photoResult: PhotoScanResult, ac: AbortController) => {
      if (!brainBookingVoiceActiveRef.current) return
      const scanForPrompt = buildBrainBookingScanSummaryFromPhoto(photoResult)
      if (!scanForPrompt.trim()) return

      const synthetic =
        'Fetch internal turn: the client just finished a photo scan; structured facts are in server context. You already spoke a user-facing description in the thread. Now ask what they want next (scope, timing, stairs or access if relevant). You MUST include a four-choice sheet aligned with your question. Do not re-list every item.'

      const messages: FetchAiChatMessage[] = [
        ...brainLinesToApiMessages(brainConvRef.current).slice(-12),
        { role: 'user', content: synthetic },
      ]

      const intelSnap = buildBrainAccountSnapshot({
        brainChatLines: brainConvRef.current.map(brainStoredToCatalogLine),
      })

      const geo =
        userMapLocation != null
          ? { latitude: userMapLocation.lat, longitude: userMapLocation.lng }
          : undefined
      const mem = buildFetchUserMemoryContext()
      const learn = buildFetchBrainLearningContext()
      const perfRunId = fetchPerfIsEnabled() ? createPerfRunId('brain_scan_follow') : undefined

      setBrainLastReply(null)
      try {
        const { reply, interaction, bookingPatch, perfTiming } = await postFetchAiChatStream(
          messages,
          {
            signal: ac.signal,
            locale: 'en-AU',
            context: {
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              ...(geo ? geo : {}),
              ...(mem ? { userMemory: mem } : {}),
              brainAccountIntel: buildBrainAccountIntelForAi(intelSnap),
              ...(learn ? { brainLearningMemory: learn } : {}),
              brainSessionGoal: 'booking_voice' as const,
              brainBookingScanSummary: scanForPrompt.slice(0, 1200),
            },
            perfRunId,
            onToken: (t) => {
              setBrainLastReply((prev) => (prev == null ? '' : prev) + t)
            },
          },
        )
        if (ac.signal.aborted) return
        if (perfRunId && perfTiming) fetchPerfSetServerTiming(perfRunId, perfTiming)

        if (interaction?.type === 'choices') {
          setBrainFieldPlaces(null)
          setBrainInteractionSheet({
            choices: interaction.choices,
            ...(interaction.prompt ? { prompt: interaction.prompt } : {}),
            ...(interaction.freeformHint ? { freeformHint: interaction.freeformHint } : {}),
          })
        }

        brainConvRef.current = appendBrainAssistantLinePersisted(brainConvRef.current, reply)
        setBrainConvRevision((n) => n + 1)
        setBrainLastReply(reply)

        if (bookingPatch) {
          await applyFetchAiBookingPatch(bookingPatch, 'brain')
        }

        setBrainSurfaceSpeaking(true)
        try {
          await speakLine(reply, {
            debounceKey: 'brain_scan_followup',
            debounceMs: 0,
            ...(perfRunId ? { perfRunId } : {}),
            withVoiceHold: true,
          })
        } finally {
          setBrainSurfaceSpeaking(false)
        }
        if (brainBookingVoiceActiveRef.current && interaction?.type !== 'choices') {
          setBrainVoiceRelistenEpoch((n) => n + 1)
        }
      } catch (e) {
        if (ac.signal.aborted) return
        const code = e instanceof Error ? e.message : ''
        let errLine: string
        if (
          code === CHAT_ERROR_OPENAI_NOT_CONFIGURED ||
          code === CHAT_ERROR_ANTHROPIC_NOT_CONFIGURED
        ) {
          errLine = 'The assistant needs server configuration before I can continue after the scan.'
        } else if (
          code === CHAT_ERROR_OPENAI_REQUEST_FAILED ||
          code === CHAT_ERROR_LLM_REQUEST_FAILED
        ) {
          errLine = 'The chat service had a problem right after your scan. Try a quick message.'
        } else if (code === CHAT_ERROR_NETWORK) {
          errLine = "I can't reach the Fetch server to continue after the scan."
        } else {
          errLine = 'Tell me in your own words what you want done — I had trouble with the follow-up prompt.'
        }
        brainConvRef.current = appendBrainAssistantLinePersisted(brainConvRef.current, errLine)
        setBrainConvRevision((n) => n + 1)
        setBrainLastReply(errLine)
        setBrainSurfaceSpeaking(true)
        try {
          await speakLine(errLine, {
            debounceKey: 'brain_scan_followup_err',
            debounceMs: 0,
            allowBrowserFallback: true,
            withVoiceHold: true,
          })
        } finally {
          setBrainSurfaceSpeaking(false)
        }
      }
    },
    [applyFetchAiBookingPatch, speakLine, userMapLocation],
  )

  const handleBrainChoiceSheetSubmit = useCallback(
    (t: string) => {
      setBrainInteractionSheet(null)
      const trimmed = t.trim()
      const fieldPriceChoice = (FIELD_VOICE_PRICE_CHOICES as readonly string[]).includes(trimmed)
      if (brainBookingVoiceActiveRef.current && fieldPriceChoice) {
        if (trimmed === 'Yes — happy with that') {
          appendBrainLearningEvent({
            kind: 'field_voice_step',
            note: 'user accepted field estimate',
          })
          void speakLine(
            'Love it. Open the booking sheet when you’re ready to lock the job in.',
            {
              debounceKey: 'field_price_ok',
              debounceMs: 0,
              withVoiceHold: true,
            },
          )
          return
        }
        if (trimmed === 'Add 5% courtesy off') {
          lastBrainFieldPriceKeyRef.current = ''
          appendBrainLearningEvent({ kind: 'field_voice_step', note: 'user requested 5% courtesy' })
          setBookingState((prev) => {
            const next = { ...prev, fieldVoiceDiscountPercent: 5 }
            queueMicrotask(() => {
              pushBrainFieldPriceUi(next)
            })
            return next
          })
          void speakLine('Done — I’ve applied five percent courtesy to that estimate.', {
            debounceKey: 'field_price_5',
            debounceMs: 0,
            withVoiceHold: true,
          })
          return
        }
        if (trimmed === 'I have another question') {
          void runBrainAiUtterance('I have a follow-up question about the price or the job details.')
          return
        }
        if (trimmed === 'Change the addresses') {
          void runBrainAiUtterance('I need to update the pickup or drop-off address.')
          return
        }
      }
      void runBrainAiUtterance(trimmed)
    },
    [runBrainAiUtterance, speakLine, pushBrainFieldPriceUi],
  )

  useEffect(() => {
    if (homeBrainFlow !== 'brain') return
    if (!brainBookingVoiceActiveRef.current || brainFieldPhotoPromptedRef.current) return
    if (brainConvRef.current.length > 0) return
    brainFieldPhotoPromptedRef.current = true
    brainConvRef.current = appendBrainAssistantLinePersisted(
      brainConvRef.current,
      'Snap a clear photo of what we’re moving — tap the + clip. I’ll scan it, tally items, and tighten your quote.',
    )
    setBrainConvRevision((n) => n + 1)
    appendBrainLearningEvent({
      kind: 'field_voice_step',
      note: 'photo prompt (empty field thread)',
    })
  }, [homeBrainFlow, brainConvRevision])

  const dismissBrainFieldPlaces = useCallback(() => {
    setBrainFieldPlaces(null)
    closeFetchBrain()
    setChatNavRoute(null)
    setHomeMapExploreMode(false)
    setIntentAddressEntryActive(false)
    setHomeShellTab('services')
    setSheetSnap('full')
    bumpInteraction()
  }, [closeFetchBrain, bumpInteraction])

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

  const onBrainAssistantChatFeedback = useCallback(
    (args: { turnId: string; rating: 1 | -1; text: string }) => {
      appendBrainLearningEvent({
        kind: 'chat_reply_feedback',
        rating: args.rating,
        note: args.text.slice(0, 400),
      })
    },
    [],
  )

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
          setSheetSnap('half')
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
      setSheetSnap,
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
      setSheetSnap('full')
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
    setHomeMapExploreMode(false)
    setHomeShellTab('marketplace')
  }, [bumpInteraction])

  const onHomeShellTabChange = useCallback(
    (tab: HomeShellTab) => {
      bumpInteraction()
      setHomeShellTab(tab)
      if (tab !== 'marketplace') {
        setDropsProductHandoff(null)
        setDropsListingHandoff(null)
      }
      if (tab === 'reels' || tab === 'marketplace' || tab === 'chat') {
        if (!chatNavRoute) setHomeMapExploreMode(false)
        setSheetSnap('closed')
      } else {
        if (!chatNavRoute) setHomeMapExploreMode(false)
        setSheetSnap((s) => (s === 'closed' ? 'compact' : s))
      }
    },
    [bumpInteraction, chatNavRoute],
  )

  const onDropsCommerceAction = useCallback(
    (
      commerce: DropsCommerceTarget,
      action: 'fetch_it' | 'buy_now' | 'place_bid',
      meta?: { bidAmountAud?: number },
    ) => {
      bumpInteraction()
      if (action === 'place_bid' && meta?.bidAmountAud != null) {
        appendHomeAlert({
          title: 'Bid (demo)',
          body: `Offer $${meta.bidAmountAud} AUD recorded — production will sync bids to the server.`,
        })
      }
      const mode = action === 'fetch_it' ? 'sheet' : action === 'place_bid' ? 'bid' : 'buyNow'
      setDropsProductHandoff(null)
      setDropsListingHandoff(null)
      if (commerce.kind === 'marketplace_product') {
        setDropsProductHandoff({ productId: commerce.productId, mode: mode === 'bid' ? 'sheet' : mode })
        onHomeShellTabChange('marketplace')
      } else if (commerce.kind === 'buy_sell_listing') {
        if (action === 'fetch_it') {
          bumpInteraction()
          setDropsListingHandoff({ listingId: commerce.listingId, mode: 'sheet' })
          onHomeShellTabChange('marketplace')
          return
        }
        setDropsListingHandoff({ listingId: commerce.listingId, mode })
        onHomeShellTabChange('marketplace')
      }
    },
    [appendHomeAlert, bumpInteraction, onHomeShellTabChange],
  )

  const clearDropsProductHandoff = useCallback(() => setDropsProductHandoff(null), [])
  const clearDropsListingHandoff = useCallback(() => setDropsListingHandoff(null), [])

  useMessagesUnreadPolling(Boolean(loadSession()?.email?.trim()), 12_000, setMessagesUnread)

  const openListingChatHandoff = useCallback(async (listingId: string) => {
    try {
      await syncCustomerSessionCookie()
      const { thread } = await createMessageThread({ kind: 'listing', listingId })
      setPendingChatThreadId(thread.id)
      setHomeShellTab('chat')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not open chat'
      appendHomeAlert({ title: 'Messages', body: msg })
    }
  }, [appendHomeAlert])

  const onChatHubOpenField = useCallback(() => {
    bumpInteraction()
    setHomeShellTab('services')
    setSheetSnap('half')
    setHomeBrainFlow('brain')
  }, [bumpInteraction])

  const onChatFetchItListing = useCallback((listing: PeerListing) => {
    bumpInteraction()
    setChatBrainHandoff({ listingId: listing.id, title: listing.title })
    setHomeShellTab('services')
  }, [bumpInteraction])

  const onBuySellBookDriver = useCallback(() => {
    bumpInteraction()
    setHomeShellTab('services')
    setSheetSnap('half')
  }, [bumpInteraction])

  useEffect(() => {
    if (!chatBrainHandoff || homeShellTab !== 'services') return
    setHomeBrainFlow('brain')
    setSheetSnap('half')
    const text = `Book a Fetch job for my marketplace item "${chatBrainHandoff.title}" (listing ${chatBrainHandoff.listingId}).`
    brainConvRef.current = appendBrainUserLineEphemeral(brainConvRef.current, text)
    saveBrainChatLines(brainConvRef.current)
    setBrainConvRevision((n) => n + 1)
    setChatBrainHandoff(null)
  }, [chatBrainHandoff, homeShellTab])

  /**
   * Opens Fetch Brain from a trip card Help control: closes the sheet for focus on chat/voice.
   * Structured steps (addresses, scan, payment) remain on the home sheet when the user returns.
   */
  const openBrainFromHome = useCallback(() => {
    bumpInteraction()
    brainBookingVoiceActiveRef.current = true
    brainFieldPhotoPromptedRef.current = false
    lastBrainFieldPriceKeyRef.current = ''
    lastBrainAddressEchoKeyRef.current = ''
    setBrainAutoVoiceEpoch((n) => n + 1)
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
  }, [bumpInteraction, setSheetSnap])

  const onShowPlaceOnMap = useCallback((lat: number, lng: number) => {
    const m = homeMapRef.current
    if (!m) return
    m.panTo({ lat, lng })
    const z = m.getZoom()
    if ((z ?? 0) < 14) m.setZoom(14)
  }, [])

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
    setHomeShellTab('services')
    setHomeMapExploreMode(true)
    setSheetSnap('compact')
    bumpInteraction()
    playUiEvent('success')
    setMysteryPanel({ mode: 'loading', flavor: 'adventure' })
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
        flavor: 'adventure',
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
        flavor: 'adventure',
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
      setMysteryPanel({ mode: 'ready', flavor: 'adventure', bundle, fetchStory: reply })
    } catch {
      setMysteryPanel({
        mode: 'ready',
        flavor: 'adventure',
        bundle,
        fetchStory:
          bundle.placeSummary ||
          'A mystery spot on your map — head over and see what you find.',
      })
    }
  }, [
    bumpInteraction,
    explorePois,
    onShowPlaceOnMap,
    playUiEvent,
    speakLine,
    userMapLocation,
    setHomeShellTab,
    setSheetSnap,
  ])

  const handleRestaurantWonder = useCallback(async () => {
    const loc = userMapLocation
    const svc = mapPlacesSvcRef.current
    if (!loc || !svc) {
      void speakLine('Turn on location for a restaurant pick nearby.', {
        debounceKey: 'restaurant_wonder_need_loc',
        debounceMs: 2200,
      })
      playUiEvent('error')
      return
    }
    setHomeShellTab('services')
    setHomeMapExploreMode(true)
    setSheetSnap('compact')
    bumpInteraction()
    playUiEvent('success')
    setMysteryPanel({ mode: 'loading', flavor: 'restaurant' })
    const preferFood = (list: ExploreMapPoi[]) => {
      const dining = list.filter((p) => p.kind === 'food' || p.kind === 'cafe')
      return dining.length ? dining : list
    }
    let candidates = preferFood(explorePois.filter((p) => p.placeId))
    if (candidates.length < 2) {
      const batch = await runRestaurantNearbyBatch(svc, loc)
      if (batch.length) setExplorePois(batch)
      candidates = preferFood(batch.filter((p) => p.placeId))
    }
    const seed = pickRandomMysteryPoi(candidates)
    if (!seed?.placeId) {
      setMysteryPanel({
        mode: 'error',
        flavor: 'restaurant',
        message:
          'No dining spots nearby with details. Open Maps, tap Food or Find nearby, then try again.',
      })
      return
    }
    onShowPlaceOnMap(seed.lat, seed.lng)
    const bundle = await fetchPlaceDetailsForMystery(svc, seed.placeId)
    if (!bundle) {
      setMysteryPanel({
        mode: 'error',
        flavor: 'restaurant',
        message: 'Could not load that place from Google. Try again.',
      })
      return
    }
    const messages: FetchAiChatMessage[] = [
      {
        role: 'user',
        content: `You are Fetch. In 3–6 short sentences, describe what makes this venue a worthwhile meal stop — vibe, cuisine fit, and who it suits. Only build on the facts in the summary and address — do not invent opening hours, prices, or features not implied there.\n\nPlace name: ${bundle.name}\nSummary: ${bundle.placeSummary || bundle.formattedAddress || 'Unknown'}`,
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
      setMysteryPanel({ mode: 'ready', flavor: 'restaurant', bundle, fetchStory: reply })
    } catch {
      setMysteryPanel({
        mode: 'ready',
        flavor: 'restaurant',
        bundle,
        fetchStory:
          bundle.placeSummary ||
          'A spot worth trying on your map — swing by and see if it’s your kind of meal.',
      })
    }
  }, [
    bumpInteraction,
    explorePois,
    onShowPlaceOnMap,
    playUiEvent,
    speakLine,
    userMapLocation,
    setHomeShellTab,
    setSheetSnap,
  ])

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

  /** Map header search line — open neural chat with keyboard focus (no tunnel). */
  const openChatFromMapHeader = useCallback(() => {
    bumpInteraction()
    if (shellShopOrChat) {
      setHomeShellTab('services')
    }
    setIntentAddressEntryActive(false)
    setSheetSnap('closed')
    brainBookingVoiceActiveRef.current = true
    brainFieldPhotoPromptedRef.current = false
    lastBrainFieldPriceKeyRef.current = ''
    lastBrainAddressEchoKeyRef.current = ''
    setBrainAutoVoiceEpoch((n) => n + 1)
    setOrbAwakened(true)
    setBrainSkipReveal(true)
    setHomeBrainFlow('brain')
    setBrainComposerFocusNonce((n) => n + 1)
  }, [bumpInteraction, shellShopOrChat, setHomeShellTab, setSheetSnap])

  const routePathFromState =
    bookingState.route?.path?.map((c) => ({ lat: c.lat, lng: c.lng })) ?? null

  const { mapRoutePath, bookingRouteProvisional } = useMemo(() => {
    if (chatNavRoute?.path && chatNavRoute.path.length >= 2) {
      return { mapRoutePath: chatNavRoute.path, bookingRouteProvisional: false }
    }
    const pc = bookingState.pickupCoords
    if (pc && bookingState.mode === 'searching') {
      const d = 0.0022
      return {
        mapRoutePath: [
          { lat: pc.lat + d, lng: pc.lng - d * 0.4 },
          { lat: pc.lat, lng: pc.lng },
          { lat: pc.lat - d * 0.55, lng: pc.lng + d * 0.65 },
        ],
        bookingRouteProvisional: false,
      }
    }
    const hideFullJob = shouldHideJobRouteDuringLiveTracking(
      bookingState.bookingStatus,
      bookingState.bookingId,
    )
    if (routePathFromState && routePathFromState.length >= 2 && !hideFullJob) {
      return {
        mapRoutePath: routePathFromState,
        bookingRouteProvisional: Boolean(bookingState.route?.provisional),
      }
    }
    if (hideFullJob) {
      return { mapRoutePath: null, bookingRouteProvisional: false }
    }

    const crowEligible =
      jobType != null &&
      requiresDropoff(jobType) &&
      bookingState.pickupCoords &&
      bookingState.dropoffCoords &&
      (!routePathFromState || routePathFromState.length < 2)

    if (crowEligible) {
      const p = bookingState.pickupCoords!
      const d = bookingState.dropoffCoords!
      return {
        mapRoutePath: [
          { lat: p.lat, lng: p.lng },
          { lat: d.lat, lng: d.lng },
        ],
        bookingRouteProvisional: true,
      }
    }

    return { mapRoutePath: routePathFromState, bookingRouteProvisional: false }
  }, [
    chatNavRoute?.path,
    routePathFromState,
    jobType,
    bookingState.pickupCoords,
    bookingState.dropoffCoords,
    bookingState.mode,
    bookingState.bookingStatus,
    bookingState.bookingId,
    bookingState.route?.provisional,
  ])

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
    if (homeMapExploreMode) {
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
    const id = bookingState.bookingId
    const st = bookingState.bookingStatus
    if (!shouldPollMarketplaceBooking(id, st)) return
    const unsub = subscribeMarketplaceStream(() => {
      void (async () => {
        try {
          const row = await fetchBooking(id!)
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
      })()
    })
    return unsub
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
  const homeSheetNavMapChrome = false
  const mapsOrbDockOnSheetTop = false
  const mapExploreMinimalChrome = false
  const orbTopLeftOnNavMap = false

  useEffect(() => {
    if (homeSheetNavMapChrome && !mapsOrbDockOnSheetTop) setHomeOrbBottomPx(null)
  }, [homeSheetNavMapChrome, mapsOrbDockOnSheetTop])

  useEffect(() => {
    if (!navStripActive && !homeMapExploreMode) setMapFollowUser(false)
  }, [navStripActive, homeMapExploreMode])

  useEffect(() => {
    if (sheetSnap !== 'closed' && shellShopOrChat) setHomeMapExploreMode(false)
  }, [sheetSnap, shellShopOrChat])

  useEffect(() => {
    if (shellShopOrChat) setExplorePois([])
  }, [shellShopOrChat])

  const orbMapAttention =
    chatNavRoute != null || homeMapExploreMode ? 'navigation' : mapAttention

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

  /** Flat rectangles — no heavy card/pill border (step-2 address + labor details). */
  const bookingFlatFieldClass =
    'fetch-stage-text-input fetch-home-address-input fetch-home-address-input--flat fetch-home-stage-field-input mt-0 w-full rounded-xl px-3.5 py-3 ring-0'

  /** Tighter step-2 address fields (pickup / drop-off / dual). */
  const bookingAddressFieldClass =
    'fetch-stage-text-input fetch-home-address-input fetch-home-address-input--flat fetch-home-stage-field-input mt-0 w-full rounded-lg px-3 py-2 ring-0 text-[14px] leading-snug'

  /** Minimal A→B route entry (map-first booking) — flat, darker border, 16px for mobile zoom guard. */
  const bookingAddressFieldMinimalClass =
    'fetch-stage-text-input fetch-home-address-input fetch-home-address-input--ab-minimal fetch-home-stage-field-input mt-0 w-full rounded-md border border-zinc-500/85 bg-white px-3 py-2.5 shadow-none ring-0 placeholder:text-zinc-500 text-[16px] leading-snug dark:border-zinc-500 dark:bg-zinc-950/80 dark:placeholder:text-zinc-400'

  /** Inside unified pickup/drop box: no per-field border; outer `fetch-home-ab-unified` frames both. */
  const bookingAddressFieldAbUnifiedInnerClass =
    'fetch-stage-text-input fetch-home-address-input fetch-home-address-input--ab-unified-inner fetch-home-stage-field-input min-w-0 flex-1 border-0 bg-transparent py-2.5 shadow-none ring-0 placeholder:text-zinc-500 text-[16px] leading-snug dark:placeholder:text-zinc-400'

  const inputClass = `${bookingFlatFieldClass} mt-1.5`

  const showDualAddresses = Boolean(
    jobType && requiresDropoff(jobType) && (flowStep === 'pickup' || flowStep === 'dropoff'),
  )
  const showIntent = !jobType || flowStep === 'intent'

  const brainImmersive = useMemo(
    () => homeBrainFlow === 'clarity' || homeBrainFlow === 'brain',
    [homeBrainFlow],
  )

  const intentAiScannerMapOverlay = useMemo(
    () =>
      Boolean(
        showIntent &&
          homeShellTab === 'services' &&
          !chatNavRoute &&
          cardVisible &&
          homeBrainFlow == null &&
          !brainImmersive,
      ),
    [showIntent, homeShellTab, chatNavRoute, cardVisible, homeBrainFlow, brainImmersive],
  )

  const intentJunkEstimate = useMemo(() => {
    if (!intentAiScannerMapOverlay || !bookingState.scan.result) return null
    return computeIntentJunkRemovalEstimate(bookingState)
  }, [intentAiScannerMapOverlay, bookingState])

  /** Services-tab booking after job pick: map-first sheet, minimal chrome. */
  const bookingSheetFocusMode = useMemo(
    () =>
      homeShellTab === 'services' &&
      Boolean(cardVisible && homeBrainFlow == null && !brainImmersive) &&
      Boolean(jobType && !showIntent),
    [homeShellTab, cardVisible, homeBrainFlow, brainImmersive, jobType, showIntent],
  )

  const showPickup = Boolean(jobType && flowStep === 'pickup' && !showDualAddresses)
  const showDropoff = Boolean(jobType && flowStep === 'dropoff' && !showDualAddresses)
  const postAddress =
    Boolean(jobType) && !showIntent && !showPickup && !showDropoff && !showDualAddresses
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

  const mapBackBubbleAriaLabel = useMemo(() => {
    if (!bookingSheetFocusMode) return 'Back'
    if (showRouteReady || showBuildingRoute) return 'Change addresses'
    if (showLaborDetails || showScanner || showPostScan) return 'Start over'
    if (showDropoff) return 'Back to pickup'
    if (
      showDualAddresses &&
      jobType &&
      flowStep === 'dropoff' &&
      requiresDropoff(jobType)
    ) {
      return 'Back to pickup'
    }
    return 'Back'
  }, [
    bookingSheetFocusMode,
    showRouteReady,
    showBuildingRoute,
    showLaborDetails,
    showScanner,
    showPostScan,
    showDropoff,
    showDualAddresses,
    jobType,
    flowStep,
  ])

  const handleMapBackBubble = useCallback(() => {
    if (!bookingSheetFocusMode) return
    bumpInteraction()
    if (showDropoff) {
      goBackToPickup()
      return
    }
    if (showDualAddresses && jobType) {
      if (flowStep === 'dropoff' && requiresDropoff(jobType)) goBackToPickup()
      else goBackToIntent()
      return
    }
    if (showPickup) {
      goBackToIntent()
      return
    }
    if (showLaborDetails || showScanner) {
      goBackToIntent()
      return
    }
    if (showRouteReady || showBuildingRoute) {
      goBackToPickup()
      return
    }
    if (showPostScan) {
      goBackToIntent()
      return
    }
  }, [
    bookingSheetFocusMode,
    bumpInteraction,
    showDropoff,
    showDualAddresses,
    jobType,
    flowStep,
    showPickup,
    showLaborDetails,
    showScanner,
    showRouteReady,
    showBuildingRoute,
    showPostScan,
    goBackToPickup,
    goBackToIntent,
  ])

  const mapBackBubbleProps = useMemo(
    () =>
      bookingSheetFocusMode
        ? {
            onClick: handleMapBackBubble,
            ariaLabel: mapBackBubbleAriaLabel,
          }
        : null,
    [bookingSheetFocusMode, handleMapBackBubble, mapBackBubbleAriaLabel],
  )

  const mapHeaderAddressEntry = useMemo(() => {
    if (!mapsApiKey) return null
    if (bookingSheetFocusMode) return null
    if (homeBrainFlow != null) return null
    if (showPickup || showDropoff || showDualAddresses) return null
    if (chatNavRoute) return null
    if (intentAiScannerMapOverlay) return null

    const pu =
      bookingState.pickupAddressText?.trim() ||
      bookingState.pickupPlace?.formattedAddress?.trim() ||
      ''
    const du =
      bookingState.dropoffAddressText?.trim() ||
      bookingState.dropoffPlace?.formattedAddress?.trim() ||
      ''
    const needDrop = Boolean(jobType && requiresDropoff(jobType))

    let title = 'Ask Fetch anything…'
    if (jobType && !bookingState.pickupCoords) {
      title = 'Ask Fetch for a pickup address…'
    } else if (jobType && needDrop && !bookingState.dropoffCoords) {
      title = pu
        ? `Add drop-off — ${pu.length > 36 ? `${pu.slice(0, 33)}…` : pu}`
        : 'Ask Fetch for a drop-off address…'
    } else if (pu || (needDrop && du)) {
      const line = needDrop && du ? `${pu} · ${du}` : pu
      title = line.length > 52 ? `${line.slice(0, 49)}…` : line
    }

    return {
      title,
      disabled: false,
      onOpen: openChatFromMapHeader,
    }
  }, [
    mapsApiKey,
    bookingSheetFocusMode,
    homeBrainFlow,
    showPickup,
    showDropoff,
    showDualAddresses,
    chatNavRoute,
    bookingState.pickupCoords,
    bookingState.dropoffCoords,
    bookingState.pickupAddressText,
    bookingState.pickupPlace?.formattedAddress,
    bookingState.dropoffAddressText,
    bookingState.dropoffPlace?.formattedAddress,
    jobType,
    openChatFromMapHeader,
    intentAiScannerMapOverlay,
  ])

  const orbExpression: FetchOrbExpression = useMemo(() => {
    if (bookingSheetFocusMode) return 'idle'
    const brainImmersiveOrb = homeBrainFlow === 'clarity' || homeBrainFlow === 'brain'
    if (isSpeechPlaying) return 'speaking'
    if (orbBurstExpression) return orbBurstExpression
    if (!brainImmersiveOrb && brainSttListening) return 'listening'
    if (voiceHoldCaption) return 'thinking'
    if (bookNowBusy) return 'thinking'
    if (mysteryPanel.mode === 'loading') return 'searching'
    if (
      bookingAddressSuggestOpen &&
      (flowStep === 'pickup' || flowStep === 'dropoff' || showDualAddresses || showIntent)
    ) {
      return 'searching'
    }
    if (idleLong) return 'sleepy'
    if (flowStep === 'route' && jobType != null && requiresDropoff(jobType)) return 'focused'
    if (jobType && (flowStep === 'pickup' || flowStep === 'dropoff')) return 'curious'
    if (orbMapAttention === 'driver') return 'excited'
    if (orbMapAttention === 'route' || orbMapAttention === 'navigation') return 'focused'
    if (orbMapAttention === 'pickup' && orbAwakened) return 'curious'
    if (jobType) return 'proud'
    return 'awake'
  }, [
    bookingSheetFocusMode,
    isSpeechPlaying,
    orbBurstExpression,
    homeBrainFlow,
    brainSttListening,
    voiceHoldCaption,
    bookNowBusy,
    mysteryPanel.mode,
    bookingAddressSuggestOpen,
    flowStep,
    showIntent,
    showDualAddresses,
    idleLong,
    jobType,
    orbMapAttention,
    orbAwakened,
  ])

  const orbDockAutonomous =
    showIntent &&
    homeBrainFlow == null &&
    !isSpeechPlaying &&
    !voiceHoldCaption &&
    !bookNowBusy &&
    mysteryPanel.mode !== 'loading'

  const quoteLive = useMemo(
    () => computePriceForState(bookingState, { allowRouteFallback: true }),
    [bookingState],
  )
  const sheetDisplayPricing = quoteLive.ok ? quoteLive.pricing : bookingState.pricing
  const sheetDisplayBreakdown = quoteLive.ok ? quoteLive.breakdown : bookingState.quoteBreakdown
  const sheetQuoteError = !quoteLive.ok ? quoteLive.message : null

  const uberTripCard = import.meta.env.VITE_UBER_TRIP_CARD !== 'false'

  const tripSheetPhase: TripSheetPhase = useMemo(
    () =>
      deriveTripSheetPhase(bookingState, {
        showConfirm: false,
        showDualAddresses,
        showIntent,
        showPickup,
        showDropoff,
        showLaborDetails,
        showRouteReady,
        showBuildingRoute,
        showScanner,
        showPostScan,
        hasSheetPricing: sheetDisplayPricing != null,
        stripeCheckoutActive: stripeBookCheckout != null,
      }),
    [
      bookingState.bookingStatus,
      bookingState.paymentIntent?.status,
      showDualAddresses,
      showIntent,
      showPickup,
      showDropoff,
      showLaborDetails,
      showRouteReady,
      showBuildingRoute,
      showScanner,
      showPostScan,
      sheetDisplayPricing,
      stripeBookCheckout,
    ],
  )

  const mapStage = useMemo(() => {
    if (!jobType) return 'idle' as const
    return mapStageForTripSheetPhase(tripSheetPhase, bookingState.mode)
  }, [jobType, tripSheetPhase, bookingState.mode])

  const mapStageForHomeStep = mapStage

  const pickupDropoffScannerFitPadding = useMemo((): google.maps.Padding | null => {
    if (!uberTripCard || !bookingSheetFocusMode || !showScanner) return null
    const baseBottom = PICKUP_DROPOFF_SHEET_FIT_PADDING.bottom ?? 252
    return {
      ...PICKUP_DROPOFF_SHEET_FIT_PADDING,
      bottom: baseBottom + 88,
    }
  }, [uberTripCard, bookingSheetFocusMode, showScanner])

  const suppressHomeOrbForTrip = useMemo(
    () =>
      uberTripCard &&
      tripSheetPhaseSuppressesHomeOrb(tripSheetPhase) &&
      homeShellTab === 'services',
    [uberTripCard, tripSheetPhase, homeShellTab],
  )

  /** After drop-off, route preview is map-first — hide dock orb (trip card + nav strip carry actions). */
  const suppressHomeOrbForRoutePreview = useMemo(
    () =>
      homeShellTab === 'services' &&
      homeBrainFlow == null &&
      Boolean(jobType && requiresDropoff(jobType)) &&
      (showBuildingRoute || showRouteReady),
    [homeShellTab, homeBrainFlow, jobType, showBuildingRoute, showRouteReady],
  )

  /** Hide dock orb for the whole services booking sheet except price / payment (Stripe). */
  const suppressHomeOrbForBookingFlow = useMemo(
    () =>
      bookingSheetFocusMode &&
      uberTripCard &&
      tripSheetPhase !== 'review_price' &&
      tripSheetPhase !== 'pay_checkout',
    [bookingSheetFocusMode, uberTripCard, tripSheetPhase],
  )

  const suppressHomeOrbDock =
    suppressHomeOrbForTrip ||
    suppressHomeOrbForRoutePreview ||
    suppressHomeOrbForBookingFlow

  /** Dog ears only while the 1m reminder line is audibly playing (same dock contexts as before). */
  const fetchDogEarsActive = useMemo(
    () =>
      reminderLineEarsArmed &&
      isSpeechPlaying &&
      !suppressHomeOrbDock &&
      !orbTopLeftOnNavMap &&
      homeBrainFlow == null &&
      !bookingSheetFocusMode,
    [
      reminderLineEarsArmed,
      isSpeechPlaying,
      suppressHomeOrbDock,
      orbTopLeftOnNavMap,
      homeBrainFlow,
      bookingSheetFocusMode,
    ],
  )

  const addAddressWaypointRow = useCallback(() => {
    setAddressWaypointDrafts((rows) => (rows.length < 2 ? [...rows, ''] : rows))
  }, [])

  const removeAddressWaypointRow = useCallback((index: number) => {
    setAddressWaypointDrafts((rows) => rows.filter((_, i) => i !== index))
  }, [])

  const setAddressWaypointValue = useCallback((index: number, value: string) => {
    setAddressWaypointDrafts((prev) => {
      const next = [...prev]
      if (next[index] !== undefined) next[index] = value
      return next
    })
  }, [])

  const addressKeyboardFreeLayout =
    showPickup || showDropoff || showDualAddresses

  useEffect(() => {
    if (jobType) return
    const t = new Date()
    setRideScheduleDate(
      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`,
    )
    setRideForWhom('me')
    setAddressWaypointDrafts([])
  }, [jobType])

  useEffect(() => {
    if (!showIntent || orbTopLeftOnNavMap || suppressHomeOrbDock) {
      setIntentOrbHintBubble(false)
      return
    }
    setIntentOrbHintBubble(true)
    const t = window.setTimeout(() => setIntentOrbHintBubble(false), 10_000)
    return () => window.clearTimeout(t)
  }, [showIntent, orbTopLeftOnNavMap, suppressHomeOrbDock])

  const showTripRouteEstimateStrip =
    uberTripCard &&
    sheetDisplayPricing != null &&
    !isWireStatusTreatedAsPaid(bookingState.bookingStatus) &&
    (tripSheetPhase === 'confirm_route' || tripSheetPhase === 'job_scan')

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

  const bookingFlowBubble = useMemo((): string | null => {
    if (showDualAddresses) {
      const hint = !mapsApiKey
        ? 'Add a Google Maps API key to use addresses.'
        : 'Use address suggestions as you type — pickup first, then drop-off. Saved places work for either.'
      const title = 'Pickup & drop-off'
      const core = `${title}\n${hint}`
      return servicePersonalityLine?.trim()
        ? `${servicePersonalityLine.trim()}\n\n${core}`
        : core
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
          'Start typing — pick a suggestion or your full address, or tap a saved place.'
      const core = `${title}\n${body}`
      return servicePersonalityLine?.trim()
        ? `${servicePersonalityLine.trim()}\n\n${core}`
        : core
    }
    if (showDropoff) {
      if (!mapsApiKey) {
        return `Drop-off location\nAdd a Google Maps API key to use addresses.`
      }
      return `Drop-off location\n${bookingState.currentQuestion ?? 'Start typing — pick a suggestion or confirm your full address.'}`
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
        'Getting directions',
        'A driving route is loading; the map may show a straight line until it finishes.',
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
        jobType != null && requiresDropoff(jobType) ? 'Review trip' : 'Addresses locked in'
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
        parts.push('Check the map, then continue to photos when it looks right.')
      } else {
        parts.push('Fetching driving directions…')
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
      return 'Items confirmed\nBuilding your quote — next you will review price, then pay to confirm.'
    }
    return null
  }, [
    showDualAddresses,
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
    if (showIntent) return null
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
    if (showPickup || showDropoff || showDualAddresses) return 'addresses'
    if ((chatNavRoute || homeMapExploreMode) && showIntent) return 'route'
    if (showIntent) return 'intent'
    if (showPostScan) return 'working'
    return 'idle'
  }, [
    showDualAddresses,
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
  ])

  const lastAssistantTurnIndex = useMemo(() => {
    for (let i = orbChatTurns.length - 1; i >= 0; i--) {
      if (orbChatTurns[i]!.role === 'assistant') return i
    }
    return -1
  }, [orbChatTurns])

  const orbChatStackBottom = useMemo(() => {
    const orbH = orbTopLeftOnNavMap ? '4rem' : '6.5rem'
    const orbHalf = orbTopLeftOnNavMap ? '2rem' : '3.25rem'
    if (homeOrbBottomPx != null) {
      return `calc(${homeOrbBottomPx}px + ${orbH} + 0.85rem)`
    }
    return `calc(max(1.1rem, env(safe-area-inset-bottom)) + min(calc((8.625rem + 3.5dvh) * 1.4), calc(16dvh * 1.4), calc(10rem * 1.4)) + 8px + ${orbHalf} + 0.85rem)`
  }, [homeOrbBottomPx, orbTopLeftOnNavMap])

  useEffect(() => {
    if (sheetGestureActive) return
    if (showPostScan && sheetDisplayPricing && !showScanner) setSheetSnap('full')
  }, [showPostScan, sheetDisplayPricing, showScanner, sheetGestureActive])

  useEffect(() => {
    if (!showPickup && !showDropoff && !showDualAddresses) {
      setBookingAddressSuggestOpen(false)
    }
  }, [showPickup, showDropoff, showDualAddresses])

  useEffect(() => {
    if (sheetGestureActive) return
    if (
      bookingAddressSuggestOpen &&
      (showPickup || showDropoff || showDualAddresses || (showIntent && mapsApiKey))
    ) {
      setSheetSnap('full')
    }
  }, [
    sheetGestureActive,
    bookingAddressSuggestOpen,
    showPickup,
    showDropoff,
    showDualAddresses,
    showIntent,
    mapsApiKey,
  ])

  useEffect(() => {
    if (sheetGestureActive || !uberTripCard) return
    if (homeShellTab !== 'services') return
    if (!tripSheetPhasePrefersExpandedSnap(tripSheetPhase)) return
    setSheetSnap('half')
  }, [sheetGestureActive, uberTripCard, homeShellTab, tripSheetPhase])

  const prevShowBuildingRouteRef = useRef(false)
  useEffect(() => {
    const wasBuilding = prevShowBuildingRouteRef.current
    prevShowBuildingRouteRef.current = showBuildingRoute
    if (sheetGestureActive) return
    if (!showBuildingRoute) return
    if (homeShellTab !== 'services') return
    if (wasBuilding) return
    setSheetSnap('compact')
  }, [showBuildingRoute, sheetGestureActive, homeShellTab])

  const prevShowScannerRef = useRef(false)
  useEffect(() => {
    const wasScanner = prevShowScannerRef.current
    prevShowScannerRef.current = showScanner
    if (sheetGestureActive) return
    if (!showScanner) return
    if (homeShellTab !== 'services') return
    if (!uberTripCard) return
    if (wasScanner) return
    setSheetSnap('compact')
  }, [showScanner, sheetGestureActive, homeShellTab, uberTripCard])

  const onPeekHomeClick = useCallback(() => {
    setIntentAddressEntryActive(false)
    exitChatNavigation()
    onHomeShellTabChange('services')
    setSheetSnap('closed')
  }, [onHomeShellTabChange, exitChatNavigation])

  const onAccountsClick = useCallback(() => {
    bumpInteraction()
    onAccountNavigate?.()
  }, [bumpInteraction, onAccountNavigate])

  const homeShellFooterNav = useMemo(
    () => (
      <nav
        className="fetch-home-intent-bottom-nav fetch-home-intent-bottom-nav--compact"
        aria-label="Home, marketplace, drops, notifications, and account"
      >
        <button
          type="button"
          className={[
            'fetch-home-intent-bottom-nav__icon',
            homeShellTab === 'services' ? 'fetch-home-intent-bottom-nav__icon--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Home"
          aria-current={homeShellTab === 'services' ? 'page' : undefined}
          onClick={() => {
            bumpInteraction()
            onPeekHomeClick()
          }}
        >
          <FetchEyesHomeIcon className="block" active={homeShellTab === 'services'} />
        </button>
        <button
          type="button"
          className={[
            'fetch-home-intent-bottom-nav__icon',
            homeShellTab === 'marketplace'
              ? 'fetch-home-intent-bottom-nav__icon--active'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Fetch marketplace"
          aria-current={homeShellTab === 'marketplace' ? 'page' : undefined}
          onClick={() => {
            bumpInteraction()
            onHomeShellTabChange('marketplace')
          }}
        >
          <MarketplaceNavIconFilled
            className="block"
            active={homeShellTab === 'marketplace'}
          />
        </button>
        <button
          type="button"
          className={[
            'fetch-home-intent-bottom-nav__icon fetch-home-intent-bottom-nav__icon--reels',
            homeShellTab === 'reels' ? 'fetch-home-intent-bottom-nav__icon--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={homeShellTab === 'reels' ? 'Drops — post video or photos' : 'Drops'}
          aria-current={homeShellTab === 'reels' ? 'page' : undefined}
          onClick={() => {
            bumpInteraction()
            if (homeShellTab === 'reels') {
              setDropsNavRepeatTick((n) => n + 1)
            } else {
              onHomeShellTabChange('reels')
            }
          }}
        >
          <ReelsNavIconFilled className="block" active={homeShellTab === 'reels'} />
        </button>
        <button
          type="button"
          className={[
            'fetch-home-intent-bottom-nav__icon relative',
            homeShellTab === 'chat' ? 'fetch-home-intent-bottom-nav__icon--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Notifications"
          aria-current={homeShellTab === 'chat' ? 'page' : undefined}
          onClick={() => {
            bumpInteraction()
            onHomeShellTabChange('chat')
          }}
        >
          <NotificationsNavIconFilled className="block" active={homeShellTab === 'chat'} />
          {messagesUnread.total > 0 ? (
            <span className="pointer-events-none absolute right-[18%] top-[10%] flex h-[11px] min-w-[11px] rounded-full bg-red-500 ring-2 ring-white" />
          ) : null}
        </button>
        <button
          type="button"
          className="fetch-home-intent-bottom-nav__icon"
          aria-label="Profile"
          onClick={onAccountsClick}
        >
          <AccountNavIconFilled className="block" active={false} />
        </button>
      </nav>
    ),
    [
      bumpInteraction,
      homeShellTab,
      messagesUnread.total,
      onAccountsClick,
      onHomeShellTabChange,
      onPeekHomeClick,
    ],
  )

  const onHomeOrbBottomPxChange = useCallback((px: number) => {
    setHomeOrbBottomPx((prev) => (prev != null && Math.abs(prev - px) < 0.75 ? prev : px))
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

  const reelFetchLoadGenRef = useRef(0)
  const reelFetchScanGenRef = useRef(0)

  useEffect(() => {
    const job = reelFetchItDelivery
    if (!job || job.phase !== 'loading') return
    const gen = (reelFetchLoadGenRef.current += 1)
    let cancelled = false
    void (async () => {
      try {
        const listing = await fetchListing(job.listingId)
        if (cancelled || gen !== reelFetchLoadGenRef.current) return
        const raw = listing.images?.[0]?.url?.trim()
        if (!raw) {
          appendHomeAlert({
            title: 'Fetch delivery',
            body: 'This listing has no photo to scan. Enter pickup and drop-off below.',
          })
          setReelFetchItDelivery((p) => (p?.listingId === job.listingId ? { ...p, phase: 'done' } : p))
          return
        }
        const abs = listingImageAbsoluteUrl(raw)
        const res = await fetch(abs, { credentials: 'include', mode: 'cors' })
        if (!res.ok) throw new Error(`Photo download failed (${res.status})`)
        const blob = await res.blob()
        if (cancelled || gen !== reelFetchLoadGenRef.current) return
        const file = new File([blob], 'listing-photo.jpg', { type: blob.type || 'image/jpeg' })
        setScanFiles([file])
        setReelFetchItDelivery({
          listingId: job.listingId,
          phase: 'scanning',
          title: listing.title,
          imageUrl: abs,
        })
      } catch (e) {
        if (cancelled || gen !== reelFetchLoadGenRef.current) return
        appendHomeAlert({
          title: 'Could not load listing',
          body: e instanceof Error ? e.message : 'Try again from the reel.',
        })
        setReelFetchItDelivery((p) => (p?.listingId === job.listingId ? { ...p, phase: 'done' } : p))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reelFetchItDelivery])

  useEffect(() => {
    const job = reelFetchItDelivery
    if (!job || job.phase !== 'scanning') return
    if (scanFiles.length === 0) return
    const gen = (reelFetchScanGenRef.current += 1)
    let cancelled = false
    void (async () => {
      setScanning(true)
      const perfRunId = fetchPerfIsEnabled() ? createPerfRunId('reel_fetch_scan') : undefined
      if (perfRunId) fetchPerfMark(perfRunId, '2_step_visible', { surface: 'reel_listing_scan' })
      try {
        const result = await scanBookingPhotos(scanFiles, 'junk', { perfRunId })
        if (cancelled || gen !== reelFetchScanGenRef.current) return
        const summaryText = scannerSummaryLine(result.detectedItems)
        const voiceLine = result.detailedDescription || summaryText
        setBookingState((prev) => {
          const withScan: BookingState = {
            ...prev,
            scan: { ...prev.scan, result, confidence: result.confidence },
          }
          return handleUserInput({ text: summaryText, source: 'scan' }, withScan).bookingState
        })
        playUiEvent('success')
        void speakLine(voiceLine, {
          debounceKey: 'reel_fetch_scan',
          debounceMs: 0,
          withVoiceHold: true,
          perfRunId,
        })
        setReelFetchItDelivery((p) =>
          p?.listingId === job.listingId && p.phase === 'scanning' ? { ...p, phase: 'done' } : p,
        )
      } catch {
        if (cancelled || gen !== reelFetchScanGenRef.current) return
        void speakLine("Couldn't scan the listing photo. You can still enter addresses below.", {
          debounceKey: 'reel_fetch_scan_err',
          debounceMs: 0,
          withVoiceHold: true,
          perfRunId,
        })
        setReelFetchItDelivery((p) =>
          p?.listingId === job.listingId && p.phase === 'scanning' ? { ...p, phase: 'done' } : p,
        )
      } finally {
        if (!cancelled && gen === reelFetchScanGenRef.current) setScanning(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reelFetchItDelivery, scanFiles, playUiEvent, speakLine])

  useEffect(() => {
    if (!intentAiScannerMapOverlay) {
      prevIntentAiScannerOverlayRef.current = false
      return
    }
    if (!prevIntentAiScannerOverlayRef.current) {
      intentScanFileCountRef.current = scanFiles.length
    }
    prevIntentAiScannerOverlayRef.current = true
  }, [intentAiScannerMapOverlay, scanFiles.length])

  useEffect(() => {
    if (!intentAiScannerMapOverlay || scanning) return
    const n = scanFiles.length
    if (n > intentScanFileCountRef.current) {
      intentScanFileCountRef.current = n
      void handleScan()
    }
  }, [intentAiScannerMapOverlay, scanFiles.length, scanning, handleScan])

  const runBrainPhotoScan = useCallback(
    async (file: File) => {
      brainAbortRef.current?.abort()
      const ac = new AbortController()
      brainAbortRef.current = ac

      setBrainAiPending(true)
      setBrainLastReply(null)
      brainConvRef.current = appendBrainAssistantLinePersisted(
        brainConvRef.current,
        'Scanning your photo for items and volume…',
        { kind: 'scanning' },
      )
      setBrainConvRevision((n) => n + 1)

      const perfRunId = fetchPerfIsEnabled() ? createPerfRunId('brain_scan') : undefined
      try {
        const result = await scanBookingPhotos([file], serviceHint, { perfRunId })
        if (ac.signal.aborted) return
        const summaryText = scannerSummaryLine(result.detectedItems)
        const voiceLine = result.detailedDescription?.trim() || summaryText

        brainConvRef.current = removeBrainScanningBubbles(brainConvRef.current)
        const resultLine =
          voiceLine.trim() ||
          (summaryText.trim() ? `Scan: ${summaryText}` : 'Photo scanned — I’ve logged what I could see.')
        brainConvRef.current = appendBrainAssistantLinePersisted(brainConvRef.current, resultLine)
        setBrainConvRevision((n) => n + 1)

        setBookingState((prev) => {
          const withScan: BookingState = {
            ...prev,
            scan: { ...prev.scan, result, confidence: result.confidence },
          }
          return handleUserInput({ text: summaryText, source: 'scan' }, withScan).bookingState
        })

        appendBrainLearningEvent({
          kind: 'field_voice_step',
          note: `photo scan: ${summaryText.slice(0, 100)}`,
        })

        setBrainLastReply(resultLine)
        playUiEvent('success')
        await speakLine(voiceLine || resultLine, {
          debounceKey: 'brain_scan_result',
          debounceMs: 0,
          withVoiceHold: true,
          ...(perfRunId ? { perfRunId } : {}),
        })
        if (ac.signal.aborted) return

        await runBrainFieldScanFollowUp(result, ac)
      } catch {
        brainConvRef.current = removeBrainScanningBubbles(brainConvRef.current)
        const line = "Couldn't read that photo. Try another."
        brainConvRef.current = appendBrainAssistantLinePersisted(brainConvRef.current, line)
        setBrainConvRevision((n) => n + 1)
        setBrainLastReply(line)
        void speakLine(line, {
          debounceKey: 'brain_scan_error',
          debounceMs: 0,
          withVoiceHold: true,
          ...(perfRunId ? { perfRunId } : {}),
        })
      } finally {
        setBrainAiPending(false)
        if (brainAbortRef.current === ac) brainAbortRef.current = null
      }
    },
    [playUiEvent, runBrainFieldScanFollowUp, serviceHint, speakLine],
  )

  const onBrainPhotoSelected = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file)
      brainConvRef.current = appendBrainUserPhotoMessage(brainConvRef.current, '📷 Photo', url)
      setBrainConvRevision((n) => n + 1)
      void runBrainPhotoScan(file)
    },
    [runBrainPhotoScan],
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

  /** Uber trip card: hide large step title row after service pick — map stays primary. */
  const tripSheetMapFirstHeader = Boolean(bookingSheetFocusMode && uberTripCard)

  /** Bottom shell — stay visible on full-screen shell pages even if Services is in booking focus mode */
  const showHomeShellChrome = Boolean(
    cardVisible &&
      homeBrainFlow == null &&
      !brainImmersive &&
      (!bookingSheetFocusMode || shellShopOrChat),
  )

  useEffect(() => {
    if (sheetGestureActive) return
    if (showIntent) setSheetSnap('compact')
    if (showPickup || showDropoff || showDualAddresses) {
      setSheetSnap('half')
    }
  }, [
    sheetGestureActive,
    sheetSnap,
    showIntent,
    showPickup,
    showDropoff,
    showDualAddresses,
  ])

  const prevHomeShellTabRef = useRef<HomeShellTab>(homeShellTab)
  useEffect(() => {
    const prev = prevHomeShellTabRef.current
    prevHomeShellTabRef.current = homeShellTab
    if (brainImmersive) return
    if (prev !== 'services') return
    if (homeShellTab === 'reels') {
      void speakLine('Drops — scroll short commerce videos, like, save, and share.', {
        debounceKey: 'reels_tab_ready_line',
        debounceMs: 0,
        withVoiceHold: true,
      })
      return
    }
    if (homeShellTab === 'marketplace') {
      void speakLine(
        'Fetch marketplace is open — browse store items and local peer listings in one place.',
        {
          debounceKey: 'marketplace_tab_ready_line',
          debounceMs: 0,
          withVoiceHold: true,
        },
      )
      return
    }
    if (homeShellTab === 'chat') {
      void speakLine('Notifications — marketplace chats and support are here.', {
        debounceKey: 'chat_tab_ready_line',
        debounceMs: 0,
        withVoiceHold: true,
      })
    }
  }, [homeShellTab, brainImmersive, speakLine])

  return (
    <div className="fetch-home-phone-stage">
    <div
      className="fetch-home-vision fetch-home-phone-frame relative h-dvh min-h-dvh w-full"
      style={homeVisionStyle}
      data-home-shell-tab={homeShellTab}
      data-orb-tunnel={
        homeBrainFlow === 'tunnel' ? 'tunnel' : homeBrainFlow ? 'brain' : 'idle'
      }
    >

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
        !shellShopOrChat ? (
        <>
        <FetchHomeStepOne
          onMapsJavaScriptReady={setMapsJsReady}
          mapTunnelPhase={homeBrainFlow === 'tunnel' ? 'tunnel' : null}
          suspendMapCameraAutomation={homeBrainFlow != null}
          onMapInstance={handleHomeMapInstance}
          chatBookingHintLabel={chatBookingHintLabel}
          pickup={
            chatNavRoute ? 'Your location' : bookingState.pickupAddressText
          }
          dropoff={
            chatNavRoute ? chatNavRoute.destinationLabel : bookingState.dropoffAddressText
          }
          pickupCoords={
            chatNavRoute
              ? { lat: chatNavRoute.originLat, lng: chatNavRoute.originLng }
              : bookingState.pickupCoords
          }
          dropoffCoords={
            chatNavRoute
              ? { lat: chatNavRoute.destLat, lng: chatNavRoute.destLng }
              : bookingState.dropoffCoords
          }
          routePath={mapRoutePath}
          bookingRouteProvisional={bookingRouteProvisional}
          pickupDropoffMapFitPadding={pickupDropoffScannerFitPadding}
          mapStage={mapStageForHomeStep}
          mapAccentRgb={orbGlowColor}
          userLocationCoords={userMapLocation}
          mapNavStrip={mapNavStrip}
          driverToPickupPath={liveTripDirections.path}
          driverLivePosition={driverMapLivePosition}
          mapFollowUser={mapFollowUser}
          onMapFollowUserChange={setMapFollowUser}
          suppressTrafficLayer={!!chatNavRoute || homeMapExploreMode}
          explorePois={homeMapExploreMode ? explorePois : []}
          navigationRouteActive={Boolean(chatNavRoute)}
          droppedPinCoords={homeMapExploreMode ? userDroppedPin : null}
          onHomeMapMenuAccount={onAccountNavigate}
          homeMapHardwareCatalog={HARDWARE_PRODUCTS}
          liveTrackingFit={chatNavRoute ? null : homeLiveTrackingFit}
          pickupLockInCelebrateKey={pickupLockInCelebrateKey}
          mapHeaderAddressEntry={mapHeaderAddressEntry}
          mapExploreMinimalChrome={mapExploreMinimalChrome}
          mapBookingTopMinimal={bookingSheetFocusMode}
          mapBackBubble={mapBackBubbleProps}
          mapRegionLockedShowcase={false}
          mapRegionLockedStatusLine={null}
        />
        </>
        ) : null
      ) : null}

      {!brainImmersive && !shellShopOrChat ? (
      <>
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
        showHomeShellTabs={showHomeShellChrome}
        mapsPeekInsetRef={mapsPeekInsetRef}
        mapsCompactPeek={false}
        navMapsExploreKeepsOpen={false}
        navMapChrome={homeSheetNavMapChrome}
        hideExpandedHeaderChrome={Boolean(
          (showIntent && homeShellTab === 'services') || bookingSheetFocusMode,
        )}
        edgeToEdgeShell={Boolean(
          cardVisible && homeBrainFlow == null && !brainImmersive,
        )}
        shellFooterNav={showHomeShellChrome ? homeShellFooterNav : undefined}
        suppressPeekBar={bookingSheetFocusMode}
        intentClosedPeek={Boolean(
          showIntent &&
            homeShellTab === 'services' &&
            sheetSnap === 'closed' &&
            !chatNavRoute &&
            cardVisible &&
            homeBrainFlow == null &&
            !brainImmersive,
        )}
        routeBuildingForMapPeek={showBuildingRoute}
        mapFirstBookingLayout={bookingSheetFocusMode}
        bareBookingSheetTop={bookingSheetFocusMode}
        suppressSheetVoiceAura={bookingSheetFocusMode}
        disableVisualViewportKeyboardInset={addressKeyboardFreeLayout}
      >
        {chatNavRoute ? (
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
                  className="w-full py-1.5 text-center text-[12px] font-semibold text-fetch-charcoal underline decoration-fetch-charcoal/35 underline-offset-2 transition-opacity hover:opacity-80"
                >
                  Use for booking
                </button>
              }
            />
          </div>
        ) : (
          <>
          {showDualAddresses && jobType ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              dense={uberTripCard}
              title={
                jobType === 'homeMoving'
                  ? 'Moving from & to'
                  : jobType === 'deliveryPickup'
                    ? 'Pickup & delivery'
                    : 'Pickup & drop-off'
              }
              secondaryAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : {
                      label: 'Back',
                      onClick:
                        flowStep === 'dropoff' && requiresDropoff(jobType)
                          ? goBackToPickup
                          : goBackToIntent,
                    }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
            >
              <section
                className={[
                  'fetch-home-booking-step fetch-home-booking-step--dual-address w-full space-y-0',
                  tripSheetMapFirstHeader ? 'fetch-home-booking-step--address-touch' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {mapsApiKey ? (
                  tripSheetMapFirstHeader ? (
                    <>
                      <HomeBookingAddressUberChrome
                        scheduleDate={rideScheduleDate}
                        onScheduleDate={setRideScheduleDate}
                        forWhom={rideForWhom}
                        onForWhom={setRideForWhom}
                      />
                      <div className="mt-3.5 flex min-h-0 gap-2.5">
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="fetch-home-ab-unified flex min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-700/90 bg-white dark:border-zinc-500 dark:bg-zinc-950/85">
                            <PlacesAddressAutocomplete
                              key={`pickup-${bookingState.pickupPlace?.placeId ?? bookingState.pickupAddressText ?? 'new'}`}
                              apiKey={mapsApiKey}
                              field="pickup"
                              placeholder="Pickup"
                              autoFocus={!bookingState.pickupCoords}
                              initialDisplayValue={bookingState.pickupAddressText}
                              onResolved={onPickupResolved}
                              onSuggestionsOpenChange={setBookingAddressSuggestOpen}
                              suggestionsMountRef={addressSuggestionsMountRef}
                              abMarker="pickup"
                              className={bookingAddressFieldAbUnifiedInnerClass}
                            />
                            {savedAddresses.length > 0 ? (
                              <div
                                className="fetch-home-ab-unified-inset flex flex-wrap gap-1 pb-2 pt-0.5"
                                role="group"
                                aria-label="Saved places for pickup"
                              >
                                {savedAddresses.map((a) => (
                                  <button
                                    key={`pu-${a.id}`}
                                    type="button"
                                    onClick={() => onPickupResolved(savedPlaceToResolved(a))}
                                    className="rounded-full border border-zinc-500/55 bg-zinc-50/90 px-2 py-0.5 text-[10px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
                                  >
                                    {a.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            {addressWaypointDrafts.length > 0 ? (
                              <div className="fetch-home-ab-unified-inset flex flex-col gap-2 pb-2">
                                <HomeAddressWaypointRows
                                  values={addressWaypointDrafts}
                                  onChangeValue={setAddressWaypointValue}
                                  onRemove={removeAddressWaypointRow}
                                  fieldClassName={`${bookingAddressFieldAbUnifiedInnerClass} rounded-md border border-zinc-600/70 bg-white px-2.5 dark:border-zinc-500 dark:bg-zinc-950/60`}
                                  keyPrefix="dual-wp"
                                />
                              </div>
                            ) : null}
                            <div
                              className="h-px shrink-0 bg-zinc-400/45 dark:bg-zinc-600"
                              aria-hidden
                            />
                            <PlacesAddressAutocomplete
                              key={`dropoff-${bookingState.dropoffPlace?.placeId ?? bookingState.dropoffAddressText ?? 'new'}`}
                              apiKey={mapsApiKey}
                              field="dropoff"
                              placeholder="Drop-off"
                              autoFocus={Boolean(
                                bookingState.pickupCoords && !bookingState.dropoffCoords,
                              )}
                              initialDisplayValue={bookingState.dropoffAddressText}
                              onResolved={onDropoffResolved}
                              onSuggestionsOpenChange={setBookingAddressSuggestOpen}
                              suggestionsMountRef={addressSuggestionsMountRef}
                              abMarker="dropoff"
                              className={bookingAddressFieldAbUnifiedInnerClass}
                            />
                            {savedAddresses.length > 0 ? (
                              <div
                                className="fetch-home-ab-unified-inset flex flex-wrap gap-1 pb-2.5 pt-0.5"
                                role="group"
                                aria-label="Saved places for drop-off"
                              >
                                {savedAddresses.map((a) => (
                                  <button
                                    key={`do-${a.id}`}
                                    type="button"
                                    onClick={() => onDropoffResolved(savedPlaceToResolved(a))}
                                    className="rounded-full border border-zinc-500/55 bg-zinc-50/90 px-2 py-0.5 text-[10px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
                                  >
                                    {a.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <AddressSuggestionsPanel mountRef={addressSuggestionsMountRef} />
                        </div>
                        <div className="flex shrink-0 flex-col justify-center self-start pt-2.5">
                          <button
                            type="button"
                            aria-label="Add stop"
                            title="Add stop"
                            disabled={addressWaypointDrafts.length >= 2}
                            onClick={() => {
                              bumpInteraction()
                              playUiEvent('success')
                              addAddressWaypointRow()
                            }}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-[1.35rem] font-light leading-none text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-none"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="pb-0">
                        <div className="mb-1 flex items-center gap-1.5">
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-800"
                            aria-hidden
                          >
                            A
                          </span>
                          <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-fetch-muted">
                            Pickup
                          </p>
                        </div>
                        <div className="relative z-[5]">
                          <PlacesAddressAutocomplete
                            key={`pickup-${bookingState.pickupPlace?.placeId ?? bookingState.pickupAddressText ?? 'new'}`}
                            apiKey={mapsApiKey}
                            field="pickup"
                            placeholder="Search pickup address"
                            autoFocus={!bookingState.pickupCoords}
                            initialDisplayValue={bookingState.pickupAddressText}
                            onResolved={onPickupResolved}
                            onSuggestionsOpenChange={setBookingAddressSuggestOpen}
                            suggestionsMountRef={addressSuggestionsMountRef}
                            className={bookingAddressFieldClass}
                          />
                        </div>
                        {savedAddresses.length > 0 ? (
                          <div
                            className="mt-1.5 flex flex-wrap gap-1"
                            role="group"
                            aria-label="Saved places for pickup"
                          >
                            {savedAddresses.map((a) => (
                              <button
                                key={`pu-${a.id}`}
                                type="button"
                                onClick={() => onPickupResolved(savedPlaceToResolved(a))}
                                className="rounded-full border border-fetch-charcoal/12 bg-fetch-charcoal/[0.04] px-2 py-0.5 text-[10px] font-semibold text-fetch-charcoal/90 transition-colors hover:bg-fetch-charcoal/[0.07] active:scale-[0.98]"
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 border-t border-fetch-charcoal/[0.07] pt-2">
                        <div className="mb-1 flex items-center gap-1.5">
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-[10px] font-bold text-sky-900"
                            aria-hidden
                          >
                            B
                          </span>
                          <p className="text-[9px] font-bold uppercase tracking-[0.07em] text-fetch-muted">
                            Drop-off
                          </p>
                        </div>
                        <div className="relative z-[5]">
                          <PlacesAddressAutocomplete
                            key={`dropoff-${bookingState.dropoffPlace?.placeId ?? bookingState.dropoffAddressText ?? 'new'}`}
                            apiKey={mapsApiKey}
                            field="dropoff"
                            placeholder="Search drop-off address"
                            autoFocus={Boolean(
                              bookingState.pickupCoords && !bookingState.dropoffCoords,
                            )}
                            initialDisplayValue={bookingState.dropoffAddressText}
                            onResolved={onDropoffResolved}
                            onSuggestionsOpenChange={setBookingAddressSuggestOpen}
                            suggestionsMountRef={addressSuggestionsMountRef}
                            className={bookingAddressFieldClass}
                          />
                        </div>
                        {savedAddresses.length > 0 ? (
                          <div
                            className="mt-1.5 flex flex-wrap gap-1"
                            role="group"
                            aria-label="Saved places for drop-off"
                          >
                            {savedAddresses.map((a) => (
                              <button
                                key={`do-${a.id}`}
                                type="button"
                                onClick={() => onDropoffResolved(savedPlaceToResolved(a))}
                                className="rounded-full border border-fetch-charcoal/12 bg-fetch-charcoal/[0.04] px-2 py-0.5 text-[10px] font-semibold text-fetch-charcoal/90 transition-colors hover:bg-fetch-charcoal/[0.07] active:scale-[0.98]"
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <AddressSuggestionsPanel mountRef={addressSuggestionsMountRef} />
                      </div>
                    </>
                  )
                ) : tripSheetMapFirstHeader ? (
                  <>
                    <HomeBookingAddressUberChrome
                      scheduleDate={rideScheduleDate}
                      onScheduleDate={setRideScheduleDate}
                      forWhom={rideForWhom}
                      onForWhom={setRideForWhom}
                    />
                    <p className="text-[12px] text-fetch-muted">
                      Add a Google Maps API key to use addresses.
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-fetch-muted">Add a Google Maps API key to use addresses.</p>
                )}
                {!tripSheetMapFirstHeader ? (
                  <p className="mt-1 text-[10px] font-medium leading-snug text-fetch-muted/85 [text-wrap:pretty]">
                    {bookingState.currentQuestion ??
                      'Pick from suggestions — both pins update on the map as you go.'}
                  </p>
                ) : null}
              </section>
            </TripSheetCard>
          ) : null}

          {showIntent ? (
            <div className="fetch-home-landing fetch-home-landing--intent-tight flex flex-col gap-2 px-0.5">
              <section className="fetch-home-landing-section fetch-home-landing-section--intent shrink-0 -mt-1">
                  <div className="flex flex-col gap-3">
                    <input
                      ref={intentCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoAdd}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={scanning}
                      onClick={openIntentCameraPicker}
                      className="w-full min-h-[3.15rem] rounded-full border-2 border-zinc-300 bg-white py-3.5 text-center text-[15px] font-bold uppercase tracking-[0.08em] text-zinc-900 shadow-sm transition-transform hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-55 dark:border-zinc-500 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                    >
                      FETCH IT
                    </button>
                    <button
                      type="button"
                      disabled={scanning}
                      onClick={() => {
                        bumpInteraction()
                        navigate(FETCH_MARKETPLACE_LIST_PATH)
                      }}
                      className="w-full min-h-[3.15rem] rounded-full bg-emerald-800 py-3.5 text-center text-[15px] font-bold uppercase tracking-[0.08em] text-white shadow-[0_1px_0_#065f46,0_4px_14px_rgba(6,95,70,0.35)] transition-transform hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-55 dark:bg-emerald-900 dark:hover:bg-emerald-800"
                    >
                      LIST IT
                    </button>
                    {scanning ? (
                      <div className="flex items-center justify-center gap-2 py-1">
                        <div className="fetch-stage-spinner h-4 w-4 shrink-0 animate-spin rounded-full" aria-hidden />
                        <span className="text-[12px] font-medium text-fetch-muted">
                          Scanning for prices…
                        </span>
                      </div>
                    ) : null}
                    {intentJunkEstimate ? (
                      <div className="mt-1 flex flex-col gap-2.5 rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-3.5 dark:border-zinc-600 dark:bg-zinc-900/85">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-fetch-muted">
                          Est. junk removal (AUD)
                        </p>
                        <p className="text-[1.65rem] font-bold leading-tight tracking-tight text-zinc-950 dark:text-zinc-50">
                          ${intentJunkEstimate.minPrice} – ${intentJunkEstimate.maxPrice}
                        </p>
                        <button
                          type="button"
                          onClick={onIntentFetchIt}
                          className="w-full min-h-[3.15rem] rounded-full bg-zinc-900 py-3.5 text-center text-[15px] font-bold uppercase tracking-[0.06em] text-white transition-transform active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-950"
                        >
                          Start junk removal
                        </button>
                      </div>
                    ) : null}
                    <div className="fetch-home-intent-sheet-pull-strip" aria-hidden />
                  </div>
              </section>
            </div>
          ) : null}

          {showPickup ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              dense={uberTripCard}
              title={
                jobType === 'helper'
                  ? 'Where you need help'
                  : jobType === 'cleaning'
                    ? 'Where to clean'
                    : 'Pickup location'
              }
              secondaryAction={
                tripSheetMapFirstHeader ? undefined : { label: 'Back', onClick: goBackToIntent }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
            >
              <section
                className={[
                  'fetch-home-booking-step w-full',
                  tripSheetMapFirstHeader ? 'fetch-home-booking-step--address-touch' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
              {reelFetchItDelivery && reelFetchItDelivery.phase !== 'done' ? (
                <div className="flex flex-col gap-3 px-0.5 py-1">
                  {reelFetchItDelivery.imageUrl && reelFetchItDelivery.phase === 'scanning' ? (
                    <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/60">
                      <img
                        src={reelFetchItDelivery.imageUrl}
                        alt=""
                        className="mx-auto max-h-[11rem] w-full object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200/90 dark:bg-zinc-700/90">
                    <div
                      className="h-full rounded-full bg-violet-600 motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out dark:bg-violet-500"
                      style={{
                        width: reelFetchItDelivery.phase === 'loading' ? '36%' : '94%',
                      }}
                    />
                  </div>
                  <p className="text-center text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
                    {reelFetchItDelivery.phase === 'loading'
                      ? 'Loading listing…'
                      : 'Scanning listing photo'}
                  </p>
                  {reelFetchItDelivery.title ? (
                    <p className="text-center text-[12px] leading-snug text-fetch-muted line-clamp-2">
                      {reelFetchItDelivery.title}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
              {mapsApiKey ? (
                tripSheetMapFirstHeader ? (
                  <>
                    <HomeBookingAddressUberChrome
                      scheduleDate={rideScheduleDate}
                      onScheduleDate={setRideScheduleDate}
                      forWhom={rideForWhom}
                      onForWhom={setRideForWhom}
                    />
                    <div className="flex min-h-0 gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="relative z-[5] mt-0.5">
                          <PlacesAddressAutocomplete
                            key={`pickup-${bookingState.pickupPlace?.placeId ?? bookingState.pickupAddressText ?? 'new'}`}
                            apiKey={mapsApiKey}
                            field="pickup"
                            placeholder={
                              jobType === 'helper'
                                ? 'Where we meet'
                                : jobType === 'cleaning'
                                  ? 'Address to clean'
                                  : 'Pickup'
                            }
                            autoFocus
                            initialDisplayValue={bookingState.pickupAddressText}
                            onResolved={onPickupResolved}
                            onSuggestionsOpenChange={setBookingAddressSuggestOpen}
                            suggestionsMountRef={addressSuggestionsMountRef}
                            className={bookingAddressFieldMinimalClass}
                          />
                        </div>
                        <HomeAddressWaypointRows
                          values={addressWaypointDrafts}
                          onChangeValue={setAddressWaypointValue}
                          onRemove={removeAddressWaypointRow}
                          fieldClassName={bookingAddressFieldMinimalClass}
                          keyPrefix="pu-wp"
                        />
                        {savedAddresses.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Saved places">
                            {savedAddresses.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => onPickupResolved(savedPlaceToResolved(a))}
                                className="rounded-full border border-fetch-charcoal/12 bg-fetch-charcoal/[0.04] px-2 py-0.5 text-[10px] font-semibold text-fetch-charcoal/90 transition-colors hover:bg-fetch-charcoal/[0.07] active:scale-[0.98]"
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col justify-center pt-2">
                        <button
                          type="button"
                          aria-label="Add stop"
                          title="Add stop"
                          disabled={addressWaypointDrafts.length >= 2}
                          onClick={() => {
                            bumpInteraction()
                            playUiEvent('success')
                            addAddressWaypointRow()
                          }}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-[1.35rem] font-light leading-none text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-none"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <AddressSuggestionsPanel mountRef={addressSuggestionsMountRef} />
                  </>
                ) : (
                  <>
                    <div className="relative z-[5] mt-0.5">
                      <PlacesAddressAutocomplete
                        key={`pickup-${bookingState.pickupPlace?.placeId ?? bookingState.pickupAddressText ?? 'new'}`}
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
                        initialDisplayValue={bookingState.pickupAddressText}
                        onResolved={onPickupResolved}
                        onSuggestionsOpenChange={setBookingAddressSuggestOpen}
                        suggestionsMountRef={addressSuggestionsMountRef}
                        className={bookingAddressFieldClass}
                      />
                    </div>
                    {savedAddresses.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Saved places">
                        {savedAddresses.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => onPickupResolved(savedPlaceToResolved(a))}
                            className="rounded-full border border-fetch-charcoal/12 bg-fetch-charcoal/[0.04] px-2 py-0.5 text-[10px] font-semibold text-fetch-charcoal/90 transition-colors hover:bg-fetch-charcoal/[0.07] active:scale-[0.98]"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <AddressSuggestionsPanel mountRef={addressSuggestionsMountRef} />
                  </>
                )
              ) : tripSheetMapFirstHeader ? (
                <>
                  <HomeBookingAddressUberChrome
                    scheduleDate={rideScheduleDate}
                    onScheduleDate={setRideScheduleDate}
                    forWhom={rideForWhom}
                    onForWhom={setRideForWhom}
                  />
                  <p className="mt-1 text-[12px] text-fetch-muted">
                    Add a Google Maps API key to use addresses.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[12px] text-fetch-muted">Add a Google Maps API key to use addresses.</p>
              )}
              {!tripSheetMapFirstHeader ? (
                <p className="mt-1 max-w-[20rem] text-[11px] font-medium leading-snug tracking-[-0.01em] text-fetch-muted/90 [text-wrap:pretty]">
                  {bookingState.currentQuestion ??
                    'Suggestions appear under the field as you type — or tap a saved place.'}
                </p>
              ) : null}
                </>
              )}
              </section>
            </TripSheetCard>
          ) : null}

          {showDropoff ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              dense={uberTripCard}
              title="Drop-off location"
              secondaryAction={
                tripSheetMapFirstHeader ? undefined : { label: 'Back', onClick: goBackToPickup }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
            >
              <section
                className={[
                  'fetch-home-booking-step w-full',
                  tripSheetMapFirstHeader ? 'fetch-home-booking-step--address-touch' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
              {mapsApiKey ? (
                tripSheetMapFirstHeader ? (
                  <>
                    <HomeBookingAddressUberChrome
                      scheduleDate={rideScheduleDate}
                      onScheduleDate={setRideScheduleDate}
                      forWhom={rideForWhom}
                      onForWhom={setRideForWhom}
                    />
                    <div className="flex min-h-0 gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="relative z-[5] mt-0.5">
                          <PlacesAddressAutocomplete
                            key={`dropoff-${bookingState.dropoffPlace?.placeId ?? bookingState.dropoffAddressText ?? 'new'}`}
                            apiKey={mapsApiKey}
                            field="dropoff"
                            placeholder="Drop-off"
                            autoFocus
                            initialDisplayValue={bookingState.dropoffAddressText}
                            onResolved={onDropoffResolved}
                            onSuggestionsOpenChange={setBookingAddressSuggestOpen}
                            suggestionsMountRef={addressSuggestionsMountRef}
                            className={bookingAddressFieldMinimalClass}
                          />
                        </div>
                        <HomeAddressWaypointRows
                          values={addressWaypointDrafts}
                          onChangeValue={setAddressWaypointValue}
                          onRemove={removeAddressWaypointRow}
                          fieldClassName={bookingAddressFieldMinimalClass}
                          keyPrefix="do-wp"
                        />
                        {savedAddresses.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Saved places">
                            {savedAddresses.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => onDropoffResolved(savedPlaceToResolved(a))}
                                className="rounded-full border border-fetch-charcoal/12 bg-fetch-charcoal/[0.04] px-2 py-0.5 text-[10px] font-semibold text-fetch-charcoal/90 transition-colors hover:bg-fetch-charcoal/[0.07] active:scale-[0.98]"
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col justify-center pt-2">
                        <button
                          type="button"
                          aria-label="Add stop"
                          title="Add stop"
                          disabled={addressWaypointDrafts.length >= 2}
                          onClick={() => {
                            bumpInteraction()
                            playUiEvent('success')
                            addAddressWaypointRow()
                          }}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-[1.35rem] font-light leading-none text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-none"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <AddressSuggestionsPanel mountRef={addressSuggestionsMountRef} />
                  </>
                ) : (
                  <>
                    <div className="relative z-[5] mt-0.5">
                      <PlacesAddressAutocomplete
                        key={`dropoff-${bookingState.dropoffPlace?.placeId ?? bookingState.dropoffAddressText ?? 'new'}`}
                        apiKey={mapsApiKey}
                        field="dropoff"
                        placeholder="Search drop-off address"
                        autoFocus
                        initialDisplayValue={bookingState.dropoffAddressText}
                        onResolved={onDropoffResolved}
                        onSuggestionsOpenChange={setBookingAddressSuggestOpen}
                        suggestionsMountRef={addressSuggestionsMountRef}
                        className={bookingAddressFieldClass}
                      />
                    </div>
                    {savedAddresses.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Saved places">
                        {savedAddresses.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => onDropoffResolved(savedPlaceToResolved(a))}
                            className="rounded-full border border-fetch-charcoal/12 bg-fetch-charcoal/[0.04] px-2 py-0.5 text-[10px] font-semibold text-fetch-charcoal/90 transition-colors hover:bg-fetch-charcoal/[0.07] active:scale-[0.98]"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <AddressSuggestionsPanel mountRef={addressSuggestionsMountRef} />
                  </>
                )
              ) : tripSheetMapFirstHeader ? (
                <>
                  <HomeBookingAddressUberChrome
                    scheduleDate={rideScheduleDate}
                    onScheduleDate={setRideScheduleDate}
                    forWhom={rideForWhom}
                    onForWhom={setRideForWhom}
                  />
                  <p className="mt-1 text-[12px] text-fetch-muted">
                    Add a Google Maps API key to use addresses.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[12px] text-fetch-muted">Add a Google Maps API key to use addresses.</p>
              )}
              {!tripSheetMapFirstHeader ? (
                <p className="mt-1 max-w-[20rem] text-[11px] font-medium leading-snug tracking-[-0.01em] text-fetch-muted/90 [text-wrap:pretty]">
                  {bookingState.currentQuestion ??
                    'Suggestions show under the field — pick one to continue.'}
                </p>
              ) : null}
              </section>
            </TripSheetCard>
          ) : null}

          {showLaborDetails ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              title={jobType === 'helper' ? 'Helper details' : 'Cleaning details'}
              secondaryAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : { label: 'Start over', onClick: goBackToIntent }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
              footer={
                uberTripCard ? (
                  <button
                    type="button"
                    onClick={handleLaborContinue}
                    disabled={!laborTask.trim()}
                    className="fetch-stage-primary-btn w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Get quote
                  </button>
                ) : undefined
              }
            >
              <div className="fetch-home-booking-step fetch-home-booking-step--stack w-full min-h-0">
                <div className="fetch-home-booking-step__main min-h-0">
                <p className="max-w-[18rem] text-[12px] font-medium leading-snug tracking-[-0.01em] text-fetch-muted/90 [text-wrap:pretty]">
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
                          ? 'rounded-full border border-black/70 bg-black/[0.08] px-3 py-1.5 text-[12px] font-semibold text-fetch-charcoal'
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
              </div>
              {!uberTripCard ? (
                <div className="fetch-home-booking-step__footer">
                  <button
                    type="button"
                    onClick={handleLaborContinue}
                    disabled={!laborTask.trim()}
                    className="fetch-stage-primary-btn w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Get quote
                  </button>
                </div>
              ) : null}
            </div>
            </TripSheetCard>
          ) : null}

          {showRouteReady ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              title={
                flowStep === 'route' && requiresDropoff(jobType)
                  ? 'Getting directions'
                  : jobType != null && requiresDropoff(jobType)
                    ? 'Review trip'
                    : 'Ready'
              }
              secondaryAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : {
                      label: 'Change addresses',
                      onClick: goBackToPickup,
                      ariaLabel: 'Cancel route and change drop-off',
                    }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
              estimateStrip={showTripRouteEstimateStrip ? <TripPriceEstimateStrip pricing={sheetDisplayPricing!} /> : null}
              footer={
                uberTripCard && flowStep !== 'route' ? (
                  <button
                    type="button"
                    onClick={handleRouteNext}
                    className="fetch-stage-primary-btn w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97]"
                  >
                    Continue to photo scan
                  </button>
                ) : undefined
              }
            >
              <div className="fetch-home-booking-step fetch-home-booking-step--stack w-full min-h-0">
              <div className="fetch-home-booking-step__main min-h-0">
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
                {flowStep === 'route' ? (
                  <p className="mt-2 text-[11px] font-medium text-fetch-muted/80">Fetching driving route…</p>
                ) : jobType != null && requiresDropoff(jobType) ? (
                  <p className="mt-2 text-[11px] font-medium text-fetch-muted/80">
                    When the map looks right, continue to photos.
                  </p>
                ) : null}
              </div>
              {!uberTripCard && flowStep !== 'route' ? (
                <div className="fetch-home-booking-step__footer">
                  <button
                    type="button"
                    onClick={handleRouteNext}
                    className="fetch-stage-primary-btn w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97]"
                  >
                    Continue to photo scan
                  </button>
                </div>
              ) : null}
            </div>
            </TripSheetCard>
          ) : null}

          {showBuildingRoute ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              title="Getting directions"
              secondaryAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : {
                      label: 'Change addresses',
                      onClick: goBackToPickup,
                      ariaLabel: 'Cancel route and change drop-off',
                    }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
            >
              <div className="fetch-home-booking-step fetch-home-booking-step--stack w-full min-h-0">
              <div
                className="fetch-home-booking-step__main min-h-0"
                aria-busy="true"
                aria-live="polite"
              >
                <p className="mt-1 text-[11px] font-medium text-fetch-muted/85">
                  Loading driving directions between your stops…
                </p>
                <div className="fetch-route-load-bar mt-2.5 w-full" aria-hidden>
                  <div className="fetch-route-load-bar__track">
                    <div
                      key={`${bookingState.pickupCoords?.lat ?? ''}-${bookingState.pickupCoords?.lng ?? ''}-${bookingState.dropoffCoords?.lat ?? ''}-${bookingState.dropoffCoords?.lng ?? ''}`}
                      className="fetch-route-load-bar__fill"
                    />
                  </div>
                </div>
                {bookingState.pickupAddressText ? (
                  <p className="mt-2 line-clamp-1 text-[11px] text-fetch-muted">
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
              </div>
            </div>
            </TripSheetCard>
          ) : null}

          {showScanner ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              title={jobType === 'junkRemoval' ? 'Show me the junk' : "Show me what we're moving"}
              secondaryAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : { label: 'Start over', onClick: goBackToIntent }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
              estimateStrip={showTripRouteEstimateStrip ? <TripPriceEstimateStrip pricing={sheetDisplayPricing!} /> : null}
            >
            <section className="fetch-home-booking-step fetch-home-booking-step--stack w-full space-y-1.5">
              <div className="fetch-home-booking-step__main min-h-0 space-y-1.5">
                <p className="text-[11px] font-medium leading-snug text-fetch-muted/90">
                  Take a photo and I'll identify the items.
                </p>

                {scanThumbs.length > 0 ? (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {scanThumbs.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Photo ${i + 1}`}
                        className="h-[48px] w-[48px] shrink-0 rounded-md object-cover ring-1 ring-black/[0.06]"
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

                {bookingState.scan.result && Object.keys(bookingState.itemCounts).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(bookingState.itemCounts).map(([item, qty]) => (
                      <span
                        key={item}
                        className="fetch-home-pill-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      >
                        {qty > 1 ? `${qty}x ` : ''}{item}
                      </span>
                    ))}
                  </div>
                ) : null}

                {scanning ? (
                  <div className="flex items-center gap-1.5">
                    <div className="fetch-stage-spinner h-3 w-3 animate-spin rounded-full" />
                    <p className="text-[11px] font-medium text-fetch-muted/80">Analysing your photos…</p>
                  </div>
                ) : null}
              </div>
              <div className="fetch-home-booking-step__footer flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={scanning}
                    className="fetch-home-secondary-btn flex-1 rounded-xl px-3 py-2 text-center text-[12px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50"
                  >
                    {scanThumbs.length > 0 ? 'Add more' : 'Take photo'}
                  </button>
                  {scanFiles.length > 0 && !bookingState.scan.result ? (
                    <button
                      type="button"
                      onClick={handleScan}
                      disabled={scanning}
                      className="fetch-stage-primary-btn flex-1 rounded-xl px-3 py-2 text-center text-[12px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-60"
                    >
                      {scanning ? 'Scanning…' : 'Scan'}
                    </button>
                  ) : null}
                </div>
                {bookingState.scan.result && Object.keys(bookingState.itemCounts).length > 0 ? (
                  <button
                    type="button"
                    onClick={handleConfirmItems}
                    className="fetch-stage-primary-btn w-full rounded-xl px-3 py-2 text-center text-[12px] font-semibold transition-transform active:scale-[0.97]"
                  >
                    Confirm items
                  </button>
                ) : null}
              </div>
            </section>
            </TripSheetCard>
          ) : null}

          {showPostScan && bookingState.bookingStatus && isLivePipelinePersistedStatus(bookingState.bookingStatus)
            ? (() => {
                const jc = junkLiveJobCopy(bookingState.bookingStatus!, bookingState.driver)
                const stLive = bookingState.bookingStatus!
                const liveStatusLabel =
                  stLive === 'dispatching' || stLive === 'pending_match'
                    ? 'Finding driver'
                    : stLive === 'matched'
                      ? 'Assigned'
                      : stLive === 'en_route'
                        ? 'En route'
                        : stLive === 'arrived'
                          ? 'Arrived'
                          : stLive === 'in_progress'
                            ? 'In progress'
                            : stLive === 'completed'
                              ? 'Completed'
                              : stLive === 'match_failed'
                                ? 'No driver matched yet'
                                : 'Trip'
                const liveEtaLine =
                  (bookingState.mode === 'searching' ||
                    bookingState.mode === 'matched' ||
                    bookingState.mode === 'live') &&
                  liveTripDirections.etaSeconds != null
                    ? `${Math.max(1, Math.round(liveTripDirections.etaSeconds / 60))} min away`
                    : bookingState.driver?.etaMinutes != null
                      ? `${bookingState.driver.etaMinutes} min away`
                      : null
                return (
                  <TripSheetCard
                    enabled={uberTripCard}
                    hideTitleHeader={tripSheetMapFirstHeader}
                    title={jc.title}
                    secondaryAction={
                      tripSheetMapFirstHeader
                        ? undefined
                        : { label: 'Start over', onClick: goBackToIntent }
                    }
                    helpAction={
                      tripSheetMapFirstHeader
                        ? undefined
                        : uberTripCard
                          ? { onClick: openBrainFromHome }
                          : null
                    }
                  >
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
                    {uberTripCard ? (
                      <div className="mb-3">
                        <TripDriverStatusStrip
                          driver={bookingState.driver}
                          statusLabel={liveStatusLabel}
                          statusTone={
                            stLive === 'en_route' || stLive === 'in_progress' ? 'emphasis' : 'neutral'
                          }
                          etaLine={liveEtaLine}
                          detailLine={jc.line}
                          leading={isWireStatusMatching(bookingState.bookingStatus) ? 'spinner' : 'avatar'}
                        />
                      </div>
                    ) : (
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
                        {bookingState.driver && isWireStatusActiveForDriverGps(bookingState.bookingStatus) ? (
                          <p className="mt-2 text-[11px] font-medium text-fetch-charcoal/85">
                            {bookingState.driver.vehicle ? `${bookingState.driver.vehicle} · ` : ''}
                            {bookingState.driver.rating != null ? `${bookingState.driver.rating}★` : ''}
                          </p>
                        ) : null}
                      </>
                    )}
                    {isWireStatusMatching(bookingState.bookingStatus) ? (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2">
                          {!uberTripCard ? (
                            <div className="fetch-stage-spinner h-3 w-3 animate-spin rounded-full" />
                          ) : null}
                          <p className="text-[12px] font-medium text-fetch-muted/80">
                            {(() => {
                              void matchUiTick
                              const start = bookingState.matchingMeta?.matchStartedAt
                              const pool = bookingState.matchingMode !== 'sequential'
                              if (start == null) {
                                return pool
                                  ? 'Searching — nearby drivers can claim your job.'
                                  : 'Searching — contacting drivers in order…'
                              }
                              const sec = Math.max(0, Math.floor((Date.now() - start) / 1000))
                              const elapsed =
                                sec >= 60
                                  ? `${Math.floor(sec / 60)}m ${sec % 60}s`
                                  : `${sec}s`
                              return pool
                                ? `Waiting for a driver · ${elapsed}`
                                : `Matching · ${elapsed}`
                            })()}
                          </p>
                        </div>
                        {bookingState.matchingMode === 'sequential' &&
                        bookingState.matchingMeta?.activeDriverId ? (
                          <p className="pl-5 text-[11px] font-medium text-fetch-muted/75">
                            Offer is with a specific driver — waiting for them to accept or pass.
                          </p>
                        ) : null}
                        {bookingState.matchingMode === 'sequential' &&
                        bookingState.matchingMeta?.activeDriverId
                          ? (() => {
                              const offerLine = formatSequentialOfferCountdownLine(
                                bookingState.matchingMeta,
                              )
                              return offerLine ? (
                                <p className="pl-5 text-[11px] font-medium text-fetch-muted/70">
                                  {offerLine}
                                </p>
                              ) : null
                            })()
                          : null}
                        {bookingState.matchingMode === 'sequential' &&
                        bookingState.matchingMeta != null &&
                        (bookingState.matchingMeta.driversContacted ?? 0) > 0 ? (
                          <p className="pl-5 text-[11px] font-medium text-fetch-muted/70">
                            Drivers contacted: {bookingState.matchingMeta.driversContacted}
                          </p>
                        ) : bookingState.matchingMode === 'pool' ||
                          bookingState.matchingMode == null ? (
                          <p className="pl-5 text-[11px] font-medium text-fetch-muted/70">
                            Open pool: drivers see your job on their dashboard when online nearby.
                          </p>
                        ) : null}
                        {(() => {
                          void matchUiTick
                          const meta = bookingState.matchingMeta
                          const start = meta?.matchStartedAt
                          const pool =
                            bookingState.matchingMode === 'pool' || bookingState.matchingMode == null
                          if (!pool || start == null) return null
                          const sec = Math.max(0, Math.floor((Date.now() - start) / 1000))
                          if (sec < 20 || (meta?.driversContacted ?? 0) > 0) return null
                          return (
                            <p className="pl-5 text-[11px] font-medium text-amber-200/85 [text-wrap:pretty]">
                              Still no drivers on this job — make sure at least one driver is online in the
                              driver dashboard, or keep this screen open while drivers come available.
                            </p>
                          )
                        })()}
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
                  </TripSheetCard>
                )
              })()
            : showPostScan && sheetDisplayPricing ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              title={stripeBookCheckout ? 'Pay to confirm' : 'Your quote'}
              secondaryAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : { label: 'Start over', onClick: goBackToIntent }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
            >
            <section className="fetch-home-booking-step fetch-home-booking-step--stack w-full">
              <div className="fetch-home-booking-step__main min-h-0">
                {stripeBookCheckout ? (
                  <p className="mt-0.5 text-[10px] font-medium leading-snug text-fetch-muted/80 [text-wrap:pretty]">
                    Secure card payment locks your booking; next we find a driver.
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] font-medium leading-snug text-fetch-muted/80 [text-wrap:pretty]">
                    Review the estimate, then pay to confirm. After payment we start driver matching.
                  </p>
                )}

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
                {isStripePublishableConfigured()
                  ? 'When the server uses Stripe, you pay with the secure card form below. Otherwise Book now charges your default card from Profile on the Fetch server (demo storage on this device — see Profile).'
                  : 'Book now creates a payment intent on the Fetch server and confirms it with your default card from Profile (demo storage on this device — see Profile for details).'}
              </p>
              {stripeBookCheckout && import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ? (
                <div className="mt-3 rounded-2xl border border-white/[0.08] bg-black/25 p-3">
                  <p className="text-[11px] font-semibold text-fetch-charcoal/90">Card payment (Stripe)</p>
                  <p className="mt-1 text-[10px] text-fetch-muted/80 [text-wrap:pretty]">
                    Pay to confirm. Ensure webhooks reach <code className="text-fetch-muted">/api/payments/webhook</code>{' '}
                    (e.g. <code className="text-fetch-muted">stripe listen</code>) so the server can unlock dispatch.
                  </p>
                  <FetchStripePaymentElement
                    publishableKey={import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()}
                    clientSecret={stripeBookCheckout.clientSecret}
                    submitLabel={bookNowBusy ? 'Confirming…' : 'Pay & book'}
                    disabled={bookNowBusy}
                    errorText={bookNowError}
                    onError={(msg) => setBookNowError(msg)}
                    onSuccess={() => {
                      void (async () => {
                        const draft = stripeBookCheckout
                        if (!draft) return
                        setBookNowBusy(true)
                        setBookNowError(null)
                        try {
                          const pi = await waitForPaymentIntentServerConfirmed(draft.paymentIntent.id)
                          if (pi.status !== 'succeeded') {
                            throw new Error(`Payment did not complete (status: ${pi.status}).`)
                          }
                          setStripeBookCheckout(null)
                          await finalizePaidBookingAfterCharge(pi, draft.payAmount)
                        } catch (e) {
                          setBookNowError(
                            e instanceof Error ? e.message : 'Payment confirmation failed.',
                          )
                        } finally {
                          setBookNowBusy(false)
                        }
                      })()
                    }}
                  />
                  <button
                    type="button"
                    disabled={bookNowBusy}
                    className="mt-2 w-full text-[11px] font-medium text-fetch-muted underline decoration-fetch-muted/35"
                    onClick={() => {
                      setStripeBookCheckout(null)
                      setBookNowError(null)
                    }}
                  >
                    Cancel card checkout
                  </button>
                </div>
              ) : null}
              </div>
              <div
                className={
                  uberTripCard
                    ? 'fetch-home-booking-step__footer fetch-trip-sheet-card__footer-pinned border-t border-fetch-charcoal/[0.06] pt-3'
                    : 'fetch-home-booking-step__footer'
                }
              >
              <button
                type="button"
                disabled={bookNowBusy || !sheetDisplayPricing || Boolean(stripeBookCheckout)}
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
                    try {
                      const pi0 = await createPaymentIntent({
                        amount: payAmount,
                        bookingId: bookingStateRef.current.bookingId,
                      })
                      if (pi0.provider === 'stripe') {
                        if (!isStripePublishableConfigured()) {
                          throw new Error(
                            'Stripe is enabled on the server. Set VITE_STRIPE_PUBLISHABLE_KEY for the app.',
                          )
                        }
                        if (!pi0.clientSecret) {
                          throw new Error('Stripe payment intent is missing clientSecret.')
                        }
                        setStripeBookCheckout({
                          clientSecret: pi0.clientSecret,
                          paymentIntent: pi0,
                          payAmount,
                        })
                        return
                      }
                      const pi = await confirmDemoPaymentIntent(pi0)
                      if (pi.status !== 'succeeded') {
                        throw new Error(
                          `Payment did not complete (status: ${pi.status}).${
                            pi.lastError ? ` ${pi.lastError}` : ''
                          }`,
                        )
                      }
                      await finalizePaidBookingAfterCharge(pi, payAmount)
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
                        'Payment did not go through. Open Profile and check your card number, security code, and expiry.',
                        { debounceKey: 'book_now_pay_err', debounceMs: 0, withVoiceHold: true },
                      )
                    } finally {
                      setBookNowBusy(false)
                    }
                  })()
                }}
                className="fetch-stage-primary-btn w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bookNowBusy ? 'Processing payment…' : 'Book now'}
              </button>
              </div>
            </section>
            </TripSheetCard>
          ) : showPostScan ? (
            <TripSheetCard
              enabled={uberTripCard}
              hideTitleHeader={tripSheetMapFirstHeader}
              title="Building your quote"
              secondaryAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : { label: 'Start over', onClick: goBackToIntent }
              }
              helpAction={
                tripSheetMapFirstHeader
                  ? undefined
                  : uberTripCard
                    ? { onClick: openBrainFromHome }
                    : null
              }
            >
              {!uberTripCard ? (
                <section
                  className="fetch-home-booking-step fetch-home-booking-step--stack w-full"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <div className="fetch-home-booking-step__main flex min-h-0 flex-1 flex-col justify-center">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[14px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
                        Building your quote
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
                      Items are saved. Next you will review price, then pay to confirm.
                    </p>
                    <div className="fetch-booking-quote-skeleton mt-3 w-full max-w-[16rem]">
                      <div className="fetch-booking-quote-skeleton__bar fetch-skeleton-shimmer w-[88%]" />
                      <div className="fetch-booking-quote-skeleton__bar fetch-skeleton-shimmer w-[72%]" />
                      <div className="fetch-booking-quote-skeleton__bar fetch-skeleton-shimmer w-[56%]" />
                    </div>
                  </div>
                </section>
              ) : (
                <div aria-busy="true" aria-live="polite">
                  <p className="text-[12px] font-medium leading-snug text-fetch-muted/90">
                    Items are saved. Building your quote — then review and pay.
                  </p>
                  <div className="fetch-booking-quote-skeleton mt-3 w-full max-w-[16rem]">
                    <div className="fetch-booking-quote-skeleton__bar fetch-skeleton-shimmer w-[88%]" />
                    <div className="fetch-booking-quote-skeleton__bar fetch-skeleton-shimmer w-[72%]" />
                    <div className="fetch-booking-quote-skeleton__bar fetch-skeleton-shimmer w-[56%]" />
                  </div>
                </div>
              )}
            </TripSheetCard>
          ) : null}
          </>
        )}
      </FetchHomeBookingSheet>
      </>
      ) : null}

      {!brainImmersive &&
      homeShellTab === 'marketplace' &&
      cardVisible &&
      homeBrainFlow == null ? (
        <HomeShellMarketplacePage
          bottomNav={showHomeShellChrome ? homeShellFooterNav : null}
          hardwareProducts={HARDWARE_PRODUCTS}
          onMenuAccount={onAccountNavigate}
          dropsProductHandoff={dropsProductHandoff}
          onDropsProductHandoffConsumed={clearDropsProductHandoff}
          onOpenListingChat={openListingChatHandoff}
          onBookDriver={onBuySellBookDriver}
          dropsListingHandoff={dropsListingHandoff}
          onDropsListingHandoffConsumed={clearDropsListingHandoff}
        />
      ) : null}

      {!brainImmersive &&
      homeShellTab === 'reels' &&
      cardVisible &&
      homeBrainFlow == null ? (
        <HomeShellReelsPage
          bottomNav={showHomeShellChrome ? homeShellFooterNav : null}
          onMenuAccount={onAccountNavigate}
          onCommerceAction={onDropsCommerceAction}
          dropsNavRepeatTick={dropsNavRepeatTick}
        />
      ) : null}

      {!brainImmersive &&
      homeShellTab === 'chat' &&
      cardVisible &&
      homeBrainFlow == null ? (
        <HomeShellChatHubPage
          bottomNav={showHomeShellChrome ? homeShellFooterNav : null}
          onMenuAccount={onAccountNavigate}
          onChatWithField={onChatHubOpenField}
          initialThreadId={pendingChatThreadId}
          onConsumedInitialThread={() => setPendingChatThreadId(null)}
          listingUnread={messagesUnread.listing}
          supportUnread={messagesUnread.support}
          onFetchIt={onChatFetchItListing}
        />
      ) : null}

      {!brainImmersive &&
      !shellShopOrChat &&
      !bookingSheetFocusMode &&
      orbChatTurns.length > 0 ? (
        <div
          className={[
            'fetch-home-orb-chat-stack pointer-events-none fixed z-[57] flex flex-col',
            orbTopLeftOnNavMap
              ? 'left-3 right-3 w-auto max-w-none translate-x-0'
              : 'left-1/2 w-[min(21rem,calc(100%-1.75rem))] max-w-[min(21rem,calc(100%-1.75rem))] -translate-x-1/2',
          ].join(' ')}
          style={{
            top: orbTopLeftOnNavMap
              ? 'calc(max(0.5rem, env(safe-area-inset-top)) + 4rem + 0.35rem)'
              : 'max(0.5rem, env(safe-area-inset-top))',
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

      {!brainImmersive && !shellShopOrChat ? (
        <div
          className={[
            'fetch-home-orb-sheet-follow pointer-events-none fixed z-[58] flex flex-col',
            orbTopLeftOnNavMap
              ? 'fetch-home-orb-sheet-follow--nav-map-top-left items-start will-change-[top,left]'
              : 'items-center will-change-[bottom]',
            sheetGestureActive ? 'fetch-home-orb-sheet-follow--no-transition' : '',
            homeBrainFlow === 'tunnel' ? 'fetch-home-orb-tunnel-drop' : '',
          ].join(' ')}
          style={
            orbTopLeftOnNavMap
              ? undefined
              : {
                  bottom:
                    homeOrbBottomPx != null
                      ? `${homeOrbBottomPx}px`
                      : 'calc(max(1.1rem, env(safe-area-inset-bottom)) + min(calc((8.625rem + 3.5dvh) * 1.4), calc(16dvh * 1.4), calc(10rem * 1.4)) + 8px - 6.5rem * 0.5 + 12px)',
                }
          }
        >
          <div
            className={[
              'relative flex flex-col',
              orbTopLeftOnNavMap ? 'items-start' : 'items-center',
            ].join(' ')}
          >
            {orbEphemeralBubble && !bookingSheetFocusMode ? (
              <div
                className={[
                  'fetch-home-orb-speech-bubble pointer-events-none absolute z-[1] w-[min(20rem,calc(100%-2.5rem))] max-w-[min(20rem,calc(100%-2.5rem))]',
                  orbTopLeftOnNavMap
                    ? 'left-0 top-full mt-2 translate-x-0'
                    : 'bottom-[calc(100%+0.65rem)] left-1/2 -translate-x-1/2',
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
            ) : showIntent &&
              !orbTopLeftOnNavMap &&
              !suppressHomeOrbDock &&
              intentOrbHintBubble ? (
              <div
                className="fetch-home-orb-intent-hint-bubble pointer-events-none absolute bottom-[calc(100%+0.65rem)] left-1/2 z-[1] w-[min(18.5rem,calc(100%-2.25rem))] max-w-[min(18.5rem,calc(100%-2.25rem))] -translate-x-1/2"
                role="status"
                aria-live="polite"
              >
                <p className="px-3.5 py-2.5 text-center text-[12px] font-medium leading-snug tracking-[-0.01em] text-fetch-charcoal/88 [text-wrap:pretty]">
                  {HOME_INTENT_ORB_BUBBLE_HINT}
                </p>
              </div>
            ) : null}
            <>
              {suppressHomeOrbDock ? (
                <div
                  className={[
                    'pointer-events-none shrink-0',
                    orbTopLeftOnNavMap ? 'h-16 w-16' : 'h-[6.5rem] w-[6.5rem]',
                  ].join(' ')}
                  aria-hidden
                />
              ) : showIntent && !orbTopLeftOnNavMap ? (
                <div className="fetch-home-orb-dock fetch-home-orb-dock--intent-nudge pointer-events-none flex flex-col items-center">
                  <div
                    className={[
                      'fetch-home-orb-vision-halo pointer-events-none flex h-[6.5rem] w-[6.5rem] items-center justify-center',
                      fetchDogEarsActive ? 'overflow-visible' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-orb-idle={orbState === 'idle' && !isSpeechPlaying ? 'true' : undefined}
                  >
                    <FetchVoiceCommandFab
                      homeSheetDock
                      dogEars={fetchDogEarsActive}
                      onboardingPulse={false}
                      expression={orbExpression}
                      orbState={orbState}
                      pulseNonce={0}
                      typingActive={false}
                      awakened={orbAwakened}
                      voiceLevel={homeOrbVoiceLevel}
                      confirmationNonce={confirmNonce + voiceHoldPulseNonce}
                      mapAttention={orbMapAttention}
                      lookAtCard={Boolean(
                        !bookingSheetFocusMode &&
                          (orbChatTurns.length > 0 ||
                            voiceHoldCaption ||
                            orbEphemeralBubble ||
                            intentOrbHintBubble) &&
                          !isSpeechPlaying,
                      )}
                      glowColor={orbGlowColor}
                      orbAppearance={themeResolved === 'light' ? 'day' : 'night'}
                      autonomous={orbDockAutonomous}
                      suspendAutonomous={Boolean(orbBurstExpression)}
                      onOpen={openBrainFromHome}
                      onSheetPullExpand={
                        !brainImmersive && showIntent && cardVisible
                          ? onIntentSheetPullExpand
                          : undefined
                      }
                    />
                  </div>
                </div>
              ) : (
                <div
                  className={[
                    'fetch-home-orb-vision-halo pointer-events-none flex items-center justify-center',
                    orbTopLeftOnNavMap ? 'h-16 w-16' : 'h-[6.5rem] w-[6.5rem]',
                    fetchDogEarsActive ? 'overflow-visible' : '',
                    bookingSheetFocusMode ? 'fetch-home-orb-vision-halo--booking-min' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-orb-idle={orbState === 'idle' && !isSpeechPlaying ? 'true' : undefined}
                >
                  <FetchVoiceCommandFab
                    homeSheetDock
                    homeSheetDockCompact={orbTopLeftOnNavMap}
                    dogEars={fetchDogEarsActive}
                    onboardingPulse={false}
                    expression={orbExpression}
                    orbState={orbState}
                    pulseNonce={0}
                    typingActive={false}
                    awakened={orbAwakened}
                    voiceLevel={homeOrbVoiceLevel}
                    confirmationNonce={confirmNonce + voiceHoldPulseNonce}
                    mapAttention={orbMapAttention}
                    lookAtCard={Boolean(
                      !bookingSheetFocusMode &&
                        (orbChatTurns.length > 0 ||
                          voiceHoldCaption ||
                          orbEphemeralBubble) &&
                        !isSpeechPlaying,
                    )}
                    glowColor={orbGlowColor}
                    orbAppearance={themeResolved === 'light' ? 'day' : 'night'}
                    autonomous={orbDockAutonomous}
                    suspendAutonomous={Boolean(orbBurstExpression)}
                    minimalDockPresentation={bookingSheetFocusMode}
                    onOpen={openBrainFromHome}
                    onSheetPullExpand={
                      !brainImmersive && showIntent && cardVisible && !orbTopLeftOnNavMap
                        ? onIntentSheetPullExpand
                        : undefined
                    }
                  />
                </div>
              )}
            </>
          </div>
        </div>
      ) : null}

      {homeBrainFlow === 'clarity' || homeBrainFlow === 'brain' ? (
        <FetchBrainMemoryOverlay
          flowPhase={homeBrainFlow}
          onClose={exitBrainChatToServiceSelector}
          theme={themeResolved}
          mind={fetchBrainMind}
          orbAppearance={themeResolved === 'light' ? 'day' : 'night'}
          brainReplyPending={brainAiPending || brainPlacesLoading}
          glowRgb={GLOW_BLUE}
          instantReveal={brainSkipReveal}
          onBrainUtterance={runBrainAiUtterance}
          onBrainListeningChange={onBrainListeningChange}
          lastAssistantLine={brainLastReply}
          onBrainPhotoSelected={onBrainPhotoSelected}
          snapshot={brainAccountSnapshot}
          focusedMemoryId={brainFocusedMemoryId}
          onFocusedMemoryIdChange={setBrainFocusedMemoryId}
          fieldPlaces={brainFieldPlaces}
          onDismissFieldPlaces={dismissBrainFieldPlaces}
          onFieldPlaceOpenMaps={onBrainFieldPlaceMaps}
          onFieldPlaceLiked={onBrainFieldPlaceLiked}
          onFieldPlacePass={onBrainFieldPlacePass}
          memoriesSheetOpen={brainMemoriesSheetOpen}
          onMemoriesSheetClose={() => setBrainMemoriesSheetOpen(false)}
          choiceSheet={brainInteractionSheet}
          onChoiceSheetSubmit={handleBrainChoiceSheetSubmit}
          onChoiceSheetDismiss={() => setBrainInteractionSheet(null)}
          onAssistantChatFeedback={onBrainAssistantChatFeedback}
          onServiceIntakeComplete={(msg) => {
            void runBrainAiUtterance(msg)
          }}
          onNewBrainChat={startNewBrainChat}
          autoVoiceEpoch={brainAutoVoiceEpoch}
          voiceRelistenEpoch={brainVoiceRelistenEpoch}
          onBrainPricePay={beginBrainFieldSecurePayment}
          onBrainPriceCourtesy={onBrainFieldPriceCourtesy}
          focusComposerNonce={brainComposerFocusNonce}
        />
      ) : null}

      <HomeServiceInfoSheet
        open={serviceInfoLandingId != null}
        landingId={serviceInfoLandingId}
        onClose={() => setServiceInfoLandingId(null)}
        onConfirmBooking={onServiceInfoConfirmBooking}
      />

      <MysteryAdventurePanel
        open={mysteryPanel.mode !== 'closed'}
        loading={mysteryPanel.mode === 'loading'}
        experienceKind={mysteryPanel.mode === 'closed' ? 'adventure' : mysteryPanel.flavor}
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
        onAnother={() => {
          if (mysteryPanel.mode === 'ready' && mysteryPanel.flavor === 'restaurant') {
            void handleRestaurantWonder()
          } else {
            void handleMysteryAdventure()
          }
        }}
      />

      {streetViewPosition && mapsJsReady ? (
        <FetchStreetViewOverlay
          position={streetViewPosition}
          onClose={() => setStreetViewPosition(null)}
        />
      ) : null}

    </div>
    </div>
  )
}