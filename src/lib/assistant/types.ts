export type BookingMode = 'idle' | 'building' | 'pricing' | 'searching' | 'matched' | 'live'
export type BookingStage = BookingMode
export type BookingJobType =
  | 'junkRemoval'
  | 'deliveryPickup'
  | 'heavyItem'
  | 'homeMoving'
  | 'helper'
  | 'cleaning'
export type BookingFlowStep =
  | 'intent'
  | 'pickup'
  | 'dropoff'
  | 'refinement'
  | 'route'
  | 'quote'
  | 'payment'
  | 'dispatch'
  | 'live'
export type JobLane =
  | 'single_item_small_move'
  | 'junk_removal'
  | 'whole_home_move'
  | 'delivery_pickup'

export type BookingServiceType = 'move' | 'pickup' | 'remove' | 'helpers' | 'cleaning'
export type BookingServiceMode = 'pickup' | 'junk' | 'move' | 'helpers' | 'cleaning'
export type BookingInputSource = 'text' | 'scan' | 'quick_action' | 'voice'

export type BookingPlace = {
  placeId: string
  formattedAddress: string
  name?: string
}

export type BookingCoords = {
  lat: number
  lng: number
}

export type BookingRoute = {
  polyline?: string
  path?: BookingCoords[]
  distanceMeters?: number
  durationSeconds?: number
  /** True while path is a straight placeholder until Google Directions returns. */
  provisional?: boolean
}

/** Bump when quote math or inputs change materially (audit / support). */
export const BOOKING_QUOTE_VERSION = 2 as const

export type BookingPricing = {
  minPrice: number
  maxPrice: number
  currency: 'AUD'
  estimatedDuration: number
  explanation: string
  /** Uber-style single number (rounded subtotal). */
  totalPrice?: number
  /** Amount to authorize or charge now (demo: full total). */
  depositDueNow?: number
  /** Pay-after-job remainder (demo: 0). */
  balanceRemaining?: number
  /** True when distance/duration came from address heuristic, not a real route. */
  usedRouteFallback?: boolean
  quoteVersion?: typeof BOOKING_QUOTE_VERSION
  /** Set when the quote is frozen at booking confirmation. */
  lockedQuoteAt?: number
}

export type BookingQuoteBreakdown = {
  baseFee: number
  routeFee: number
  routeTimeFee: number
  inventoryFee: number
  accessFee: number
  disposalFee: number
  helperFee: number
  /** Specialty / bulky item surcharges (pool table, spa, etc.) — not multiplied by move size. */
  specialtyFee: number
  specialtyLines: { label: string; aud: number }[]
  moveSizeMultiplier: number
  subtotal: number
  spread: number
  totalItems: number
  autoHelpers: number
}

export type BookingRoomCategory =
  | 'living room'
  | 'bedroom'
  | 'kitchen'
  | 'laundry'
  | 'garage'
  | 'outdoor'

export type BookingPriceRange = {
  min: number
  max: number
  estimatedDurationMin: number
}

export type BookingDriver = {
  name: string
  vehicle?: string
  etaMinutes?: number
  rating?: number
}

export type BookingDriverLocation = {
  lat: number
  lng: number
  heading?: number
  updatedAt: number
}

export type BookingLifecycleStatus =
  | 'draft'
  | 'payment_required'
  | 'confirmed'
  /** @deprecated Prefer pending_match; still accepted from older server data. */
  | 'dispatching'
  /** Paid job: matching engine is cycling driver offers (Uber-style). */
  | 'pending_match'
  | 'matched'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  /** Matching window exhausted — customer may retry dispatch or cancel. */
  | 'match_failed'
  | 'cancelled'

export type BookingPaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'processing'
  | 'succeeded'
  | 'failed'

export type BookingAiReview = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  summary: string | null
  confidence: number | null
  riskLevel: 'low' | 'medium' | 'high' | null
  highlights: string[]
  blockers: string[]
  suggestedPrompt: string | null
  quoteBreakdown: BookingQuoteBreakdown | null
  lastReviewedAt: number | null
  errorMessage: string | null
}

/** Attached on successful confirm — demo only; full PAN must not be stored in production. */
export type BookingPaymentInstrument = {
  paymentMethodId: string | null
  brand: string | null
  /** Full card number digits (demo storage). */
  number: string | null
  last4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  /** True if a CVV was supplied at confirm time (value is never stored). */
  cvcProvided: boolean
}

export type BookingPaymentIntent = {
  id: string
  status: BookingPaymentIntentStatus
  amount: number
  currency: 'AUD'
  paymentMethodId: string | null
  clientSecret: string
  lastError: string | null
  createdAt: number
  confirmedAt: number | null
  instrument?: BookingPaymentInstrument | null
  bookingId?: string | null
  metadata?: Record<string, unknown> | null
  /** Demo checkout vs Stripe — dispatch may require webhook when `stripe`. */
  provider?: 'demo' | 'stripe'
  webhookConfirmedAt?: number | null
  stripePaymentIntentId?: string | null
}

