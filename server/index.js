import express from 'express'
import multer from 'multer'
import cors from 'cors'
import dotenv from 'dotenv'
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPaymentIntentRecord, reviewBookingDraft as reviewFetchAiBookingDraft } from './lib/fetch-ai-booking.js'
import { buildFetchAiSystemContentFull, FETCH_AI_PROMPT_REV } from './llm/fetchAiChatPrompt.js'
import { retrieveFetchChatRagSnippet } from './llm/fetchChatRag.js'
import {
  anthropicApiKeyForChat,
  openAiApiKeyForChat,
  resolveChatLlmConfig,
} from './llm/chatProvider.js'
import { runFetchAiChatTurn } from './llm/fetchChatRunner.js'
import {
  createStripeConnectPaymentIntent,
  createStripePaymentIntentOnStripe,
  isStripeWebhookEventProcessed,
  localRecordFromStripePaymentIntent,
  markStripeWebhookEventProcessed,
} from './lib/stripe-payments.js'
import { getHardwareSkuPriceAud } from './lib/hardware-catalog.js'
import { getSupplySkuPriceAud } from './lib/supplies-catalog.js'
import { createHardwareOrdersStore } from './lib/hardware-orders-store.js'
import { createStoreOrdersStore } from './lib/store-orders-store.js'
import { validateSupplyCartLines, validateBundleCart, STORE_CATALOG_PRODUCTS, STORE_BUNDLES } from './lib/store-cart.js'
import { createStoreCatalogOverridesStore } from './lib/store-catalog-overrides-store.js'
import {
  refreshMergedStoreCatalog,
  setStoreCatalogOverrideReader,
  setStoreCatalogPostgresReader,
  getMergedCatalogProducts,
} from './lib/store-catalog-merge.js'
import {
  ensureProductsTable,
  listActiveProductsForMerge,
  productRowToMergedPartial,
  listProductsApi,
  insertProduct,
  updateProduct,
  deleteProduct,
} from './lib/products-pg.js'
import { importProductFromUrl } from './lib/amazon-product-import.js'
import {
  ensureStoreCategoriesTables,
  seedStoreCategoriesIfEmpty,
  backfillProductSubcategoriesGeneral,
  listSubcategoriesPublic,
  listCategoriesAdminTree,
  listPublicStoreCategoriesNested,
  insertCategory,
  insertSubcategory,
  updateSubcategory,
  deleteSubcategory,
  updateCategory,
  isCategoryActive,
} from './lib/store-categories-pg.js'
import {
  ensureAnalyticsTables,
  recordAnalyticsPing,
  countLiveVisitors,
  visitorBucketsByDay,
} from './lib/analytics-pg.js'
import { runAdminStoreAiChat } from './lib/admin-store-ai.js'
import {
  createPeerListingsStore,
  normalizeInitialListingImages,
  normalizeListingRow,
} from './lib/peer-listings-store.js'
import { createPeerListingsSupabaseStore } from './lib/peer-listings-supabase.js'
import { getSupabaseAdminClient } from './lib/supabase-admin.js'
import {
  classifyListingCreateFailure,
  logListingCreateRequestBodyShape,
} from './lib/listing-create-request-log.js'
import {
  buildPublicDemoListings,
  filterPublicDemoListings,
  getPublicDemoListingById,
  isPublicDemoListingId,
} from './lib/demo-marketplace-seed.js'
import { createPeerMessagesStore } from './lib/peer-messages-store.js'
import { postStoreOrderWebhook } from './lib/store-outbound-webhook.js'
import { createMarketplaceStore } from './lib/marketplace-store.js'
import { createMarketplaceEventBus } from './lib/marketplace-events.js'
import { createSqlitePersistence } from './lib/marketplace-sqlite.js'
import {
  assertCustomerCanAccessBooking,
  assertDriverCanPatchLocation,
  assertDriverCanPatchStatus,
  bookingLockedFromDowngrade,
  normalizeEmail,
  resolveMarketplaceActor,
} from './lib/fetch-marketplace-auth.js'
import {
  buildDevDemoPeerListings,
  getDevDemoPeerListing,
  isDevDemoListingId,
  isDevDemoMarketplaceActor,
  patchDevDemoPeerListing,
} from './lib/dev-demo-peer-listings.js'
import { signFetchSessionCookie, FETCH_SESSION_COOKIE_NAME } from './lib/fetch-session-cookie.js'
import { marketplaceLog } from './lib/marketplace-log.js'
import pg from 'pg'
import rateLimit from 'express-rate-limit'
import {
  ensureStripeWebhookEventsTable,
  classifyStripeWebhookDelivery,
  markStripeWebhookEventDone,
  markStripeWebhookEventError,
} from './lib/stripe-webhook-events-pg.js'
import {
  ensureFetchUsersTable,
  registerFetchUser,
  loginFetchUser,
  getFetchUserById,
} from './lib/fetch-users-pg.js'
import { attachPostgresMarketplacePersistence } from './lib/marketplace-pg-persistence.js'
import {
  ensureDropsTables,
  listPublishedDropsFeed,
  getDropWithMedia,
  createDropDraft,
  countRecentDropsByUser,
  updateDrop,
  publishDrop,
  addDropMedia,
  recordDropEngagement,
  addDropMediaInternal,
  publishDropInternal,
  listModerationPendingDrops,
  insertMarketplacePost,
} from './lib/drops-pg.js'
import {
  muxCreateLiveStreamForDrop,
  verifyMuxWebhookSignature,
  muxExtractReplayAsset,
  muxPlaybackUrl,
} from './lib/drops-live-mux.js'
import { transformVideoBuffer, ffmpegAvailable } from './lib/drops-ffmpeg-process.js'
import {
  ensureBattlesTables,
  createBattle,
  joinBattle,
  startBattle,
  addBattleScore,
  recordBattleBoost,
  addBattleComment,
  finalizeBattle,
  getBattleWithParticipants,
  getSellerBattleStats as getSellerBattleStatsPg,
  listActiveBattles,
  finalizeExpiredBattles,
} from './lib/battles-pg.js'
import {
  getSupabaseClientForUserAccessToken,
  parseBearerAccessToken,
} from './lib/supabase-user-client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
/** Repo root (parent of server/), so .env loads even when cwd is not the project root. */
const projectRoot = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(projectRoot, '.env') })
dotenv.config({ path: path.join(projectRoot, '.env.local'), override: true })

console.log('[scan] starting server')

process.on('uncaughtException', (err) => {
  console.error('[scan] uncaughtException', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[scan] unhandledRejection', reason)
})

const app = express()
const upload = multer({ storage: multer.memoryStorage() })
const PORT = Number(process.env.PORT || 8787)

const DATABASE_URL = (process.env.DATABASE_URL || '').trim()
const sharedPgPool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL, max: 12 }) : null
const FETCH_AUTH_USERS_DB_ENABLED = process.env.FETCH_AUTH_USERS_DB === '1' && Boolean(sharedPgPool)

const dropsWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
})

const dropsEngageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
})

const authRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
})
const paymentIntentCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
})
const analyticsPingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
})
const adminAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
})

function sendHealthz(_req, res) {
  res.json({ ok: true })
}

async function sendReadyz(_req, res) {
  if (!sharedPgPool) {
    return res.json({ ok: true, db: 'not_configured' })
  }
  try {
    await sharedPgPool.query('SELECT 1')
    return res.json({ ok: true, db: 'up' })
  } catch {
    return res.status(503).json({ ok: false, db: 'down' })
  }
}

app.get('/healthz', sendHealthz)
app.get('/api/healthz', sendHealthz)

app.get('/readyz', sendReadyz)
app.get('/api/readyz', sendReadyz)
/** LLM keys: set `OPENAI_API_KEY` (and optional `ANTHROPIC_API_KEY`) on Vercel — never `VITE_*`. */
const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
/** Google Cloud Text-to-Speech API key (enable “Cloud Text-to-Speech API” in GCP). */
const GOOGLE_TTS_API_KEY =
  (process.env.GOOGLE_TEXT_TO_SPEECH_API_KEY ||
    process.env.GOOGLE_CLOUD_API_KEY ||
    process.env.GOOGLE_TTS_API_KEY ||
    ''
  ).trim()
/** Premium assistant default (Jarvis-style Chirp HD). Override with `GOOGLE_TTS_VOICE`. */
const DEFAULT_GOOGLE_TTS_VOICE = 'en-US-Chirp-HD-D'
const GOOGLE_TTS_VOICE = (process.env.GOOGLE_TTS_VOICE || DEFAULT_GOOGLE_TTS_VOICE).trim()
const GOOGLE_TTS_TIMEOUT_MS = 12000

function googleLanguageCodeFromVoiceName(voiceName) {
  const parts = voiceName.split('-')
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`
  return 'en-US'
}

/** @returns {Promise<Buffer | null>} */
async function synthesizeGoogleTtsToMp3(text) {
  /* v1 REST has no silence-trim; MP3 + speakingRate only. */
  if (!GOOGLE_TTS_API_KEY) return null
  const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(GOOGLE_TTS_API_KEY)}`

  async function tryVoice(voiceName) {
    const languageCode = googleLanguageCodeFromVoiceName(voiceName)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GOOGLE_TTS_TIMEOUT_MS)
    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          input: { text: text.slice(0, 5000) },
          voice: { languageCode, name: voiceName },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 1.05,
            pitch: 0,
          },
        }),
      })
      const raw = await upstream.text()
      let data
      try {
        data = JSON.parse(raw)
      } catch {
        data = null
      }
      if (!upstream.ok) {
        const msg = data?.error?.message ?? raw.slice(0, 500)
        console.error('[voice_tts] Google Cloud TTS HTTP', voiceName, upstream.status, msg)
        return null
      }
      const b64 = data?.audioContent
      if (typeof b64 === 'string' && b64.length > 0) {
        return Buffer.from(b64, 'base64')
      }
      console.error('[voice_tts] Google response missing audioContent', data ? Object.keys(data) : 'non-json')
      return null
    } catch (e) {
      console.error('[voice_tts] Google Cloud TTS request error', e instanceof Error ? e.message : e)
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  const fallbackVoices = ['en-US-Neural2-D', 'en-GB-Neural2-B']
  const chain = [GOOGLE_TTS_VOICE, ...fallbackVoices.filter((v) => v !== GOOGLE_TTS_VOICE)]
  for (const voiceName of chain) {
    const buf = await tryVoice(voiceName)
    if (buf) {
      if (voiceName !== GOOGLE_TTS_VOICE) {
        console.warn('[voice_tts] Using fallback voice', voiceName)
      }
      return buf
    }
  }
  return null
}
const MAX_IMAGES_PER_REQUEST = 8
const SCAN_UPLOAD_FIELD = 'images'
const ALLOWED_LISTING_AI_CATEGORIES = new Set([
  'general',
  'furniture',
  'electronics',
  'fashion',
  'sports',
  'other',
])
const ALLOWED_LISTING_AI_CONDITIONS = new Set([
  'new',
  'like new',
  'good',
  'fair',
  'used',
  'for parts',
])
const ALLOWED_SERVICES = new Set(['junk', 'moving', 'pickup', 'heavy'])
const ALLOWED_SPECIAL_ITEM_TYPES = new Set([
  'pool_table',
  'spa',
  'piano',
  'safe',
  'marble_table',
  'wardrobe',
  'fridge',
  'gym_equipment',
  'sofa',
  'mattress',
  'none',
])
const ALLOWED_SUGGESTED_ACTION = new Set(['move', 'remove', 'pickup'])
const ALLOWED_ACCESS_RISK = new Set(['low', 'medium', 'high'])
const ALLOWED_PRICING_BAND = new Set(['local_quick', 'standard', 'heavy_special'])
const ALLOWED_BOOKING_SAVE_STATUSES = new Set(['draft', 'payment_required', 'confirmed'])
const ALLOWED_BOOKING_PATCH_STATUSES = new Set([
  'draft',
  'payment_required',
  'confirmed',
  'dispatching',
  'pending_match',
  'matched',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'match_failed',
  'cancelled',
])
const SAFE_FALLBACK = {
  selectedService: 'pickup',
  matchesSelectedService: true,
  recommendedService: 'pickup',
  suggestedAction: 'pickup',
  specialItemType: 'none',
  detectedItems: [],
  itemCountEstimate: 1,
  mainItems: [],
  loadSize: 'small',
  complexity: 'medium',
  vehicle: 'ute',
  isBulky: false,
  isHeavyItem: false,
  isFragileItem: false,
  needsTwoMovers: false,
  needsSpecialEquipment: false,
  accessRisk: 'medium',
  singleItemEligible: false,
  singleItemDisqualifier: 'scan_unavailable',
  pricingBand: 'standard',
  pricingReason: 'Fallback classification — confirm details before quoting.',
  confidence: 0.35,
  note: 'Fallback used',
}
const DATA_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-marketplace-data.json')
  : path.join(__dirname, 'marketplace-data.json')
const ALLOWED_MEDIA_TYPES = new Set(['pickup', 'during_job', 'completion'])
const FETCH_SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

function fetchSessionSecret() {
  return (process.env.FETCH_SESSION_SECRET || 'fetch_dev_session_insecure').trim()
}

function appendFetchSessionCookie(res, token) {
  const maxSec = Math.floor(FETCH_SESSION_MAX_AGE_MS / 1000)
  const segs = [
    `${FETCH_SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxSec}`,
  ]
  if (process.env.NODE_ENV === 'production') segs.push('Secure')
  res.append('Set-Cookie', segs.join('; '))
}

