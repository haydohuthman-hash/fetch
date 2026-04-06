import type { BookingPaymentIntent } from './assistant/types'
import {
  confirmPaymentIntent,
  createPaymentIntent,
  type PaymentCardConfirmPayload,
} from './booking/api'
import { getDefaultPaymentMethod, paymentMethodToConfirmPayload } from './paymentMethods'

export function isStripePublishableConfigured(): boolean {
  return Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim())
}

/** Confirms an existing demo-mode intent (not `provider: 'stripe'`). */
export async function confirmDemoPaymentIntent(paymentIntent: BookingPaymentIntent) {
  if (paymentIntent.provider === 'stripe') {
    throw new Error('This payment uses Stripe Elements checkout, not demo card confirm.')
  }
  const method = getDefaultPaymentMethod()
  if (!method) {
    throw new Error('Add a payment card in Account before booking.')
  }
  const cardOrErr = paymentMethodToConfirmPayload(method)
  if ('error' in cardOrErr) {
    throw new Error(cardOrErr.error)
  }
  const card: PaymentCardConfirmPayload = cardOrErr
  return confirmPaymentIntent(paymentIntent.id, method.id, card)
}

export async function chargeDefaultSavedCard(params: {
  amount: number
  bookingId?: string | null
}) {
  const paymentIntent = await createPaymentIntent({
    bookingId: params.bookingId ?? null,
    amount: params.amount,
    currency: 'AUD',
  })
  return confirmDemoPaymentIntent(paymentIntent)
}

/** Hardware checkout — amount must match server price × qty; server validates on confirm. */
export async function chargeHardwareWithDefaultCard(params: {
  sku: string
  qty: number
  /** Client display total; server recomputes from sku. */
  amountAud: number
}) {
  const qty = Math.max(1, Math.min(20, Math.floor(params.qty)))
  const paymentIntent = await createPaymentIntent({
    bookingId: null,
    amount: params.amountAud,
    currency: 'AUD',
    metadata: { type: 'hardware', sku: params.sku, qty },
  })
  return confirmDemoPaymentIntent(paymentIntent)
}