/** Customer post-job rating persisted on the booking record (marketplace). */
export type BookingCustomerRating = {
  stars: 1 | 2 | 3 | 4 | 5
  note: string | null
  submittedAt: number
}

export type BookingTimelineEntry = {
  id: string
  kind:
    | 'draft_created'
    | 'ai_reviewed'
    | 'payment_required'
    | 'payment_confirmed'
    | 'booking_confirmed'
    | 'dispatching'
    | 'pending_match'
    | 'matched'
    | 'en_route'
    | 'arrived'
    | 'in_progress'
    | 'completed'
    | 'match_failed'
    | 'cancelled'
  title: string
  description: string
  createdAt: number
}

/** Server-driven driver matching (persisted on {@link BookingRecord}). */
export type BookingMatchingMeta = {
  matchStartedAt: number
  /** Monotonic count of offers issued (incl. expired rounds). */
  driversContacted: number
  activeOfferId: string | null
  activeDriverId: string | null
  offerSentAt: number | null
  offerTimeoutMs: number
  /** Cursor into ranked queue for the current pass. */
  candidateCursor: number
  /** Last computed ranking (debug / UI transparency). */
  rankedDriverIds: string[]
  /** Set when an offer clears (timeout / decline) — used for wave spacing. */
  lastOfferClearedAt?: number
}

export type BookingScanResult = {
  detectedItems: string[]
  estimatedSize: 'small' | 'medium' | 'large' | 'whole_home'
  notes?: string
  mainItems?: string[]
  specialItemType?: string | null
  isHeavyItem?: boolean
  isBulky?: boolean
  needsTwoMovers?: boolean
  needsSpecialEquipment?: boolean
  accessRisk?: 'low' | 'medium' | 'high' | null
}

export type BookingState = {
  mode: BookingMode
  jobType: BookingJobType | null
  flowStep: BookingFlowStep
  serviceMode: BookingServiceMode | null
  serviceType: BookingServiceType | null
  moveContext: 'whole_home' | 'standard' | null
  homeBedrooms: number | null
  moveSize: 'small' | 'medium' | 'large' | null
  moveBuilderMode: 'scan_rooms' | 'add_by_room' | 'typical_inventory' | null
  activeRoom: BookingRoomCategory | null
  roomInventory: Partial<Record<BookingRoomCategory, string[]>>
  disposalRequired: boolean | null
  internalDisposalDestination: string | null
  source: BookingInputSource | null
  detectedItems: string[]
  itemCounts: Record<string, number>
  inventorySummary: string | null
  /** Whitelist specialty slugs from chat / scan; duplicates count as quantity (capped per slug). */
  specialtyItemSlugs: string[]
  pickupAddressText: string
  pickupPlace: BookingPlace | null
  pickupCoords: BookingCoords | null
  dropoffAddressText: string
  dropoffPlace: BookingPlace | null
  dropoffCoords: BookingCoords | null
  route: BookingRoute | null
  distanceMeters: number | null
  durationSeconds: number | null
  pricing: BookingPricing | null
  quoteBreakdown: BookingQuoteBreakdown | null
  helperHours: number | null
  helperType: string | null
  helperNotes: string | null
  cleaningHours: number | null
  cleaningType: string | null
  cleaningNotes: string | null
  specialItemType: string | null
  isHeavyItem: boolean
  isBulky: boolean
  needsTwoMovers: boolean
  needsSpecialEquipment: boolean
  accessRisk: 'low' | 'medium' | 'high' | null
  accessDetails: {
    stairs: boolean | null
    lift: boolean | null
    carryDistance: number | null
    disassembly: boolean | null
  }
  scan: {
    images: string[]
    result: BookingScanResult | null
    confidence: number | null
  }
  matchingHandoff: {
    requestedAt: number | null
    ready: boolean
    payload: {
      serviceType: BookingServiceType
      pickupAddressText: string
      pickupCoords: BookingCoords | null
      dropoffAddressText: string
      dropoffCoords: BookingCoords | null
      route: BookingRoute | null
      pricing: BookingPricing | null
      detectedItems: string[]
      itemCounts: Record<string, number>
      accessDetails: BookingState['accessDetails']
      disposalRequired: boolean | null
    } | null
  }
  bookingId: string | null
  bookingStatus: BookingLifecycleStatus | null
  /** Populated when a live marketplace booking is matching or failed matching. */
  matchingMeta: BookingMatchingMeta | null
  /** Server dispatch mode: open pool vs sequential offers. */
  matchingMode: 'pool' | 'sequential' | null
  aiReview: BookingAiReview
  paymentIntent: BookingPaymentIntent | null
  selectedPaymentMethodId: string | null
  timeline: BookingTimelineEntry[]
  driver: BookingDriver | null
  /** Live GPS from marketplace (or null). Client may also keep server copy while polling. */
  driverLocation: BookingDriverLocation | null
  currentQuestion: string | null
  suggestions: string[]
  /** After route confirm, user tapped Next — item / describe step is active. */
  jobDetailsStarted: boolean
  /** User confirmed the scanned item list (job-details step). */
  jobDetailsItemsConfirmed: boolean
  /** User finished scan-first inventory step (Next). */
  jobDetailsScanStepComplete: boolean
  /** Junk: access details step complete; allows quote/pricing. */
  junkAccessStepComplete: boolean
  /** Junk: user advanced past the quote card toward booking confirmation (payment). */
  junkQuoteAcknowledged: boolean
  /** Junk: user tapped Confirm booking — unlocks pricing / payment mode. */
  junkConfirmStepComplete: boolean
  /** Set when server returns a persisted customer rating for this booking. */
  customerRating: BookingCustomerRating | null
  /**
   * Neural-field voice booking: courtesy % subtracted from quoted totals (e.g. user tapped “Add 5% off”).
   * Applied automatically in `computePriceForState` unless overridden in options.
   */
  fieldVoiceDiscountPercent: number
  /** Neural field: user wants ASAP dispatch vs a later window (from chat / bookingPatch). */
  fieldVoiceSchedulePreference: null | 'asap' | 'scheduled'
  /** Human-readable schedule e.g. “Saturday morning”. */
  fieldVoiceScheduledWindow: string | null
  /** Extra stops, multi-leg jobs, or second job — free text for quote summary UI. */
  fieldVoiceItineraryNote: string | null
}