function clearFetchSessionCookie(res) {
  res.append(
    'Set-Cookie',
    `${FETCH_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  )
}

function issueCustomerSessionCookie(res, { userId, email }) {
  const now = Math.floor(Date.now() / 1000)
  const e = normalizeEmail(email)
  const token = signFetchSessionCookie(
    {
      role: 'customer',
      userId,
      email: e,
      iat: now,
      exp: now + 60 * 60 * 24 * 14,
    },
    fetchSessionSecret(),
  )
  appendFetchSessionCookie(res, token)
}

async function markStripeWebhookDoneOrMemory(eventId) {
  if (sharedPgPool) {
    await markStripeWebhookEventDone(sharedPgPool, eventId)
  }
  markStripeWebhookEventProcessed(eventId)
}

const marketplaceEventBus = createMarketplaceEventBus()
let marketplaceStreamSeq = 0

async function createConfiguredMarketplaceStore() {
  const onAfterWrite = () => marketplaceEventBus.emit()
  if (process.env.FETCH_MARKETPLACE_STORE === 'postgres') {
    if (!sharedPgPool) {
      throw new Error('DATABASE_URL is required when FETCH_MARKETPLACE_STORE=postgres')
    }
    const persistence = await attachPostgresMarketplacePersistence(sharedPgPool)
    return createMarketplaceStore({ ...persistence, onAfterWrite })
  }
  if (process.env.FETCH_MARKETPLACE_STORE === 'sqlite') {
    const sqlitePath = process.env.VERCEL
      ? path.join('/tmp', 'fetch-marketplace.sqlite')
      : path.join(projectRoot, process.env.FETCH_SQLITE_PATH || 'server/marketplace.sqlite')
    const persistence = await createSqlitePersistence(sqlitePath)
    return createMarketplaceStore({ ...persistence, onAfterWrite })
  }
  return createMarketplaceStore({ dataFile: DATA_FILE, onAfterWrite })
}

if (sharedPgPool) {
  await ensureStripeWebhookEventsTable(sharedPgPool)
  if (FETCH_AUTH_USERS_DB_ENABLED) {
    await ensureFetchUsersTable(sharedPgPool)
  }
  await ensureProductsTable(sharedPgPool)
  await ensureStoreCategoriesTables(sharedPgPool)
  await seedStoreCategoriesIfEmpty(sharedPgPool)
  await backfillProductSubcategoriesGeneral(sharedPgPool)
  await ensureAnalyticsTables(sharedPgPool)
  await ensureDropsTables(sharedPgPool)
  await ensureBattlesTables(sharedPgPool)
}

if (process.env.NODE_ENV === 'production') {
  const sec = (process.env.FETCH_SESSION_SECRET || '').trim()
  if (!sec || sec === 'fetch_dev_session_insecure') {
    console.warn('[fetch] WARNING: Set a strong FETCH_SESSION_SECRET in production.')
  } else if (sec.length < 24) {
    console.warn('[fetch] WARNING: FETCH_SESSION_SECRET should be at least 24 characters in production.')
  }
}

;(() => {
  const pg = Boolean(sharedPgPool)
  const vercel = process.env.VERCEL === '1'
  console.log(
    `[fetch] Drops deploy check: postgres=${pg}${vercel ? ', host=Vercel' : ''} — browser uploads to Supabase Storage bucket "drops" (VITE_SUPABASE_* + optional VITE_SUPABASE_DROP_BUCKET).`,
  )
})()

const marketplaceStore = await createConfiguredMarketplaceStore()
const HARDWARE_ORDERS_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-hardware-orders.json')
  : path.join(__dirname, 'hardware-orders.json')
const hardwareOrdersStore = createHardwareOrdersStore(HARDWARE_ORDERS_FILE)

const STORE_ORDERS_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-store-orders.json')
  : path.join(__dirname, 'store-orders.json')
const storeOrdersStore = createStoreOrdersStore(STORE_ORDERS_FILE)

const STORE_CATALOG_OVERRIDES_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-store-catalog-overrides.json')
  : path.join(__dirname, 'store-catalog-overrides.json')
const storeCatalogOverridesStore = createStoreCatalogOverridesStore(STORE_CATALOG_OVERRIDES_FILE)
setStoreCatalogOverrideReader(() => storeCatalogOverridesStore.readProducts())
if (sharedPgPool) {
  setStoreCatalogPostgresReader(async () => {
    const rows = await listActiveProductsForMerge(sharedPgPool)
    return rows.map(productRowToMergedPartial).filter(Boolean)
  })
}
await refreshMergedStoreCatalog()

const PEER_LISTINGS_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-peer-listings.json')
  : path.join(__dirname, 'peer-listings.json')
const supabaseAdminForListings = getSupabaseAdminClient()
const peerListingsStore = supabaseAdminForListings
  ? createPeerListingsSupabaseStore(supabaseAdminForListings)
  : createPeerListingsStore(PEER_LISTINGS_FILE)
if (supabaseAdminForListings) {
  console.log('[peer-listings] persistence: Supabase/Postgres (durable)')
} else {
  console.warn(
    '[peer-listings] persistence: local JSON file — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for durable marketplace data (required in production)',
  )
}

const PEER_MESSAGES_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-peer-messages.json')
  : path.join(__dirname, 'peer-messages.json')
const peerMessagesStore = createPeerMessagesStore(PEER_MESSAGES_FILE)

const LISTING_UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'fetch-listing-uploads')
  : path.join(projectRoot, 'public', 'listing-uploads')
const DROPS_UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'fetch-drops-uploads')
  : path.join(projectRoot, 'public', 'drops-uploads')
const LISTING_PLATFORM_FEE_BPS = Math.min(
  5000,
  Math.max(0, Math.round(Number(process.env.LISTING_PLATFORM_FEE_BPS || '1000') || 1000)),
)
const STRIPE_CONNECT_REFRESH_URL = (process.env.STRIPE_CONNECT_REFRESH_URL || 'http://localhost:5173').trim()
const STRIPE_CONNECT_RETURN_URL = (process.env.STRIPE_CONNECT_RETURN_URL || 'http://localhost:5173').trim()

/** @type {Map<string, { storeOrderId: string, at: number }>} */
const storeCheckoutIdempotency = new Map()
const STORE_CHECKOUT_IDEM_MAX = 2000

function storeCheckoutIdemRemember(key, storeOrderId) {
  if (!key) return
  storeCheckoutIdempotency.set(key, { storeOrderId, at: Date.now() })
  while (storeCheckoutIdempotency.size > STORE_CHECKOUT_IDEM_MAX) {
    const first = storeCheckoutIdempotency.keys().next().value
    storeCheckoutIdempotency.delete(first)
  }
}

function storeCheckoutIdemGet(key) {
  if (!key) return null
  const row = storeCheckoutIdempotency.get(key)
  if (!row) return null
  if (Date.now() - row.at > 24 * 60 * 60 * 1000) {
    storeCheckoutIdempotency.delete(key)
    return null
  }
  return row.storeOrderId
}

async function finalizeSupplyStoreOrderPaid(storeOrderId, stripePiId) {
  if (!storeOrderId || typeof storeOrderId !== 'string') return
  const order = await storeOrdersStore.getById(storeOrderId)
  if (!order || order.status === 'paid') return
  await storeOrdersStore.patchOrder(storeOrderId, {
    status: 'paid',
    webhookConfirmedAt: Date.now(),
    stripePaymentIntentId: stripePiId || order.stripePaymentIntentId,
  })
  await postStoreOrderWebhook(
    (process.env.STORE_ORDER_WEBHOOK_URL || '').trim(),
    (process.env.STORE_ORDER_WEBHOOK_SECRET || '').trim(),
    { event: 'order.paid', orderId: storeOrderId, kind: order.kind, subtotalAud: order.subtotalAud },
  )
}

async function finalizeListingOrderPaidCore(o, chargeRef) {
  if (!o || o.status === 'paid') return
  await peerListingsStore.patchListingOrder(o.id, {
    status: 'paid',
    webhookConfirmedAt: Date.now(),
    stripePaymentIntentId: chargeRef || o.stripePaymentIntentId || null,
  })
  if (o.listingId) await peerListingsStore.markListingSold(o.listingId)
  await peerListingsStore.appendLedger({
    sellerKey: o.sellerKey,
    type: 'sale',
    listingOrderId: o.id,
    listingId: o.listingId,
    grossCents: o.priceCents,
    feeCents: o.platformFeeCents ?? 0,
    netCents: o.sellerNetCents ?? Math.max(0, o.priceCents - (o.platformFeeCents ?? 0)),
    currency: 'aud',
    stripeChargeId: chargeRef || o.stripePaymentIntentId || o.paymentIntentId || '',
  })
}

async function finalizeListingOrderPaidFromPi(stripePiId) {
  const o = await peerListingsStore.findListingOrderByPaymentIntent(stripePiId)
  if (!o) return
  await finalizeListingOrderPaidCore(o, stripePiId)
}

const listingImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
})

/** Batch upload before POST /api/listings — avoids orphan drafts when create fails after partial uploads. */
const listingImagesBatchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 12 },
})

const DROP_VIDEO_MAX_BYTES = 100 * 1024 * 1024

const dropsMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 12 },
})

function stripJsonFence(s) {
  const t = (s || '').trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  return t
}

/** Opt-in when client sends `x-fetch-perf-run` — logs + `X-Fetch-Perf-Timing` response header. */
function readPerfRun(req) {
  const v = req.headers['x-fetch-perf-run']
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 96) : ''
}

function perfLog(runId, phase, extra = {}) {
  if (!runId) return
  console.log('[FetchPerf]', JSON.stringify({ phase, runId, ...extra }))
}

function attachPerfTimingHeader(res, runId, data) {
  if (!runId) return
  try {
    res.setHeader('X-Fetch-Perf-Timing', JSON.stringify({ runId, ...data }))
  } catch {
    /* ignore */
  }
}

async function buildReviewedBookingPayload(payload) {
  const review = await reviewFetchAiBookingDraft(payload ?? {}, {
    openAiApiKey: OPENAI_API_KEY,
  })
  return {
    ...payload,
    pricing: review.pricing,
    quoteBreakdown: review.quoteBreakdown,
    aiReview: review.aiReview,
    review,
  }
}

/**
 * Vercel optional catch-all (`api/[[...slug]].js`) may invoke Express with a path that omits the `/api` prefix.
 * Normalize so existing `/api/...` Express routes match in production.
 */
function vercelRestoreApiRequestPath(req, _res, next) {
  if (process.env.VERCEL !== '1') return next()
  const raw = typeof req.url === 'string' ? req.url : '/'
  if (raw.startsWith('/api')) return next()
  const pathOnly = raw.split('?')[0] || '/'
  if (
    /^\/(fetch-ai|scan|auth|marketplace|payments|store|listings|sellers|chat|voice|tts|healthz|readyz)(\/|$)/.test(
      pathOnly,
    )
  ) {
    req.url = '/api/' + raw.replace(/^\//, '')
  }
  next()
}

app.use(vercelRestoreApiRequestPath)

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)

app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json', limit: '2mb' }),
  async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    const key = process.env.STRIPE_SECRET_KEY
    if (!secret || !key) {
      return res.status(503).json({ error: 'stripe_webhook_not_configured' })
    }
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(key)
      const sig = req.headers['stripe-signature']
      const event = stripe.webhooks.constructEvent(req.body, sig, secret)

      if (sharedPgPool) {
        const d = await classifyStripeWebhookDelivery(sharedPgPool, event.id, event.type)
        if (d === 'duplicate') {
          return res.json({ received: true, duplicate: true })
        }
      } else if (isStripeWebhookEventProcessed(event.id)) {
        return res.json({ received: true, duplicate: true })
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object
        const stripeId = pi.id
        const state = await marketplaceStore.readState()
        const now = Date.now()
        let updated = false
        let matched = false
        for (const row of state.paymentIntents) {
          if (row.stripePaymentIntentId === stripeId || row.id === stripeId) {
            matched = true
            if (row.status === 'succeeded' && row.webhookConfirmedAt) {
              await markStripeWebhookDoneOrMemory(event.id)
              return res.json({ received: true, idempotent: true })
            }
            row.status = 'succeeded'
            row.webhookConfirmedAt = now
            row.provider = 'stripe'
            row.stripePaymentIntentId = stripeId
            row.confirmedAt = row.confirmedAt ?? now
            updated = true
            if (row.bookingId) {
              const booking = state.bookings.find((b) => b.id === row.bookingId)
              if (booking) {
                booking.paymentIntent = { ...row }
                if (booking.status === 'payment_required') {
                  booking.status = 'confirmed'
                  booking.updatedAt = now
                }
              }
            }
            break
          }
        }
        if (!matched) {
          if (sharedPgPool) {
            await markStripeWebhookEventError(sharedPgPool, event.id, 'payment_intent_row_missing')
          }
          return res.status(500).json({ error: 'payment_intent_row_missing' })
        }
        if (updated) {
          marketplaceStore.materializeState(state)
          await marketplaceStore.writeState(state)
        }
        const metaOk = pi.metadata || {}
        if (metaOk.checkout === 'supply_cart' && metaOk.storeOrderId) {
          await finalizeSupplyStoreOrderPaid(metaOk.storeOrderId, stripeId)
        }
        if (metaOk.checkout === 'listing_order') {
          await finalizeListingOrderPaidFromPi(stripeId)
        }
        await markStripeWebhookDoneOrMemory(event.id)
        return res.json({ received: true })
      }
      if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object
        const stripeId = pi.id
        const msg =
          pi.last_payment_error && typeof pi.last_payment_error.message === 'string'
            ? pi.last_payment_error.message
            : 'payment_failed'
        const state = await marketplaceStore.readState()
        let updated = false
        for (const row of state.paymentIntents) {
          if (row.stripePaymentIntentId === stripeId || row.id === stripeId) {
            row.status = 'failed'
            row.lastError = msg.slice(0, 500)
            row.provider = 'stripe'
            row.stripePaymentIntentId = stripeId
            updated = true
            break
          }
        }
        if (updated) {
          marketplaceStore.materializeState(state)
          await marketplaceStore.writeState(state)
        }
        const metaF = pi.metadata || {}
        if (metaF.checkout === 'supply_cart' && metaF.storeOrderId) {
          await storeOrdersStore.patchOrder(metaF.storeOrderId, { status: 'failed', lastError: msg.slice(0, 500) })
        }
        if (metaF.checkout === 'listing_order') {
          const lo = await peerListingsStore.findListingOrderByPaymentIntent(stripeId)
          if (lo) await peerListingsStore.patchListingOrder(lo.id, { status: 'failed', lastError: msg.slice(0, 500) })
        }
        await markStripeWebhookDoneOrMemory(event.id)
        return res.json({ received: true })
      }
      await markStripeWebhookDoneOrMemory(event.id)
      return res.json({ received: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(400).send(`Webhook Error: ${msg}`)
    }
  },
)

app.post(
  '/api/webhooks/mux',
  express.raw({ type: 'application/json', limit: '4mb' }),
  async (req, res) => {
    const raw = req.body
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw || {}))
    const sig = req.headers['mux-signature']
    const signingSecret = (process.env.MUX_WEBHOOK_SIGNING_SECRET || '').trim()
    if (signingSecret) {
      const ok = verifyMuxWebhookSignature(buf, typeof sig === 'string' ? sig : '')
      if (!ok) {
        console.warn('[mux/webhook] invalid signature')
        return res.status(400).send('invalid signature')
      }
    }
    let event
    try {
      event = JSON.parse(buf.toString('utf8'))
    } catch {
      return res.status(400).send('invalid json')
    }
    const ext = muxExtractReplayAsset(event)
    if (!ext || !sharedPgPool) {
      return res.json({ received: true })
    }
    const dropId = ext.passthrough
    try {
      const dup = await sharedPgPool.query(
        `SELECT 1 FROM drop_media WHERE drop_id = $1::uuid AND kind = 'live_replay' LIMIT 1`,
        [dropId],
      )
      if (dup.rows.length) {
        return res.json({ received: true })
      }
      await addDropMediaInternal(sharedPgPool, dropId, {
        kind: 'live_replay',
        url: muxPlaybackUrl(ext.playbackId),
        sortOrder: 0,
      })
      if ((process.env.MUX_AUTO_PUBLISH_REPLAY || '').trim() === '1') {
        await publishDropInternal(sharedPgPool, dropId)
      }
    } catch (e) {
      console.error('[mux/webhook] attach replay failed', e)
    }
    return res.json({ received: true })
  },
)

app.use(express.json({ limit: '15mb' }))

/**
 * @param {unknown[]} orders
 * @param {number} days
 */
function earningsBucketsFromOrders(orders, days) {
  const d = Math.max(1, Math.min(90, Math.floor(Number(days) || 30)))
  const cutoff = Date.now() - d * 86400000
  /** @type {Map<string, { revenueAud: number, orders: number }>} */
  const byDay = new Map()
  let totalRevenueAud = 0
  let paidOrders = 0
  for (const o of orders) {
    if (!o || typeof o !== 'object') continue
    const rec = /** @type {{ status?: string, createdAt?: number, subtotalAud?: number }} */ (o)
    if (rec.status !== 'paid') continue
    const t = Number(rec.createdAt)
    if (!Number.isFinite(t) || t < cutoff) continue
    const day = new Date(t).toISOString().slice(0, 10)
    const sub = Math.round(Number(rec.subtotalAud))
    if (!Number.isFinite(sub) || sub < 0) continue
    totalRevenueAud += sub
    paidOrders += 1
    const cur = byDay.get(day) ?? { revenueAud: 0, orders: 0 }
    cur.revenueAud += sub
    cur.orders += 1
    byDay.set(day, cur)
  }
  const earningsByDay = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({ day, revenueAud: v.revenueAud, orders: v.orders }))
  return { earningsByDay, totalRevenueAud, paidOrders }
}

app.post('/api/analytics/ping', analyticsPingLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(204).end()
  const body = req.body ?? {}
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim().slice(0, 128) : ''
  if (!sessionId) return res.status(400).json({ error: 'session_required' })
  const pingPath = typeof body.path === 'string' ? body.path.trim().slice(0, 512) : ''
  try {
    await recordAnalyticsPing(sharedPgPool, sessionId, pingPath)
    return res.json({ ok: true })
  } catch (e) {
    console.error('[analytics/ping]', e)
    return res.status(500).json({ error: 'ping_failed' })
  }
})

app.use('/listing-uploads', express.static(LISTING_UPLOAD_DIR))
app.use('/drops-uploads', express.static(DROPS_UPLOAD_DIR))

app.post('/api/auth/customer-session', authRouteLimiter, (req, res) => {
  if (FETCH_AUTH_USERS_DB_ENABLED) {
    return res.status(400).json({
      error: 'use_password_auth',
      detail: 'Set FETCH_AUTH_USERS_DB=0 to allow legacy email-only sessions, or use /api/auth/register and /api/auth/login.',
    })
  }
  const email = normalizeEmail(typeof req.body?.email === 'string' ? req.body.email : '')
  if (!email) return res.status(400).json({ error: 'email_required' })
  const now = Math.floor(Date.now() / 1000)
  const token = signFetchSessionCookie(
    { role: 'customer', email, iat: now, exp: now + 60 * 60 * 24 * 14 },
    fetchSessionSecret(),
  )
  appendFetchSessionCookie(res, token)
  return res.json({ ok: true })
})

app.post('/api/auth/register', async (req, res) => {
  if (!FETCH_AUTH_USERS_DB_ENABLED) {
    return res.status(503).json({ error: 'server_auth_not_configured' })
  }
  const email = typeof req.body?.email === 'string' ? req.body.email : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : ''
  try {
    const result = await registerFetchUser(sharedPgPool, { email, password, displayName })
    if (!result.ok) {
      const status = result.error === 'email_taken' ? 409 : 400
      return res.status(status).json({ error: result.error })
    }
    issueCustomerSessionCookie(res, { userId: result.user.id, email: result.user.email })
    return res.json({
      ok: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.display_name,
      },
    })
  } catch (e) {
    console.error('[auth/register]', e)
    return res.status(500).json({ error: 'register_failed' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  if (!FETCH_AUTH_USERS_DB_ENABLED) {
    return res.status(503).json({ error: 'server_auth_not_configured' })
  }
  const email = typeof req.body?.email === 'string' ? req.body.email : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  try {
    const result = await loginFetchUser(sharedPgPool, email, password)
    if (!result.ok) {
      return res.status(401).json({ error: result.error })
    }
    issueCustomerSessionCookie(res, { userId: result.user.id, email: result.user.email })
    return res.json({
      ok: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.display_name,
      },
    })
  } catch (e) {
    console.error('[auth/login]', e)
    return res.status(500).json({ error: 'login_failed' })
  }
})

/**
 * After Supabase (email/OAuth) sign-in, mint httpOnly `fetch_session` so marketplace + listing APIs
 * resolve `customerUserId` / email from the cookie (see resolveMarketplaceActor).
 */
function primaryEmailForFetchSessionFromSupabaseUser(user) {
  if (!user || typeof user !== 'object') return ''
  const e = normalizeEmail(typeof user.email === 'string' ? user.email : '')
  if (e) return e
  const meta = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}
  if (typeof meta.email === 'string' && meta.email.trim()) return normalizeEmail(meta.email)
  const ids = Array.isArray(user.identities) ? user.identities : []
  for (const row of ids) {
    const data = row?.identity_data && typeof row.identity_data === 'object' ? row.identity_data : {}
    if (typeof data.email === 'string' && data.email.trim()) return normalizeEmail(data.email)
  }
  const compact = String(user.id || '')
    .replace(/-/g, '')
    .slice(0, 12)
  if (compact.length >= 8) return normalizeEmail(`${compact}@users.oauth.fetch`)
  return ''
}

app.post('/api/auth/supabase-session', authRouteLimiter, async (req, res) => {
  let accessToken = parseBearerAccessToken(req)
  if (!accessToken && typeof req.body?.access_token === 'string') {
    accessToken = req.body.access_token.trim()
  }
  if (!accessToken) {
    return res.status(400).json({ error: 'access_token_required' })
  }
  const sb = getSupabaseClientForUserAccessToken(accessToken)
  if (!sb) {
    console.error('[auth/supabase-session] Supabase env missing (SUPABASE_URL / anon key)')
    return res.status(503).json({ error: 'supabase_not_configured' })
  }
  const { data, error } = await sb.auth.getUser()
  if (error || !data?.user?.id) {
    console.error('[auth/supabase-session] getUser failed', error?.message ?? 'no user')
    return res.status(401).json({
      error: 'invalid_token',
      detail: error?.message ?? 'invalid_session',
    })
  }
  const user = data.user
  const email = primaryEmailForFetchSessionFromSupabaseUser(user)
  if (!email) {
    console.error('[auth/supabase-session] no email derivable for user', user.id)
    return res.status(400).json({ error: 'email_required', detail: 'Could not derive email for session' })
  }
  console.log('[auth/supabase-session] issuing cookie', { userId: user.id, email })
  issueCustomerSessionCookie(res, { userId: user.id, email })
  return res.json({ ok: true, userId: user.id })
})

app.get('/api/auth/me', async (req, res) => {
  const actor = resolveMarketplaceActor(req)
  if (!actor.customerEmail && !actor.customerUserId) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  if (FETCH_AUTH_USERS_DB_ENABLED && actor.customerUserId) {
    try {
      const user = await getFetchUserById(sharedPgPool, actor.customerUserId)
      if (!user) return res.status(401).json({ error: 'unauthorized' })
      return res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
        },
      })
    } catch (e) {
      console.error('[auth/me]', e)
      return res.status(500).json({ error: 'me_failed' })
    }
  }
  return res.json({
    user: {
      id: null,
      email: actor.customerEmail,
      displayName: actor.customerEmail ? actor.customerEmail.split('@')[0] : '',
    },
  })
})

app.post('/api/auth/driver-session', authRouteLimiter, (req, res) => {
  const driverId = typeof req.body?.driverId === 'string' ? req.body.driverId.trim() : ''
  if (!driverId) return res.status(400).json({ error: 'driver_id_required' })
  const now = Math.floor(Date.now() / 1000)
  const token = signFetchSessionCookie(
    { role: 'driver', driverId, iat: now, exp: now + 60 * 60 * 24 * 14 },
    fetchSessionSecret(),
  )
  appendFetchSessionCookie(res, token)
  return res.json({ ok: true })
})

app.post('/api/auth/logout', authRouteLimiter, (req, res) => {
  clearFetchSessionCookie(res)
  return res.json({ ok: true })
})

if (!process.env.VERCEL) {
  console.log(
    '[voice_tts] startup:',
    GOOGLE_TTS_API_KEY
      ? `Google key loaded (${GOOGLE_TTS_API_KEY.length} chars, voice ${GOOGLE_TTS_VOICE})`
      : 'no Google TTS key (set GOOGLE_TEXT_TO_SPEECH_API_KEY, GOOGLE_CLOUD_API_KEY, or GOOGLE_TTS_API_KEY)',
  )
}

async function handleGoogleTtsPost(req, res) {
  const perfRun = readPerfRun(req)
  const perfT0 = Date.now()
  if (perfRun) perfLog(perfRun, '4_backend_request_received', { route: 'voice_tts' })

  const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : ''

  if (!rawText) {
    return res.status(400).json({ error: 'text_required' })
  }

  if (!GOOGLE_TTS_API_KEY) {
    return res.status(500).json({
      error: 'missing_google_tts',
      detail:
        'Set GOOGLE_TEXT_TO_SPEECH_API_KEY, GOOGLE_CLOUD_API_KEY, or GOOGLE_TTS_API_KEY on the server.',
    })
  }

  if (perfRun) perfLog(perfRun, '7_tts_generation_starts', { route: 'voice_tts_google' })
  const tGoogleStart = Date.now()
  const audio = await synthesizeGoogleTtsToMp3(rawText)
  const google_tts_fetch_ms = Date.now() - tGoogleStart
  if (perfRun) {
    perfLog(perfRun, '7b_tts_upstream_response', {
      route: 'voice_tts_google',
      ok: Boolean(audio),
      google_tts_fetch_ms,
    })
  }

  if (!audio) {
    attachPerfTimingHeader(res, perfRun, {
      route: 'voice_tts_google',
      google_tts_fetch_ms,
      server_total_ms: Date.now() - perfT0,
    })
    return res.status(502).json({
      error: 'google_tts_failed',
      detail: 'Google Cloud Text-to-Speech did not return audio. Check server logs for [voice_tts].',
    })
  }

  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  attachPerfTimingHeader(res, perfRun, {
    route: 'voice_tts_google',
    google_tts_fetch_ms,
    server_total_ms: Date.now() - perfT0,
  })
  return res.send(audio)
}

/** TTS: `POST { text }` → `audio/mpeg` (Google Cloud TTS, server-side key only). */
app.post(['/api/voice', '/api/voice/tts', '/api/tts'], handleGoogleTtsPost)

app.post('/api/fetch-ai/review', async (req, res) => {
  try {
    const review = await reviewFetchAiBookingDraft(req.body?.draft ?? {}, {
      openAiApiKey: OPENAI_API_KEY,
    })
    return res.json(review)
  } catch (error) {
    return res.status(500).json({
      error: 'fetch_ai_review_failed',
      detail: error instanceof Error ? error.message : 'unknown_error',
    })
  }
})

const FETCH_AI_CHAT_MAX_MESSAGES = 20
const FETCH_AI_CHAT_MAX_CONTENT = 2000

const DEFAULT_CHAT_TZ = 'Australia/Sydney'
const CHAT_CONTEXT_MAX_LEN = 2200
const OPEN_METEO_TIMEOUT_MS = 1800

function sanitizeTimeZone(raw) {
  if (typeof raw !== 'string') return DEFAULT_CHAT_TZ
  const t = raw.trim().slice(0, 64)
  if (t.length < 3 || !/^[A-Za-z0-9_+\/-]+$/.test(t)) return DEFAULT_CHAT_TZ
  return t
}

function formatLocalContextTime(timeZone) {
  const opts = {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
  try {
    return new Intl.DateTimeFormat('en-AU', opts).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-AU', { ...opts, timeZone: DEFAULT_CHAT_TZ }).format(new Date())
  }
}

function wmoWeatherPhrase(code) {
  const c = typeof code === 'number' && Number.isFinite(code) ? Math.trunc(code) : -1
  if (c === 0) return 'clear skies'
  if (c === 1) return 'mainly clear'
  if (c === 2) return 'partly cloudy'
  if (c === 3) return 'overcast'
  if (c >= 45 && c <= 48) return 'foggy'
  if (c >= 51 && c <= 57) return 'drizzle'
  if (c >= 61 && c <= 67) return 'rain'
  if (c >= 71 && c <= 77) return 'snow'
  if (c >= 80 && c <= 82) return 'rain showers'
  if (c >= 85 && c <= 86) return 'snow showers'
  if (c >= 95 && c <= 99) return 'thunderstorms possible'
  if (c > 0) return 'mixed conditions'
  return 'conditions unknown'
}

async function fetchOpenMeteoSummary(lat, lon) {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), OPEN_METEO_TIMEOUT_MS)
  try {
    const u = new URL('https://api.open-meteo.com/v1/forecast')
    u.searchParams.set('latitude', String(lat))
    u.searchParams.set('longitude', String(lon))
    u.searchParams.set('current', 'temperature_2m,weather_code')
    u.searchParams.set('timezone', 'auto')
    const res = await fetch(u.toString(), { signal: controller.signal })
    if (!res.ok) return ''
    const data = await res.json()
    const temp = data?.current?.temperature_2m
    const code = data?.current?.weather_code
    if (typeof temp !== 'number' || !Number.isFinite(temp)) return ''
    const phrase = wmoWeatherPhrase(code)
    return `Weather near the user (Open-Meteo): about ${Math.round(temp)} degrees Celsius, ${phrase}.`
  } catch {
    return ''
  } finally {
    clearTimeout(tid)
  }
}

function parseChatContext(body) {
  const ctx = body?.context
  if (!ctx || typeof ctx !== 'object') return { timeZone: DEFAULT_CHAT_TZ, lat: null, lon: null }
  const timeZone = sanitizeTimeZone(ctx.timeZone)
  let lat = ctx.latitude
  let lon = ctx.longitude
  lat =
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null
  lon =
    typeof lon === 'number' && Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null
  return { timeZone, lat, lon }
}

function googleMapsServerKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  )
    .trim()
}

/** Decode Google encoded polyline to { lat, lng }[] */
function decodeGooglePolyline(encoded) {
  if (typeof encoded !== 'string' || !encoded.length) return []
  const points = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    let b
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat
    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng
    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 })
  }
  return points
}

function downsamplePath(points, maxPts) {
  if (!Array.isArray(points) || points.length <= maxPts) return points
  const step = Math.ceil(points.length / maxPts)
  const out = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  const last = points[points.length - 1]
  const tail = out[out.length - 1]
  if (last && tail && (last.lat !== tail.lat || last.lng !== tail.lng)) out.push(last)
  return out
}

function looksLikeAddressOrNavIntent(text) {
  const t = (text || '').trim()
  if (t.length < 8 || t.length > 320) return false
  const low = t.toLowerCase()
  if (
    /^(what|when|why|who|which)\b/i.test(t) &&
    !/\d/.test(t) &&
    t.length < 40
  ) {
    return false
  }
  if (/\d/.test(t)) return true
  if (
    /(navigate|directions|drive me|take me|route to|heading to|go to)\s/i.test(low)
  ) {
    return true
  }
  if (/\bto\s+.{6,}/i.test(t) && t.length > 18) return true
  return false
}

async function googleGeocodeAddress(address, apiKey) {
  const u = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  u.searchParams.set('address', address.slice(0, 280))
  u.searchParams.set('components', 'country:AU')
  u.searchParams.set('key', apiKey)
  const res = await fetch(u.toString())
  if (!res.ok) return null
  const data = await res.json()
  const r0 = data?.results?.[0]
  const loc = r0?.geometry?.location
  if (!r0 || typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null
  return {
    lat: loc.lat,
    lng: loc.lng,
    formatted: typeof r0.formatted_address === 'string' ? r0.formatted_address : address,
  }
}

async function googleDirectionsDrivingTraffic(originLat, originLng, destLat, destLng, apiKey) {
  const u = new URL('https://maps.googleapis.com/maps/api/directions/json')
  u.searchParams.set('origin', `${originLat},${originLng}`)
  u.searchParams.set('destination', `${destLat},${destLng}`)
  u.searchParams.set('mode', 'driving')
  u.searchParams.set('departure_time', 'now')
  u.searchParams.set('traffic_model', 'best_guess')
  u.searchParams.set('key', apiKey)
  const res = await fetch(u.toString())
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 'OK' || !data.routes?.[0]) return null
  const route = data.routes[0]
  const leg = route.legs?.[0]
  if (!leg) return null
  const enc = route.overview_polyline?.points
  const path = downsamplePath(decodeGooglePolyline(enc), 280)
  const duration = typeof leg.duration?.value === 'number' ? leg.duration.value : 0
  const inTraffic =
    typeof leg.duration_in_traffic?.value === 'number'
      ? leg.duration_in_traffic.value
      : null
  const distanceMeters =
    typeof leg.distance?.value === 'number' ? leg.distance.value : 0
  return {
    path,
    durationSeconds: duration,
    durationInTrafficSeconds: inTraffic,
    distanceMeters,
    summary: typeof route.summary === 'string' ? route.summary : '',
  }
}

function formatDriveDuration(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.round(s / 60)
  if (m < 1) return 'under a minute'
  if (m === 1) return 'about one minute'
  if (m < 60) return `about ${m} minutes`
  const h = Math.floor(m / 60)
  const r = m % 60
  if (r < 8) return `about ${h} hour${h > 1 ? 's' : ''}`
  return `about ${h} hour${h > 1 ? 's' : ''} and ${r} minutes`
}

async function tryBuildLiveDrivingRouteFromUserMessage(body, lastUserText) {
  const key = googleMapsServerKey()
  const { lat, lon } = parseChatContext(body)
  if (!key || lat == null || lon == null) {
    return { appendix: '', navigation: null }
  }
  if (!looksLikeAddressOrNavIntent(lastUserText)) {
    return { appendix: '', navigation: null }
  }
  try {
    const geo = await googleGeocodeAddress(lastUserText, key)
    if (!geo) return { appendix: '', navigation: null }

    const dir = await googleDirectionsDrivingTraffic(lat, lon, geo.lat, geo.lng, key)
    if (!dir || !dir.path?.length) return { appendix: '', navigation: null }

    const base = dir.durationSeconds
    const traffic = dir.durationInTrafficSeconds
    const eta = traffic != null && traffic > 0 ? traffic : base
    const delaySec =
      traffic != null && base > 0 && traffic > base ? traffic - base : null
    const km = dir.distanceMeters / 1000
    const kmStr = km >= 10 ? `${km.toFixed(0)}` : km >= 1 ? `${km.toFixed(1)}` : `${Math.round(dir.distanceMeters)} metres`

    let trafficPhrase = 'typical conditions right now'
    if (delaySec != null && delaySec >= 120) {
      trafficPhrase = `traffic is heavier than usual—roughly ${formatDriveDuration(delaySec)} extra`
    } else if (delaySec != null && delaySec >= 45) {
      trafficPhrase = 'traffic is a bit slower than the baseline route'
    } else if (delaySec != null && delaySec > 0) {
      trafficPhrase = 'light delays on the route'
    } else if (traffic != null) {
      trafficPhrase = 'roads look fairly clear for this run'
    }

    const appendix = `\n\nLive driving route (Google Maps Directions with traffic): From the user’s current location to ${geo.formatted}. Distance about ${kmStr} kilometres. Drive time ${formatDriveDuration(eta)} with current traffic${traffic != null ? '' : ' (baseline duration—traffic estimate unavailable)'}. ${trafficPhrase}. Trust this block for ETA, distance, and traffic tone; describe it naturally in your reply.`

    const navigation = {
      active: true,
      destinationLabel: geo.formatted,
      destLat: geo.lat,
      destLng: geo.lng,
      originLat: lat,
      originLng: lon,
      etaSeconds: Math.round(eta),
      baseDurationSeconds: Math.round(base),
      distanceMeters: Math.round(dir.distanceMeters),
      trafficDelaySeconds: delaySec != null ? Math.round(delaySec) : null,
      path: dir.path,
    }
    return { appendix, navigation }
  } catch (e) {
    console.error('[fetch-ai/chat] navigation build failed', e)
    return { appendix: '', navigation: null }
  }
}

function parseUserMemory(body) {
  const ctx = body?.context
  if (!ctx || typeof ctx !== 'object') return ''
  const m = ctx.userMemory
  if (typeof m !== 'string') return ''
  const t = m.trim()
  return t.length > 0 ? t.slice(0, 1400) : ''
}

function parseBrainAccountIntel(body) {
  const ctx = body?.context
  if (!ctx || typeof ctx !== 'object') return ''
  const m = ctx.brainAccountIntel
  if (typeof m !== 'string') return ''
  const t = m.trim()
  return t.length > 0 ? t.slice(0, 900) : ''
}

function parseNearbyExploreSummary(body) {
  const ctx = body?.context
  if (!ctx || typeof ctx !== 'object') return ''
  const m = ctx.nearbyExploreSummary
  if (typeof m !== 'string') return ''
  const t = m.trim()
  return t.length > 0 ? t.slice(0, 1600) : ''
}

function parseBrainLearningMemory(body) {
  const ctx = body?.context
  if (!ctx || typeof ctx !== 'object') return ''
  const m = ctx.brainLearningMemory
  if (typeof m !== 'string') return ''
  const t = m.trim()
  return t.length > 0 ? t.slice(0, 700) : ''
}

function parseBrainSessionGoal(body) {
  const raw = body?.context?.brainSessionGoal
  return raw === 'booking_voice' ? 'booking_voice' : null
}

function parseBrainBookingScanSummary(body) {
  const raw = body?.context?.brainBookingScanSummary
  if (typeof raw !== 'string') return ''
  const t = raw.trim()
  return t.length > 0 ? t.slice(0, 1200) : ''
}

async function buildChatContextAppendix(body) {
  const { timeZone, lat, lon } = parseChatContext(body)
  const timeLine = `Current local time (user device timezone ${timeZone}): ${formatLocalContextTime(timeZone)}.`
  let extra = ''
  if (lat != null && lon != null) {
    const w = await fetchOpenMeteoSummary(lat, lon)
    if (w) extra = `\n${w}`
  }
  const userMemory = parseUserMemory(body)
  const memBlock = userMemory
    ? `\n\nUser memory (signed-in customer—use naturally in conversation; confirm addresses before booking):\n${userMemory}`
    : ''
  const brainIntelRaw = parseBrainAccountIntel(body)
  const brainBlock = brainIntelRaw
    ? `\n\nBrain account snapshot (trust these figures for spend/mileage/job counts; do not invent other amounts):\n${brainIntelRaw}`
    : ''
  const exploreRaw = parseNearbyExploreSummary(body)
  const exploreBlock = exploreRaw
    ? `\n\nNearby places on the user map (trust this list only for location ideas; do not invent other venues or coordinates):\n${exploreRaw}`
    : ''
  const learnRaw = parseBrainLearningMemory(body)
  const learnBlock = learnRaw
    ? `\n\nUser place memory (local device; trust recency; use for follow-ups like “you liked X last week”):\n${learnRaw}`
    : ''
  const scanRaw = parseBrainBookingScanSummary(body)
  const scanBlock = scanRaw
    ? `\n\nLatest booking photo scan (structured facts — trust for items, size, access flags; the thread may also contain a spoken description):\n${scanRaw}`
    : ''
  const trusted =
    'Trust the following lines as facts for questions about time or weather; do not contradict them. If no weather line is present, you do not have live weather—say so briefly and suggest they allow location if they want it.'
  const bookingVoiceBlock =
    parseBrainSessionGoal(body) === 'booking_voice'
      ? `\n\nSession mode: BOOKING VOICE (neural-field booking). The user books via voice + chat + photos over the map. Rules: (1) Multi-stop / multi-job: keep one primary pickup + drop-off in bookingPatch for routing; describe extra stops, second jobs, or sequencing in bookingPatch.extraStopsNote. If unclear, ask which leg is first. (2) Timing: before final quote language, ask ASAP vs a scheduled date/window; set bookingPatch.schedulePreference to "asap" or "scheduled", and scheduledWindowText when they give a concrete window. (3) Photos: still request images when volume/items matter; scan facts may appear in server context. (4) Pricing: the app shows exact engine totals (total + deposit in AUD) and a Pay button — never say “ballpark”, never invent dollar amounts or ranges from the model. At quote/payment confirmation use sheet null (no four-choice sheet for accepting price). Four-choice sheets are fine earlier (service, access, stairs, timing mode). (5) Courtesy discount is a secondary tap in UI — do not promise amounts you cannot see. (6) Follow existing openBookingOnMap rules. Be concise; never contradict user-confirmed addresses.`
      : ''
  const block = `${trusted}\n${timeLine}${extra}${memBlock}${brainBlock}${learnBlock}${exploreBlock}${scanBlock}${bookingVoiceBlock}`
  return block.length > CHAT_CONTEXT_MAX_LEN ? block.slice(0, CHAT_CONTEXT_MAX_LEN) : block
}

/** Shared validation + LLM pipeline for `/api/fetch-ai/chat` and `/api/fetch-ai/chat/stream`. */
async function runFetchAiChatPipeline(body) {
  const rawMessages = body?.messages
  if (!Array.isArray(rawMessages)) {
    return { ok: false, httpStatus: 400, httpBody: { error: 'messages_required' } }
  }
  if (rawMessages.length > FETCH_AI_CHAT_MAX_MESSAGES) {
    return { ok: false, httpStatus: 400, httpBody: { error: 'messages_too_many' } }
  }

  const safe = []
  for (const m of rawMessages) {
    if (!m || typeof m !== 'object') continue
    const role = m.role
    if (role !== 'user' && role !== 'assistant') continue
    const content = typeof m.content === 'string' ? m.content : ''
    if (content.length > FETCH_AI_CHAT_MAX_CONTENT) {
      return { ok: false, httpStatus: 400, httpBody: { error: 'message_too_long' } }
    }
    safe.push({ role, content: content.trim() })
  }

  const nonEmpty = safe.filter((m) => m.content.length > 0)
  if (nonEmpty.length === 0) {
    return { ok: false, httpStatus: 400, httpBody: { error: 'no_valid_messages' } }
  }

  const cfg = resolveChatLlmConfig()
  const openaiKey = openAiApiKeyForChat()
  const anthropicKey = anthropicApiKeyForChat()
  const keyFor = (p) => (p === 'anthropic' ? anthropicKey : openaiKey)
  let provider = cfg.provider
  let model = cfg.model
  if (!keyFor(provider)) {
    const alt = provider === 'openai' ? 'anthropic' : 'openai'
    if (keyFor(alt)) {
      provider = alt
      model =
        (process.env.FETCH_CHAT_FALLBACK_MODEL || '').trim() ||
        (alt === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o')
    }
  }
  if (!keyFor(provider)) {
    const err =
      cfg.provider === 'anthropic' ? 'anthropic_not_configured' : 'openai_not_configured'
    return { ok: false, httpStatus: 503, httpBody: { error: err } }
  }

  const lastUserTurn = [...nonEmpty].reverse().find((m) => m.role === 'user')
  const tNav0 = Date.now()
  const navBundle = lastUserTurn
    ? await tryBuildLiveDrivingRouteFromUserMessage(body, lastUserTurn.content)
    : { appendix: '', navigation: null }
  const nav_build_ms = Date.now() - tNav0

  const localeHint =
    typeof body.locale === 'string' && body.locale.trim()
      ? `\nUser locale / language hint: ${body.locale.trim().slice(0, 48)}`
      : ''

  const tCtx0 = Date.now()
  const baseAppendix = await buildChatContextAppendix(body)
  const contextAppendix = (baseAppendix + (navBundle.appendix || '')).slice(
    0,
    CHAT_CONTEXT_MAX_LEN,
  )
  const context_build_ms = Date.now() - tCtx0 + nav_build_ms

  const ragSnippet = lastUserTurn ? retrieveFetchChatRagSnippet(lastUserTurn.content) : ''
  const system = buildFetchAiSystemContentFull({
    localeHint,
    contextAppendix,
    ragSnippet: ragSnippet || undefined,
    useTools: cfg.useTools,
  })

  const mapsKey = googleMapsServerKey()
  const geocodeForTools = async (address) => {
    if (!mapsKey) return { ok: false, error: 'no_maps_key' }
    const g = await googleGeocodeAddress(address, mapsKey)
    return g
      ? { ok: true, lat: g.lat, lng: g.lng, formatted: g.formatted }
      : { ok: false, error: 'geocode_not_found' }
  }

  const tLlm0 = Date.now()
  const turn = await runFetchAiChatTurn({
    system,
    nonEmptyMessages: nonEmpty,
    provider,
    model,
    useTools: cfg.useTools,
    openaiKey,
    anthropicKey,
    geocodeAddress: geocodeForTools,
    enableFallback: cfg.enableFallback,
  })
  const openai_ms = Date.now() - tLlm0

  return {
    ok: true,
    nonEmpty,
    navBundle,
    context_build_ms,
    turn,
    openai_ms,
  }
}

app.post(['/api/fetch-ai/chat', '/api/chat'], async (req, res) => {
  const perfRun = readPerfRun(req)
  const perfT0 = Date.now()
  if (perfRun) perfLog(perfRun, '4_backend_request_received', { route: 'fetch_ai_chat' })

  const body = req.body ?? {}

  let pipeline
  try {
    pipeline = await runFetchAiChatPipeline(body)
  } catch (e) {
    console.error('[fetch-ai/chat] pipeline failed', e)
    return res.status(502).json({
      error: 'chat_upstream_failed',
      detail: e instanceof Error ? e.message : 'unknown_error',
    })
  }

  if (!pipeline.ok) {
    return res.status(pipeline.httpStatus).json(pipeline.httpBody)
  }

  const { nonEmpty, navBundle, context_build_ms, turn, openai_ms } = pipeline

  try {
    if (perfRun) {
      perfLog(perfRun, '5_llm_request_starts', {
        route: 'fetch_ai_chat',
        provider: turn.providerUsed,
      })
    }
    if (perfRun) {
      perfLog(perfRun, '6_llm_response_returns', {
        route: 'fetch_ai_chat',
        providerUsed: turn.providerUsed,
        openai_ms,
        ok: turn.ok,
      })
    }

    try {
      res.setHeader('X-Fetch-Prompt-Rev', FETCH_AI_PROMPT_REV)
    } catch {
      /* ignore */
    }

    if (!turn.ok) {
      attachPerfTimingHeader(res, perfRun, {
        route: 'fetch_ai_chat',
        context_build_ms,
        openai_ms,
        server_total_ms: Date.now() - perfT0,
      })
      const code =
        turn.error === 'openai_request_failed' || turn.status === 502
          ? 'openai_request_failed'
          : 'llm_request_failed'
      return res.status(turn.status && turn.status >= 400 ? turn.status : 502).json({
        error: code,
        detail: typeof turn.error === 'string' ? turn.error.slice(0, 200) : 'upstream_error',
      })
    }

    const { reply, interaction, bookingPatch } = turn.parsed
    if (!reply) {
      attachPerfTimingHeader(res, perfRun, {
        route: 'fetch_ai_chat',
        context_build_ms,
        openai_ms,
        server_total_ms: Date.now() - perfT0,
      })
      return res.status(502).json({ error: 'empty_model_reply' })
    }

    attachPerfTimingHeader(res, perfRun, {
      route: 'fetch_ai_chat',
      context_build_ms,
      openai_ms,
      server_total_ms: Date.now() - perfT0,
    })
    const payloadOut = { reply }
    if (interaction) payloadOut.interaction = interaction
    if (bookingPatch) payloadOut.bookingPatch = bookingPatch
    if (navBundle.navigation?.active) {
      payloadOut.navigation = navBundle.navigation
    }
    return res.json(payloadOut)
  } catch (error) {
    console.error('[fetch-ai/chat] failed', error)
    attachPerfTimingHeader(res, perfRun, {
      route: 'fetch_ai_chat',
      context_build_ms,
      server_total_ms: Date.now() - perfT0,
    })
    return res.status(502).json({
      error: 'chat_upstream_failed',
      detail: error instanceof Error ? error.message : 'unknown_error',
    })
  }
})

app.post(['/api/fetch-ai/chat/stream', '/api/chat/stream'], async (req, res) => {
  const perfRun = readPerfRun(req)
  const perfT0 = Date.now()
  if (perfRun) perfLog(perfRun, '4_backend_request_received', { route: 'fetch_ai_chat_stream' })

  const body = req.body ?? {}
  let pipeline
  try {
    pipeline = await runFetchAiChatPipeline(body)
  } catch (e) {
    console.error('[fetch-ai/chat/stream] pipeline failed', e)
    res.status(502).json({
      error: 'chat_upstream_failed',
      detail: e instanceof Error ? e.message : 'unknown_error',
    })
    return
  }

  if (!pipeline.ok) {
    res.status(pipeline.httpStatus).json(pipeline.httpBody)
    return
  }

  const { navBundle, context_build_ms, turn, openai_ms } = pipeline

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  try {
    res.setHeader('X-Fetch-Prompt-Rev', FETCH_AI_PROMPT_REV)
  } catch {
    /* ignore */
  }

  const writeSse = (event, dataObj) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(dataObj)}\n\n`)
  }

  if (!turn.ok) {
    attachPerfTimingHeader(res, perfRun, {
      route: 'fetch_ai_chat_stream',
      context_build_ms,
      openai_ms,
      server_total_ms: Date.now() - perfT0,
    })
    writeSse('error', {
      error: turn.error || 'llm_request_failed',
      status: turn.status || 502,
    })
    res.end()
    return
  }

  const { reply, interaction, bookingPatch } = turn.parsed
  if (!reply) {
    attachPerfTimingHeader(res, perfRun, {
      route: 'fetch_ai_chat_stream',
      context_build_ms,
      openai_ms,
      server_total_ms: Date.now() - perfT0,
    })
    writeSse('error', { error: 'empty_model_reply' })
    res.end()
    return
  }

  attachPerfTimingHeader(res, perfRun, {
    route: 'fetch_ai_chat_stream',
    context_build_ms,
    openai_ms,
    server_total_ms: Date.now() - perfT0,
  })
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }

  const chunkSize = 32
  for (let i = 0; i < reply.length; i += chunkSize) {
    writeSse('token', { t: reply.slice(i, i + chunkSize) })
  }

  const donePayload = { reply, interaction: interaction ?? null, bookingPatch: bookingPatch ?? null }
  if (navBundle.navigation?.active) {
    donePayload.navigation = navBundle.navigation
  }
  writeSse('complete', donePayload)
  res.end()
})

