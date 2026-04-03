export type BookingMode = 'idle' | 'building' | 'pricing' | 'searching' | 'matched' | 'live'
export type BookingStage = BookingMode
export type BookingJobType =
  | 'junkRemoval'
  | 'deliveryPickup'
  | 'heavyItem'
  | 'homeMoving'
  | 'helper'
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

export type BookingServiceType = 'move' | 'pickup' | 'remove' | 'helpers'
export type BookingServiceMode = 'pickup' | 'junk' | 'move' | 'helpers'
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
}

export type BookingPricing = {
  minPrice: number
  maxPrice: number
  currency: 'AUD'
  estimatedDuration: number
  explanation: string
}

export type BookingQuoteBreakdown = {
  baseFee: number
  routeFee: number
  routeTimeFee: number
  inventoryFee: number
  accessFee: number
  disposalFee: number
  helperFee: number
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

export type BookingLifecycleStatus =
  | 'draft'
  | 'payment_required'
  | 'confirmed'
  | 'dispatching'
  | 'matched'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
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
    | 'matched'
    | 'en_route'
    | 'arrived'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
  title: string
  description: string
  createdAt: number
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
  aiReview: BookingAiReview
  paymentIntent: BookingPaymentIntent | null
  selectedPaymentMethodId: string | null
  timeline: BookingTimelineEntry[]
  driver: BookingDriver | null
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
    currentQuestion: 'What type of job is this?',
    suggestions: [
      'Junk removal',
      'Delivery / pickup',
      'Heavy item',
      'Home moving',
      'Helper',
    ],
    jobDetailsStarted: false,
    jobDetailsItemsConfirmed: false,
    jobDetailsScanStepComplete: false,
    junkAccessStepComplete: false,
    junkQuoteAcknowledged: false,
    junkConfirmStepComplete: false,
  }
}
