import {
  confirmPaymentIntent,
  createPaymentIntent,
  type PaymentCardConfirmPayload,
} from './booking/api'
import { getDefaultPaymentMethod, paymentMethodToConfirmPayload } from './paymentMethods'

/**
 * Creates a payment intent and confirms it with the user's default saved card
 * (full number + CVV from local storage — demo only).
 */
export async function chargeDefaultSavedCard(params: {
  amount: number
  bookingId?: string | null
}) {
  const method = getDefaultPaymentMethod()
  if (!method) {
    throw new Error('Add a payment card in Account before booking.')
  }
  const cardOrErr = paymentMethodToConfirmPayload(method)
  if ('error' in cardOrErr) {
    throw new Error(cardOrErr.error)
  }
  const card: PaymentCardConfirmPayload = cardOrErr
  const paymentIntent = await createPaymentIntent({
    bookingId: params.bookingId ?? null,
    amount: params.amount,
    currency: 'AUD',
  })
  return confirmPaymentIntent(paymentIntent.id, method.id, card)
}

/** Hardware checkout — amount must match server price × qty; server validates on confirm. */
export async function chargeHardwareWithDefaultCard(params: {
  sku: string
  qty: number
  /** Client display total; server recomputes from sku. */
  amountAud: number
}) {
  const method = getDefaultPaymentMethod()
  if (!method) {
    throw new Error('Add a payment card in Account before purchase.')
  }
  const cardOrErr = paymentMethodToConfirmPayload(method)
  if ('error' in cardOrErr) {
    throw new Error(cardOrErr.error)
  }
  const card: PaymentCardConfirmPayload = cardOrErr
  const qty = Math.max(1, Math.min(20, Math.floor(params.qty)))
  const paymentIntent = await createPaymentIntent({
    bookingId: null,
    amount: params.amountAud,
    currency: 'AUD',
    metadata: { type: 'hardware', sku: params.sku, qty },
  })
  return confirmPaymentIntent(paymentIntent.id, method.id, card)
}