const STORE_ADMIN_KEY = (process.env.STORE_ADMIN_KEY || '').trim()

const STORE_SUPPLY_CATEGORY_IDS = new Set([
  'drinks',
  'cleaning',
  'packing',
  'kitchen',
  'bedroom',
  'bathroom',
  'livingRoom',
  'laundry',
  'storage',
])

/** Legacy file-catalog admin: allow category if active in DB, else fall back to static ids when DATABASE_URL is unset. */
async function isFileCatalogCategoryAllowed(categoryId) {
  const id = typeof categoryId === 'string' ? categoryId.trim() : ''
  if (!id) return false
  if (sharedPgPool) {
    try {
      return await isCategoryActive(sharedPgPool, id)
    } catch {
      return false
    }
  }
  return STORE_SUPPLY_CATEGORY_IDS.has(id)
}

function parseStoreAdminKey(req) {
  const h = req.headers['x-fetch-store-admin-key']
  return typeof h === 'string' ? h.trim() : ''
}

function assertStoreAdmin(req, res) {
  const key = parseStoreAdminKey(req)
  if (!STORE_ADMIN_KEY) {
    res.status(503).json({
      error: 'admin_not_configured',
      detail: 'Set STORE_ADMIN_KEY in the server environment (e.g. .env), then restart the API.',
    })
    return false
  }
  if (key !== STORE_ADMIN_KEY) {
    res.status(403).json({ error: 'forbidden' })
    return false
  }
  return true
}

function serializeProductPublic(row) {
  const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : []
  const productSource =
    typeof row.product_source === 'string' && row.product_source.trim() ? row.product_source.trim() : 'fetch'
  return {
    id: String(row.id),
    sku: row.sku,
    title: row.title,
    subtitle: typeof row.subtitle === 'string' ? row.subtitle : '',
    category: row.category,
    subcategoryId: row.subcategory_id != null ? String(row.subcategory_id) : null,
    subcategoryLabel: typeof row.subcategory_label === 'string' ? row.subcategory_label : null,
    price: Number(row.price_aud),
    comparePrice: row.compare_price_aud != null ? Number(row.compare_price_aud) : null,
    description: row.description || '',
    imageUrl: row.image_url || '',
    isBundle: Boolean(row.is_bundle),
    isActive: Boolean(row.is_active),
    tags,
    productSource,
    externalListing: Boolean(row.external_listing),
    affiliateUrl: typeof row.affiliate_url === 'string' ? row.affiliate_url : '',
    asin: row.asin != null ? String(row.asin) : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at
          ? new Date(row.created_at).toISOString()
          : null,
  }
}

function serializeProductAdmin(row) {
  return {
    ...serializeProductPublic(row),
    costPrice: row.cost_price_aud != null ? Number(row.cost_price_aud) : null,
    metadata: row.metadata ?? {},
    stockQuantity: row.stock_quantity != null ? Number(row.stock_quantity) : null,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
          ? new Date(row.updated_at).toISOString()
          : null,
  }
}

/** Admin JSON for file-based catalog overrides (merged with static catalog). */
function serializeLegacyOverrideAdmin(p) {
  if (!p || typeof p !== 'object') return null
  const id = typeof p.id === 'string' ? p.id.trim() : ''
  if (!id) return null
  const compareRaw = p.compareAtAud
  let comparePrice = null
  if (compareRaw != null && String(compareRaw).trim() !== '') {
    const c = Math.round(Number(compareRaw))
    if (Number.isFinite(c) && c > 0) comparePrice = c
  }
  const cover = typeof p.coverImageUrl === 'string' ? p.coverImageUrl.trim().slice(0, 2048) : ''
  const subId = typeof p.subcategoryId === 'string' ? p.subcategoryId.trim() : ''
  const subLabel = typeof p.subcategoryLabel === 'string' ? p.subcategoryLabel.trim() : ''
  return {
    id,
    sku: typeof p.sku === 'string' ? p.sku : '',
    title: typeof p.title === 'string' ? p.title : '',
    category: typeof p.categoryId === 'string' ? p.categoryId : '',
    subcategoryId: subId || null,
    subcategoryLabel: subLabel || null,
    price: Number.isFinite(Number(p.priceAud)) ? Math.round(Number(p.priceAud)) : 0,
    comparePrice,
    costPrice: null,
    description: typeof p.description === 'string' ? p.description : '',
    imageUrl: cover,
    isBundle: false,
    isActive: true,
    createdAt: null,
    updatedAt: null,
    metadata: {},
    stockQuantity: null,
    tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t)) : [],
    source: 'legacy_file',
  }
}

function serializeDatabaseProductAdmin(row) {
  return { ...serializeProductAdmin(row), source: 'database' }
}

app.get('/api/products', async (req, res) => {
  if (!sharedPgPool) {
    return res.status(503).json({
      error: 'products_db_not_configured',
      detail: 'Set DATABASE_URL to enable the products API.',
    })
  }
  const activeRaw = req.query.active
  const activeOnly = activeRaw === undefined || activeRaw === 'true' || activeRaw === '1'
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''
  const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : ''
  try {
    const rows = await listProductsApi(sharedPgPool, {
      activeOnly,
      category: category || undefined,
      tag: tag || undefined,
    })
    res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    return res.json({ products: rows.map(serializeProductPublic) })
  } catch (e) {
    console.error('[api/products]', e)
    return res.status(500).json({ error: 'products_list_failed' })
  }
})

app.get('/api/admin/products', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  try {
    const legacyRows = await storeCatalogOverridesStore.readProducts()
    const legacyMapped = legacyRows.map(serializeLegacyOverrideAdmin).filter(Boolean)
    if (!sharedPgPool) {
      return res.json({
        products: legacyMapped,
        meta: { databaseProducts: false },
      })
    }
    const rows = await listProductsApi(sharedPgPool, { activeOnly: false })
    const dbMapped = rows.map(serializeDatabaseProductAdmin)
    const dbIds = new Set(dbMapped.map((p) => p.id))
    const legacyOnly = legacyMapped.filter((p) => !dbIds.has(p.id))
    const products = [...dbMapped, ...legacyOnly]
    return res.json({
      products,
      meta: { databaseProducts: true },
    })
  } catch (e) {
    console.error('[admin/products list]', e)
    return res.status(500).json({ error: 'products_list_failed' })
  }
})

/**
 * Admin: draft product fields from an Amazon product URL (lightweight fetch; replace with PA-API later).
 * POST body: { url: string }
 */
app.post('/api/import-product', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  const url = typeof req.body?.url === 'string' ? req.body.url : ''
  try {
    const result = await importProductFromUrl(url)
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, draft: null })
    }
    return res.json({ ok: true, draft: result.draft })
  } catch (e) {
    console.error('[import-product]', e)
    return res.status(500).json({ ok: false, error: 'import_failed', draft: null })
  }
})

app.post('/api/admin/products', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) {
    return res.status(503).json({ error: 'products_db_not_configured' })
  }
  try {
    const row = await insertProduct(sharedPgPool, req.body ?? {})
    await refreshMergedStoreCatalog()
    return res.json({ product: serializeDatabaseProductAdmin(row) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'title_required') return res.status(400).json({ error: msg })
    if (msg === 'invalid_category') return res.status(400).json({ error: msg })
    if (msg === 'invalid_price') return res.status(400).json({ error: msg })
    if (msg === 'compare_at_invalid') {
      return res.status(400).json({
        error: msg,
        detail: 'Compare price must be higher than the listing price.',
      })
    }
    if (msg === 'invalid_subcategory' || msg === 'subcategory_required') {
      return res.status(400).json({ error: msg })
    }
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
      return res.status(409).json({ error: 'sku_taken' })
    }
    console.error('[admin/products create]', e)
    return res.status(500).json({ error: 'create_failed' })
  }
})

app.patch('/api/admin/products/:id', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) {
    return res.status(503).json({ error: 'products_db_not_configured' })
  }
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : ''
  if (!id) return res.status(400).json({ error: 'id_required' })
  try {
    const row = await updateProduct(sharedPgPool, id, req.body ?? {})
    if (!row) return res.status(404).json({ error: 'not_found' })
    await refreshMergedStoreCatalog()
    return res.json({ product: serializeDatabaseProductAdmin(row) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'invalid_category') return res.status(400).json({ error: msg })
    if (msg === 'invalid_price') return res.status(400).json({ error: msg })
    if (msg === 'invalid_compare') return res.status(400).json({ error: msg })
    if (msg === 'invalid_cost') return res.status(400).json({ error: msg })
    if (msg === 'compare_at_invalid') {
      return res.status(400).json({
        error: msg,
        detail: 'Compare price must be higher than the listing price.',
      })
    }
    if (msg === 'invalid_subcategory' || msg === 'subcategory_required') {
      return res.status(400).json({ error: msg })
    }
    console.error('[admin/products patch]', e)
    return res.status(500).json({ error: 'update_failed' })
  }
})

app.delete('/api/admin/products/:id', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) {
    return res.status(503).json({ error: 'products_db_not_configured' })
  }
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : ''
  if (!id) return res.status(400).json({ error: 'id_required' })
  try {
    const ok = await deleteProduct(sharedPgPool, id)
    if (!ok) return res.status(404).json({ error: 'not_found' })
    await refreshMergedStoreCatalog()
    return res.json({ ok: true })
  } catch (e) {
    console.error('[admin/products delete]', e)
    return res.status(500).json({ error: 'delete_failed' })
  }
})

app.get('/api/store/categories', async (req, res) => {
  if (!sharedPgPool) {
    return res.json({ categories: [], meta: { source: 'none' } })
  }
  try {
    const categories = await listPublicStoreCategoriesNested(sharedPgPool)
    res.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600')
    return res.json({ categories, meta: { source: 'database' } })
  } catch (e) {
    console.error('[api/store/categories]', e)
    return res.status(500).json({ error: 'categories_list_failed' })
  }
})

app.get('/api/admin/store/categories', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) {
    return res.status(503).json({ error: 'database_required', detail: 'Set DATABASE_URL.' })
  }
  try {
    const tree = await listCategoriesAdminTree(sharedPgPool)
    return res.json(tree)
  } catch (e) {
    console.error('[admin/store/categories]', e)
    return res.status(500).json({ error: 'categories_list_failed' })
  }
})

app.post('/api/admin/store/categories', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) return res.status(503).json({ error: 'database_required' })
  const body = req.body ?? {}
  try {
    const row = await insertCategory(sharedPgPool, {
      id: body.id,
      label: body.label,
      sortOrder: body.sortOrder,
    })
    await refreshMergedStoreCatalog()
    return res.json({ category: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'category_fields_required' || msg === 'invalid_category_id') {
      return res.status(400).json({ error: msg })
    }
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
      return res.status(409).json({ error: 'category_id_taken' })
    }
    console.error('[admin/store/categories create]', e)
    return res.status(500).json({ error: 'create_failed' })
  }
})

app.patch('/api/admin/store/categories/:categoryId', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) return res.status(503).json({ error: 'database_required' })
  const categoryId = typeof req.params.categoryId === 'string' ? req.params.categoryId.trim() : ''
  if (!categoryId) return res.status(400).json({ error: 'category_required' })
  const body = req.body ?? {}
  try {
    const row = await updateCategory(sharedPgPool, categoryId, {
      label: typeof body.label === 'string' ? body.label : undefined,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
      shortDescription: typeof body.shortDescription === 'string' ? body.shortDescription : undefined,
      keywords: body.keywords,
      heroImageUrl: typeof body.heroImageUrl === 'string' ? body.heroImageUrl : undefined,
    })
    if (!row) return res.status(404).json({ error: 'not_found' })
    await refreshMergedStoreCatalog()
    return res.json({ category: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'category_has_products') {
      return res.status(400).json({
        error: msg,
        detail: 'Move or deactivate products in this category before deactivating it.',
      })
    }
    console.error('[admin/store/categories patch]', e)
    return res.status(500).json({ error: 'update_failed' })
  }
})

app.post('/api/admin/store/subcategories', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) return res.status(503).json({ error: 'database_required' })
  const body = req.body ?? {}
  try {
    const row = await insertSubcategory(sharedPgPool, {
      categoryId: body.categoryId,
      slug: body.slug,
      label: body.label,
      sortOrder: body.sortOrder,
    })
    await refreshMergedStoreCatalog()
    return res.json({ subcategory: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'subcategory_fields_required') {
      return res.status(400).json({ error: msg })
    }
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
      return res.status(409).json({ error: 'slug_taken' })
    }
    console.error('[admin/store/subcategories create]', e)
    return res.status(500).json({ error: 'create_failed' })
  }
})

app.patch('/api/admin/store/subcategories/:id', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) return res.status(503).json({ error: 'database_required' })
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : ''
  if (!id) return res.status(400).json({ error: 'id_required' })
  const body = req.body ?? {}
  try {
    const row = await updateSubcategory(sharedPgPool, id, {
      label: typeof body.label === 'string' ? body.label : undefined,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
      shortDescription: typeof body.shortDescription === 'string' ? body.shortDescription : undefined,
      keywords: body.keywords,
      heroImageUrl: typeof body.heroImageUrl === 'string' ? body.heroImageUrl : undefined,
    })
    if (!row) return res.status(404).json({ error: 'not_found' })
    await refreshMergedStoreCatalog()
    return res.json({ subcategory: row })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
      return res.status(409).json({ error: 'slug_taken' })
    }
    console.error('[admin/store/subcategories patch]', e)
    return res.status(500).json({ error: 'update_failed' })
  }
})

app.delete('/api/admin/store/subcategories/:id', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  if (!sharedPgPool) return res.status(503).json({ error: 'database_required' })
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : ''
  if (!id) return res.status(400).json({ error: 'id_required' })
  try {
    const r = await deleteSubcategory(sharedPgPool, id)
    if (!r.ok) {
      if (r.error === 'not_found') return res.status(404).json({ error: 'not_found' })
      if (r.error === 'cannot_delete_general') {
        return res.status(400).json({ error: r.error, detail: 'The General subcategory cannot be deleted.' })
      }
      if (r.error === 'subcategory_in_use') {
        return res.status(400).json({ error: r.error, detail: 'Reassign products before deleting.' })
      }
      return res.status(400).json({ error: 'delete_blocked' })
    }
    await refreshMergedStoreCatalog()
    return res.json({ ok: true })
  } catch (e) {
    console.error('[admin/store/subcategories delete]', e)
    return res.status(500).json({ error: 'delete_failed' })
  }
})

