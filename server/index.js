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
import { createPeerListingsStore } from './lib/peer-listings-store.js'
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
}

if (process.env.NODE_ENV === 'production') {
  const sec = (process.env.FETCH_SESSION_SECRET || '').trim()
  if (!sec || sec === 'fetch_dev_session_insecure') {
    console.warn('[fetch] WARNING: Set a strong FETCH_SESSION_SECRET in production.')
  }
}

const marketplaceStore = await createConfiguredMarketplaceStore()
const HARDWARE_ORDERS_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-hardware-orders.json')
  : path.join(__dirname, 'hardware-orders.json')
const hardwareOrdersStore = createHardwareOrdersStore(HARDWARE_ORDERS_FILE)

const STORE_ORDERS_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-store-orders.json')
  : path.join(__dirname, 'store-orders.json')
const storeOrdersStore = createStoreOrdersStore(STORE_ORDERS_FILE)

const PEER_LISTINGS_FILE = process.env.VERCEL
  ? path.join('/tmp', 'fetch-peer-listings.json')
  : path.join(__dirname, 'peer-listings.json')
const peerListingsStore = createPeerListingsStore(PEER_LISTINGS_FILE)

const LISTING_UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'fetch-listing-uploads')
  : path.join(projectRoot, 'public', 'listing-uploads')
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

app.use(express.json({ limit: '15mb' }))

app.use('/listing-uploads', express.static(LISTING_UPLOAD_DIR))

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

app.post('/api/auth/register', authRouteLimiter, async (req, res) => {
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

app.post('/api/auth/login', authRouteLimiter, async (req, res) => {
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

app.get('/api/store/catalog', (req, res) => {
  const cat = typeof req.query.category === 'string' ? req.query.category.trim() : ''
  let products = STORE_CATALOG_PRODUCTS.map((p) => ({
    id: p.id,
    sku: p.sku,
    title: p.title,
    subtitle: p.subtitle,
    categoryId: p.categoryId,
    priceAud: p.priceAud,
    coverImageUrl: `/supplies/${p.id}.png`,
  }))
  if (cat) products = products.filter((p) => p.categoryId === cat)
  return res.json({ products, currency: 'AUD' })
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
  const key = (req.headers['x-fetch-store-admin-key'] || '').trim()
  if (!STORE_ADMIN_KEY || key !== STORE_ADMIN_KEY) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const stock = {}
  for (const p of STORE_CATALOG_PRODUCTS) {
    stock[p.sku] = { sku: p.sku, available: null, note: 'Unlimited (demo)' }
  }
  return res.json({ products: STORE_CATALOG_PRODUCTS, stock, bundles: STORE_BUNDLES })
})

function peerListingSellerKey(req) {
  const actor = resolveMarketplaceActor(req)
  return peerListingsStore.sellerKey(actor.customerUserId, actor.customerEmail)
}

app.get('/api/listings', async (req, res) => {
  const statusRaw = typeof req.query.status === 'string' ? req.query.status.trim() : 'published'
  const r = await peerListingsStore.listListings({
    status: statusRaw || 'published',
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    limit:
      typeof req.query.limit === 'string' && Number.isFinite(Number(req.query.limit))
        ? Math.min(48, Math.max(1, Math.floor(Number(req.query.limit))))
        : 24,
  })
  return res.json({ ...r, currency: 'AUD' })
})

app.get('/api/listings/mine', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const listings = await peerListingsStore.listListingsBySeller(sk)
  return res.json({ listings })
})

app.get('/api/listings/:listingId', async (req, res) => {
  const sk = peerListingSellerKey(req)
  const l = await peerListingsStore.getListingVisible(req.params.listingId, sk)
  if (!l) return res.status(404).json({ error: 'listing_not_found' })
  return res.json({ listing: l })
})

app.post('/api/listings', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const actor = resolveMarketplaceActor(req)
  const body = req.body ?? {}
  const listing = await peerListingsStore.createListing({
    sellerUserId: actor.customerUserId,
    sellerEmail: actor.customerEmail,
    title: body.title,
    description: body.description,
    priceAud: body.priceAud,
    category: body.category,
    condition: body.condition,
  })
  return res.json({ listing })
})

app.patch('/api/listings/:listingId', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
  const out = await peerListingsStore.patchListing(req.params.listingId, sk, req.body ?? {})
  if (!out) return res.status(404).json({ error: 'listing_not_found' })
  if (out.error) return res.status(403).json({ error: out.error })
  return res.json(out)
})

app.post('/api/listings/:listingId/publish', async (req, res) => {
  const sk = peerListingSellerKey(req)
  if (!sk) return res.status(401).json({ error: 'auth_required' })
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

