import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { waitForPaymentIntentServerConfirmed } from '../lib/booking/api'
import { loadSession } from '../lib/fetchUserSession'
import {
  checkoutListing,
  DEMO_LISTING_CHECKOUT_DISABLED_MESSAGE,
  fetchListing,
  formatListingCheckoutError,
  isPublicDemoListingId,
  listingImageAbsoluteUrl,
  type PeerListing,
} from '../lib/listingsApi'
import {
  fetchMessageThread,
  markThreadRead,
  postThreadMessage,
  type MessageThreadSummary,
  type PeerThreadMessage,
} from '../lib/messagesApi'
import { syncCustomerSessionCookie } from '../lib/fetchServerSession'
import { confirmDemoPaymentIntent, isStripePublishableConfigured } from '../lib/paymentCheckout'
import { FetchStripePaymentElement } from './FetchStripePaymentElement'

function formatAudFromCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export type ChatThreadViewProps = {
  thread: MessageThreadSummary
  onBack: () => void
  /** After “Fetch it” — parent switches to services + seeds brain */
  onFetchIt?: (listing: PeerListing) => void
  pollMs?: number
}

function ChatThreadViewInner({ thread, onBack, onFetchIt, pollMs = 8000 }: ChatThreadViewProps) {
  const [listing, setListing] = useState<PeerListing | null>(null)
  const [messages, setMessages] = useState<PeerThreadMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [stripeBuy, setStripeBuy] = useState<{ clientSecret: string; paymentIntentId: string } | null>(null)
  const [buyErr, setBuyErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const sessionEmail = loadSession()?.email?.trim() ?? ''

  const isBuyer = thread.role === 'buyer'
  const showBuyerCtas = thread.kind === 'listing' && isBuyer && listing != null

  const reload = useCallback(async () => {
    setErr(null)
    try {
      const { thread: t, messages: msgs } = await fetchMessageThread(thread.id)
      setMessages(msgs)
      if (t.listingId) {
        const l = await fetchListing(t.listingId)
        setListing(l)
      } else {
        setListing(null)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load thread')
    }
  }, [thread.id])

  useEffect(() => {
    void reload()
    void markThreadRead(thread.id).catch(() => {})
  }, [thread.id, reload])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void reload()
    }, pollMs)
    return () => window.clearInterval(id)
  }, [reload, pollMs])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    if (!sessionEmail) {
      setErr('Sign in to send messages.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await syncCustomerSessionCookie()
      await postThreadMessage(thread.id, text)
      setDraft('')
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  const startBuy = async () => {
    if (!listing) return
    setBuyErr(null)
    setStripeBuy(null)
    if (isPublicDemoListingId(listing.id)) {
      setBuyErr(DEMO_LISTING_CHECKOUT_DISABLED_MESSAGE)
      return
    }
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const { paymentIntent } = await checkoutListing(listing.id)
      if (paymentIntent.provider === 'stripe') {
        if (!isStripePublishableConfigured()) {
          setBuyErr('Set VITE_STRIPE_PUBLISHABLE_KEY to pay with Stripe.')
          return
        }
        if (!paymentIntent.clientSecret) {
          setBuyErr('Missing Stripe client secret.')
          return
        }
        setStripeBuy({ clientSecret: paymentIntent.clientSecret, paymentIntentId: paymentIntent.id })
        return
      }
      await confirmDemoPaymentIntent(paymentIntent)
      await reload()
    } catch (e) {
      setBuyErr(formatListingCheckoutError(e))
    } finally {
      setBusy(false)
    }
  }

  const cashPickup = async () => {
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      await postThreadMessage(thread.id, '', { template: 'cash_pickup' })
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not record choice')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-emerald-50">
      <header className="shrink-0 border-b border-emerald-800/40 bg-[#064e3b] px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-4">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <button
            type="button"
            className="rounded-full px-2 py-2 text-[15px] font-semibold text-emerald-200 hover:text-white"
            onClick={onBack}
          >
            Back
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-white">
            {thread.kind === 'support' ? 'Live support' : listing?.title ?? 'Marketplace chat'}
          </h1>
          <div className="w-14 shrink-0" aria-hidden />
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden">
        {listing && thread.kind === 'listing' ? (
          <div className="shrink-0 border-b border-emerald-200/80 bg-white px-3 py-3 sm:px-4">
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-emerald-50">
                {listing.images?.[0]?.url ? (
                  <img
                    src={listingImageAbsoluteUrl(listing.images[0].url)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">No photo</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14px] font-bold text-emerald-950">{listing.title}</p>
                <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-emerald-950">
                  {formatAudFromCents(listing.priceCents ?? 0)}
                </p>
              </div>
            </div>
            {showBuyerCtas ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {listing && isPublicDemoListingId(listing.id) && !buyErr ? (
                  <p className="w-full text-[12px] font-medium text-amber-900/90">
                    Showcase listing — checkout is disabled here too.
                  </p>
                ) : null}
                {stripeBuy && import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ? (
                  <div className="w-full rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                    <FetchStripePaymentElement
                      publishableKey={import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()}
                      clientSecret={stripeBuy.clientSecret}
                      submitLabel={busy ? '…' : 'Pay'}
                      disabled={busy || (listing ? isPublicDemoListingId(listing.id) : false)}
                      errorText={buyErr}
                      onError={(m) => setBuyErr(m)}
                      onSuccess={() => {
                        void (async () => {
                          setBusy(true)
                          try {
                            await waitForPaymentIntentServerConfirmed(stripeBuy.paymentIntentId)
                            setStripeBuy(null)
                            await reload()
                          } catch (e) {
                            setBuyErr(e instanceof Error ? e.message : 'Confirm failed')
                          } finally {
                            setBusy(false)
                          }
                        })()
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy || (listing ? isPublicDemoListingId(listing.id) : false)}
                      className="rounded-xl bg-[#065f46] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-[#064e3b] disabled:opacity-50"
                      onClick={() => void startBuy()}
                    >
                      {listing && isPublicDemoListingId(listing.id) ? 'Unavailable' : 'Buy'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] font-bold text-[#064e3b] disabled:opacity-50"
                      onClick={() => listing && onFetchIt?.(listing)}
                    >
                      Fetch it
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-[13px] font-bold text-emerald-950 disabled:opacity-50"
                      onClick={() => void cashPickup()}
                    >
                      Pick up cash
                    </button>
                  </>
                )}
                {buyErr ? <p className="w-full text-[12px] text-red-600">{buyErr}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-4">
          {err ? <p className="text-[13px] text-red-600">{err}</p> : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={[
                'max-w-[85%] rounded-2xl px-3 py-2 text-[14px] leading-snug shadow-sm',
                m.messageType === 'system'
                  ? 'mx-auto bg-amber-50 text-center text-[12px] font-medium text-amber-950'
                  : m.fromViewer
                    ? 'ml-auto bg-[#047857] text-white shadow-sm'
                    : 'mr-auto border border-emerald-200/90 bg-white text-emerald-950',
              ].join(' ')}
            >
              {m.body}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t border-emerald-200/90 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
          {!sessionEmail ? (
            <p className="text-center text-[12px] font-medium text-emerald-800/75">Sign in to reply.</p>
          ) : (
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message…"
                className="min-w-0 flex-1 rounded-full border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-[15px] text-emerald-950 outline-none placeholder:text-emerald-800/40 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              <button
                type="button"
                disabled={busy || !draft.trim()}
                className="shrink-0 rounded-full bg-[#065f46] px-5 py-2.5 text-[14px] font-bold text-white shadow-sm hover:bg-[#064e3b] disabled:opacity-40"
                onClick={() => void send()}
              >
                Send
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const ChatThreadView = memo(ChatThreadViewInner)