app.post(
  '/api/admin/products/upload-image',
  listingImageUpload.single('file'),
  async (req, res) => {
    if (!assertStoreAdmin(req, res)) return
    const buf = req.file?.buffer
    if (!buf?.length) return res.status(400).json({ error: 'file_required' })
    const mime = req.file.mimetype || ''
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(mime)) {
      return res.status(400).json({ error: 'invalid_image_type' })
    }
    try {
      if (process.env.VERCEL === '1') {
        return res.status(503).json({
          error: 'admin_upload_unavailable',
          detail:
            'Admin multipart uploads are not available on Vercel (no durable local disk). Paste an image URL or run the API locally.',
        })
      }
      const ext = path.extname(req.file.originalname || '').toLowerCase()
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg'
      const name = `product_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`
      await fs.promises.mkdir(LISTING_UPLOAD_DIR, { recursive: true })
      await fs.promises.writeFile(path.join(LISTING_UPLOAD_DIR, name), buf)
      /** Same-origin or Vite `/listing-uploads` proxy to API in dev. */
      return res.json({ url: `/listing-uploads/${name}` })
    } catch (e) {
      console.error('[admin/products/upload]', e)
      const detail = e instanceof Error ? e.message : String(e)
      return res.status(502).json({
        error: 'upload_failed',
        detail: detail.slice(0, 240),
      })
    }
  },
)

app.get('/api/store/catalog', async (req, res) => {
  const cat = typeof req.query.category === 'string' ? req.query.category.trim() : ''
  const overrideRows = await storeCatalogOverridesStore.readProducts()
  const customIds = new Set(overrideRows.map((r) => r?.id).filter(Boolean))
  let products = getMergedCatalogProducts().map((p) => ({
    id: p.id,
    sku: p.sku,
    title: p.title,
    subtitle: p.subtitle,
    categoryId: p.categoryId,
    ...(p.subcategoryId ? { subcategoryId: p.subcategoryId } : {}),
    ...(p.subcategoryLabel ? { subcategoryLabel: p.subcategoryLabel } : {}),
    priceAud: p.priceAud,
    ...(p.description ? { description: p.description } : {}),
    ...(p.compareAtAud != null && p.compareAtAud > 0 ? { compareAtAud: p.compareAtAud } : {}),
    ...(p.affiliateUrl ? { affiliateUrl: p.affiliateUrl } : {}),
    ...(p.externalListing ? { externalListing: true } : {}),
    ...(p.productSource === 'amazon' ? { productSource: 'amazon' } : {}),
    ...(p.asin ? { asin: p.asin } : {}),
    coverImageUrl:
      typeof p.coverImageUrl === 'string' && p.coverImageUrl.trim()
        ? p.coverImageUrl.trim()
        : `/supplies/${p.id}.png`,
    isCustom: customIds.has(p.id),
  }))
  if (cat) products = products.filter((p) => p.categoryId === cat)
  return res.json({ products, currency: 'AUD' })
})

app.get('/api/store/subcategories', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''
  if (!category) return res.status(400).json({ error: 'category_required' })
  if (!sharedPgPool) return res.json({ subcategories: [] })
  try {
    const subcategories = await listSubcategoriesPublic(sharedPgPool, category)
    return res.json({ subcategories })
  } catch (e) {
    console.error('[store/subcategories]', e)
    return res.status(500).json({ error: 'subcategories_failed' })
  }
})

app.get('/api/store/bundles', (_req, res) => {
  return res.json({ bundles: STORE_BUNDLES, currency: 'AUD' })
})

app.post('/api/store/cart/validate', (req, res) => {
  const body = req.body ?? {}
  if (body.bundleId != null) {
    const v = validateBundleCart(body.bundleId)
    if (!v.ok) return res.status(400).json({ error: v.error, detail: v.detail })
    return res.json({
      bundleId: v.bundleId,
      lines: v.lines,
      subtotalAud: v.subtotalAud,
      retailAud: v.retailAud,
      currency: v.currency,
    })
  }
  const lines = body.lines
  const v = validateSupplyCartLines(Array.isArray(lines) ? lines : [])
  if (!v.ok) return res.status(400).json({ error: v.error, detail: v.detail })
  return res.json({ lines: v.lines, subtotalAud: v.subtotalAud, currency: v.currency })
})

app.post('/api/store/checkout', paymentIntentCreateLimiter, async (req, res) => {
  const actor = resolveMarketplaceActor(req)
  const idem =
    typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : ''
  if (idem) {
    const existingId = storeCheckoutIdemGet(idem)
    if (existingId) {
      const existingOrder = await storeOrdersStore.getById(existingId)
      if (existingOrder) {
        const state = await marketplaceStore.readState()
        const pid = existingOrder.paymentIntentId
        const pi = pid
          ? state.paymentIntents.find((row) => row.id === pid || row.stripePaymentIntentId === pid)
          : null
        return res.json({
          storeOrder: existingOrder,
          paymentIntent: pi ?? null,
          idempotent: true,
        })
      }
    }
  }

  const body = req.body ?? {}
  /** @type {{ ok: true, lines: any[], subtotalAud: number, bundleId: string | null } | { ok: false, error: string, detail?: string }} */
  let validated
  if (body.bundleId != null) {
    const v = validateBundleCart(body.bundleId)
    if (!v.ok) return res.status(400).json({ error: v.error, detail: v.detail })
    validated = { ok: true, lines: v.lines, subtotalAud: v.subtotalAud, bundleId: v.bundleId }
  } else {
    const v = validateSupplyCartLines(Array.isArray(body.lines) ? body.lines : [])
    if (!v.ok) return res.status(400).json({ error: v.error, detail: v.detail })
    validated = { ok: true, lines: v.lines, subtotalAud: v.subtotalAud, bundleId: null }
  }

  const order = await storeOrdersStore.appendPendingOrder({
    kind: validated.bundleId ? 'supply_bundle' : 'supply_cart',
    lines: validated.lines,
    subtotalAud: validated.subtotalAud,
    currency: 'AUD',
    customerUserId: actor.customerUserId,
    customerEmail: actor.customerEmail,
    idempotencyKey: idem || null,
    bundleId: validated.bundleId,
    paymentIntentId: null,
    stripePaymentIntentId: null,
    webhookConfirmedAt: null,
  })

  const ship = body.shipping && typeof body.shipping === 'object' ? body.shipping : null
  if (ship) {
    const shipping = {
      name: String(ship.name || '').slice(0, 200),
      email: String(ship.email || '').slice(0, 200),
      address: String(ship.address || '').slice(0, 2000),
    }
    if (shipping.name || shipping.email || shipping.address) {
      await storeOrdersStore.patchOrder(order.id, { shipping })
    }
  }

  if (idem) storeCheckoutIdemRemember(idem, order.id)

  const intentMetadata = { type: 'supply_cart', storeOrderId: order.id }
  const state = await marketplaceStore.readState()
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  let paymentIntent
  if (stripeKey) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(stripeKey)
      const stripePi = await createStripePaymentIntentOnStripe(stripe, {
        amountAud: validated.subtotalAud,
        bookingId: null,
        metadata: intentMetadata,
      })
      paymentIntent = localRecordFromStripePaymentIntent(stripePi, {
        bookingId: null,
        amountAud: validated.subtotalAud,
        currency: 'AUD',
        metadata: intentMetadata,
      })
    } catch (e) {
      console.error('[store/checkout] stripe create failed', e)
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(502).json({
        error: 'stripe_intent_create_failed',
        detail: msg.slice(0, 280),
      })
    }
  } else {
    paymentIntent = createPaymentIntentRecord({
      bookingId: null,
      amount: validated.subtotalAud,
      currency: 'AUD',
      metadata: intentMetadata,
    })
  }
  marketplaceStore.upsertPaymentIntent(state, paymentIntent)
  await marketplaceStore.writeState(state)
  await storeOrdersStore.patchOrder(order.id, {
    paymentIntentId: paymentIntent.id,
    stripePaymentIntentId: paymentIntent.stripePaymentIntentId || null,
  })
  const nextOrder = await storeOrdersStore.getById(order.id)
  return res.json({ storeOrder: nextOrder, paymentIntent })
})

app.get('/api/store/orders', async (req, res) => {
  const actor = resolveMarketplaceActor(req)
  if (!actor.customerUserId && !actor.customerEmail) {
    return res.json({ orders: [] })
  }
  const fs = await import('node:fs/promises')
  try {
    const raw = await fs.readFile(STORE_ORDERS_FILE, 'utf8')
    const rows = JSON.parse(raw)
    if (!Array.isArray(rows)) return res.json({ orders: [] })
    const mine = rows.filter((o) => {
      if (actor.customerUserId && o.customerUserId === actor.customerUserId) return true
      if (actor.customerEmail && o.customerEmail === actor.customerEmail) return true
      return false
    })
    return res.json({ orders: mine.slice(0, 50) })
  } catch (e) {
    if (e && e.code === 'ENOENT') return res.json({ orders: [] })
    throw e
  }
})

app.get('/api/store/orders/:orderId', async (req, res) => {
  const order = await storeOrdersStore.getById(req.params.orderId)
  if (!order) return res.status(404).json({ error: 'order_not_found' })
  return res.json({ order })
})

app.get('/api/store/admin/inventory', (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  const merged = getMergedCatalogProducts()
  const stock = {}
  for (const p of merged) {
    stock[p.sku] = { sku: p.sku, available: null, note: 'Unlimited (demo)' }
  }
  return res.json({ products: merged, stock, bundles: STORE_BUNDLES })
})

app.post('/api/store/admin/ping', (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  return res.json({ ok: true })
})

app.get('/api/store/admin/products', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  const products = await storeCatalogOverridesStore.readProducts()
  return res.json({ products })
})

app.post('/api/store/admin/products', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  const body = req.body ?? {}
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : ''
  if (!(await isFileCatalogCategoryAllowed(categoryId))) {
    return res.status(400).json({ error: 'invalid_category' })
  }
  const title = String(body.title || '').trim().slice(0, 200)
  if (!title) return res.status(400).json({ error: 'title_required' })
  const subtitle = String(body.subtitle || '').trim().slice(0, 300)
  const priceRaw = Number(body.priceAud)
  if (!Number.isFinite(priceRaw) || priceRaw < 0) {
    return res.status(400).json({ error: 'invalid_price' })
  }
  const priceAud = Math.round(priceRaw)
  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim().slice(0, 120)
      : `sup-admin-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  let sku =
    typeof body.sku === 'string' && body.sku.trim()
      ? body.sku
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, '_')
          .slice(0, 80)
      : `SUPPLY_ADMIN_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  if (!sku) return res.status(400).json({ error: 'sku_invalid' })
  const merged = getMergedCatalogProducts()
  for (const p of merged) {
    if (p.sku === sku && p.id !== id) {
      return res.status(409).json({ error: 'sku_taken', detail: sku })
    }
  }
  const descRaw = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : ''
  let compareAt = 0
  const cap = body.compareAtPriceAud
  if (cap != null && String(cap).trim() !== '') {
    compareAt = Math.round(Number(cap) * 100) / 100
    if (!Number.isFinite(compareAt) || compareAt < 0) compareAt = 0
  }
  if (compareAt > 0 && priceAud > 0 && compareAt <= priceAud) {
    return res.status(400).json({
      error: 'compare_at_invalid',
      detail: 'Compare-at price must be higher than the listing price.',
    })
  }
  /** @type {Record<string, unknown>} */
  const product = { id, sku, title, subtitle: subtitle || '—', categoryId, priceAud }
  if (descRaw) product.description = descRaw
  if (compareAt > 0) product.compareAtAud = compareAt
  const subId = typeof body.subcategoryId === 'string' ? body.subcategoryId.trim() : ''
  const subLb = typeof body.subcategoryLabel === 'string' ? body.subcategoryLabel.trim().slice(0, 120) : ''
  if (subId) product.subcategoryId = subId
  if (subLb) product.subcategoryLabel = subLb
  if (Array.isArray(body.tags)) {
    product.tags = body.tags.map((t) => String(t).trim().slice(0, 64)).filter(Boolean).slice(0, 32)
  }
  await storeCatalogOverridesStore.upsertProduct(product)
  await refreshMergedStoreCatalog()
  return res.json({ product })
})

app.patch('/api/store/admin/products/:productId', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  const productId = typeof req.params.productId === 'string' ? req.params.productId.trim() : ''
  if (!productId) return res.status(400).json({ error: 'id_required' })
  const rows = await storeCatalogOverridesStore.readProducts()
  const p = rows.find((r) => r && r.id === productId)
  if (!p) return res.status(404).json({ error: 'not_found' })
  const body = req.body ?? {}
  /** @type {Record<string, unknown>} */
  const next = { ...p }
  if (typeof body.title === 'string') next.title = body.title.trim().slice(0, 200)
  if (typeof body.subtitle === 'string') next.subtitle = body.subtitle.trim().slice(0, 300)
  if (typeof body.categoryId === 'string') {
    const c = body.categoryId.trim()
    if (await isFileCatalogCategoryAllowed(c)) next.categoryId = c
  }
  if (typeof body.category === 'string') {
    const c = body.category.trim()
    if (await isFileCatalogCategoryAllowed(c)) next.categoryId = c
  }
  if (body.price != null && String(body.price).trim() !== '') {
    const pr = Math.round(Number(body.price))
    if (Number.isFinite(pr) && pr >= 0) next.priceAud = pr
  }
  if (body.priceAud != null && String(body.priceAud).trim() !== '') {
    const pr = Math.round(Number(body.priceAud))
    if (Number.isFinite(pr) && pr >= 0) next.priceAud = pr
  }
  if (body.comparePrice !== undefined || body.compareAtAud !== undefined) {
    const raw = body.compareAtAud !== undefined ? body.compareAtAud : body.comparePrice
    if (raw == null || String(raw).trim() === '') {
      delete next.compareAtAud
    } else {
      const c = Math.round(Number(raw) * 100) / 100
      if (Number.isFinite(c) && c > 0) next.compareAtAud = c
      else delete next.compareAtAud
    }
  }
  if (typeof body.description === 'string') next.description = body.description.trim().slice(0, 4000)
  if (typeof body.coverImageUrl === 'string') next.coverImageUrl = body.coverImageUrl.trim().slice(0, 2048)
  if (typeof body.imageUrl === 'string') next.coverImageUrl = body.imageUrl.trim().slice(0, 2048)
  if (typeof body.subcategoryId === 'string') next.subcategoryId = body.subcategoryId.trim()
  if (body.subcategoryId === null) delete next.subcategoryId
  if (typeof body.subcategoryLabel === 'string') {
    next.subcategoryLabel = body.subcategoryLabel.trim().slice(0, 120)
  }
  if (body.tags !== undefined) {
    if (Array.isArray(body.tags)) {
      next.tags = body.tags.map((t) => String(t).trim().slice(0, 64)).filter(Boolean).slice(0, 32)
    } else if (typeof body.tags === 'string') {
      next.tags = body.tags
        .split(/[,;]+/)
        .map((t) => t.trim().slice(0, 64))
        .filter(Boolean)
        .slice(0, 32)
    } else {
      next.tags = []
    }
  }

  const pa = Number(next.priceAud)
  const cmp = next.compareAtAud != null ? Number(next.compareAtAud) : null
  if (cmp != null && cmp > 0 && pa > 0 && cmp <= pa) {
    return res.status(400).json({
      error: 'compare_at_invalid',
      detail: 'Compare-at price must be higher than the listing price.',
    })
  }

  await storeCatalogOverridesStore.upsertProduct(next)
  await refreshMergedStoreCatalog()
  const admin = serializeLegacyOverrideAdmin(next)
  return res.json({ product: admin })
})

app.post(
  '/api/store/admin/products/:productId/cover',
  listingImageUpload.single('file'),
  async (req, res) => {
    if (!assertStoreAdmin(req, res)) return
    const productId = req.params.productId
    const buf = req.file?.buffer
    if (!buf || !buf.length) return res.status(400).json({ error: 'file_required' })
    const ext = path.extname(req.file.originalname || '').toLowerCase()
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
    const name = `store_${productId}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`
    await fs.promises.mkdir(LISTING_UPLOAD_DIR, { recursive: true })
    await fs.promises.writeFile(path.join(LISTING_UPLOAD_DIR, name), buf)
    const url = `/listing-uploads/${name}`
    const rows = await storeCatalogOverridesStore.readProducts()
    const p = rows.find((r) => r && r.id === productId)
    if (!p) return res.status(404).json({ error: 'product_not_found' })
    const next = { ...p, coverImageUrl: url }
    await storeCatalogOverridesStore.upsertProduct(next)
    await refreshMergedStoreCatalog()
    return res.json({ product: next })
  },
)

app.delete('/api/store/admin/products/:productId', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  const productId = req.params.productId
  const ok = await storeCatalogOverridesStore.deleteById(productId)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  await refreshMergedStoreCatalog()
  return res.json({ ok: true })
})

app.get('/api/store/admin/analytics/overview', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  const days = Math.max(1, Math.min(90, Math.floor(Number(req.query.days) || 30)))
  try {
    const orders = await storeOrdersStore.listRecent(2000)
    const { earningsByDay, totalRevenueAud, paidOrders } = earningsBucketsFromOrders(orders, days)
    let liveVisitors = 0
    let visitorsByDay = []
    if (sharedPgPool) {
      liveVisitors = await countLiveVisitors(sharedPgPool, 5)
      visitorsByDay = await visitorBucketsByDay(sharedPgPool, days)
    }
    return res.json({
      rangeDays: days,
      liveVisitors,
      earningsByDay,
      visitorsByDay,
      totals: {
        revenueAud: totalRevenueAud,
        paidOrders,
        avgOrderAud: paidOrders > 0 ? Math.round(totalRevenueAud / paidOrders) : 0,
      },
    })
  } catch (e) {
    console.error('[admin/analytics/overview]', e)
    return res.status(500).json({ error: 'analytics_failed' })
  }
})

app.post('/api/store/admin/ai/chat', adminAiLimiter, async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  try {
    const out = await runAdminStoreAiChat(req.body ?? {}, sharedPgPool, storeOrdersStore)
    if (!out.ok) return res.status(out.httpStatus).json(out.httpBody)
    return res.json({ message: out.message, llmMs: out.llmMs })
  } catch (e) {
    console.error('[admin/ai/chat]', e)
    return res.status(500).json({ error: 'admin_ai_failed' })
  }
})

app.get('/api/store/admin/orders', async (req, res) => {
  if (!assertStoreAdmin(req, res)) return
  const fs = await import('node:fs/promises')
  try {
    const raw = await fs.readFile(STORE_ORDERS_FILE, 'utf8')
    const rows = JSON.parse(raw)
    if (!Array.isArray(rows)) return res.json({ orders: [], summary: { total: 0, paid: 0, pending: 0 } })
    const slice = rows.slice(0, 100)
    const paid = slice.filter((o) => o.status === 'paid').length
    const pending = slice.filter((o) => o.status === 'pending').length
    return res.json({
      orders: slice,
      summary: { total: slice.length, paid, pending, failed: slice.filter((o) => o.status === 'failed').length },
    })
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return res.json({ orders: [], summary: { total: 0, paid: 0, pending: 0, failed: 0 } })
    }
    throw e
  }
})

function peerListingSellerKey(req) {
  const actor = resolveMarketplaceActor(req)
  return peerListingsStore.sellerKey(actor.customerUserId, actor.customerEmail)
}

async function supabaseAuthUserFromRequest(req) {
  const accessToken = parseBearerAccessToken(req)
  if (!accessToken) return null
  const sb = getSupabaseClientForUserAccessToken(accessToken)
  if (!sb) return null
  const { data, error } = await sb.auth.getUser()
  if (error || !data?.user?.id) return null
  return data.user
}

function peerMessageJson(message, viewerKey) {
  return {
    id: message.id,
    threadId: message.threadId,
    body: message.body,
    createdAt: message.createdAt,
    messageType: message.messageType,
    fromViewer: message.senderKey === viewerKey,
  }
}

function peerMessageThreadJson(thread, viewerKey) {
  const role =
    thread.kind === 'listing'
      ? viewerKey === thread.buyerKey
        ? 'buyer'
        : viewerKey === thread.sellerKey
          ? 'seller'
          : null
      : thread.kind === 'support' && viewerKey === thread.buyerKey
        ? 'buyer'
        : null
  return {
    id: thread.id,
    kind: thread.kind,
    listingId: thread.listingId,
    lastMessagePreview: thread.lastMessagePreview,
    lastMessageAt: thread.lastMessageAt,
    updatedAt: thread.updatedAt,
    unreadCount: thread.unreadByParticipant?.[viewerKey] ?? 0,
    role,
  }
}

app.get('/api/drops/feed', async (req, res) => {
  if (!sharedPgPool) {
    return res.json({ drops: [], nextCursor: null, database: false })
  }
  try {
    const limit =
      typeof req.query.limit === 'string' && Number.isFinite(Number(req.query.limit))
        ? Number(req.query.limit)
        : 24
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : ''
    const ranked = req.query.rank === '1' || req.query.ranked === '1' || req.query.sort === 'rank'
    const { drops, nextCursor } = await listPublishedDropsFeed(sharedPgPool, { limit, cursor, ranked })
    res.set('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60')
    return res.json({ drops, nextCursor, database: true, ranked })
  } catch (e) {
    console.error('[drops/feed]', e)
    return res.status(500).json({ error: 'drops_feed_failed' })
  }
})

app.get('/api/profiles/:username', async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'profiles_unavailable' })
  const username = String(req.params.username || '')
    .trim()
    .toLowerCase()
  if (!username) return res.status(400).json({ error: 'username_required' })
  try {
    const { rows: pRows } = await sharedPgPool.query(
      `SELECT id, username, avatar_url, created_at FROM profiles WHERE lower(username) = $1 LIMIT 1`,
      [username],
    )
    const profile = pRows[0]
    if (!profile) return res.status(404).json({ error: 'profile_not_found' })
    const { rows: dRows } = await sharedPgPool.query(
      `SELECT d.* FROM drops d
       WHERE d.user_id = $1::uuid AND d.status = 'published' AND d.moderation_state = 'ok'
       ORDER BY d.published_at DESC NULLS LAST
       LIMIT 50`,
      [profile.id],
    )
    const ids = dRows.map((r) => r.id)
    const { rows: mediaRows } = ids.length
      ? await sharedPgPool.query(
          `SELECT * FROM drop_media WHERE drop_id = ANY($1::uuid[]) ORDER BY drop_id, sort_order`,
          [ids],
        )
      : { rows: [] }
    const byDrop = new Map()
    for (const m of mediaRows) {
      const k = String(m.drop_id)
      if (!byDrop.has(k)) byDrop.set(k, [])
      byDrop.get(k).push(m)
    }
    const drops = dRows.map((d) => {
      const media = byDrop.get(String(d.id)) ?? []
      const images = media.filter((m) => m.kind === 'image').map((m) => m.url)
      const vid = media.find((m) => m.kind === 'video' || m.kind === 'live_replay')
      return {
        id: String(d.id),
        userId: d.user_id ? String(d.user_id) : null,
        title: d.title,
        seller: d.seller_display,
        authorId: d.author_id,
        priceLabel: d.price_label,
        blurb: d.blurb,
        categories: Array.isArray(d.categories) ? d.categories : [],
        region: d.region,
        ...(images.length ? { mediaKind: 'images', imageUrls: images } : {}),
        ...(!images.length && vid ? { mediaKind: vid.kind === 'live_replay' ? 'live_replay' : 'video', videoUrl: vid.url } : {}),
      }
    })
    return res.json({ profile, drops })
  } catch (e) {
    console.error('[profiles/get]', e)
    return res.status(500).json({ error: 'profiles_get_failed' })
  }
})

app.get('/api/drops/:id', async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'drops_db_not_configured' })
  try {
    const row = await getDropWithMedia(sharedPgPool, req.params.id)
    if (!row || row.drop.status !== 'published' || row.drop.moderation_state !== 'ok') {
      return res.status(404).json({ error: 'drop_not_found' })
    }
    return res.json({ drop: row.public })
  } catch (e) {
    console.error('[drops/get]', e)
    return res.status(500).json({ error: 'drop_get_failed' })
  }
})

app.post('/api/drops', dropsWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'drops_db_not_configured' })
  const authUser = await supabaseAuthUserFromRequest(req)
  if (!authUser?.id) return res.status(401).json({ error: 'auth_required' })
  const sk = peerListingsStore.sellerKey(authUser.id, authUser.email || '')
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  try {
    const body = req.body ?? {}
    const userId = String(authUser.id).trim()
    const authorId = userId
    const recentUploads = await countRecentDropsByUser(sharedPgPool, userId, 60)
    if (recentUploads >= 5) return res.status(429).json({ error: 'rate_limited' })
    const row = await createDropDraft(sharedPgPool, sk, {
      ...body,
      userId,
      authorId,
    })
    if (!row) return res.status(500).json({ error: 'create_failed' })
    const full = await getDropWithMedia(sharedPgPool, row.id)
    return res.json({ drop: full?.public ?? null, id: row.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'seller_key_required') return res.status(400).json({ error: msg })
    console.error('[drops/create]', e)
    return res.status(500).json({ error: 'drops_create_failed' })
  }
})

app.patch('/api/drops/:id', dropsWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'drops_db_not_configured' })
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  try {
    const row = await updateDrop(sharedPgPool, req.params.id, sk, req.body ?? {})
    if (!row) return res.status(404).json({ error: 'drop_not_found' })
    const full = await getDropWithMedia(sharedPgPool, row.id)
    return res.json({ drop: full?.public ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'forbidden') return res.status(403).json({ error: msg })
    console.error('[drops/patch]', e)
    return res.status(500).json({ error: 'drops_patch_failed' })
  }
})

app.post('/api/drops/:id/publish', dropsWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'drops_db_not_configured' })
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  try {
    const row = await publishDrop(sharedPgPool, req.params.id, sk)
    if (!row) return res.status(404).json({ error: 'drop_not_found' })
    const full = await getDropWithMedia(sharedPgPool, row.id)
    return res.json({ drop: full?.public ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'forbidden') return res.status(403).json({ error: msg })
    if (msg === 'media_required') return res.status(400).json({ error: msg })
    console.error('[drops/publish]', e)
    return res.status(500).json({ error: 'drops_publish_failed' })
  }
})

/**
 * One-shot Drops publish: create draft, attach media URLs (already uploaded), publish, record marketplace_posts.
 * DB access is server-only; the SPA must not read DATABASE_URL.
 */
