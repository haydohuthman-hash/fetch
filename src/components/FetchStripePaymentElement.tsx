import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { type FormEvent, useMemo } from 'react'

export type FetchStripePaymentElementProps = {
  publishableKey: string
  clientSecret: string
  submitLabel: string
  disabled?: boolean
  errorText?: string | null
  onError: (message: string) => void
  onSuccess: () => void
}

function InnerForm({
  submitLabel,
  disabled,
  errorText,
  onError,
  onSuccess,
}: Omit<FetchStripePaymentElementProps, 'publishableKey' | 'clientSecret'>) {
  const stripe = useStripe()
  const elements = useElements()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    })
    if (error) {
      onError(error.message ?? 'Payment failed')
      return
    }
    onSuccess()
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-2 space-y-3">
      <PaymentElement />
      {errorText ? (
        <p className="text-[11px] font-medium leading-snug text-red-300/90">{errorText}</p>
      ) : null}
      <button
        type="submit"
        disabled={disabled || !stripe}
        className="fetch-stage-primary-btn w-full rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  )
}

export function FetchStripePaymentElement({
  publishableKey,
  clientSecret,
  ...rest
}: FetchStripePaymentElementProps) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey])
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: 'night', variables: { colorPrimary: '#a78bfa' } },
      }}
    >
      <InnerForm {...rest} />
    </Elements>
  )
}
