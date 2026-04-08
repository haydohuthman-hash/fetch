import type { BookingJobType, BookingLifecycleStatus, BookingState } from '../lib/assistant'
import { getSessionPhaseJobCard, sessionPhaseFromWireStatus } from '../lib/booking/bookingSessionPhase'

/** Legacy short line; home TTS uses `buildHomeWelcomeLine` (time + weather). */
export const INTRO_COPY = 'Fetch activated. What can I do for you today?'

/** Default line above the dock orb on the intent step (orb guide). */
export const INTENT_ORB_PROMPT =
  'Tap Fetch to chat, a service to book a driver, or Nav for directions.'

/** Shown in a short speech bubble above the orb on the intent step (~10s). */
export const HOME_INTENT_ORB_BUBBLE_HINT = "Tap me or speak — I'm listening."

/** @deprecated Prefer `HOME_INTENT_ORB_BUBBLE_HINT` (bubble above orb). */
export const HOME_INTENT_ORB_LINE = 'Tap or speak for help'

/**
 * Local explore prompts — rotate after the first “full booking” placeholder in the composer.
 */
export const INTENT_COMPOSER_DISCOVERY_PLACEHOLDER_HINTS: readonly string[] = [
  'What\'s a good restaurant near me?',
  'What\'s a good park near me?',
  'Nice café nearby?',
  'Best coffee near me?',
  'Kid-friendly park close by?',
  'Quiet spot to work nearby?',
  'Scenic walk or lookout near me?',
]

/**
 * Default (non–intent-landing) composer: first line = full service / booking surface; rest = local asks.
 */
export const INTENT_COMPOSER_PLACEHOLDER_HINTS: readonly string[] = [
  'Book moving, junk, pick & drop, heavy item, helpers, or cleaning — addresses, photos, mic, or drive + traffic…',
  ...INTENT_COMPOSER_DISCOVERY_PLACEHOLDER_HINTS,
]

/**
 * Intent step (below service cards): first line ties to cards + full capabilities; rest = discovery-style asks.
 */
export const INTENT_COMPOSER_INTENT_LANDING_HINTS: readonly string[] = [
  'Tap a service card or type a job: move, junk, pick & drop, heavy item, help, clean — addresses, photos, mic, pricing…',
  ...INTENT_COMPOSER_DISCOVERY_PLACEHOLDER_HINTS,
]

/** @deprecated First line of INTENT_COMPOSER_INTENT_LANDING_HINTS; kept for older imports. */
export const INTENT_COMPOSER_SERVICE_PLACEHOLDER_STATIC = INTENT_COMPOSER_INTENT_LANDING_HINTS[0]!

/** Step-1 sheet: broader service prompts (e.g. analytics). */
export const INTENT_COMPOSER_SERVICE_PLACEHOLDER_HINTS: readonly string[] = [
  ...INTENT_COMPOSER_INTENT_LANDING_HINTS,
  'Bond clean or regular tidy?',
  "Extra hands — what's the job?",
  'Which service do you need?',
]

/**
 * Intent row: three compact choices (sell / categories / book driver).
 * Full service list: `ADVANCED_SERVICE_MENU_OPTIONS` in the “more” sheet.
 */
export const INTENT_COMPACT_PILLS = [
  {
    id: 'sell-for-you',
    label: 'Sell for you',
    kind: 'shell' as const,
    shellTab: 'buySell' as const,
  },
  {
    id: 'categories',
    label: 'Categories',
    kind: 'shell' as const,
    shellTab: 'marketplace' as const,
  },
  {
    id: 'book-driver',
    label: 'Book a driver',
    kind: 'job' as const,
    jobType: 'deliveryPickup' as const,
    fetchPersonalityExample:
      'Hayden, what are we picking up, and where should we drop it?',
  },
] as const