function isAllowedDropMediaUrl(url) {
  const u = String(url || '').trim()
  if (u.length < 4 || u.length > 2048) return false
  if (u.startsWith('/') && !u.startsWith('//')) return true
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

app.post('/api/publish', dropsWriteLimiter, async (req, res) => {
  const reqId = `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  console.log('[publish-api] step 1: request received', { reqId, method: req.method, path: req.path })
  if (!sharedPgPool) return res.status(503).json({ error: 'publish_unavailable' })
  console.log('[publish-api] step 2: before auth check', { reqId })
  const authUser = await supabaseAuthUserFromRequest(req)
  console.log('[publish-api] step 3: after auth check', { reqId, hasUser: Boolean(authUser?.id) })
  if (!authUser?.id) return res.status(401).json({ error: 'auth_required' })
  const sk = peerListingsStore.sellerKey(authUser.id, authUser.email || '')
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  try {
    console.log('[publish-api] step 4: body parsed', { reqId, hasBody: Boolean(req.body) })
    const body = req.body ?? {}
    const userId = String(authUser.id).trim()
    const userEmail = String(authUser.email || '').trim().toLowerCase()
    console.log('AUTH USER', userId)
    const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : ''
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls.map((x) => String(x || '').trim()).filter(Boolean)
      : []
    if (videoUrl && imageUrls.length) {
      return res.status(400).json({ error: 'video_or_images_not_both' })
    }
    if (!videoUrl && !imageUrls.length) {
      return res.status(400).json({ error: 'media_required' })
    }
    if (videoUrl && !isAllowedDropMediaUrl(videoUrl)) {
      return res.status(400).json({ error: 'invalid_media_url' })
    }
    for (const u of imageUrls) {
      if (!isAllowedDropMediaUrl(u)) return res.status(400).json({ error: 'invalid_media_url' })
    }

    console.log('[publish-api] step 5: before recent uploads query', { reqId, userId })
    const recentUploads = await countRecentDropsByUser(sharedPgPool, userId, 60)
    console.log('[publish-api] step 6: after recent uploads query', { reqId, recentUploads })
    if (recentUploads >= 5) {
      return res.status(429).json({ error: 'rate_limited', detail: 'Max 5 uploads per minute.' })
    }

    console.log('[publish-api] step 7: before profile username query', { reqId, userId })
    const { rows: profRows } = await sharedPgPool.query(
      `SELECT username FROM profiles WHERE id = $1::uuid LIMIT 1`,
      [userId],
    )
    console.log('[publish-api] step 8: after profile username query', { reqId, rowCount: profRows?.length ?? 0 })
    const username = String(profRows?.[0]?.username || '').trim()
    console.log('USERNAME', username || null)
    const authorId = userId
    const sellerDisplay =
      username && /^user_/i.test(username) === false
        ? `@${username}`
        : typeof body.sellerDisplay === 'string' && body.sellerDisplay.trim()
          ? body.sellerDisplay.trim().slice(0, 120)
          : `@${userEmail.split('@')[0] || 'seller'}`

    console.log('[publish-api] step 9: db insert start createDropDraft', { reqId })
    const row = await createDropDraft(sharedPgPool, sk, {
      userId,
      authorId,
      sellerDisplay,
      title: typeof body.title === 'string' ? body.title : undefined,
      priceLabel: typeof body.priceLabel === 'string' ? body.priceLabel : undefined,
      blurb: typeof body.blurb === 'string' ? body.blurb : undefined,
      categories: Array.isArray(body.categories) ? body.categories : undefined,
      region: typeof body.region === 'string' ? body.region : undefined,
      commerce: body.commerce,
      commerceSaleMode: body.commerceSaleMode,
      growthVelocityScore: body.growthVelocityScore,
      watchTimeMsSeed: body.watchTimeMsSeed,
    })
    console.log('[publish-api] step 10: db insert done createDropDraft', { reqId, dropId: row?.id ?? null })
    if (!row?.id) return res.status(500).json({ error: 'create_failed' })
    const dropId = String(row.id)

    if (videoUrl) {
      console.log('[publish-api] step 11: before addDropMedia video', { reqId, dropId })
      await addDropMedia(sharedPgPool, dropId, { kind: 'video', url: videoUrl, sortOrder: 0 })
      console.log('[publish-api] step 12: after addDropMedia video', { reqId, dropId })
    } else {
      let sort = 0
      for (const u of imageUrls) {
        console.log('[publish-api] step 11: before addDropMedia image', { reqId, dropId, sort })
        await addDropMedia(sharedPgPool, dropId, { kind: 'image', url: u, sortOrder: sort++ })
        console.log('[publish-api] step 12: after addDropMedia image', { reqId, dropId, sort })
      }
    }

    console.log('[publish-api] step 13: before publishDrop', { reqId, dropId })
    await publishDrop(sharedPgPool, dropId, sk)
    console.log('[publish-api] step 14: after publishDrop', { reqId, dropId })
    const mediaKind = videoUrl ? 'video' : 'carousel'
    console.log('[publish-api] step 15: before insertMarketplacePost', { reqId, dropId, mediaKind })
    await insertMarketplacePost(sharedPgPool, dropId, sk, mediaKind)
    console.log('[publish-api] step 16: after insertMarketplacePost', { reqId, dropId })

    console.log('[publish-api] step 17: before getDropWithMedia', { reqId, dropId })
    const full = await getDropWithMedia(sharedPgPool, dropId)
    console.log('[publish-api] step 18: after getDropWithMedia', { reqId, hasPublic: Boolean(full?.public) })
    console.log('[publish-api] step 19: response returned', { reqId, dropId })
    return res.json({ ok: true, id: dropId, drop: full?.public ?? null })
  } catch (e) {
    console.error('[publish-api] failed', { reqId, error: e instanceof Error ? e.message : String(e) })
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'seller_key_required') return res.status(400).json({ error: msg })
    if (msg === 'forbidden') return res.status(403).json({ error: msg })
    if (msg === 'media_required') return res.status(400).json({ error: msg })
    if (msg === 'invalid_media_kind' || msg === 'url_required') {
      return res.status(400).json({ error: 'invalid_media' })
    }
    console.error('[publish]', e)
    return res.status(500).json({ error: 'publish_failed' })
  }
})

app.post(
  '/api/drops/:id/media',
  dropsWriteLimiter,
  dropsMediaUpload.array('files', 12),
  async (req, res) => {
    if (!sharedPgPool) return res.status(503).json({ error: 'drops_db_not_configured' })
    const sk = peerListingSellerKey(req)
    if (!sk) return res.status(401).json({ error: 'auth_required' })
    const files = req.files
    if (!Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: 'files_required' })
    }
    try {
      const owner = await sharedPgPool.query(`SELECT seller_key FROM drops WHERE id = $1::uuid`, [req.params.id])
      const d = owner.rows[0]
      if (!d) return res.status(404).json({ error: 'drop_not_found' })
      if (String(d.seller_key) !== String(sk).trim()) return res.status(403).json({ error: 'forbidden' })
      await fs.promises.mkdir(DROPS_UPLOAD_DIR, { recursive: true })
      const out = []
      let sort = 0
      for (const f of files) {
        const buf = f.buffer
        if (!buf?.length) continue
        const ext = path.extname(f.originalname || '').toLowerCase()
        const mime = (f.mimetype || '').toLowerCase()
        const isVid = mime.startsWith('video/') || ['.mp4', '.webm', '.mov'].includes(ext)
        const isImg = mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
        if (!isVid && !isImg) continue
        const safeExt = isVid ? (ext && ext.length < 8 ? ext : '.mp4') : isImg ? (ext || '.jpg') : '.bin'
        const name = `d_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`
        await fs.promises.writeFile(path.join(DROPS_UPLOAD_DIR, name), buf)
        const url = `/drops-uploads/${name}`
        const kind = isVid ? 'video' : 'image'
        const m = await addDropMedia(sharedPgPool, req.params.id, { kind, url, sortOrder: sort++ })
        if (m) out.push(m)
      }
      if (!out.length) return res.status(400).json({ error: 'no_valid_files' })
      const full = await getDropWithMedia(sharedPgPool, req.params.id)
      return res.json({ media: out, drop: full?.public ?? null })
    } catch (e) {
      console.error('[drops/media]', e)
      return res.status(500).json({ error: 'drops_media_failed' })
    }
  },
)

app.post('/api/drops/:id/engage', dropsEngageLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(204).end()
  try {
    const body = req.body ?? {}
    const eventType = typeof body.eventType === 'string' ? body.eventType : 'view_ms'
    const clientId = typeof body.clientId === 'string' ? body.clientId : 'anon'
    const amount = Number(body.amount) || 0
    await recordDropEngagement(sharedPgPool, req.params.id, eventType, clientId, amount)
    return res.json({ ok: true })
  } catch (e) {
    console.error('[drops/engage]', e)
    return res.status(500).json({ error: 'engage_failed' })
  }
})

app.get('/api/drops/moderation/pending', async (req, res) => {
  const key = (process.env.FETCH_DROPS_ADMIN_KEY || '').trim()
  if (!key) return res.status(503).json({ error: 'moderation_disabled' })
  const hdr = req.headers['x-fetch-admin-key']
  if (hdr !== key) return res.status(401).json({ error: 'forbidden' })
  if (!sharedPgPool) return res.status(503).json({ error: 'drops_db_not_configured' })
  try {
    const { drops } = await listModerationPendingDrops(sharedPgPool, 48)
    return res.json({ drops })
  } catch (e) {
    console.error('[drops/moderation]', e)
    return res.status(500).json({ error: 'moderation_list_failed' })
  }
})

app.post('/api/drops/live/start', dropsWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'drops_db_not_configured' })
  const authUser = await supabaseAuthUserFromRequest(req)
  if (!authUser?.id) return res.status(401).json({ error: 'auth_required' })
  const sk = peerListingsStore.sellerKey(authUser.id, authUser.email || '')
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  try {
    const body = req.body ?? {}
    const userId = String(authUser.id).trim()
    const authorId = userId
    const recentUploads = await countRecentDropsByUser(sharedPgPool, userId, 60)
    if (recentUploads >= 5) return res.status(429).json({ error: 'rate_limited' })
    const sellerDisplay =
      typeof body.sellerDisplay === 'string' && body.sellerDisplay.trim()
        ? body.sellerDisplay.trim().slice(0, 120)
        : '@seller'
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : 'Live'
    const MAX_SHOWCASE = 24
    const showcaseRaw = body.showcaseItems
    const commerceItems = []
    if (Array.isArray(showcaseRaw)) {
      for (const x of showcaseRaw) {
        if (commerceItems.length >= MAX_SHOWCASE) break
        if (!x || typeof x !== 'object') continue
        const label = typeof x.label === 'string' ? x.label.trim().slice(0, 120) : ''
        if (x.type === 'product' && typeof x.id === 'string') {
          const id = x.id.trim().slice(0, 128)
          if (id) {
            const row = { kind: 'marketplace_product', productId: id }
            if (label) row.label = label
            commerceItems.push(row)
          }
        }
        if (x.type === 'listing' && typeof x.id === 'string') {
          const id = x.id.trim().slice(0, 128)
          if (!id) continue
          const listing = await peerListingsStore.getListing(id)
          if (!listing) continue
          const listSk = peerListingsStore.sellerKey(listing.sellerUserId, listing.sellerEmail)
          if (listSk !== sk) continue
          const safeLabel =
            label ||
            (typeof listing.title === 'string' ? listing.title.trim().slice(0, 120) : '')
          const row = { kind: 'buy_sell_listing', listingId: id }
          if (safeLabel) row.label = safeLabel
          commerceItems.push(row)
        }
      }
    }
    if (!commerceItems.length) {
      return res.status(400).json({
        error: 'showcase_required',
        detail: 'Select at least one store product or one of your marketplace listings.',
      })
    }
    const commerce = { kind: 'live_showcase', items: commerceItems }
    const productCount = commerceItems.filter((i) => i.kind === 'marketplace_product').length
    const listingCount = commerceItems.filter((i) => i.kind === 'buy_sell_listing').length
    const blurbParts = commerceItems
      .map((i) => i.label || i.productId || i.listingId)
      .filter(Boolean)
      .slice(0, 8)
    const defaultBlurb =
      blurbParts.length > 0
        ? `Live showcase · ${blurbParts.join(' · ')}`.slice(0, 400)
        : 'Live replay processing…'
    const blurb =
      typeof body.blurb === 'string' && body.blurb.trim()
        ? body.blurb.trim().slice(0, 400)
        : defaultBlurb
    const priceLabelBuilt =
      productCount && listingCount
        ? `Live · ${productCount} store · ${listingCount} listing${listingCount === 1 ? '' : 's'}`
        : productCount
          ? `Live · ${productCount} product${productCount === 1 ? '' : 's'}`
          : `Live · ${listingCount} listing${listingCount === 1 ? '' : 's'}`
    const priceLabel =
      typeof body.priceLabel === 'string' && body.priceLabel.trim()
        ? body.priceLabel.trim().slice(0, 80)
        : priceLabelBuilt
    const row = await createDropDraft(sharedPgPool, sk, {
      userId,
      authorId,
      sellerDisplay,
      title,
      priceLabel,
      blurb,
      categories: Array.isArray(body.categories) ? body.categories : ['community'],
      region: typeof body.region === 'string' ? body.region : 'SEQ',
      growthVelocityScore: 1.55,
      commerce,
    })
    if (!row?.id) return res.status(500).json({ error: 'draft_failed' })
    const mux = await muxCreateLiveStreamForDrop(String(row.id), title)
    if (!mux.ok) {
      const code = mux.error === 'mux_not_configured' ? 503 : 502
      return res.status(code).json({ error: mux.error, detail: mux.detail, dropId: row.id })
    }
    const root = mux.data
    const d =
      root && typeof root === 'object' && 'data' in root && root.data && typeof root.data === 'object'
        ? /** @type {Record<string, unknown>} */ (root.data)
        : /** @type {Record<string, unknown>} */ (root)
    const streamKey = typeof d.stream_key === 'string' ? d.stream_key : null
    const pids = Array.isArray(d.playback_ids) ? d.playback_ids : []
    const firstPid =
      pids[0] && typeof pids[0] === 'object' && pids[0] && 'id' in pids[0]
        ? String(/** @type {{ id?: string }} */ (pids[0]).id || '')
        : ''
    return res.json({
      dropId: row.id,
      rtmpUrl: 'rtmps://global-live.mux.com:443/app',
      streamKey,
      playbackUrl: firstPid ? muxPlaybackUrl(firstPid) : null,
    })
  } catch (e) {
    console.error('[drops/live/start]', e)
    return res.status(500).json({ error: 'live_start_failed' })
  }
})

app.get('/api/drops/ffmpeg-status', async (_req, res) => {
  const ok = await ffmpegAvailable()
  return res.json({ available: ok, bin: (process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg' })
})

/* ═══════════════════════ Live Battles API ═══════════════════════ */

const battlesWriteLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false })

const BATTLE_BOOST_TIERS = {
  1: { creditsCost: 10, pointsValue: 5 },
  2: { creditsCost: 50, pointsValue: 30 },
  3: { creditsCost: 200, pointsValue: 150 },
}

const BATTLE_SCORING = {
  sales: { sale: 100, bid: 10, boostMul: 0.5 },
  bidding: { sale: 40, bid: 100, boostMul: 0.5 },
  boost: { sale: 20, bid: 20, boostMul: 2 },
  mixed: { sale: 80, bid: 50, boostMul: 1 },
}

app.post('/api/battles', battlesWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const body = req.body || {}
    const mode = ['sales', 'bidding', 'boost', 'mixed'].includes(body.mode) ? body.mode : 'mixed'
    const durationMs = Math.min(600000, Math.max(60000, Number(body.durationMs) || 300000))
    const battle = await createBattle(sharedPgPool, { mode, durationMs })
    console.log('[battles] created', { id: battle.id, mode, durationMs })
    return res.json({ ok: true, battle })
  } catch (e) {
    console.error('[battles] create failed', e)
    return res.status(500).json({ error: 'battle_create_failed' })
  }
})

app.post('/api/battles/:id/join', battlesWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  try {
    const body = req.body || {}
    const side = body.side === 'b' ? 'b' : 'a'
    const part = await joinBattle(sharedPgPool, {
      battleId: req.params.id,
      sellerKey: sk,
      side,
      displayName: typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : '@seller',
      avatar: typeof body.avatar === 'string' ? body.avatar.trim().slice(0, 10) : '',
      rating: Number(body.rating) || null,
    })
    console.log('[battles] joined', { battleId: req.params.id, side, seller: sk })
    return res.json({ ok: true, participant: part })
  } catch (e) {
    console.error('[battles] join failed', e)
    return res.status(500).json({ error: 'join_failed' })
  }
})

app.post('/api/battles/:id/start', battlesWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const battle = await startBattle(sharedPgPool, req.params.id)
    console.log('[battles] started', { id: battle.id, endsAt: battle.ends_at })
    battleEventBus.emit('battle_started', { battleId: battle.id, battle })
    return res.json({ ok: true, battle })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'battle_not_found') return res.status(404).json({ error: msg })
    if (msg === 'battle_already_started') return res.status(409).json({ error: msg })
    console.error('[battles] start failed', e)
    return res.status(500).json({ error: 'start_failed' })
  }
})

app.post('/api/battles/:id/boost', battlesWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const body = req.body || {}
    const side = body.side === 'b' ? 'b' : 'a'
    const tier = [1, 2, 3].includes(Number(body.tier)) ? Number(body.tier) : 1
    const tierCfg = BATTLE_BOOST_TIERS[tier]
    const viewerId = typeof body.viewerId === 'string' ? body.viewerId.trim() : 'anon'
    const viewerName = typeof body.viewerName === 'string' ? body.viewerName.trim().slice(0, 40) : 'Viewer'

    const full = await getBattleWithParticipants(sharedPgPool, req.params.id)
    if (!full) return res.status(404).json({ error: 'battle_not_found' })
    if (full.battle.status !== 'live') return res.status(409).json({ error: 'battle_not_live' })

    const mode = full.battle.mode || 'mixed'
    const scoring = BATTLE_SCORING[mode] ?? BATTLE_SCORING.mixed
    const points = Math.round(tierCfg.pointsValue * scoring.boostMul)

    const boost = await recordBattleBoost(sharedPgPool, {
      battleId: req.params.id,
      viewerId,
      viewerName,
      side,
      tier,
      creditsCost: tierCfg.creditsCost,
      pointsAdded: points,
    })
    const newScore = await addBattleScore(sharedPgPool, {
      battleId: req.params.id,
      side,
      points,
      reason: `boost_tier_${tier}`,
    })

    battleEventBus.emit('boost_sent', { battleId: req.params.id, boost, newScore })
    return res.json({ ok: true, boost, newScore })
  } catch (e) {
    console.error('[battles] boost failed', e)
    return res.status(500).json({ error: 'boost_failed' })
  }
})

app.post('/api/battles/:id/comment', battlesWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const body = req.body || {}
    const comment = await addBattleComment(sharedPgPool, {
      battleId: req.params.id,
      viewerId: typeof body.viewerId === 'string' ? body.viewerId.trim() : 'anon',
      viewerName: typeof body.viewerName === 'string' ? body.viewerName.trim().slice(0, 40) : 'Viewer',
      body: typeof body.text === 'string' ? body.text : '',
    })
    if (!comment) return res.status(400).json({ error: 'empty_comment' })
    battleEventBus.emit('comment_added', { battleId: req.params.id, comment })
    return res.json({ ok: true, comment })
  } catch (e) {
    console.error('[battles] comment failed', e)
    return res.status(500).json({ error: 'comment_failed' })
  }
})

app.post('/api/battles/:id/score', battlesWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const body = req.body || {}
    const side = body.side === 'b' ? 'b' : 'a'
    const reason = typeof body.reason === 'string' ? body.reason : 'manual'
    const full = await getBattleWithParticipants(sharedPgPool, req.params.id)
    if (!full) return res.status(404).json({ error: 'battle_not_found' })
    if (full.battle.status !== 'live') return res.status(409).json({ error: 'battle_not_live' })

    const mode = full.battle.mode || 'mixed'
    const scoring = BATTLE_SCORING[mode] ?? BATTLE_SCORING.mixed
    let points = 0
    if (reason === 'sale') points = scoring.sale
    else if (reason === 'bid') points = scoring.bid
    else points = Math.min(500, Math.max(0, Math.round(Number(body.points) || 0)))

    if (points <= 0) return res.status(400).json({ error: 'invalid_points' })

    const newScore = await addBattleScore(sharedPgPool, { battleId: req.params.id, side, points, reason })
    battleEventBus.emit('score_updated', { battleId: req.params.id, side, points, reason, newScore })
    return res.json({ ok: true, newScore })
  } catch (e) {
    console.error('[battles] score failed', e)
    return res.status(500).json({ error: 'score_failed' })
  }
})

app.post('/api/battles/:id/end', battlesWriteLimiter, async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const result = await finalizeBattle(sharedPgPool, req.params.id)
    if (!result) return res.status(404).json({ error: 'battle_not_found' })
    battleEventBus.emit('battle_ended', { battleId: req.params.id, result })
    return res.json({ ok: true, result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'battle_not_found') return res.status(404).json({ error: msg })
    console.error('[battles] end failed', e)
    return res.status(500).json({ error: 'end_failed' })
  }
})

app.get('/api/battles', async (_req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const battles = await listActiveBattles(sharedPgPool)
    return res.json({ ok: true, battles })
  } catch (e) {
    console.error('[battles] list failed', e)
    return res.status(500).json({ error: 'list_failed' })
  }
})

app.get('/api/battles/:id', async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const data = await getBattleWithParticipants(sharedPgPool, req.params.id)
    if (!data) return res.status(404).json({ error: 'battle_not_found' })
    return res.json({ ok: true, ...data })
  } catch (e) {
    console.error('[battles] get failed', e)
    return res.status(500).json({ error: 'get_failed' })
  }
})

app.get('/api/battles/seller/:sellerId/stats', async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  try {
    const stats = await getSellerBattleStatsPg(sharedPgPool, req.params.sellerId)
    return res.json({ ok: true, stats: stats ?? null })
  } catch (e) {
    console.error('[battles] seller stats failed', e)
    return res.status(500).json({ error: 'stats_failed' })
  }
})

app.get('/api/battles/:id/stream', async (req, res) => {
  if (!sharedPgPool) return res.status(503).json({ error: 'db_not_configured' })
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('event: connected\ndata: {}\n\n')

  const battleId = req.params.id
  const handler = (/** @type {{ battleId: string }} */ evt) => {
    if (evt.battleId !== battleId) return
    try {
      res.write(`event: battle\ndata: ${JSON.stringify(evt)}\n\n`)
    } catch {}
  }
  battleEventBus.on('score_updated', handler)
  battleEventBus.on('boost_sent', handler)
  battleEventBus.on('comment_added', handler)
  battleEventBus.on('battle_ended', handler)
  battleEventBus.on('battle_started', handler)

  const ping = setInterval(() => {
    try { res.write('event: ping\ndata: {}\n\n') } catch {}
  }, 15_000)

  req.on('close', () => {
    clearInterval(ping)
    battleEventBus.off('score_updated', handler)
    battleEventBus.off('boost_sent', handler)
    battleEventBus.off('comment_added', handler)
    battleEventBus.off('battle_ended', handler)
    battleEventBus.off('battle_started', handler)
  })
})

import { EventEmitter } from 'node:events'
const battleEventBus = new EventEmitter()
battleEventBus.setMaxListeners(200)

if (sharedPgPool) {
  setInterval(async () => {
    try {
      const finalized = await finalizeExpiredBattles(sharedPgPool)
      for (const r of finalized) {
        battleEventBus.emit('battle_ended', { battleId: r.battle_id, result: r })
      }
    } catch {}
  }, 5_000)
}

/* ═══════════════════════ End Live Battles API ═══════════════════════ */

app.post(
  '/api/drops/process-video',
  dropsWriteLimiter,
  upload.single('file'),
  async (req, res) => {
    try {
      console.log('[drops/process-video] STEP 1 route entered')
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '217219' },
        body: JSON.stringify({
          sessionId: '217219',
          location: 'server/index.js:process-video',
          message: 'STEP 1 route entered',
          data: {},
          timestamp: Date.now(),
          hypothesisId: 'H5',
          runId: 'pre-fix',
        }),
      }).catch(() => {})
      // #endregion
      const buf = req.file?.buffer
      if (!buf?.length) return res.status(400).json({ error: 'file_required' })
      if (buf.length > DROP_VIDEO_MAX_BYTES) {
        return res.status(413).json({ error: 'file_too_large' })
      }
      const mute = req.body?.mute === '1' || req.body?.mute === true || req.body?.mute === 'true'
      const rot = Number(req.body?.rotation)
      const rotation = rot === 90 || rot === 180 || rot === 270 ? rot : 0
      const trimStartSec = Math.max(0, Number(req.body?.trimStartSec) || 0)
      const td = Number(req.body?.trimDurationSec)
      const trimDurationSec = Number.isFinite(td) && td > 0 ? td : undefined
      const out = await transformVideoBuffer(buf, {
        mute,
        rotation,
        trimStartSec,
        trimDurationSec,
      })
      if (!out.ok) {
        const code = out.error === 'ffmpeg_not_available' ? 501 : 422
        return res.status(code).json({ error: out.error })
      }
      await fs.promises.mkdir(DROPS_UPLOAD_DIR, { recursive: true })
      const name = `d_ff_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.mp4`
      await fs.promises.writeFile(path.join(DROPS_UPLOAD_DIR, name), out.buffer)
      const relVideoUrl = `/drops-uploads/${name}`

      const accessToken = parseBearerAccessToken(req)
      console.log('SERVER TOKEN DEBUG', {
        hasBearer: !!accessToken,
        tokenPrefix: accessToken ? accessToken.slice(0, 12) : null,
      })
      const wantSupabaseDropRow =
        req.body?.supabaseDropInsert === '1' ||
        req.body?.supabaseDropInsert === 'true' ||
        req.body?.supabaseDropInsert === true
      const sbUser = accessToken ? getSupabaseClientForUserAccessToken(accessToken) : null
      console.log('[drops/process-video] STEP 2 bearer present', {
        bearerPresent: Boolean(accessToken),
        wantSupabaseDropRow,
        hasSbUserClient: Boolean(sbUser),
      })
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '217219' },
        body: JSON.stringify({
          sessionId: '217219',
          location: 'server/index.js:process-video',
          message: 'STEP 2 bearer present',
          data: {
            bearerPresent: Boolean(accessToken),
            wantSupabaseDropRow,
            hasSbUserClient: Boolean(sbUser),
          },
          timestamp: Date.now(),
          hypothesisId: 'H3',
          runId: 'pre-fix',
        }),
      }).catch(() => {})
      // #endregion
      if (wantSupabaseDropRow && sbUser && accessToken) {
        console.log('[drops/process-video] STEP 3 before auth.getUser')
        const { data: userData, error: userErr } = await sbUser.auth.getUser(accessToken)
        const userId = userData?.user?.id
        console.log('SERVER USER DEBUG', {
          hasUser: !!userData?.user,
          userId: userData?.user?.id ?? null,
          userError: userErr
            ? {
                message: userErr.message,
                status: userErr.status,
                name: userErr.name,
              }
            : null,
        })
        console.log('[drops/process-video] STEP 4 auth.getUser result', {
          ok: !userErr && Boolean(userId),
          message: userErr?.message,
        })
        // #region agent log
        fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '217219' },
          body: JSON.stringify({
            sessionId: '217219',
            location: 'server/index.js:process-video',
            message: 'STEP 4 auth.getUser result',
            data: { ok: !userErr && Boolean(userId), authErrorName: userErr?.name },
            timestamp: Date.now(),
            hypothesisId: 'H2',
            runId: 'pre-fix',
          }),
        }).catch(() => {})
        // #endregion
        if (userErr || !userId) {
          console.error('[drops/process-video] supabase getUser failed', userErr)
          return res.status(401).json({ error: 'supabase_auth_invalid', detail: userErr?.message })
        }

        console.log('[drops/process-video] STEP 5 before insert payload build')
        const host = req.get('x-forwarded-host') || req.get('host') || ''
        const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim()
        const base = host ? `${proto}://${host}` : ''
        const videoUrl = base ? `${base}${relVideoUrl}` : relVideoUrl

        let imageUrls = []
        const rawImages = req.body?.imageUrls ?? req.body?.image_urls
        if (typeof rawImages === 'string' && rawImages.trim()) {
          try {
            const parsed = JSON.parse(rawImages)
            if (Array.isArray(parsed)) imageUrls = parsed.map((x) => String(x || '').trim()).filter(Boolean)
          } catch {
            imageUrls = []
          }
        }

        const title =
          typeof req.body?.title === 'string' && req.body.title.trim()
            ? req.body.title.trim().slice(0, 500)
            : 'Drop'
        const blurb =
          typeof req.body?.blurb === 'string' && req.body.blurb.trim()
            ? req.body.blurb.trim().slice(0, 4000)
            : ''
        const priceLabel = req.body?.priceLabel
        const priceField = req.body?.price

        const payload = {
          user_id: userId,
          title,
          price: String(priceLabel ?? priceField ?? ''),
          blurb,
          video_url: String(videoUrl),
          image_urls: Array.isArray(imageUrls) ? imageUrls : [],
        }
        console.log('INSERT DEBUG', { userId, payload })
        console.log('RLS CHECK', {
          authUserId: userId,
          payloadUserId: payload.user_id,
        })
        console.log('[drops/process-video] STEP 6 before drops insert')
        const { error: insertError } = await sbUser.from('drops').insert(payload)
        console.log('[drops/process-video] STEP 7 drops insert result', {
          ok: !insertError,
          code: insertError?.code,
          message: insertError?.message,
          insertWithoutSelect: true,
        })
        // #region agent log
        fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '217219' },
          body: JSON.stringify({
            sessionId: '217219',
            location: 'server/index.js:process-video',
            message: 'STEP 7 drops insert result',
            data: {
              ok: !insertError,
              code: insertError?.code,
              insertWithoutSelect: true,
            },
            timestamp: Date.now(),
            hypothesisId: 'H1',
            runId: 'pre-fix',
          }),
        }).catch(() => {})
        // #endregion
        if (insertError) {
          console.error('[drops/process-video] supabase drops insert', insertError)
          return res.status(403).json({
            step: 'drops_insert',
            code: insertError?.code,
            message: insertError?.message,
            authUserId: userId,
            payloadUserId: payload.user_id,
            hasBearer: !!accessToken,
            tokenPrefix: accessToken ? accessToken.slice(0, 12) : null,
          })
        }
        return res.status(200).json({ ok: true, step: 'drops_insert_succeeded' })
      }

      return res.json({ videoUrl: relVideoUrl })
    } catch (e) {
      console.error('[drops/process-video]', e)
      return res.status(500).json({ error: 'process_failed' })
    }
  },
)

