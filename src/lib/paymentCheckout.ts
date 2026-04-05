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