export type UserInput = {
  text: string
  source?: BookingInputSource
  addressSelection?: {
    field: 'pickup' | 'dropoff'
    formattedAddress: string
    placeId: string
    coords: BookingCoords
    name?: string
  }
}

export type HandleUserInputResult = {
  bookingState: BookingState
  reply: string
}

export function createInitialBookingState(): BookingState {
  return {
    mode: 'idle',
    jobType: null,
    flowStep: 'intent',
    serviceMode: null,
    serviceType: null,
    moveContext: null,
    homeBedrooms: null,
    moveSize: null,
    moveBuilderMode: null,
    activeRoom: null,
    roomInventory: {},
    disposalRequired: null,
    internalDisposalDestination: null,
    source: null,
    detectedItems: [],
    itemCounts: {},
    inventorySummary: null,
    specialtyItemSlugs: [],
    pickupAddressText: '',
    pickupPlace: null,
    pickupCoords: null,
    dropoffAddressText: '',
    dropoffPlace: null,
    dropoffCoords: null,
    route: null,
    distanceMeters: null,
    durationSeconds: null,
    pricing: null,
    quoteBreakdown: null,
    helperHours: null,
    helperType: null,
    helperNotes: null,
    cleaningHours: null,
    cleaningType: null,
    cleaningNotes: null,
    specialItemType: null,
    isHeavyItem: false,
    isBulky: false,
    needsTwoMovers: false,
    needsSpecialEquipment: false,
    accessRisk: null,
    accessDetails: {
      stairs: null,
      lift: null,
      carryDistance: null,
      disassembly: null,
    },
    scan: {
      images: [],
      result: null,
      confidence: null,
    },
    matchingHandoff: {
      requestedAt: null,
      ready: false,
      payload: null,
    },
    bookingId: null,
    bookingStatus: null,
    matchingMeta: null,
    matchingMode: null,
    aiReview: {
      status: 'idle',
      summary: null,
      confidence: null,
      riskLevel: null,
      highlights: [],
      blockers: [],
      suggestedPrompt: null,
      quoteBreakdown: null,
      lastReviewedAt: null,
      errorMessage: null,
    },
    paymentIntent: null,
    selectedPaymentMethodId: null,
    timeline: [],
    driver: null,
    driverLocation: null,
    currentQuestion: 'What type of job is this?',
    suggestions: [
      'Junk removal',
      'Pick & drop',
      'Heavy item',
      'Home moving',
      'Helper',
      'Cleaning',
    ],
    jobDetailsStarted: false,
    jobDetailsItemsConfirmed: false,
    jobDetailsScanStepComplete: false,
    junkAccessStepComplete: false,
    junkQuoteAcknowledged: false,
    junkConfirmStepComplete: false,
    customerRating: null,
    fieldVoiceDiscountPercent: 0,
    fieldVoiceSchedulePreference: null,
    fieldVoiceScheduledWindow: null,
    fieldVoiceItineraryNote: null,
  }
}