app.get('/api/listings', async (req, res) => {
  const statusRaw = typeof req.query.status === 'string' ? req.query.status.trim() : 'published'
  const profileAuthorId =
    typeof req.query.profileAuthorId === 'string' ? req.query.profileAuthorId.trim() : undefined
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
  const limit =
    typeof req.query.limit === 'string' && Number.isFinite(Number(req.query.limit))
      ? Math.min(48, Math.max(1, Math.floor(Number(req.query.limit))))
      : 24
  const baseParams = {
    status: statusRaw || 'published',
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    profileAuthorId: profileAuthorId || undefined,
    cursor,
    limit,
  }
  if (cursor) {
    const r = await peerListingsStore.listListings(baseParams)
    return res.json({ ...r, currency: 'AUD' })
  }
  const demosFiltered = filterPublicDemoListings(buildPublicDemoListings(), {
    status: baseParams.status,
    q: baseParams.q,
    category: baseParams.category,
    profileAuthorId: baseParams.profileAuthorId,
    minPrice: baseParams.minPrice,
    maxPrice: baseParams.maxPrice,
  })
  const demosNorm = demosFiltered.map((l) => normalizeListingRow(l))
  const demoIds = new Set(demosNorm.map((l) => l.id))
  const storeLimit = Math.max(0, limit - demosNorm.length)
  const r = await peerListingsStore.listListings({ ...baseParams, limit: storeLimit })
  const storeListings = r.listings.filter((l) => !demoIds.has(l.id))
  return res.json({ listings: [...demosNorm, ...storeListings], nextCursor: r.nextCursor, currency: 'AUD' })
})

app.get('/api/listings/mine', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const listings = await peerListingsStore.listListingsBySeller(sk)
  const actor = resolveMarketplaceActor(req)
  if (isDevDemoMarketplaceActor(actor)) {
    const demo = buildDevDemoPeerListings(actor)
    return res.json({ listings: [...demo, ...listings] })
  }
  return res.json({ listings })
})

app.post('/api/listings/ai-fill-from-photos', (req, res) => {
  upload.array(SCAN_UPLOAD_FIELD, MAX_IMAGES_PER_REQUEST)(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: 'invalid_image_upload', detail: uploadErr.message || 'upload failed' })
    }
    try {
      if (!OPENAI_API_KEY) {
        return res.status(503).json({ error: 'openai_not_configured' })
      }
      const files = Array.isArray(req.files) ? req.files : []
      if (files.length === 0) {
        return res.status(400).json({
          error: 'no_images',
          detail: `Upload 1–${MAX_IMAGES_PER_REQUEST} images (field "${SCAN_UPLOAD_FIELD}").`,
        })
      }

      const prompt = `You help sellers list second-hand items on a local marketplace (Australia, AUD).
Analyse the product photo(s) and output JSON ONLY for a peer-to-peer listing.

Rules:
- Be factual from what is visible; note uncertainty ("appears to be…") when needed.
- No markdown fences. JSON object only.
- Title: short, specific, buyer-friendly (max ~72 characters).
- Description: 2–5 sentences: what it is, visible condition, notable wear, inclusions (cables, box) if visible, pickup hints if obvious.
- Category must be one of: general, furniture, electronics, fashion, sports, other.
- Condition must be one of: new, like new, good, fair, used, for parts
- keywords: comma-separated search tokens (brands, materials, style, size words), max ~120 chars total.
- Measurements: estimate widthCm, heightCm, depthCm in centimetres only when a ruler, label, or strong scale cue is visible; otherwise use null. Never invent precise mm.
- measurementsSummary: one human line e.g. "Approx. 120 W × 75 H × 60 D cm (estimated from image)" or null if unknown.
- suggestedPriceAud: fair second-hand AUD ask as a whole number (not cents), conservative; null if you cannot justify from the image/category.
- suggestedCompareAtAud: optional higher "was/RRP" AUD whole number when a retail product is recognizable; null otherwise.
- sku: short internal code if visible on packaging/label, else null.

Return exactly this shape:
{
  "title": "string",
  "description": "string",
  "category": "general|furniture|electronics|fashion|sports|other",
  "condition": "new|like new|good|fair|used|for parts",
  "keywords": "string",
  "widthCm": number|null,
  "heightCm": number|null,
  "depthCm": number|null,
  "measurementsSummary": string|null,
  "suggestedPriceAud": number|null,
  "suggestedCompareAtAud": number|null,
  "sku": string|null,
  "confidence": number
}`

      const content = [{ type: 'text', text: prompt }]
      for (const file of files) {
        const base64 = file.buffer.toString('base64')
        const dataUrl = `data:${file.mimetype};base64,${base64}`
        content.push({ type: 'image_url', image_url: { url: dataUrl } })
      }

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          temperature: 0.2,
          max_tokens: 900,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content }],
        }),
      })

      if (!openaiRes.ok) {
        const upstreamBody = await openaiRes.text().catch(() => '')
        return res.status(502).json({
          error: 'openai_failed',
          detail: upstreamBody.slice(0, 280),
        })
      }

      const payload = await openaiRes.json()
      const raw = payload?.choices?.[0]?.message?.content
      let parsed = null
      try {
        parsed = typeof raw === 'string' ? JSON.parse(stripJsonFence(raw)) : null
      } catch {
        return res.status(502).json({ error: 'openai_bad_json' })
      }

      const category =
        typeof parsed?.category === 'string' && ALLOWED_LISTING_AI_CATEGORIES.has(parsed.category)
          ? parsed.category
          : 'general'
      const condition =
        typeof parsed?.condition === 'string' && ALLOWED_LISTING_AI_CONDITIONS.has(parsed.condition)
          ? parsed.condition
          : 'used'

      const clampAud = (v) => {
        if (v == null || !Number.isFinite(Number(v))) return null
        const n = Math.round(Number(v))
        if (n < 0 || n > 250_000) return null
        return n
      }

      const numOrNull = (v) => {
        if (v == null || !Number.isFinite(Number(v))) return null
        const n = Math.round(Number(v))
        if (n < 1 || n > 500) return null
        return n
      }

      return res.json({
        title: typeof parsed?.title === 'string' ? parsed.title.trim().slice(0, 140) : '',
        description: typeof parsed?.description === 'string' ? parsed.description.trim().slice(0, 4000) : '',
        category,
        condition,
        keywords: typeof parsed?.keywords === 'string' ? parsed.keywords.trim().slice(0, 500) : '',
        widthCm: numOrNull(parsed?.widthCm),
        heightCm: numOrNull(parsed?.heightCm),
        depthCm: numOrNull(parsed?.depthCm),
        measurementsSummary:
          parsed?.measurementsSummary === null
            ? null
            : typeof parsed?.measurementsSummary === 'string'
              ? parsed.measurementsSummary.trim().slice(0, 240)
              : null,
        suggestedPriceAud: clampAud(parsed?.suggestedPriceAud),
        suggestedCompareAtAud: clampAud(parsed?.suggestedCompareAtAud),
        sku:
          parsed?.sku === null
            ? null
            : typeof parsed?.sku === 'string'
              ? parsed.sku.trim().slice(0, 64)
              : null,
        confidence:
          typeof parsed?.confidence === 'number' && Number.isFinite(parsed.confidence)
            ? Math.max(0, Math.min(1, parsed.confidence))
            : null,
      })
    } catch (e) {
      console.error('[listings/ai-fill-from-photos]', e)
      return res.status(500).json({ error: 'listing_ai_fill_failed' })
    }
  })
})

app.get('/api/listings/:listingId', async (req, res) => {
  const pubId = req.params.listingId
  if (isPublicDemoListingId(pubId)) {
    const raw = getPublicDemoListingById(pubId)
    if (raw) return res.json({ listing: normalizeListingRow(raw) })
  }
  const sk = peerListingSellerKey(req)
  const actor = resolveMarketplaceActor(req)
  if (isDevDemoListingId(req.params.listingId) && isDevDemoMarketplaceActor(actor)) {
    const d = getDevDemoPeerListing(actor, req.params.listingId)
    if (d) return res.json({ listing: d })
  }
  const l = await peerListingsStore.getListingVisible(req.params.listingId, sk)
  if (!l) return res.status(404).json({ error: 'listing_not_found' })
  return res.json({ listing: l })
})

app.post(
  '/api/listings/uploads',
  listingImagesBatchUpload.array('files', 12),
  async (req, res) => {
    const sk = peerListingSellerKey(req)
    if (!sk) return res.status(401).json({ error: 'auth_required' })
    const files = req.files
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files_required', detail: 'Attach at least one image.' })
    }
    try {
      await fs.promises.mkdir(LISTING_UPLOAD_DIR, { recursive: true })
      const urls = []
      for (const f of files) {
        const buf = f.buffer
        if (!buf || !buf.length) continue
        const ext = path.extname(f.originalname || '').toLowerCase()
        const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
        const name = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`
        await fs.promises.writeFile(path.join(LISTING_UPLOAD_DIR, name), buf)
        urls.push(`/listing-uploads/${name}`)
      }
      if (urls.length === 0) {
        return res.status(400).json({ error: 'file_required', detail: 'No valid image bytes received.' })
      }
      return res.json({ urls })
    } catch (e) {
      console.error('POST ERROR', e)
      const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined
      console.error('[listings/uploads] write failed', {
        code,
        message: e instanceof Error ? e.message : String(e),
        dir: LISTING_UPLOAD_DIR,
      })
      return res.status(500).json({ error: 'upload_failed', detail: 'Could not save images.' })
    }
  },
)

app.post('/api/listings', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const actor = resolveMarketplaceActor(req)
  const body = req.body ?? {}
  logListingCreateRequestBodyShape(body)
  try {
    const title =
      typeof body.title === 'string' ? body.title.trim().slice(0, 200) : String(body.title ?? '').trim().slice(0, 200)
    if (!title) {
      return res.status(400).json({ error: 'title_required', detail: 'Add a product title.' })
    }

    const rawPrice = body.priceAud
    const priceNum =
      typeof rawPrice === 'string' ? Number.parseFloat(String(rawPrice).replace(/,/g, '')) : Number(rawPrice)
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: 'invalid_price', detail: 'Enter a valid price (0 or more AUD).' })
    }

    const profileAuthorId = typeof body.profileAuthorId === 'string' ? body.profileAuthorId.trim() : ''
    const profileDisplayName = typeof body.profileDisplayName === 'string' ? body.profileDisplayName.trim() : ''
    if (!profileAuthorId) {
      return res.status(400).json({
        error: 'profile_required',
        detail: 'Link your Fetch public profile (Drops @handle) before listing.',
      })
    }
    if (!profileDisplayName) {
      return res.status(400).json({
        error: 'profile_display_required',
        detail: 'profileDisplayName is required (your public @handle name).',
      })
    }

    const description =
      typeof body.description === 'string' ? body.description.trim().slice(0, 8000) : ''
    const category =
      typeof body.category === 'string' && body.category.trim()
        ? body.category.trim().slice(0, 64)
        : 'general'
    const condition =
      typeof body.condition === 'string' && body.condition.trim()
        ? body.condition.trim().slice(0, 32)
        : 'used'
    const keywords =
      typeof body.keywords === 'string' ? body.keywords.trim().slice(0, 2000) : ''
    const locFromLabel =
      typeof body.locationLabel === 'string' && body.locationLabel.trim()
        ? body.locationLabel.trim().slice(0, 200)
        : ''
    const locFromSuburb =
      typeof body.suburb === 'string' && body.suburb.trim() ? body.suburb.trim().slice(0, 200) : ''
    const locationLabel = locFromLabel || locFromSuburb

    const images = Array.isArray(body.images) ? body.images : []
    const imagesAccepted = normalizeInitialListingImages(images)
    const rawImagesLen = images.length
    if (rawImagesLen > 0 && imagesAccepted.length === 0) {
      console.warn('[listings/create] images_raw_present_but_none_accepted', {
        rawImagesLen,
        hint: 'URLs must start with /listing-uploads/ and contain no ..',
      })
    }

    const insertPayload = {
      sellerUserId: actor.customerUserId ?? null,
      sellerEmail: actor.customerEmail ?? null,
      title,
      description,
      priceAud: priceNum,
      category,
      condition,
      keywords,
      locationLabel,
      imagesRawCount: rawImagesLen,
      imagesAcceptedCount: imagesAccepted.length,
    }
    console.log('[listings/create] insert payload', JSON.stringify(insertPayload))

    const saleModeNorm = body.saleMode === 'auction' ? 'auction' : 'fixed'
    if (saleModeNorm === 'auction') {
      const ends = Number(body.auctionEndsAt)
      if (!Number.isFinite(ends) || ends <= Date.now() + 60_000) {
        return res.status(400).json({
          error: 'auction_end_required',
          detail: 'Timed auctions need an end time at least 2 minutes in the future.',
        })
      }
    }

    let compareAtCents = 0
    const capRaw = body.compareAtPriceAud
    if (capRaw != null && String(capRaw).trim() !== '') {
      const c = Math.round(Number(capRaw) * 100)
      if (Number.isFinite(c) && c > 0) compareAtCents = c
    }

    const minIncRaw = Number(body.minBidIncrementCents)
    const minBidIncrementCents =
      Number.isFinite(minIncRaw) && minIncRaw >= 50 ? Math.round(minIncRaw) : undefined
    const reserveRaw = Number(body.reserveCents)
    const reserveCents =
      saleModeNorm === 'auction' && Number.isFinite(reserveRaw) && reserveRaw >= 0
        ? Math.round(reserveRaw)
        : undefined

    const listing = await peerListingsStore.createListing({
      sellerUserId: actor.customerUserId,
      sellerEmail: actor.customerEmail,
      title,
      description,
      priceAud: priceNum,
      compareAtCents,
      category,
      condition,
      keywords,
      locationLabel,
      sku: body.sku,
      acceptsOffers: body.acceptsOffers,
      fetchDelivery: body.fetchDelivery,
      sameDayDelivery: body.sameDayDelivery,
      saleMode: body.saleMode,
      auctionEndsAt: body.auctionEndsAt,
      reserveCents,
      minBidIncrementCents,
      profileAuthorId,
      profileDisplayName,
      profileAvatar: typeof body.profileAvatar === 'string' ? body.profileAvatar : '',
      images,
    })
    return res.json({ listing })
  } catch (e) {
    console.error('POST ERROR', e)
    const { reason, code, message } = classifyListingCreateFailure(e)
    console.error('[listings/create] failure', { reason, code, message })
    const msg = e instanceof Error ? e.message : String(e)
    const fileWriteHint =
      reason === 'filesystem_permission' || reason === 'disk_full' || reason === 'filesystem_missing'
        ? ' (peer listings JSON file write)'
        : ''
    return res.status(500).json({
      error: 'listing_create_failed',
      detail: `${msg.slice(0, 200)}${fileWriteHint}`.slice(0, 240),
    })
  }
})

app.patch('/api/listings/:listingId', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const actor = resolveMarketplaceActor(req)
  if (isDevDemoListingId(req.params.listingId) && isDevDemoMarketplaceActor(actor)) {
    const listing = patchDevDemoPeerListing(actor, req.params.listingId, req.body ?? {})
    if (!listing) return res.status(404).json({ error: 'listing_not_found' })
    return res.json({ listing })
  }
  const out = await peerListingsStore.patchListing(req.params.listingId, sk, req.body ?? {})
  if (!out) return res.status(404).json({ error: 'listing_not_found' })
  if (out.error) return res.status(403).json({ error: out.error })
  return res.json(out)
})

app.post('/api/listings/:listingId/publish', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const actor = resolveMarketplaceActor(req)
  if (isDevDemoListingId(req.params.listingId) && isDevDemoMarketplaceActor(actor)) {
    const listing = patchDevDemoPeerListing(actor, req.params.listingId, { status: 'published' })
    if (!listing) return res.status(404).json({ error: 'listing_not_found' })
    return res.json({ listing })
  }
  const out = await peerListingsStore.setListingStatus(req.params.listingId, sk, 'published')
  if (!out) return res.status(404).json({ error: 'listing_not_found' })
  if (out.error) return res.status(403).json({ error: out.error })
  return res.json(out)
})

app.post('/api/listings/:listingId/pause', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const out = await peerListingsStore.setListingStatus(req.params.listingId, sk, 'paused')
  if (!out) return res.status(404).json({ error: 'listing_not_found' })
  if (out.error) return res.status(403).json({ error: out.error })
  return res.json(out)
})

app.post(
  '/api/listings/:listingId/images',
  listingImageUpload.single('file'),
  async (req, res) => {
    const sk = peerListingSellerKey(req)
    if (!sk) return res.status(401).json({ error: 'auth_required' })
    const buf = req.file?.buffer
    if (!buf || !buf.length) return res.status(400).json({ error: 'file_required' })
    const ext = path.extname(req.file.originalname || '').toLowerCase()
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
    const name = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`
    await fs.promises.mkdir(LISTING_UPLOAD_DIR, { recursive: true })
    await fs.promises.writeFile(path.join(LISTING_UPLOAD_DIR, name), buf)
    const url = `/listing-uploads/${name}`
    const out = await peerListingsStore.addListingImage(req.params.listingId, sk, { url, sort: undefined })
    if (!out) return res.status(404).json({ error: 'listing_not_found' })
    if (out.error) return res.status(400).json({ error: out.error })
    return res.json(out)
  },
)

app.post('/api/listings/:listingId/checkout', paymentIntentCreateLimiter, async (req, res) => {
  if (isPublicDemoListingId(req.params.listingId)) {
    return res.status(409).json({
      error: 'demo_listing_no_checkout',
      detail: 'Showcase listings cannot be purchased. Use a real published listing to test checkout.',
    })
  }
  const listing = await peerListingsStore.getListing(req.params.listingId)
  if (!listing || listing.status !== 'published') {
    return res.status(404).json({ error: 'listing_not_available' })
  }
  const sellerKey = peerListingsStore.sellerKey(listing.sellerUserId, listing.sellerEmail)
  const seller = sellerKey ? await peerListingsStore.getSeller(sellerKey) : null
  const buyer = resolveMarketplaceActor(req)
  const priceCents = listing.priceCents ?? 0
  if (priceCents < 1) return res.status(400).json({ error: 'invalid_price' })
  const feeCents = Math.min(priceCents - 1, Math.round((priceCents * LISTING_PLATFORM_FEE_BPS) / 10000))
  const netCents = Math.max(0, priceCents - feeCents)
  const listingOrder = await peerListingsStore.appendListingOrder({
    listingId: listing.id,
    sellerKey,
    buyerUserId: buyer.customerUserId,
    buyerEmail: buyer.customerEmail,
    priceCents,
    platformFeeCents: feeCents,
    sellerNetCents: netCents,
    status: 'pending',
    paymentIntentId: null,
    stripePaymentIntentId: null,
  })
  const intentMetadata = { type: 'listing_order', listingOrderId: listingOrder.id }
  const amountAud = priceCents / 100
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  const state = await marketplaceStore.readState()
  let paymentIntent
  if (stripeKey) {
    if (!seller?.stripeAccountId) {
      return res.status(409).json({ error: 'seller_not_connect_ready', detail: 'Seller has not connected payouts.' })
    }
    if (!seller.onboardingComplete) {
      return res
        .status(409)
        .json({ error: 'seller_onboarding_incomplete', detail: 'Seller must finish Stripe Connect onboarding.' })
    }
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(stripeKey)
      const stripePi = await createStripeConnectPaymentIntent(stripe, {
        amountCents: priceCents,
        applicationFeeCents: feeCents,
        destinationAccountId: seller.stripeAccountId,
        metadata: intentMetadata,
      })
      paymentIntent = localRecordFromStripePaymentIntent(stripePi, {
        bookingId: null,
        amountAud,
        currency: 'AUD',
        metadata: intentMetadata,
      })
    } catch (e) {
      console.error('[listings/checkout] stripe create failed', e)
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(502).json({
        error: 'stripe_intent_create_failed',
        detail: msg.slice(0, 280),
      })
    }
  } else {
    paymentIntent = createPaymentIntentRecord({
      bookingId: null,
      amount: amountAud,
      currency: 'AUD',
      metadata: intentMetadata,
    })
  }
  marketplaceStore.upsertPaymentIntent(state, paymentIntent)
  await marketplaceStore.writeState(state)
  await peerListingsStore.patchListingOrder(listingOrder.id, {
    paymentIntentId: paymentIntent.id,
    stripePaymentIntentId: paymentIntent.stripePaymentIntentId || null,
  })
  const nextLo = await peerListingsStore.getListingOrder(listingOrder.id)
  return res.json({ listingOrder: nextLo, paymentIntent })
})

app.post('/api/listings/:listingId/bid', paymentIntentCreateLimiter, async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const listing = await peerListingsStore.getListing(req.params.listingId)
  if (!listing || listing.status !== 'published') {
    return res.status(404).json({ error: 'listing_not_available' })
  }
  const amountAud = Number(req.body?.amountAud)
  const amountCents = Math.round(amountAud * 100)
  if (!Number.isFinite(amountCents) || amountCents < 1) {
    return res.status(400).json({ error: 'invalid_amount' })
  }
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  let stripePaymentIntentId = null
  let clientSecret = null
  /** @type {import('stripe').default | null} */
  let stripe = null
  if (stripeKey) {
    try {
      const Stripe = (await import('stripe')).default
      stripe = new Stripe(stripeKey)
      const pi = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'aud',
        capture_method: 'manual',
        automatic_payment_methods: { enabled: true },
        metadata: {
          type: 'auction_bid',
          listingId: String(listing.id),
          bidderKey: sk,
        },
      })
      stripePaymentIntentId = pi.id
      clientSecret = pi.client_secret
    } catch (e) {
      console.error('[listings/bid] stripe', e)
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(502).json({ error: 'stripe_intent_create_failed', detail: msg.slice(0, 280) })
    }
  }
  const out = await peerListingsStore.placeBid({
    listingId: listing.id,
    bidderKey: sk,
    amountCents,
    stripePaymentIntentId,
  })
  if (out.error) {
    if (stripePaymentIntentId && stripe) {
      try {
        await stripe.paymentIntents.cancel(stripePaymentIntentId)
      } catch {
        /* ignore */
      }
    }
    const status =
      out.error === 'bid_too_low' || out.error === 'below_reserve' || out.error === 'invalid_amount'
        ? 400
        : 409
    return res.status(status).json({ error: out.error })
  }
  return res.json({
    listing: out.listing,
    paymentIntent: clientSecret ? { clientSecret, id: stripePaymentIntentId } : null,
  })
})

