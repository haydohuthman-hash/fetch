import type {
  BookingAiReview,
  BookingCoords,
  BookingDriver,
  BookingDriverLocation,
  BookingFlowStep,
  BookingJobType,
  BookingLifecycleStatus,
  BookingPaymentIntent,
  BookingPricing,
  BookingQuoteBreakdown,
  BookingRoute,
  BookingServiceMode,
  BookingServiceType,
  BookingState,
  BookingTimelineEntry,
} from '../assistant/types'

export type FetchAiBookingDraft = {
  jobType: BookingJobType | null
  flowStep?: BookingFlowStep
  serviceMode: BookingServiceMode | null
  serviceType: BookingServiceType | null
  moveContext?: BookingState['moveContext']
  moveBuilderMode?: BookingState['moveBuilderMode']
  activeRoom?: BookingState['activeRoom']
  roomInventory?: BookingState['roomInventory']
  source?: BookingState['source']
  internalDisposalDestination?: string | null
  pickupAddressText: string
  pickupCoords: BookingCoords | null
  dropoffAddressText: string
  dropoffCoords: BookingCoords | null
  route: BookingRoute | null
  pricing: BookingPricing | null
  quoteBreakdown: BookingQuoteBreakdown | null
  detectedItems: string[]
  itemCounts: Record<string, number>
  inventorySummary: string | null
  accessDetails: BookingState['accessDetails']
  disposalRequired: boolean | null
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
  accessRisk: BookingState['accessRisk']
  moveSize: BookingState['moveSize']
  homeBedrooms: number | null
  scanConfidence: number | null
  bookingId?: string | null
}

export type FetchAiReviewResponse = {
  draft: FetchAiBookingDraft
  ready: boolean
  missingFields: string[]
  blockers: string[]
  suggestedPrompt: string | null
  aiReview: BookingAiReview
  pricing: BookingPricing | null
  quoteBreakdown: BookingQuoteBreakdown | null
}

export type BookingRecord = {
  id: string
  status: BookingLifecycleStatus
  jobType: BookingJobType | null
  flowStep?: BookingFlowStep
  serviceMode: BookingServiceMode | null
  serviceType: BookingServiceType | null
  moveContext?: BookingState['moveContext']
  homeBedrooms?: number | null
  moveSize?: BookingState['moveSize']
  moveBuilderMode?: BookingState['moveBuilderMode']
  activeRoom?: BookingState['activeRoom']
  roomInventory?: BookingState['roomInventory']
  source?: BookingState['source']
  internalDisposalDestination?: string | null
  pickupAddressText: string
  pickupPlace?: BookingState['pickupPlace']
  pickupCoords: BookingCoords | null
  dropoffAddressText: string
  dropoffPlace?: BookingState['dropoffPlace']
  dropoffCoords: BookingCoords | null
  route: BookingRoute | null
  pricing: BookingPricing | null
  quoteBreakdown: BookingQuoteBreakdown | null
  aiReview: BookingAiReview
  detectedItems: string[]
  itemCounts: Record<string, number>
  inventorySummary: string | null
  accessDetails: BookingState['accessDetails']
  disposalRequired: boolean | null
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
  accessRisk: BookingState['accessRisk']
  paymentIntent: BookingPaymentIntent | null
  matchedDriver: BookingDriver | null
  driverLocation?: BookingDriverLocation | null
  /** When set, this booking is tied to a driver account (demo: localStorage id). */
  assignedDriverId?: string | null
  /**
   * When true, server-side demo dispatch timers do not auto-advance status;
   * the driver dashboard drives lifecycle via PATCH status.
   */
  driverControlled?: boolean
  timeline: BookingTimelineEntry[]
  createdAt: number
  updatedAt: number
}

export type BookingNotificationRecord = {
  id: string
  bookingId: string
  title: string
  message: string
  createdAt: number
  isRead: boolean
  updatedAt?: number
}

export type BookingMediaRecord = {
  id: string
  bookingId: string
  urlOrLocalRef: string
  type: string
  createdAt: number
  updatedAt: number
  uploadedBy: string
}

export type MarketplaceOfferStatus = 'pending' | 'accepted' | 'declined' | 'expired'

export type MarketplaceOffer = {
  offerId: string
  bookingId: string
  driverId: string
  status?: MarketplaceOfferStatus
  updatedAt?: number
}

export function bookingStateToDraft(state: BookingState): FetchAiBookingDraft {
  return {
    jobType: state.jobType,
    flowStep: state.flowStep,
    serviceMode: state.serviceMode,
    serviceType: state.serviceType,
    moveContext: state.moveContext,
    homeBedrooms: state.homeBedrooms,
    moveSize: state.moveSize,
    moveBuilderMode: state.moveBuilderMode,
    activeRoom: state.activeRoom,
    roomInventory: state.roomInventory,
    source: state.source,
    internalDisposalDestination: state.internalDisposalDestination,
    pickupAddressText: state.pickupAddressText,
    pickupCoords: state.pickupCoords,
    dropoffAddressText: state.dropoffAddressText,
    dropoffCoords: state.dropoffCoords,
    route: state.route,
    pricing: state.pricing,
    quoteBreakdown: state.quoteBreakdown,
    detectedItems: [...state.detectedItems],
    itemCounts: { ...state.itemCounts },
    inventorySummary: state.inventorySummary,
    accessDetails: { ...state.accessDetails },
    disposalRequired: state.disposalRequired,
    helperHours: state.helperHours,
    helperType: state.helperType,
    helperNotes: state.helperNotes,
    cleaningHours: state.cleaningHours,
    cleaningType: state.cleaningType,
    cleaningNotes: state.cleaningNotes,
    specialItemType: state.specialItemType,
    isHeavyItem: state.isHeavyItem,
    isBulky: state.isBulky,
    needsTwoMovers: state.needsTwoMovers,
    needsSpecialEquipment: state.needsSpecialEquipment,
    accessRisk: state.accessRisk,
    scanConfidence: state.scan.confidence,
    bookingId: state.bookingId,
  }
}