/** @deprecated Use `INTENT_COMPACT_PILLS` for the intent row; kept for scripts / analytics parity. */
export const LANDING_PRIMARY_SERVICES = [
  {
    id: 'home-moving',
    label: 'Moving',
    jobType: 'homeMoving' as const,
    tone: 'green' as const,
    cardHeading: 'Home move',
    fetchPersonalityExample:
      'Hayden, what are we moving today — and where are we taking it?',
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    jobType: 'cleaning' as const,
    tone: 'teal' as const,
    cardHeading: 'Bond clean',
    fetchPersonalityExample:
      'Hayden, which place are we cleaning — regular tidy or a bond clean?',
  },
  {
    id: 'delivery-pickup',
    label: 'Pick & drop',
    jobType: 'deliveryPickup' as const,
    tone: 'blue' as const,
    cardHeading: 'Pick & drop',
    fetchPersonalityExample:
      'Hayden, what are we picking up, and where should we drop it?',
  },
  {
    id: 'junk-removal',
    label: 'Junk removal',
    jobType: 'junkRemoval' as const,
    tone: 'orange' as const,
    cardHeading: 'Junk removal',
    fetchPersonalityExample: 'Where is the junk located, Hayden?',
  },
  {
    id: 'helper',
    label: 'Helper',
    jobType: 'helper' as const,
    tone: 'slate' as const,
    cardHeading: 'Help & labour',
    fetchPersonalityExample: 'Hayden, what do you need an extra pair of hands for?',
  },
] as const

export const SERVICE_OPTIONS = [
  { id: 'junk-removal', label: 'Junk removal', jobType: 'junkRemoval' as const },
  { id: 'delivery-pickup', label: 'Pick & drop', jobType: 'deliveryPickup' as const },
  { id: 'home-moving', label: 'Home moving', jobType: 'homeMoving' as const },
  { id: 'helper', label: 'Helper', jobType: 'helper' as const },
  { id: 'cleaning', label: 'Cleaning', jobType: 'cleaning' as const },
] as const

/** Full list for the “advanced” service sheet (includes heavy item + longer labels). */
export const ADVANCED_SERVICE_MENU_OPTIONS = [
  {
    id: 'junk-removal',
    label: 'Junk removal',
    jobType: 'junkRemoval' as const,
    personalityLine: 'Where is the junk located, Hayden?',
  },
  {
    id: 'delivery-pickup',
    label: 'Pick & drop',
    jobType: 'deliveryPickup' as const,
    personalityLine:
      'Hayden, what are we picking up, and where should we drop it?',
  },
  {
    id: 'home-moving',
    label: 'Home moving',
    jobType: 'homeMoving' as const,
    personalityLine: 'Hayden, what are we moving today — and where are we taking it?',
  },
  {
    id: 'heavy-item',
    label: 'Heavy item',
    jobType: 'heavyItem' as const,
    personalityLine:
      'What heavy item are we moving, Hayden — pianos, safes, and awkward loads?',
  },
  {
    id: 'helper',
    label: 'Helper / labour',
    jobType: 'helper' as const,
    personalityLine: 'Hayden, what do you need an extra pair of hands for?',
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    jobType: 'cleaning' as const,
    personalityLine:
      'Hayden, which place are we cleaning — regular tidy or a bond clean?',
  },
] as const

export const JOB_TYPE_TO_SERVICE_ID: Record<BookingJobType, string> = {
  junkRemoval: 'junk-removal',
  deliveryPickup: 'delivery-pickup',
  heavyItem: 'heavy-item',
  homeMoving: 'home-moving',
  helper: 'helper',
  cleaning: 'cleaning',
}

export function junkLiveJobCopy(
  status: BookingLifecycleStatus,
  driver: BookingState['driver'],
): { title: string; line: string } {
  return getSessionPhaseJobCard({ phase: sessionPhaseFromWireStatus(status), driver })
}

/** No “sleepy” orb / sleepy line until this much quiet time. */
export const IDLE_TO_SLEEPY_MS = 10 * 60_000

/**
 * After this much quiet time: dog ears + one friendly reminder line (before sleepy at 10m).
 */
export const IDLE_TO_FETCH_REMINDER_MS = 60_000

export const FETCH_IDLE_REMINDER_COPY =
  "If you need anything, I'll fetch it for you."

export const SLEEPY_COPY = "Feeling a bit sleepy. If you need anything, wake me up."
export const WAKE_COPY = 'Fetch activated. What can I do for you today?'