/** Seller resets an ended auction that did not meet reserve, with a new end time. */
app.post('/api/listings/:listingId/repost-auction', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  if (isDevDemoListingId(req.params.listingId)) {
    return res.status(403).json({ error: 'demo_readonly', detail: 'Demo listings cannot be changed.' })
  }
  const ends = Number(req.body?.auctionEndsAt)
  if (!Number.isFinite(ends) || ends <= Date.now() + 60_000) {
    return res.status(400).json({ error: 'invalid_auction_end', detail: 'Pick an end time at least 2 minutes ahead.' })
  }
  const priceAud = req.body?.priceAud
  const minBidInc = req.body?.minBidIncrementCents
  const out = await peerListingsStore.repostExpiredAuctionListing(req.params.listingId, sk, {
    auctionEndsAt: ends,
    priceAud: priceAud != null && priceAud !== '' ? Number(priceAud) : undefined,
    minBidIncrementCents:
      minBidInc != null && Number.isFinite(Number(minBidInc)) ? Math.round(Number(minBidInc)) : undefined,
  })
  if (out?.error) {
    const map = {
      listing_not_found: 404,
      forbidden: 403,
      not_auction: 400,
      bad_status: 400,
      auction_not_ended: 409,
      reserve_met: 409,
      invalid_end: 400,
    }
    const status = map[out.error] ?? 400
    return res.status(status).json({ error: out.error })
  }
  return res.json({ listing: out.listing })
})

app.get('/api/messages/unread-summary', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.json({ listing: 0, support: 0, total: 0 })
  const s = await peerMessagesStore.unreadSummary(sk)
  return res.json(s)
})

app.get('/api/messages/threads', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const kind = typeof req.query.kind === 'string' ? req.query.kind.trim() : ''
  const threads = await peerMessagesStore.listThreadsForParticipant(sk, {
    kind: kind === 'listing' || kind === 'support' ? kind : undefined,
  })
  return res.json({ threads: threads.map((t) => peerMessageThreadJson(t, sk)) })
})

app.post('/api/messages/threads', authRouteLimiter, async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const body = req.body ?? {}
  const kind = body.kind === 'support' ? 'support' : body.kind === 'listing' ? 'listing' : null
  if (!kind) return res.status(400).json({ error: 'kind_required' })
  if (kind === 'support') {
    const out = await peerMessagesStore.getOrCreateSupportThread(sk)
    if (out.error) return res.status(400).json({ error: out.error })
    return res.json({ thread: peerMessageThreadJson(out.thread, sk), created: Boolean(out.created) })
  }
  const listingId = typeof body.listingId === 'string' ? body.listingId.trim() : ''
  if (!listingId) return res.status(400).json({ error: 'listing_id_required' })
  const listing = await peerListingsStore.getListingVisible(listingId, sk)
  if (!listing) return res.status(404).json({ error: 'listing_not_found' })
  const sellerKey = peerListingsStore.sellerKey(listing.sellerUserId, listing.sellerEmail)
  if (!sellerKey) return res.status(400).json({ error: 'seller_missing' })
  const out = await peerMessagesStore.getOrCreateListingThread({
    listingId,
    buyerKey: sk,
    sellerKey,
  })
  if (out.error === 'cannot_message_self') return res.status(400).json({ error: out.error })
  if (out.error) return res.status(400).json({ error: out.error })
  return res.json({ thread: peerMessageThreadJson(out.thread, sk), created: Boolean(out.created) })
})

app.get('/api/messages/threads/:threadId', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const thread = await peerMessagesStore.getThread(req.params.threadId, sk)
  if (!thread) return res.status(404).json({ error: 'thread_not_found' })
  const recent = await peerMessagesStore.recentMessages(req.params.threadId, sk, 80)
  return res.json({
    thread: peerMessageThreadJson(thread, sk),
    messages: recent.map((m) => peerMessageJson(m, sk)),
  })
})

app.get('/api/messages/threads/:threadId/messages', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
  const limRaw = typeof req.query.limit === 'string' ? req.query.limit : undefined
  const page = await peerMessagesStore.listMessagesPage(req.params.threadId, sk, {
    cursor,
    limit: limRaw != null ? Number(limRaw) : undefined,
  })
  if (!page) return res.status(404).json({ error: 'thread_not_found' })
  return res.json({
    messages: page.messages.map((m) => peerMessageJson(m, sk)),
    nextCursor: page.nextCursor,
  })
})

app.post('/api/messages/threads/:threadId/messages', authRouteLimiter, async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const body = req.body ?? {}
  let text = typeof body.text === 'string' ? body.text : ''
  let messageType = 'user'
  if (body.template === 'cash_pickup') {
    messageType = 'system'
    text = 'Buyer chose cash pickup.'
  }
  const out = await peerMessagesStore.appendMessage(req.params.threadId, sk, { text, messageType })
  if (out.error === 'thread_not_found') return res.status(404).json({ error: out.error })
  if (out.error === 'forbidden') return res.status(403).json({ error: out.error })
  if (out.error) return res.status(400).json({ error: out.error })
  return res.json({
    message: peerMessageJson(out.message, sk),
    thread: peerMessageThreadJson(out.thread, sk),
  })
})

app.post('/api/messages/threads/:threadId/read', authRouteLimiter, async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const out = await peerMessagesStore.markRead(req.params.threadId, sk)
  if (out.error === 'thread_not_found') return res.status(404).json({ error: out.error })
  if (out.error === 'forbidden') return res.status(403).json({ error: out.error })
  if (out.error) return res.status(400).json({ error: out.error })
  return res.json({ thread: peerMessageThreadJson(out.thread, sk) })
})

app.post('/api/sellers/connect/start', authRouteLimiter, async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (!stripeKey) {
    return res.status(503).json({ error: 'stripe_not_configured' })
  }
  try {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(stripeKey)
    let seller = await peerListingsStore.getSeller(sk)
    let accountId = seller?.stripeAccountId
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      })
      accountId = acct.id
      await peerListingsStore.upsertSellerStripe(sk, accountId)
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: STRIPE_CONNECT_REFRESH_URL,
      return_url: STRIPE_CONNECT_RETURN_URL,
      type: 'account_onboarding',
    })
    return res.json({ url: link.url, stripeAccountId: accountId })
  } catch (e) {
    console.error('[sellers/connect/start]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(502).json({ error: 'stripe_connect_failed', detail: msg.slice(0, 280) })
  }
})

app.post('/api/sellers/connect/refresh-status', authRouteLimiter, async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (!stripeKey) return res.status(503).json({ error: 'stripe_not_configured' })
  const seller = await peerListingsStore.getSeller(sk)
  if (!seller?.stripeAccountId) return res.status(400).json({ error: 'no_connected_account' })
  try {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(stripeKey)
    const acct = await stripe.accounts.retrieve(seller.stripeAccountId)
    const ok = Boolean(acct.charges_enabled && acct.details_submitted)
    await peerListingsStore.setSellerOnboardingByUserKey(sk, ok)
    return res.json({ stripeAccountId: seller.stripeAccountId, onboardingComplete: ok })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(502).json({ error: 'stripe_retrieve_failed', detail: msg.slice(0, 280) })
  }
})

app.post('/api/sellers/connect/register-dev', authRouteLimiter, async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.FETCH_ALLOW_CONNECT_REGISTER_DEV !== '1') {
    return res.status(403).json({ error: 'forbidden' })
  }
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const id = typeof req.body?.stripeAccountId === 'string' ? req.body.stripeAccountId.trim() : ''
  if (!id) return res.status(400).json({ error: 'stripe_account_id_required' })
  await peerListingsStore.upsertSellerStripe(sk, id)
  await peerListingsStore.setSellerOnboardingByUserKey(sk, true)
  return res.json({ ok: true, stripeAccountId: id, onboardingComplete: true })
})

app.get('/api/sellers/me', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const seller = await peerListingsStore.getSeller(sk)
  return res.json({ seller })
})

app.get('/api/sellers/me/earnings', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const from = req.query.from ? Number(req.query.from) : undefined
  const to = req.query.to ? Number(req.query.to) : undefined
  const ledger = await peerListingsStore.ledgerForSeller(sk, { from, to })
  const gross = ledger.reduce((s, e) => s + (e.grossCents ?? 0), 0)
  const fees = ledger.reduce((s, e) => s + (e.feeCents ?? 0), 0)
  const net = ledger.reduce((s, e) => s + (e.netCents ?? 0), 0)
  return res.json({ ledger, summary: { grossCents: gross, feeCents: fees, netCents: net, currency: 'AUD' } })
})

app.post('/api/payments/intents', paymentIntentCreateLimiter, async (req, res) => {
  const meta = req.body?.metadata
  const isHardware =
    meta &&
    typeof meta === 'object' &&
    meta.type === 'hardware' &&
    typeof meta.sku === 'string'
  const isSupply =
    meta &&
    typeof meta === 'object' &&
    meta.type === 'supply' &&
    typeof meta.sku === 'string'

  let bookingId = typeof req.body?.bookingId === 'string' ? req.body.bookingId : null
  const requestedAmount =
    typeof req.body?.amount === 'number' && Number.isFinite(req.body.amount) ? req.body.amount : 0
  const state = await marketplaceStore.readState()

  let amount = requestedAmount
  let intentMetadata = null

  if (isHardware) {
    bookingId = null
    const unit = getHardwareSkuPriceAud(meta.sku)
    if (unit == null) {
      return res.status(400).json({ error: 'unknown_hardware_sku' })
    }
    const qtyRaw = Number(meta.qty)
    const qty =
      Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(20, Math.floor(qtyRaw)) : 1
    amount = Math.round(unit * qty)
    intentMetadata = { type: 'hardware', sku: meta.sku, qty }
  } else if (isSupply) {
    bookingId = null
    const unit = getSupplySkuPriceAud(meta.sku)
    if (unit == null) {
      return res.status(400).json({ error: 'unknown_supply_sku' })
    }
    const qtyRaw = Number(meta.qty)
    const qty =
      Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(20, Math.floor(qtyRaw)) : 1
    amount = Math.round(unit * qty)
    intentMetadata = { type: 'supply', sku: meta.sku, qty }
  } else {
    const booking =
      bookingId ? state.bookings.find((row) => row.id === bookingId) ?? null : null
    amount =
      booking?.pricing?.maxPrice != null ? booking.pricing.maxPrice : requestedAmount
  }

  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (stripeKey) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(stripeKey)
      const stripePi = await createStripePaymentIntentOnStripe(stripe, {
        amountAud: amount,
        bookingId,
        metadata: intentMetadata,
      })
      const paymentIntent = localRecordFromStripePaymentIntent(stripePi, {
        bookingId,
        amountAud: amount,
        currency: 'AUD',
        metadata: intentMetadata,
      })
      marketplaceStore.upsertPaymentIntent(state, paymentIntent)
      await marketplaceStore.writeState(state)
      return res.json({ paymentIntent })
    } catch (e) {
      console.error('[payments/intents] stripe create failed', e)
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(502).json({
        error: 'stripe_intent_create_failed',
        detail: msg.slice(0, 280),
      })
    }
  }

  const paymentIntent = createPaymentIntentRecord({
    bookingId,
    amount,
    currency: 'AUD',
    metadata: intentMetadata,
  })
  marketplaceStore.upsertPaymentIntent(state, paymentIntent)
  await marketplaceStore.writeState(state)
  return res.json({ paymentIntent })
})

app.get('/api/payments/intents/:paymentIntentId', async (req, res) => {
  const { paymentIntentId } = req.params
  const state = await marketplaceStore.readState()
  const paymentIntent = state.paymentIntents.find(
    (row) => row.id === paymentIntentId || row.stripePaymentIntentId === paymentIntentId,
  )
  if (!paymentIntent) {
    return res.status(404).json({ error: 'payment_intent_not_found' })
  }
  return res.json({ paymentIntent })
})

app.post('/api/payments/intents/:paymentIntentId/confirm', async (req, res) => {
  const { paymentIntentId } = req.params
  const paymentMethodId =
    typeof req.body?.paymentMethodId === 'string' ? req.body.paymentMethodId.trim() : ''
  if (!paymentMethodId) {
    return res.status(400).json({ error: 'payment_method_required' })
  }
  const card = req.body?.card
  const number =
    card && typeof card.number === 'string' ? card.number.replace(/\D/g, '') : ''
  const cvcRaw = card && typeof card.cvc === 'string' ? card.cvc.replace(/\D/g, '') : ''
  const expMonth =
    card && typeof card.expMonth === 'number' && Number.isFinite(card.expMonth)
      ? Math.min(12, Math.max(1, Math.trunc(card.expMonth)))
      : null
  const expYear =
    card && typeof card.expYear === 'number' && Number.isFinite(card.expYear)
      ? Math.trunc(card.expYear)
      : null
  const brand =
    card && typeof card.brand === 'string' ? card.brand.trim().slice(0, 32) : null
  if (number.length < 13 || number.length > 19) {
    return res.status(400).json({
      error: 'card_invalid',
      detail: 'Full card number (13–19 digits) is required for checkout.',
    })
  }
  if (cvcRaw.length < 3 || cvcRaw.length > 4) {
    return res.status(400).json({
      error: 'card_invalid',
      detail: 'Card security code (CVV) is required.',
    })
  }
  if (expMonth == null || expYear == null) {
    return res.status(400).json({
      error: 'card_invalid',
      detail: 'Expiry month and year are required.',
    })
  }

  const state = await marketplaceStore.readState()
  const paymentIntent = state.paymentIntents.find(
    (row) => row.id === paymentIntentId || row.stripePaymentIntentId === paymentIntentId,
  )
  if (!paymentIntent) {
    return res.status(404).json({ error: 'payment_intent_not_found' })
  }
  if (paymentIntent.bookingId) {
    const booking = state.bookings.find((row) => row.id === paymentIntent.bookingId)
    if (!booking) {
      return res.status(404).json({ error: 'booking_not_found' })
    }
    if (booking.status !== 'payment_required' || !booking.pricing || booking.aiReview?.status !== 'ready') {
      return res.status(409).json({ error: 'booking_not_ready_for_confirmation' })
    }
  }
  if (paymentIntent.provider === 'stripe') {
    return res.status(409).json({
      error: 'use_stripe_checkout',
      detail: 'This payment intent is handled by Stripe; wait for webhook confirmation.',
    })
  }

  if (paymentIntent.metadata?.type === 'hardware') {
    const sku = paymentIntent.metadata.sku
    const unit = getHardwareSkuPriceAud(sku)
    if (unit == null) {
      return res.status(400).json({ error: 'unknown_hardware_sku' })
    }
    const qty =
      typeof paymentIntent.metadata.qty === 'number' && paymentIntent.metadata.qty >= 1
        ? Math.min(20, Math.floor(paymentIntent.metadata.qty))
        : 1
    const expected = Math.round(unit * qty)
    if (paymentIntent.amount !== expected) {
      return res.status(409).json({ error: 'hardware_amount_mismatch' })
    }
  }
  if (paymentIntent.metadata?.type === 'supply') {
    const sku = paymentIntent.metadata.sku
    const unit = getSupplySkuPriceAud(sku)
    if (unit == null) {
      return res.status(400).json({ error: 'unknown_supply_sku' })
    }
    const qty =
      typeof paymentIntent.metadata.qty === 'number' && paymentIntent.metadata.qty >= 1
        ? Math.min(20, Math.floor(paymentIntent.metadata.qty))
        : 1
    const expected = Math.round(unit * qty)
    if (paymentIntent.amount !== expected) {
      return res.status(409).json({ error: 'supply_amount_mismatch' })
    }
  }
  if (paymentIntent.metadata?.type === 'supply_cart') {
    const storeOrderId = paymentIntent.metadata.storeOrderId
    if (typeof storeOrderId !== 'string' || !storeOrderId.trim()) {
      return res.status(400).json({ error: 'invalid_metadata' })
    }
    const ord = await storeOrdersStore.getById(storeOrderId.trim())
    if (!ord) return res.status(400).json({ error: 'store_order_not_found' })
    if (paymentIntent.amount !== ord.subtotalAud) {
      return res.status(409).json({ error: 'store_amount_mismatch' })
    }
  }
  if (paymentIntent.metadata?.type === 'listing_order') {
    const lid = paymentIntent.metadata.listingOrderId
    if (typeof lid !== 'string' || !lid.trim()) {
      return res.status(400).json({ error: 'invalid_metadata' })
    }
    const lo = await peerListingsStore.getListingOrder(lid.trim())
    if (!lo) return res.status(400).json({ error: 'listing_order_not_found' })
    const expectedAud = Math.round(lo.priceCents) / 100
    if (Math.abs(paymentIntent.amount - expectedAud) > 0.001) {
      return res.status(409).json({ error: 'listing_amount_mismatch' })
    }
  }
  paymentIntent.status = 'succeeded'
  paymentIntent.provider = paymentIntent.provider || 'demo'
  paymentIntent.webhookConfirmedAt = Date.now()
  paymentIntent.paymentMethodId = paymentMethodId
  paymentIntent.confirmedAt = Date.now()
  paymentIntent.lastError = null
  /** Demo only — never persist full PAN or CVV in production. */
  paymentIntent.instrument = {
    paymentMethodId,
    brand,
    number,
    last4: number.slice(-4),
    expiryMonth: expMonth,
    expiryYear: expYear,
    cvcProvided: true,
  }
  if (paymentIntent.bookingId) {
    const booking = state.bookings.find((row) => row.id === paymentIntent.bookingId)
    if (booking) {
      booking.paymentIntent = { ...paymentIntent }
      booking.status = 'confirmed'
      booking.updatedAt = Date.now()
    }
  }
  if (paymentIntent.metadata?.type === 'hardware') {
    try {
      await hardwareOrdersStore.appendOrder({
        paymentIntentId: paymentIntent.id,
        sku: paymentIntent.metadata.sku,
        qty: paymentIntent.metadata.qty ?? 1,
        amountAud: paymentIntent.amount,
        status: 'paid',
        lineKind: 'hardware',
      })
    } catch (e) {
      console.error('[hardware-orders] append failed', e)
    }
  }
  if (paymentIntent.metadata?.type === 'supply') {
    try {
      await hardwareOrdersStore.appendOrder({
        paymentIntentId: paymentIntent.id,
        sku: paymentIntent.metadata.sku,
        qty: paymentIntent.metadata.qty ?? 1,
        amountAud: paymentIntent.amount,
        status: 'paid',
        lineKind: 'supply',
      })
    } catch (e) {
      console.error('[hardware-orders] supply append failed', e)
    }
  }
  if (paymentIntent.metadata?.type === 'supply_cart' && typeof paymentIntent.metadata.storeOrderId === 'string') {
    await finalizeSupplyStoreOrderPaid(paymentIntent.metadata.storeOrderId.trim(), paymentIntent.id)
  }
  if (paymentIntent.metadata?.type === 'listing_order' && typeof paymentIntent.metadata.listingOrderId === 'string') {
    const lo = await peerListingsStore.getListingOrder(paymentIntent.metadata.listingOrderId.trim())
    if (lo) await finalizeListingOrderPaidCore(lo, paymentIntent.id)
  }
  marketplaceStore.materializeState(state)
  await marketplaceStore.writeState(state)
  return res.json({ paymentIntent })
})

app.get('/api/marketplace/bookings/:bookingId', async (req, res) => {
  const { bookingId } = req.params
  const actor = resolveMarketplaceActor(req)
  const state = await marketplaceStore.readState()
  const booking = state.bookings.find((b) => b.id === bookingId) ?? null
  const offers = state.offers.filter((o) => o.bookingId === bookingId)
  const notifications = state.notifications.filter((n) => n.bookingId === bookingId)
  const media = state.media.filter((m) => m.bookingId === bookingId)
  if (!booking) return res.status(404).json({ error: 'booking_not_found' })
  if (!assertCustomerCanAccessBooking(actor, booking)) {
    return res.status(403).json({ error: 'forbidden' })
  }
  return res.json({ booking, offers, notifications, media })
})

app.get('/api/marketplace/bookings', async (req, res) => {
  const state = await marketplaceStore.readState()
  const actor = resolveMarketplaceActor(req)
  let bookings = state.bookings
  if (actor.customerUserId) {
    const uid = actor.customerUserId
    bookings = bookings.filter(
      (b) =>
        !b.customerUserId ||
        (typeof b.customerUserId === 'string' && b.customerUserId === uid),
    )
  } else if (actor.customerEmail) {
    bookings = bookings.filter((b) => !b.customerEmail || b.customerEmail === actor.customerEmail)
  }
  return res.json({ bookings })
})

app.post('/api/marketplace/bookings', async (req, res) => {
  const payload = req.body ?? {}
  if (!payload?.id) return res.status(400).json({ error: 'booking_id_required' })
  const requestedStatus =
    typeof payload.status === 'string' && ALLOWED_BOOKING_SAVE_STATUSES.has(payload.status)
      ? payload.status
      : 'draft'
  const reviewedPayload = await buildReviewedBookingPayload(payload)
  if (
    requestedStatus !== 'draft' &&
    (!reviewedPayload.review.ready || !reviewedPayload.pricing || !reviewedPayload.quoteBreakdown)
  ) {
    return res.status(409).json({
      error: 'booking_not_ready',
      missingFields: reviewedPayload.review.missingFields,
    })
  }
  if (requestedStatus === 'confirmed' && reviewedPayload.paymentIntent?.status !== 'succeeded') {
    return res.status(409).json({ error: 'confirmed_payment_required' })
  }
  const state = await marketplaceStore.readState()
  const actor = resolveMarketplaceActor(req)
  const tUpsert = Date.now()
  const existing = state.bookings.find((b) => b.id === payload.id)
  if (existing && bookingLockedFromDowngrade(existing.status, requestedStatus)) {
    return res.status(409).json({ error: 'booking_locked' })
  }
  const headerEmail = actor.customerEmail
  const bodyEmail =
    typeof payload.customerEmail === 'string' ? payload.customerEmail.trim().toLowerCase() : ''
  const customerEmail = bodyEmail || headerEmail || existing?.customerEmail || null
  const customerUserId = actor.customerUserId
    ? actor.customerUserId
    : existing?.customerUserId && typeof existing.customerUserId === 'string'
      ? existing.customerUserId
      : null
  const { review: _review, ...sanitizedPayload } = reviewedPayload
  const booking = marketplaceStore.upsertBooking(state, {
    ...sanitizedPayload,
    customerEmail: customerEmail || undefined,
    customerUserId: customerUserId || undefined,
    status: requestedStatus,
  })
  await marketplaceStore.writeState(state)
  marketplaceLog('booking_upsert', {
    bookingId: booking.id,
    status: booking.status,
    latencyMs: Date.now() - tUpsert,
    route: 'POST /api/marketplace/bookings',
  })
  return res.json({ booking })
})

app.patch('/api/marketplace/bookings/:bookingId/location', async (req, res) => {
  const { bookingId } = req.params
  const lat = typeof req.body?.lat === 'number' && Number.isFinite(req.body.lat) ? req.body.lat : null
  const lng = typeof req.body?.lng === 'number' && Number.isFinite(req.body.lng) ? req.body.lng : null
  const heading =
    typeof req.body?.heading === 'number' && Number.isFinite(req.body.heading)
      ? req.body.heading
      : undefined
  const driverId = typeof req.body?.driverId === 'string' ? req.body.driverId.trim() : ''
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'invalid_coordinates' })
  }
  const state = await marketplaceStore.readState()
  const booking = state.bookings.find((b) => b.id === bookingId)
  if (!booking) return res.status(404).json({ error: 'booking_not_found' })
  const actor = resolveMarketplaceActor(req)
  if (!assertDriverCanPatchLocation(actor, booking, driverId)) {
    return res.status(403).json({ error: 'forbidden' })
  }
  if (
    booking.assignedDriverId &&
    driverId &&
    booking.assignedDriverId !== driverId
  ) {
    return res.status(403).json({ error: 'driver_mismatch' })
  }
  booking.driverLocation = {
    lat,
    lng,
    ...(heading != null ? { heading } : {}),
    updatedAt: Date.now(),
  }
  booking.updatedAt = Date.now()
  await marketplaceStore.writeState(state)
  return res.json({ booking })
})

app.patch('/api/marketplace/bookings/:bookingId/status', async (req, res) => {
  const { bookingId } = req.params
  const { status } = req.body ?? {}
  if (typeof status !== 'string' || !ALLOWED_BOOKING_PATCH_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status_required' })
  }
  const state = await marketplaceStore.readState()
  const booking = state.bookings.find((b) => b.id === bookingId)
  if (!booking) return res.status(404).json({ error: 'booking_not_found' })
  const actor = resolveMarketplaceActor(req)

  if (status === 'matched') {
    if (!assertDriverCanPatchStatus(actor, booking, status, req.body)) {
      return res.status(403).json({ error: 'forbidden' })
    }
    const driverId = typeof req.body?.assignedDriverId === 'string' ? req.body.assignedDriverId.trim() : ''
    const matchedDriver = req.body?.matchedDriver
    const result = marketplaceStore.atomicAcceptMatch(state, bookingId, driverId, matchedDriver)
    if (result.error === 'invalid_payload') {
      return res.status(400).json({ error: result.error })
    }
    if (result.error === 'not_matching') {
      return res.status(409).json({ error: result.error })
    }
    if (result.error === 'already_assigned') {
      return res.status(409).json({ error: result.error })
    }
    const t0 = Date.now()
    await marketplaceStore.writeState(state)
    marketplaceLog('booking_status_patch', {
      bookingId,
      status: 'matched',
      driverId,
      latencyMs: Date.now() - t0,
      route: 'PATCH /api/marketplace/bookings/:bookingId/status',
    })
    return res.json({ booking: result.booking })
  }

  if (!assertDriverCanPatchStatus(actor, booking, status, req.body)) {
    return res.status(403).json({ error: 'forbidden' })
  }
  if (status === 'confirmed' && booking.paymentIntent?.status !== 'succeeded') {
    return res.status(409).json({ error: 'confirmed_payment_required' })
  }
  booking.status = status
  booking.updatedAt = Date.now()
  if (req.body?.matchedDriver) {
    booking.matchedDriver = req.body.matchedDriver
  }
  if (req.body?.assignedDriverId !== undefined) {
    booking.assignedDriverId = req.body.assignedDriverId
  }
  if (req.body?.driverControlled !== undefined) {
    booking.driverControlled = Boolean(req.body.driverControlled)
  }
  marketplaceStore.materializeState(state)
  const t0 = Date.now()
  await marketplaceStore.writeState(state)
  marketplaceLog('booking_status_patch', {
    bookingId,
    status,
    latencyMs: Date.now() - t0,
    route: 'PATCH /api/marketplace/bookings/:bookingId/status',
  })
  return res.json({ booking })
})

