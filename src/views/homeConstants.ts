import type { BookingJobType, BookingLifecycleStatus, BookingState } from '../lib/assistant'

/** Legacy short line; home TTS uses `buildHomeWelcomeLine` (time + weather). */
export const INTRO_COPY = 'Fetch activated. What can I do for you today?'

/** Default line above the dock orb on the intent step (orb guide). */
export const INTENT_ORB_PROMPT =
  'What do you need done today? Tap an option below or ask me anything.'

/** Cycles in the intent chat composer placeholder to show what Fetch can do. */
export const INTENT_COMPOSER_PLACEHOLDER_HINTS: readonly string[] = [
  'Junk, move, deliver…',
  '“Drive to…” + traffic',
  'Photo + ask',
  'Pickup → drop-off',
  'Pricing help',
  'Extra hands?',
  'Bond clean?',
  'Tap wave to talk',
]

/** First-step sheet: large cards (matches primary services in the hero layout). */
export const LANDING_PRIMARY_SERVICES = [
  {
    id: 'home-moving',
    label: 'Moving',
    jobType: 'homeMoving' as const,
    tone: 'green' as const,
    /** Sample line Fetch might say after you pick this service (warm, AU tone). */
    fetchPersonalityExample:
      'Hayden, what are we moving today — and where are we taking it?',
  },
  {
    id: 'junk-removal',
    label: 'Junk Removal',
    jobType: 'junkRemoval' as const,
    tone: 'orange' as const,
    fetchPersonalityExample: 'Where is the junk located, Hayden?',
  },
  {
    id: 'delivery-pickup',
    label: 'Delivery',
    jobType: 'deliveryPickup' as const,
    tone: 'blue' as const,
    fetchPersonalityExample:
      'Hayden, what needs picking up, and where should we deliver it?',
  },
  {
    id: 'helper',
    label: 'Helper',
    jobType: 'helper' as const,
    tone: 'purple' as const,
    fetchPersonalityExample: 'Hayden, what do you need an extra pair of hands for?',
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    jobType: 'cleaning' as const,
    tone: 'teal' as const,
    fetchPersonalityExample:
      'Hayden, which place are we cleaning — regular tidy or a bond clean?',
  },
] as const

export const SERVICE_OPTIONS = [
  { id: 'junk-removal', label: 'Junk removal', jobType: 'junkRemoval' as const },
  { id: 'delivery-pickup', label: 'Delivery / pickup', jobType: 'deliveryPickup' as const },
  { id: 'home-moving', label: 'Home moving', jobType: 'homeMoving' as const },
  { id: 'helper', label: 'Helper', jobType: 'helper' as const },
  { id: 'cleaning', label: 'Cleaning', jobType: 'cleaning' as const },
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

export const IDLE_TO_SLEEPY_MS = 60_000
export const SLEEPY_COPY = "Feeling a bit sleepy. If you need anything, wake me up."
export const WAKE_COPY = 'Fetch activated. What can I do for you today?'
