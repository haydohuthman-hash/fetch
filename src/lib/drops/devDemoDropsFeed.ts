import type { FetchUserRecord } from '../fetchUserSession'
import { accountAuthorIdFromEmail } from './profileStore'

const SAMPLE_VIDEO_A =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
const SAMPLE_VIDEO_B =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'

/**
 * API-shaped rows merged into GET /api/drops/feed on localhost for the demo account
 * (see `getFetchDevDemoUserEmail` / server `FETCH_DEV_DEMO_USER_EMAIL`).
 */
export function buildDevDemoDropApiRows(session: FetchUserRecord): Record<string, unknown>[] {
  const authorId = session.id?.trim() || accountAuthorIdFromEmail(session.email)
  const nick = (session.displayName || session.email.split('@')[0] || 'Demo').trim().replace(/^@+/, '')
  const seller = nick.startsWith('@') ? nick : `@${nick}`

  return [
    {
      id: 'demo_drop_ringlight',
      title: 'Desk setup tour — ring light linked to listing',
      seller,
      authorId,
      priceLabel: '$89',
      blurb: 'Local demo drop: tap Fetch it to open the linked marketplace draft.',
      likes: 42,
      growthVelocityScore: 1.15,
      watchTimeMsSeed: 120_000,
      viewMsTotal: 48_000,
      categories: ['electronics', 'local_pickup'],
      region: 'SEQ',
      videoUrl: SAMPLE_VIDEO_A,
      mediaKind: 'video',
      commerce: { kind: 'buy_sell_listing', listingId: 'demo_lst_ringlight' },
      commerceSaleMode: 'buy_now',
      isOfficial: false,
      isSponsored: false,
    },
    {
      id: 'demo_drop_planter',
      title: 'Plant corner restyle — pots in bio',
      seller,
      authorId,
      priceLabel: '$45',
      blurb: 'Second demo clip with a different marketplace listing attached.',
      likes: 28,
      growthVelocityScore: 1.08,
      watchTimeMsSeed: 95_000,
      viewMsTotal: 31_000,
      categories: ['community', 'local_pickup'],
      region: 'SEQ',
      videoUrl: SAMPLE_VIDEO_B,
      mediaKind: 'video',
      commerce: { kind: 'buy_sell_listing', listingId: 'demo_lst_planter' },
      commerceSaleMode: 'buy_now',
      isOfficial: false,
      isSponsored: false,
    },
  ]
}