app.patch('/api/marketplace/bookings/:bookingId/customer-rating', async (req, res) => {
  const { bookingId } = req.params
  const starsRaw = req.body?.stars
  const stars =
    typeof starsRaw === 'number' && Number.isFinite(starsRaw) ? Math.trunc(starsRaw) : null
  if (stars == null || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'invalid_stars', detail: 'stars must be 1–5' })
  }
  let note = null
  if (typeof req.body?.note === 'string') {
    const t = req.body.note.trim().slice(0, 280)
    note = t.length ? t : null
  }
  const state = await marketplaceStore.readState()
  const booking = state.bookings.find((b) => b.id === bookingId)
  if (!booking) return res.status(404).json({ error: 'booking_not_found' })
  const actor = resolveMarketplaceActor(req)
  if (!assertCustomerCanAccessBooking(actor, booking)) {
    return res.status(403).json({ error: 'forbidden' })
  }
  if (booking.customerRating) {
    return res.status(409).json({ error: 'rating_already_submitted' })
  }
  booking.customerRating = {
    stars,
    note,
    submittedAt: Date.now(),
  }
  booking.updatedAt = Date.now()
  marketplaceStore.materializeState(state)
  await marketplaceStore.writeState(state)
  return res.json({ booking })
})

app.post('/api/marketplace/bookings/:bookingId/dispatch', async (req, res) => {
  const { bookingId } = req.params
  const bodyMode = req.body?.matchingMode
  const matchingMode =
    bodyMode === 'sequential' || bodyMode === 'pool'
      ? bodyMode
      : typeof req.query.matchingMode === 'string' &&
          (req.query.matchingMode === 'sequential' || req.query.matchingMode === 'pool')
        ? req.query.matchingMode
        : undefined
  const state = await marketplaceStore.readState()
  const { booking, error } = marketplaceStore.startDispatch(state, bookingId, { matchingMode })
  if (!booking) {
    return res.status(error === 'booking_not_dispatchable' ? 409 : 404).json({ error })
  }
  const t0 = Date.now()
  await marketplaceStore.writeState(state)
  marketplaceLog('booking_dispatch', {
    bookingId,
    matchingMode: booking.matchingMode ?? null,
    latencyMs: Date.now() - t0,
    route: 'POST /api/marketplace/bookings/:bookingId/dispatch',
  })
  return res.json({ booking })
})

app.get('/api/marketplace/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
  const headerLast =
    typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'].trim() : ''
  const queryLast =
    typeof req.query?.lastEventId === 'string' ? req.query.lastEventId.trim() : ''
  const lastEventId = headerLast || queryLast
  if (lastEventId) {
    res.write(`event: resume\ndata: ${JSON.stringify({ lastEventId })}\n\n`)
  }
  const writePing = () => {
    marketplaceStreamSeq += 1
    const id = String(marketplaceStreamSeq)
    res.write(`id: ${id}\n`)
    res.write(`event: ping\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`)
  }
  writePing()
  const pingEvery = setInterval(writePing, 15000)
  const unsub = marketplaceEventBus.subscribe(() => {
    marketplaceStreamSeq += 1
    const id = String(marketplaceStreamSeq)
    res.write(`id: ${id}\n`)
    res.write(`event: marketplace\ndata: ${JSON.stringify({ t: Date.now(), seq: marketplaceStreamSeq })}\n\n`)
  })
  req.on('close', () => {
    clearInterval(pingEvery)
    unsub()
  })
})

app.post('/api/marketplace/offers', async (req, res) => {
  const payload = req.body ?? {}
  if (!payload?.offerId || !payload?.bookingId || !payload?.driverId) {
    return res.status(400).json({ error: 'invalid_offer' })
  }
  const state = await marketplaceStore.readState()
  const without = state.offers.filter((o) => o.offerId !== payload.offerId)
  const offer = { ...payload, updatedAt: Date.now() }
  state.offers = [offer, ...without]
  marketplaceStore.materializeState(state)
  const t0 = Date.now()
  await marketplaceStore.writeState(state)
  marketplaceLog('offer_upsert', {
    offerId: offer.offerId,
    bookingId: offer.bookingId,
    driverId: offer.driverId,
    latencyMs: Date.now() - t0,
    route: 'POST /api/marketplace/offers',
  })
  return res.json({ offer })
})

app.patch('/api/marketplace/offers/:offerId', async (req, res) => {
  const { offerId } = req.params
  const { status } = req.body ?? {}
  const state = await marketplaceStore.readState()
  const offer = state.offers.find((o) => o.offerId === offerId)
  if (!offer) return res.status(404).json({ error: 'offer_not_found' })
  const nextStatus = status ?? offer.status
  if (offer.status === 'accepted' && nextStatus === 'accepted') {
    return res.json({ offer })
  }
  if (nextStatus === 'accepted') {
    const booking = state.bookings.find((b) => b.id === offer.bookingId)
    if (booking?.status === 'matched' && booking.assignedDriverId && booking.assignedDriverId !== offer.driverId) {
      return res.status(409).json({ error: 'booking_already_assigned' })
    }
  }
  offer.status = nextStatus
  offer.updatedAt = Date.now()
  marketplaceStore.materializeState(state)
  await marketplaceStore.writeState(state)
  return res.json({ offer })
})

app.get('/api/marketplace/offers', async (req, res) => {
  const bookingId = req.query.bookingId
  const state = await marketplaceStore.readState()
  const offers =
    typeof bookingId === 'string'
      ? state.offers.filter((o) => o.bookingId === bookingId)
      : state.offers
  return res.json({ offers })
})

app.post('/api/marketplace/notifications', async (req, res) => {
  const payload = req.body ?? {}
  if (!payload?.id || !payload?.bookingId) {
    return res.status(400).json({ error: 'invalid_notification' })
  }
  const state = await marketplaceStore.readState()
  const without = state.notifications.filter((n) => n.id !== payload.id)
  const notification = { ...payload, updatedAt: Date.now() }
  state.notifications = [notification, ...without]
  await marketplaceStore.writeState(state)
  return res.json({ notification })
})

app.get('/api/marketplace/notifications', async (req, res) => {
  const bookingId = req.query.bookingId
  const state = await marketplaceStore.readState()
  const notifications =
    typeof bookingId === 'string'
      ? state.notifications.filter((n) => n.bookingId === bookingId)
      : state.notifications
  return res.json({ notifications })
})

app.post('/api/marketplace/notifications/:notificationId/read', async (req, res) => {
  const { notificationId } = req.params
  const state = await marketplaceStore.readState()
  const notification = marketplaceStore.markNotificationRead(state, notificationId)
  if (!notification) return res.status(404).json({ error: 'notification_not_found' })
  await marketplaceStore.writeState(state)
  return res.json({ notification })
})

app.post('/api/marketplace/media', async (req, res) => {
  const payload = req.body ?? {}
  if (
    !payload?.id ||
    !payload?.bookingId ||
    typeof payload?.urlOrLocalRef !== 'string' ||
    !ALLOWED_MEDIA_TYPES.has(payload?.type) ||
    !payload?.createdAt ||
    typeof payload?.uploadedBy !== 'string'
  ) {
    return res.status(400).json({ error: 'invalid_media' })
  }
  const state = await marketplaceStore.readState()
  const without = state.media.filter((m) => m.id !== payload.id)
  const media = { ...payload, updatedAt: Date.now() }
  state.media = [media, ...without]
  await marketplaceStore.writeState(state)
  return res.json({ media })
})

app.get('/api/marketplace/media', async (req, res) => {
  const bookingId = req.query.bookingId
  const state = await marketplaceStore.readState()
  const media =
    typeof bookingId === 'string'
      ? state.media.filter((m) => m.bookingId === bookingId)
      : state.media
  return res.json({ media })
})

app.post('/api/scan', (req, res) => {
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  console.log(`[scan:${reqId}] request received`, {
    contentType: req.headers['content-type'] ?? null,
  })

  upload.array(SCAN_UPLOAD_FIELD, MAX_IMAGES_PER_REQUEST)(req, res, async (uploadErr) => {
    const perfRun = readPerfRun(req)
    const perfT0 = Date.now()
    if (perfRun) perfLog(perfRun, '4_backend_request_received', { route: 'scan', reqId })

    if (uploadErr) {
      console.error(`[scan:${reqId}] upload parse error`, uploadErr)
      return res.status(400).json({
        ...SAFE_FALLBACK,
        error: 'Invalid image upload payload',
        detail: uploadErr.message || 'upload parse failed',
      })
    }

    let scanOpenaiMs = 0

    try {
      if (!OPENAI_API_KEY) {
        console.error(`[scan:${reqId}] missing OPENAI_API_KEY`)
        return res.status(500).json({
          ...SAFE_FALLBACK,
          error: 'Missing OPENAI_API_KEY',
        })
      }

      const files = Array.isArray(req.files) ? req.files : []
      const rawSelectedService = req.body?.selectedService
      const selectedService =
        typeof rawSelectedService === 'string' &&
        ALLOWED_SERVICES.has(rawSelectedService)
          ? rawSelectedService
          : 'pickup'
      console.log(`[scan:${reqId}] parsed images`, { count: files.length })
      if (files.length === 0) {
        return res
          .status(400)
          .json({
            ...SAFE_FALLBACK,
            error: `No image uploaded. Field name must be "${SCAN_UPLOAD_FIELD}".`,
          })
      }

      const prompt =
        `You are the Fetch AI vision scanner. Analyse the photo(s) carefully and output detailed classification JSON.
Do NOT output dollar amounts, prices, deposits, or totals — pricing is computed separately.

User selected service: "${selectedService}".

Return JSON ONLY with this exact shape (all keys required):
{
  "selectedService":"junk|moving|pickup|heavy",
  "matchesSelectedService":boolean,
  "recommendedService":"junk|moving|pickup|heavy",
  "suggestedAction":"move|remove|pickup",
  "specialItemType":"pool_table|spa|piano|safe|marble_table|wardrobe|fridge|gym_equipment|sofa|mattress|none",
  "detectedItems":[{"name":"string","count":number}],
  "itemCountEstimate":number,
  "mainItems":["string"],
  "loadSize":"single|small|medium|large|xlarge",
  "complexity":"easy|medium|hard",
  "vehicle":"ute|van|truck",
  "isBulky":boolean,
  "isHeavyItem":boolean,
  "isFragileItem":boolean,
  "needsTwoMovers":boolean,
  "needsSpecialEquipment":boolean,
  "accessRisk":"low|medium|high",
  "singleItemEligible":boolean,
  "singleItemDisqualifier":string|null,
  "pricingBand":"local_quick|standard|heavy_special",
  "pricingReason":"short string, no currency symbols",
  "confidence":number,
  "detailedDescription":"string"
}
COUNTING RULES (critical for pricing accuracy):
- Scan the ENTIRE image systematically: left to right, front to back, floor to ceiling.
- Count EVERY individual item separately. A stack of 4 boxes = 4 boxes, not 1. A pair of chairs = 2 chairs.
- If items are partially hidden behind others, still count them if you can see any part.
- For groups of same items, give the exact count: "cardboard box" count:6, not "boxes" count:1.
- Never group different items together. A desk and a chair are 2 separate detectedItems entries.

NAMING RULES:
- Use specific descriptive names: "3-seater brown leather couch" not "furniture" or "couch".
- Include colour, material, and size when visible: "large white Samsung fridge", "small wooden coffee table".
- For junk/removal: describe condition if visible: "broken office chair", "old CRT TV", "stained mattress".

JUNK REMOVAL SPECIFICS (when selectedService is "junk"):
- Pay special attention to volume. Estimate cubic metres of waste visible.
- Classify junk types: general household, green waste, construction debris, e-waste, mattresses, whitegoods.
- Note if items look heavy or awkward (old washing machines, concrete, timber, etc.).
- loadSize for junk: single = 1 item; small = fits a ute tray; medium = half a truck; large = full truck load; xlarge = multiple loads.

OTHER RULES:
- detailedDescription: 1-2 sentences describing what you see naturally, as a friendly assistant who has done thousands of these jobs. Be specific about quantities. Example: "I can see about 6 cardboard boxes stacked against the wall, a worn brown leather couch, and what looks like a broken bookshelf. Standard junk run, nothing too heavy."
- loadSize for non-junk: single = one normal item; small = 2-4 items; medium = 5-10 items; large = 10+ items or bulky; xlarge = full room or more.
- Be conservative with weight/handling: if unsure, set singleItemEligible false and explain in singleItemDisqualifier.
- For pool tables, spas, pianos, safes, marble tops, large fridges, etc.: specialItemType not none, heavy/equipment flags true, singleItemEligible false.
- If photo does not match selectedService, matchesSelectedService=false and set recommendedService.
- Only state facts visible or strongly implied; do not invent stairs, parking, or building details.
- JSON only, no markdown fences, no prose outside the object.`

      const content = [{ type: 'text', text: prompt }]
      for (const file of files) {
        const base64 = file.buffer.toString('base64')
        const dataUrl = `data:${file.mimetype};base64,${base64}`
        content.push({ type: 'image_url', image_url: { url: dataUrl } })
      }

      console.log(`[scan:${reqId}] openai call start`, { images: files.length })
      if (perfRun) perfLog(perfRun, '5_openai_request_starts', { route: 'scan' })
      const tScanOai0 = Date.now()
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          temperature: 0,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content,
            },
          ],
        }),
      })
      scanOpenaiMs = Date.now() - tScanOai0
      console.log(`[scan:${reqId}] openai response status`, { status: openaiRes.status })
      if (perfRun) {
        perfLog(perfRun, '6_openai_response_returns', {
          route: 'scan',
          status: openaiRes.status,
          openai_ms: scanOpenaiMs,
        })
      }

      if (!openaiRes.ok) {
        const upstreamBody = await openaiRes.text().catch(() => '')
        console.error(`[scan:${reqId}] openai error`, {
          status: openaiRes.status,
          body: upstreamBody.slice(0, 300),
        })
        attachPerfTimingHeader(res, perfRun, {
          route: 'scan',
          openai_ms: scanOpenaiMs,
          server_total_ms: Date.now() - perfT0,
        })
        return res.status(502).json({
          ...SAFE_FALLBACK,
          selectedService,
          recommendedService: selectedService,
          error: 'OpenAI Vision request failed',
          status: openaiRes.status,
          body: upstreamBody.slice(0, 300),
        })
      }

      const payload = await openaiRes.json()
      const raw = payload?.choices?.[0]?.message?.content
      const parsed = typeof raw === 'string' ? JSON.parse(stripJsonFence(raw)) : null
      const detectedItems = Array.isArray(parsed?.detectedItems)
        ? parsed.detectedItems
        : []
      const matchesSelectedService =
        typeof parsed?.matchesSelectedService === 'boolean'
          ? parsed.matchesSelectedService
          : true
      const recommendedService =
        typeof parsed?.recommendedService === 'string' &&
        ALLOWED_SERVICES.has(parsed.recommendedService)
          ? parsed.recommendedService
          : selectedService
      const specialItemType =
        typeof parsed?.specialItemType === 'string' &&
        ALLOWED_SPECIAL_ITEM_TYPES.has(parsed.specialItemType)
          ? parsed.specialItemType
          : 'none'
      const loadSize =
        parsed?.loadSize === 'single' ||
        parsed?.loadSize === 'small' ||
        parsed?.loadSize === 'medium' ||
        parsed?.loadSize === 'large' ||
        parsed?.loadSize === 'xlarge'
          ? parsed.loadSize
          : 'small'
      const complexity =
        parsed?.complexity === 'easy' ||
        parsed?.complexity === 'medium' ||
        parsed?.complexity === 'hard'
          ? parsed.complexity
          : 'easy'
      const vehicle =
        parsed?.vehicle === 'ute' ||
        parsed?.vehicle === 'van' ||
        parsed?.vehicle === 'truck'
          ? parsed.vehicle
          : 'ute'
      const confidence =
        typeof parsed?.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.55

      const defaultSuggested =
        selectedService === 'moving'
          ? 'move'
          : selectedService === 'junk'
            ? 'remove'
            : 'pickup'
      const suggestedAction =
        typeof parsed?.suggestedAction === 'string' &&
        ALLOWED_SUGGESTED_ACTION.has(parsed.suggestedAction)
          ? parsed.suggestedAction
          : defaultSuggested

      let itemCountEstimate =
        typeof parsed?.itemCountEstimate === 'number' &&
        Number.isFinite(parsed.itemCountEstimate)
          ? Math.max(0, Math.min(40, Math.round(parsed.itemCountEstimate)))
          : null
      if (itemCountEstimate === null) {
        const sum = detectedItems.reduce((n, row) => {
          const c =
            row && typeof row === 'object' && typeof row.count === 'number'
              ? row.count
              : 1
          return n + Math.max(1, Math.min(40, Math.round(c)))
        }, 0)
        itemCountEstimate = sum > 0 ? Math.min(40, sum) : 1
      }

      const mainItems = []
      if (Array.isArray(parsed?.mainItems)) {
        for (const row of parsed.mainItems) {
          if (typeof row === 'string' && row.trim()) mainItems.push(row.trim())
          if (mainItems.length >= 8) break
        }
      }
      if (mainItems.length === 0 && detectedItems.length > 0) {
        for (const row of detectedItems) {
          if (row && typeof row === 'object' && typeof row.name === 'string' && row.name.trim()) {
            mainItems.push(row.name.trim())
          }
          if (mainItems.length >= 5) break
        }
      }

      const isHeavyItem =
        typeof parsed?.isHeavyItem === 'boolean'
          ? parsed.isHeavyItem
          : specialItemType !== 'none'
      const isFragileItem =
        typeof parsed?.isFragileItem === 'boolean'
          ? parsed.isFragileItem
          : specialItemType === 'marble_table' || specialItemType === 'piano'
      const isBulky =
        typeof parsed?.isBulky === 'boolean'
          ? parsed.isBulky
          : loadSize === 'large' || loadSize === 'xlarge'
      const needsTwoMovers =
        typeof parsed?.needsTwoMovers === 'boolean'
          ? parsed.needsTwoMovers
          : specialItemType !== 'none' || loadSize === 'large' || loadSize === 'xlarge'
      const needsSpecialEquipment =
        typeof parsed?.needsSpecialEquipment === 'boolean'
          ? parsed.needsSpecialEquipment
          : specialItemType === 'pool_table' ||
            specialItemType === 'spa' ||
            specialItemType === 'safe' ||
            specialItemType === 'piano' ||
            specialItemType === 'marble_table'

      const accessRisk =
        typeof parsed?.accessRisk === 'string' && ALLOWED_ACCESS_RISK.has(parsed.accessRisk)
          ? parsed.accessRisk
          : 'medium'

      let singleItemEligible =
        typeof parsed?.singleItemEligible === 'boolean' ? parsed.singleItemEligible : undefined
      let singleItemDisqualifier =
        parsed?.singleItemDisqualifier === null
          ? null
          : typeof parsed?.singleItemDisqualifier === 'string'
            ? parsed.singleItemDisqualifier.slice(0, 120)
            : null
      if (singleItemEligible === undefined) {
        singleItemEligible =
          itemCountEstimate <= 1 &&
          loadSize === 'single' &&
          specialItemType === 'none' &&
          !isHeavyItem &&
          !isBulky &&
          !needsTwoMovers &&
          !needsSpecialEquipment &&
          accessRisk !== 'high' &&
          complexity !== 'hard' &&
          vehicle !== 'truck'
        singleItemDisqualifier = singleItemEligible ? null : singleItemDisqualifier || 'heuristic_ineligible'
      }

      const pricingBand =
        typeof parsed?.pricingBand === 'string' && ALLOWED_PRICING_BAND.has(parsed.pricingBand)
          ? parsed.pricingBand
          : specialItemType !== 'none' && (isHeavyItem || needsSpecialEquipment)
            ? 'heavy_special'
            : singleItemEligible
              ? 'local_quick'
              : 'standard'
      const pricingReason =
        typeof parsed?.pricingReason === 'string' && parsed.pricingReason.trim()
          ? parsed.pricingReason.trim().slice(0, 240)
          : 'Vision classification summary.'

      const detailedDescription =
        typeof parsed?.detailedDescription === 'string' && parsed.detailedDescription.trim()
          ? parsed.detailedDescription.trim().slice(0, 400)
          : null

      console.log(`[scan:${reqId}] openai result parsed`, {
        detectedItemsCount: detectedItems.length,
        matchesSelectedService,
        recommendedService,
        singleItemEligible,
      })
      console.log(`[scan:${reqId}] response sent`)
      attachPerfTimingHeader(res, perfRun, {
        route: 'scan',
        openai_ms: scanOpenaiMs,
        server_total_ms: Date.now() - perfT0,
      })
      return res.json({
        selectedService,
        matchesSelectedService,
        recommendedService,
        suggestedAction,
        specialItemType,
        detectedItems,
        itemCountEstimate,
        mainItems,
        loadSize,
        complexity,
        vehicle,
        isBulky,
        isHeavyItem,
        isFragileItem,
        needsTwoMovers,
        needsSpecialEquipment,
        accessRisk,
        singleItemEligible,
        singleItemDisqualifier,
        pricingBand,
        pricingReason,
        confidence,
        detailedDescription,
      })
    } catch (err) {
      console.error(`[scan:${reqId}] unhandled route error`, err)
      attachPerfTimingHeader(res, perfRun, {
        route: 'scan',
        openai_ms: scanOpenaiMs,
        server_total_ms: Date.now() - perfT0,
      })
      return res.status(500).json({
        ...SAFE_FALLBACK,
        selectedService:
          typeof req.body?.selectedService === 'string' &&
          ALLOWED_SERVICES.has(req.body.selectedService)
            ? req.body.selectedService
            : 'pickup',
        recommendedService:
          typeof req.body?.selectedService === 'string' &&
          ALLOWED_SERVICES.has(req.body.selectedService)
            ? req.body.selectedService
            : 'pickup',
        error: 'Scan failed',
        detail: err instanceof Error ? err.message : 'unknown error',
      })
    }
  })
})

app.use((err, _req, res, _next) => {
  console.error('[scan] express unhandled error', err)
  return res.status(500).json({
    ...SAFE_FALLBACK,
    error: 'Internal server error',
    detail: err instanceof Error ? err.message : 'unknown error',
  })
})

const HOST = '127.0.0.1'

export { app }

/** Windows netstat lines: LISTENING row ends with PID. */
function listeningPidsFromNetstatOutput(out, port) {
  const pids = new Set()
  const needle = `:${port}`
  for (const line of out.split(/\r?\n/)) {
    const t = line.trim()
    if (!t.includes('LISTENING') || !t.includes(needle)) continue
    const parts = t.split(/\s+/).filter(Boolean)
    const last = parts[parts.length - 1]
    if (last && /^\d+$/.test(last)) pids.add(last)
  }
  return [...pids]
}

/**
 * Kill whatever is LISTENING on PORT (dev convenience). Returns true if any PID was targeted.
 */
function killListenersOnPort(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        windowsHide: true,
      }).trim()
      const pids = listeningPidsFromNetstatOutput(out, port)
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { windowsHide: true, stdio: 'ignore' })
          console.warn(`[scan] Stopped PID ${pid} that was using port ${port}`)
        } catch {
          /* process already exited or access denied */
        }
      }
      return pids.length > 0
    } catch {
      return false
    }
  }
  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      const out = execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (!out) return false
      const pids = [...new Set(out.split(/\n/).filter(Boolean))]
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGTERM')
          console.warn(`[scan] Sent SIGTERM to PID ${pid} on port ${port}`)
        } catch {
          /* ignore */
        }
      }
      return pids.length > 0
    } catch {
      return false
    }
  }
  return false
}

/** Local dev only — on Vercel, `api/index.js` imports `app` (no listen). */
function startLocalHttpServer() {
  /** Do not pass a listen callback to `app.listen` — Express 5 also registers it on `error`, so EADDRINUSE still runs the "success" log once. */
  const server = app.listen(PORT, HOST)

  function logListening() {
    console.log(`[scan] server listening on ${PORT}`)
    console.log(`Scan API running on http://${HOST}:${PORT}`)
  }

  if (server.listening) {
    logListening()
  } else {
    server.once('listening', logListening)
  }

  setInterval(() => {
    void peerListingsStore.closeExpiredAuctions()
  }, 60_000)

  let eaddruseAutoRecoverAttempted = false

  server.on('error', (err) => {
    console.error('[scan] server error', err)
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
      if (!eaddruseAutoRecoverAttempted && killListenersOnPort(PORT)) {
        eaddruseAutoRecoverAttempted = true
        console.warn(`[scan] Retrying bind on ${HOST}:${PORT}…`)
        try {
          server.listen(PORT, HOST)
          return
        } catch (retryErr) {
          console.error('[scan] Retry listen threw', retryErr)
        }
      }

      console.error(
        `[scan] Port ${PORT} is still in use after auto-recovery — stop the other process or set PORT to a free port.`,
      )
      if (process.platform === 'win32') {
        try {
          const out = execSync(`netstat -ano | findstr :${PORT}`, {
            encoding: 'utf8',
            windowsHide: true,
          }).trim()
          if (out) {
            console.error('[scan] Who is using this port (netstat):')
            console.error(out)
            const pids = listeningPidsFromNetstatOutput(out, PORT)
            if (pids.length > 0) {
              console.error('[scan] Free the port (copy-paste):')
              for (const pid of pids) {
                console.error(`[scan]   taskkill /PID ${pid} /F`)
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
      process.exit(1)
    }
  })

  server.on('close', () => {
    console.error('[scan] server closed')
  })

  let shuttingDown = false
  async function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true
    console.warn(`[scan] ${signal} received, shutting down…`)
    await new Promise((resolve) => {
      server.close(() => resolve(undefined))
    })
    if (sharedPgPool) {
      try {
        await sharedPgPool.end()
        console.log('[scan] Postgres pool closed')
      } catch (e) {
        console.error('[scan] pool.end failed', e)
      }
    }
    process.exit(0)
  }
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })
}

if (process.env.VERCEL !== '1') {
  startLocalHttpServer()
}

