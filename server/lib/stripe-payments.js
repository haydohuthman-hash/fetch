/**
 * Stripe PaymentIntent creation + webhook helpers for marketplace checkout.
 */

/** @type {Set<string>} */
const processedStripeWebhookEventIds = new Set()
const MAX_WEBHOOK_EVENT_CACHE = 8000

/** @param {string} eventId */
export function isStripeWebhookEventProcessed(eventId) {
  return Boolean(eventId && typeof eventId === 'string' && processedStripeWebhookEventIds.has(eventId))
}

/** Call after a webhook event is handled successfully (idempotent OK). */
export function markStripeWebhookEventProcessed(eventId) {
  if (!eventId || typeof eventId !== 'string') return
  processedStripeWebhookEventIds.add(eventId)
  while (processedStripeWebhookEventIds.size > MAX_WEBHOOK_EVENT_CACHE) {
    const first = processedStripeWebhookEventIds.values().next().value
    if (first == null) break
    processedStripeWebhookEventIds.delete(first)
  }
}

/**
 * @param {string} stripeStatus
 * @returns {import('./fetch-ai-booking.js').BookingPaymentIntentStatus | string}
 */
export function mapStripePaymentIntentStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'requires_payment_method':
      return 'requires_payment_method'
    case 'requires_confirmation':
      return 'requires_confirmation'
    case 'requires_action':
      return 'processing'
    case 'processing':
      return 'processing'
    case 'requires_capture':
      return 'processing'
    case 'succeeded':
      return 'succeeded'
    case 'canceled':
      return 'failed'
    default:
      return 'processing'
  }
}

/**
 * Flatten metadata for Stripe (string values only).
 * @param {string | null} bookingId
 * @param {object | null} intentMetadata
 */
export function stripeMetadataForIntent(bookingId, intentMetadata) {
  /** @type {Record<string, string>} */
  const meta = {}
  if (bookingId) meta.bookingId = bookingId
  if (intentMetadata && typeof intentMetadata === 'object') {
    if (intentMetadata.type === 'hardware' || intentMetadata.type === 'supply') {
      meta.checkout = intentMetadata.type === 'supply' ? 'supply' : 'hardware'
      if (typeof intentMetadata.sku === 'string') meta.sku = intentMetadata.sku.slice(0, 120)
      const qty = intentMetadata.qty
      meta.qty =
        typeof qty === 'number' && Number.isFinite(qty) ? String(Math.min(20, Math.max(1, Math.floor(qty)))) : '1'
    }
    if (intentMetadata.type === 'supply_cart') {
      meta.checkout = 'supply_cart'
      if (typeof intentMetadata.storeOrderId === 'string') {
        meta.storeOrderId = intentMetadata.storeOrderId.slice(0, 120)
      }
    }
    if (intentMetadata.type === 'listing_order') {
      meta.checkout = 'listing_order'
      if (typeof intentMetadata.listingOrderId === 'string') {
        meta.listingOrderId = intentMetadata.listingOrderId.slice(0, 120)
      }
    }
  }
  return meta
}

/**
 * @param {import('stripe').Stripe.PaymentIntent} stripePi
 * @param {{
 *   bookingId: string | null
 *   amountAud: number
 *   currency: string
 *   metadata: object | null
 * }} ctx
 */
export function localRecordFromStripePaymentIntent(stripePi, ctx) {
  const now = Date.now()
  const status = mapStripePaymentIntentStatus(stripePi.status)
  return {
    id: stripePi.id,
    stripePaymentIntentId: stripePi.id,
    bookingId: ctx.bookingId,
    metadata: ctx.metadata && typeof ctx.metadata === 'object' ? ctx.metadata : null,
    status,
    amount: Math.max(0, Math.round((Number(ctx.amountAud) || 0) * 100) / 100),
    currency: ctx.currency || 'AUD',
    paymentMethodId: null,
    clientSecret: stripePi.client_secret,
    lastError: null,
    createdAt: now,
    confirmedAt: null,
    provider: 'stripe',
    webhookConfirmedAt: null,
    instrument: null,
  }
}

/**
 * @param {import('stripe').Stripe} stripe
 * @param {{
 *   amountAud: number
 *   bookingId: string | null
 *   metadata: object | null
 * }} args
 */
export async function createStripePaymentIntentOnStripe(stripe, args) {
  const amountCents = Math.round(Math.max(0, args.amountAud) * 100)
  if (!Number.isFinite(amountCents) || amountCents < 1) {
    throw new Error('stripe_amount_invalid')
  }
  const metadata = stripeMetadataForIntent(args.bookingId, args.metadata)
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'aud',
    automatic_payment_methods: { enabled: true },
    metadata,
  })
}

/**
 * Destination charge with application fee (Stripe Connect).
 * @param {import('stripe').Stripe} stripe
 * @param {{
 *   amountCents: number
 *   applicationFeeCents: number
 *   destinationAccountId: string
 *   metadata: object | null
 * }} args
 */
export async function createStripeConnectPaymentIntent(stripe, args) {
  const amountCents = Math.max(1, Math.round(Number(args.amountCents) || 0))
  let feeCents = Math.max(0, Math.round(Number(args.applicationFeeCents) || 0))
  if (feeCents >= amountCents) feeCents = Math.max(0, amountCents - 1)
  const dest = String(args.destinationAccountId || '').trim()
  if (!dest) throw new Error('stripe_connect_destination_required')
  const metadata = stripeMetadataForIntent(null, args.metadata)
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'aud',
    automatic_payment_methods: { enabled: true },
    application_fee_amount: feeCents,
    transfer_data: { destination: dest },
    metadata,
  })
}
