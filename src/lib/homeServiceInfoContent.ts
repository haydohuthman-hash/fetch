import type { BookingJobType } from './assistant'

/**
 * Hero art: drop PNGs into `public/service-heroes/` (see filenames below).
 * Images are wide banners — UI crops with `object-position: right center`.
 */
export const HOME_SERVICE_HERO_PATHS: Partial<Record<BookingJobType, string>> = {
  deliveryPickup: '/service-heroes/pickup-delivery.png',
  homeMoving: '/service-heroes/home-moving.png',
  cleaning: '/service-heroes/bond-cleaning.png',
  junkRemoval: '/service-heroes/junk-removal.png',
}

export type HomeServiceLandingId =
  | 'home-moving'
  | 'cleaning'
  | 'delivery-pickup'
  | 'junk-removal'
  | 'helper'

export const LANDING_ID_TO_JOB_TYPE: Record<HomeServiceLandingId, BookingJobType> = {
  'home-moving': 'homeMoving',
  cleaning: 'cleaning',
  'delivery-pickup': 'deliveryPickup',
  'junk-removal': 'junkRemoval',
  helper: 'helper',
}

export type HomeServiceInfoCopy = {
  title: string
  subtitle: string
  body: string
  ctaLabel: string
}

export const HOME_SERVICE_INFO_BY_LANDING_ID: Record<HomeServiceLandingId, HomeServiceInfoCopy> = {
  'delivery-pickup': {
    title: 'Pick-Up & Delivery',
    subtitle: 'Fast, reliable door-to-door service',
    body:
      'From parcels to bulky items, we coordinate pickup and drop-off with clear timing and careful handling. Ideal for marketplace buys, store runs, and anything that needs a set of hands and a van.',
    ctaLabel: 'Start booking',
  },
  'home-moving': {
    title: 'Home Moving',
    subtitle: 'Pro packing & careful transport',
    body:
      'Room-to-room moves with optional pre-packing support. We plan access, protect floors and corners, and keep you updated from load-in to handover so moving day feels controlled, not chaotic.',
    ctaLabel: 'Get a quote',
  },
  cleaning: {
    title: 'Bond Cleaning',
    subtitle: 'Professional end-of-lease cleaning by Fetch',
    body:
      'Thorough bond-ready cleaning with attention to kitchens, wet areas, and detail checks. Regular tidies available too — tell us the property size and we’ll line up the right crew and timeframe.',
    ctaLabel: 'Get Help',
  },
  'junk-removal': {
    title: 'Junk Removal',
    subtitle: 'Fast, affordable clear-outs',
    body:
      'Garage cleanups, green waste, furniture, and mixed loads — we load, haul, and dispose responsibly. Great when you need space back quickly without hiring a skip yourself.',
    ctaLabel: 'Book now',
  },
  helper: {
    title: 'Help & Labour',
    subtitle: 'Extra hands on site',
    body:
      'Loading, assembly, event setup, or a second pair of hands for a few hours. Describe the task and duration — we’ll match strength and tools to the job.',
    ctaLabel: 'Get started',
  },
}