export function bookingRecordToStatePatch(record: BookingRecord): Partial<BookingState> {
  return {
    bookingId: record.id,
    bookingStatus: record.status,
    jobType: record.jobType,
    flowStep: record.flowStep ?? 'intent',
    serviceMode: record.serviceMode,
    serviceType: record.serviceType,
    moveContext: record.moveContext ?? null,
    homeBedrooms: record.homeBedrooms ?? null,
    moveSize: record.moveSize ?? null,
    moveBuilderMode: record.moveBuilderMode ?? null,
    activeRoom: record.activeRoom ?? null,
    roomInventory: record.roomInventory ?? {},
    source: record.source ?? null,
    internalDisposalDestination: record.internalDisposalDestination ?? null,
    pricing: record.pricing,
    quoteBreakdown: record.quoteBreakdown,
    aiReview: record.aiReview,
    paymentIntent: record.paymentIntent,
    driver: record.matchedDriver,
    driverLocation: record.driverLocation ?? null,
    timeline: record.timeline,
    pickupAddressText: record.pickupAddressText,
    pickupPlace: record.pickupPlace ?? null,
    pickupCoords: record.pickupCoords,
    dropoffAddressText: record.dropoffAddressText,
    dropoffPlace: record.dropoffPlace ?? null,
    dropoffCoords: record.dropoffCoords,
    route: record.route,
    detectedItems: [...record.detectedItems],
    itemCounts: { ...record.itemCounts },
    inventorySummary: record.inventorySummary,
    disposalRequired: record.disposalRequired,
    helperHours: record.helperHours,
    helperType: record.helperType,
    helperNotes: record.helperNotes,
    cleaningHours: record.cleaningHours,
    cleaningType: record.cleaningType,
    cleaningNotes: record.cleaningNotes,
    specialItemType: record.specialItemType,
    isHeavyItem: record.isHeavyItem,
    isBulky: record.isBulky,
    needsTwoMovers: record.needsTwoMovers,
    needsSpecialEquipment: record.needsSpecialEquipment,
    accessRisk: record.accessRisk,
    accessDetails: { ...record.accessDetails },
  }
}

/**
 * Payload for `POST /api/marketplace/bookings` after payment — server runs `reviewBookingDraft` and persists.
 */
export function bookingStateToConfirmedUpsertPayload(
  state: BookingState,
  id: string,
): Partial<BookingRecord> & { id: string; status: 'confirmed' } {
  return {
    id,
    status: 'confirmed',
    jobType: state.jobType,
    flowStep: state.flowStep,
    serviceMode: state.serviceMode,
    serviceType: state.serviceType,
    moveContext: state.moveContext ?? null,
    homeBedrooms: state.homeBedrooms,
    moveSize: state.moveSize,
    moveBuilderMode: state.moveBuilderMode ?? null,
    activeRoom: state.activeRoom ?? null,
    roomInventory: state.roomInventory ?? {},
    source: state.source ?? null,
    internalDisposalDestination: state.internalDisposalDestination ?? null,
    pickupAddressText: state.pickupAddressText,
    pickupPlace: state.pickupPlace ?? undefined,
    pickupCoords: state.pickupCoords,
    dropoffAddressText: state.dropoffAddressText,
    dropoffPlace: state.dropoffPlace ?? undefined,
    dropoffCoords: state.dropoffCoords,
    route: state.route,
    pricing: state.pricing,
    quoteBreakdown: state.quoteBreakdown,
    aiReview: state.aiReview,
    detectedItems: [...state.detectedItems],
    itemCounts: { ...state.itemCounts },
    inventorySummary: state.inventorySummary,
    accessDetails: { ...state.accessDetails },
    disposalRequired: state.disposalRequired,
    helperHours: state.helperHours,
    helperType: state.helperType,
    helperNotes: state.helperNotes,
    cleaningHours: state.cleaningHours,
    cleaningType: state.cleaningType,
    cleaningNotes: state.cleaningNotes,
    specialItemType: state.specialItemType,
    isHeavyItem: state.isHeavyItem,
    isBulky: state.isBulky,
    needsTwoMovers: state.needsTwoMovers,
    needsSpecialEquipment: state.needsSpecialEquipment,
    accessRisk: state.accessRisk,
    paymentIntent: state.paymentIntent,
    matchedDriver: null,
    timeline: [...state.timeline],
  }
}

export function getActiveBooking(bookings: BookingRecord[]): BookingRecord | null {
  const active = bookings.find(
    (booking) => !['completed', 'cancelled'].includes(booking.status),
  )
  return active ?? null
}
