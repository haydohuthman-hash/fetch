import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createPaymentIntent, waitForPaymentIntentServerConfirmed } from '../lib/booking/api'
import type { HardwareProduct } from '../lib/hardwareCatalog'
import { confirmDemoPaymentIntent, isStripePublishableConfigured } from '../lib/paymentCheckout'
import { FetchStripePaymentElement } from './FetchStripePaymentElement'

type Phase = 'detail' | 'checkout'

function previewGradient(style: HardwareProduct['previewStyle']) {
  switch (style) {
    case 'violet':
      return 'from-violet-600/40 via-fuchsia-500/30 to-transparent'
    case 'emerald':
      return 'from-emerald-600/40 via-teal-500/30 to-transparent'
    default:
      return 'from-slate-500/45 via-slate-600/25 to-transparent'
  }
}

export type FetchHardwareShopFlowProps = {
  product: HardwareProduct | null
  onDismiss: () => void
}

export function FetchHardwareShopFlow({ product, onDismiss }: FetchHardwareShopFlowProps) {
  const [phase, setPhase] = useState<Phase>('detail')
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeHw, setStripeHw] = useState<{ clientSecret: string; paymentIntentId: string } | null>(null)

  const resetAndClose = useCallback(() => {
    setPhase('detail')
    setQty(1)
    setBusy(false)
    setError(null)
    onDismiss()
  }, [onDismiss])

  useEffect(() => {
    if (!product) return
    setPhase('detail')
    setQty(1)
    setBusy(false)
    setError(null)
    setStripeHw(null)
  }, [product?.id])

  if (!product || typeof document === 'undefined') return null

  const lineTotal = product.priceAud * qty

  const handlePay = async () => {
    setBusy(true)
    setError(null)
    try {
      const pi0 = await createPaymentIntent({
        bookingId: null,
        amount: lineTotal,
        metadata: { type: 'hardware', sku: product.sku, qty },
      })
      if (pi0.provider === 'stripe') {
        if (!isStripePublishableConfigured()) {
          setError('Stripe is enabled on the server. Set VITE_STRIPE_PUBLISHABLE_KEY for checkout.')
          return
        }
        if (!pi0.clientSecret) {
          setError('Missing Stripe client secret.')
          return
        }
        setStripeHw({ clientSecret: pi0.clientSecret, paymentIntentId: pi0.id })
        return
      }
      await confirmDemoPaymentIntent(pi0)
      resetAndClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fetch-hardware-shop-root fixed inset-0 z-[57] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-md"
        aria-label="Close shop"
        onClick={() => !busy && resetAndClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fetch-hardware-shop-title"
        className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[22px] border border-white/[0.1] bg-[rgba(10,12,18,0.97)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
              {phase === 'detail' ? 'Wall panel' : 'Checkout'}
            </p>
            <h2
              id="fetch-hardware-shop-title"
              className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-white/[0.94]"
            >
              {product.title}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-emerald-200/90 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
            onClick={resetAndClose}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === 'detail' ? (
            <>
              <div
                className={[
                  'relative h-36 w-full overflow-hidden rounded-2xl bg-gradient-to-br',
                  previewGradient(product.previewStyle),
                ].join(' ')}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-white/50">
                    Fetch hardware
                  </span>
                </div>
              </div>
              <p className="mt-4 text-[14px] leading-relaxed text-white/[0.78]">{product.description}</p>
              <ul className="mt-4 space-y-2">
                {product.specs.map((s) => (
                  <li
                    key={s}
                    className="flex gap-2 text-[13px] leading-snug text-white/[0.72] before:mt-2 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-emerald-400/80 before:content-['']"
                  >
                    {s}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[22px] font-semibold tabular-nums text-emerald-200/95">
                ${product.priceAud}{' '}
                <span className="text-[13px] font-medium text-white/50">AUD each</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] leading-relaxed text-white/[0.78]">
                {isStripePublishableConfigured()
                  ? 'Pay with the secure card form when Stripe is active on the server; otherwise your default saved card is charged. Shipping and install are coordinated after purchase.'
                  : 'You pay with your default card on file. Shipping and install are coordinated after purchase — we&apos;ll reach out with next steps.'}
              </p>
              <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
                <div className="flex justify-between text-[13px] text-white/70">
                  <span>{product.title}</span>
                  <span className="tabular-nums">× {qty}</span>
                </div>
                <div className="mt-3 flex justify-between border-t border-white/[0.08] pt-3 text-[15px] font-semibold text-white/[0.92]">
                  <span>Total</span>
                  <span className="tabular-nums text-emerald-200/95">${lineTotal} AUD</span>
                </div>
              </div>
              {error ? (
                <p className="mt-3 text-[13px] font-medium text-red-300/95" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t border-white/[0.08] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {phase === 'detail' ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-[13px] text-white/70">
                <span className="shrink-0">Qty</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={qty}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (!Number.isFinite(n)) return
                    setQty(Math.max(1, Math.min(20, Math.floor(n))))
                  }}
                  className="w-20 rounded-lg border border-white/[0.12] bg-black/30 px-2 py-1.5 text-center text-[14px] font-semibold tabular-nums text-white"
                />
              </label>
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-500/90 py-3 text-[15px] font-semibold text-emerald-950 transition-colors hover:bg-emerald-400/95"
                onClick={() => setPhase('checkout')}
              >
                Buy — ${lineTotal} AUD
              </button>
            </div>
          ) : stripeHw && import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ? (
            <div className="space-y-2">
              <FetchStripePaymentElement
                publishableKey={import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()}
                clientSecret={stripeHw.clientSecret}
                submitLabel={busy ? 'Confirming…' : 'Pay now'}
                disabled={busy}
                errorText={error}
                onError={(msg) => setError(msg)}
                onSuccess={() => {
                  void (async () => {
                    setBusy(true)
                    setError(null)
                    try {
                      await waitForPaymentIntentServerConfirmed(stripeHw.paymentIntentId)
                      resetAndClose()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Payment confirmation failed.')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              />
              <button
                type="button"
                disabled={busy}
                className="w-full text-[12px] font-medium text-white/55 underline decoration-white/25"
                onClick={() => {
                  setStripeHw(null)
                  setError(null)
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-xl bg-emerald-500/90 py-3 text-[15px] font-semibold text-emerald-950 transition-colors hover:bg-emerald-400/95 disabled:opacity-60"
              onClick={() => void handlePay()}
            >
              {busy ? 'Processing…' : 'Pay with saved card'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
