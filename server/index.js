import express from 'express'
import multer from 'multer'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPaymentIntentRecord, reviewBookingDraft as reviewFetchAiBookingDraft } from './lib/fetch-ai-booking.js'
import { createMarketplaceStore } from './lib/marketplace-store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })

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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ||
  process.env.VITE_ELEVENLABS_VOICE_ID ||
  'onwK4e9ZLuTAKqWW03F9'
const ELEVENLABS_TIMEOUT_MS = 12000
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
  'matched',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
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
const DATA_FILE = path.join(__dirname, 'marketplace-data.json')
const ALLOWED_MEDIA_TYPES = new Set(['pickup', 'during_job', 'completion'])
const marketplaceStore = createMarketplaceStore(DATA_FILE)

function stripJsonFence(s) {
  const t = (s || '').trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  return t
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

app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.post('/api/voice/tts', async (req, res) => {
  const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  const voiceId =
    typeof req.body?.voiceId === 'string' && req.body.voiceId.trim()
      ? req.body.voiceId.trim()
      : ELEVENLABS_VOICE_ID

  if (!rawText) {
    return res.status(400).json({ error: 'text_required' })
  }

  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'missing_elevenlabs_api_key' })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS)
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: rawText.slice(0, 320),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.72,
          similarity_boost: 0.78,
          style: 0.16,
          use_speaker_boost: true,
          speed: 0.92,
        },
      }),
    }).finally(() => {
      clearTimeout(timeout)
    })

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({
        error: 'elevenlabs_request_failed',
        detail: detail.slice(0, 300),
      })
    }

    const audio = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.send(audio)
  } catch (error) {
    return res.status(502).json({
      error: 'elevenlabs_proxy_failed',
      detail: error instanceof Error ? error.message : 'unknown_error',
    })
  }
})

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

app.post('/api/payments/intents', async (req, res) => {
  const bookingId = typeof req.body?.bookingId === 'string' ? req.body.bookingId : null
  const requestedAmount =
    typeof req.body?.amount === 'number' && Number.isFinite(req.body.amount) ? req.body.amount : 0
  const state = await marketplaceStore.readState()
  const booking =
    bookingId ? state.bookings.find((row) => row.id === bookingId) ?? null : null
  const amount =
    booking?.pricing?.maxPrice != null ? booking.pricing.maxPrice : requestedAmount
  const paymentIntent = createPaymentIntentRecord({ bookingId, amount, currency: 'AUD' })
  marketplaceStore.upsertPaymentIntent(state, paymentIntent)
  await marketplaceStore.writeState(state)
  return res.json({ paymentIntent })
})

app.post('/api/payments/intents/:paymentIntentId/confirm', async (req, res) => {
  const { paymentIntentId } = req.params
  const paymentMethodId =
    typeof req.body?.paymentMethodId === 'string' ? req.body.paymentMethodId.trim() : ''
  if (!paymentMethodId) {
    return res.status(400).json({ error: 'payment_method_required' })
  }
  const state = await marketplaceStore.readState()
  const paymentIntent = state.paymentIntents.find((row) => row.id === paymentIntentId)
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
  paymentIntent.status = 'succeeded'
  paymentIntent.paymentMethodId = paymentMethodId
  paymentIntent.confirmedAt = Date.now()
  paymentIntent.lastError = null
  if (paymentIntent.bookingId) {
    const booking = state.bookings.find((row) => row.id === paymentIntent.bookingId)
    if (booking) {
      booking.paymentIntent = { ...paymentIntent }
      booking.status = 'confirmed'
      booking.updatedAt = Date.now()
    }
  }
  marketplaceStore.materializeState(state)
  await marketplaceStore.writeState(state)
  return res.json({ paymentIntent })
})

app.get('/api/marketplace/bookings/:bookingId', async (req, res) => {
  const { bookingId } = req.params
  const state = await marketplaceStore.readState()
  const booking = state.bookings.find((b) => b.id === bookingId) ?? null
  const offers = state.offers.filter((o) => o.bookingId === bookingId)
  const notifications = state.notifications.filter((n) => n.bookingId === bookingId)
  const media = state.media.filter((m) => m.bookingId === bookingId)
  if (!booking) return res.status(404).json({ error: 'booking_not_found' })
  return res.json({ booking, offers, notifications, media })
})

app.get('/api/marketplace/bookings', async (_req, res) => {
  const state = await marketplaceStore.readState()
  return res.json({ bookings: state.bookings })
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
  const { review: _review, ...sanitizedPayload } = reviewedPayload
  const booking = marketplaceStore.upsertBooking(state, {
    ...sanitizedPayload,
    status: requestedStatus,
  })
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
  if (status === 'confirmed' && booking.paymentIntent?.status !== 'succeeded') {
    return res.status(409).json({ error: 'confirmed_payment_required' })
  }
  booking.status = status
  booking.updatedAt = Date.now()
  if (req.body?.matchedDriver) {
    booking.matchedDriver = req.body.matchedDriver
  }
  marketplaceStore.materializeState(state)
  await marketplaceStore.writeState(state)
  return res.json({ booking })
})

app.post('/api/marketplace/bookings/:bookingId/dispatch', async (req, res) => {
  const { bookingId } = req.params
  const state = await marketplaceStore.readState()
  const { booking, error } = marketplaceStore.startDispatch(state, bookingId)
  if (!booking) {
    return res.status(error === 'booking_not_dispatchable' ? 409 : 404).json({ error })
  }
  await marketplaceStore.writeState(state)
  return res.json({ booking })
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
  await marketplaceStore.writeState(state)
  return res.json({ offer })
})

app.patch('/api/marketplace/offers/:offerId', async (req, res) => {
  const { offerId } = req.params
  const { status } = req.body ?? {}
  const state = await marketplaceStore.readState()
  const offer = state.offers.find((o) => o.offerId === offerId)
  if (!offer) return res.status(404).json({ error: 'offer_not_found' })
  offer.status = status ?? offer.status
  offer.updatedAt = Date.now()
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
    if (uploadErr) {
      console.error(`[scan:${reqId}] upload parse error`, uploadErr)
      return res.status(400).json({
        ...SAFE_FALLBACK,
        error: 'Invalid image upload payload',
        detail: uploadErr.message || 'upload parse failed',
      })
    }

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
      console.log(`[scan:${reqId}] openai response status`, { status: openaiRes.status })

      if (!openaiRes.ok) {
        const upstreamBody = await openaiRes.text().catch(() => '')
        console.error(`[scan:${reqId}] openai error`, {
          status: openaiRes.status,
          body: upstreamBody.slice(0, 300),
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

const server = app.listen(PORT, HOST, () => {
  console.log(`[scan] server listening on ${PORT}`)
  console.log(`Scan API running on http://${HOST}:${PORT}`)
})

server.on('error', (err) => {
  console.error('[scan] server error', err)
})

server.on('close', () => {
  console.error('[scan] server closed')
})

