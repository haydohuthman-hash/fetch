import { memo, useCallback, useEffect, useState, type ReactNode } from 'react'
import { waitForPaymentIntentServerConfirmed } from '../lib/booking/api'
import {
  checkoutListing,
  createListing,
  fetchPublishedListings,
  fetchSellerEarnings,
  listingImageAbsoluteUrl,
  publishListing,
  refreshSellerConnectStatus,
  registerDevSellerStripe,
  startSellerConnect,
  uploadListingImage,
  type PeerListing,
} from '../lib/listingsApi'
import { syncCustomerSessionCookie } from '../lib/fetchServerSession'
import { loadSession } from '../lib/fetchUserSession'
import { confirmDemoPaymentIntent, isStripePublishableConfigured } from '../lib/paymentCheckout'
import { AccountNavIconFilled, FetchEyesHomeIcon } from './icons/HomeShellNavIcons'
import { FetchStripePaymentElement } from './FetchStripePaymentElement'

export type HomeShellBuySellPageProps = {
  bottomNav: ReactNode
  onMenuAccount?: () => void
}

function formatAudFromCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

type Panel = 'home' | 'browse' | 'create' | 'earnings' | 'connect'

function HomeShellBuySellPageInner({ bottomNav, onMenuAccount }: HomeShellBuySellPageProps) {
  const [panel, setPanel] = useState<Panel>('home')
  const [listings, setListings] = useState<PeerListing[]>([])
  const [listErr, setListErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<PeerListing | null>(null)
  const [stripeBuy, setStripeBuy] = useState<{
    clientSecret: string
    paymentIntentId: string
  } | null>(null)
  const [buyErr, setBuyErr] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priceAud, setPriceAud] = useState('25')
  const [photo, setPhoto] = useState<File | null>(null)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const [earnings, setEarnings] = useState<Awaited<ReturnType<typeof fetchSellerEarnings>> | null>(null)
  const [earnErr, setEarnErr] = useState<string | null>(null)

  const [connectMsg, setConnectMsg] = useState<string | null>(null)
  const [devAcct, setDevAcct] = useState('')

  const sessionEmail = loadSession()?.email?.trim() ?? ''

  useEffect(() => {
    void syncCustomerSessionCookie()
  }, [])

  const loadBrowse = useCallback(async () => {
    setListErr(null)
    setBusy(true)
    try {
      const r = await fetchPublishedListings()
      setListings(r.listings)
    } catch (e) {
      setListings([])
      setListErr(e instanceof Error ? e.message : 'Failed to load listings')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (panel === 'browse') void loadBrowse()
  }, [panel, loadBrowse])

  const handleCreate = async () => {
    if (!sessionEmail) {
      setCreateErr('Sign in from Account (email session) to list items.')
      return
    }
    setCreateErr(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const n = Number(priceAud)
      if (!Number.isFinite(n) || n <= 0) {
        setCreateErr('Enter a valid price in AUD.')
        return
      }
      const listing = await createListing({
        title: title.trim() || 'Untitled',
        description: description.trim(),
        priceAud: n,
        category: 'general',
        condition: 'used',
      })
      if (photo) {
        await uploadListingImage(listing.id, photo)
      }
      await publishListing(listing.id)
      setTitle('')
      setDescription('')
      setPriceAud('25')
      setPhoto(null)
      setPanel('browse')
      void loadBrowse()
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Could not create listing')
    } finally {
      setBusy(false)
    }
  }

  const startBuy = async (listing: PeerListing) => {
    setBuyErr(null)
    setStripeBuy(null)
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
      setSelected(null)
      void loadBrowse()
    } catch (e) {
      setBuyErr(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setBusy(false)
    }
  }

  const loadEarnings = useCallback(async () => {
    if (!sessionEmail) {
      setEarnErr('Sign in from Account to view seller earnings.')
      return
    }
    setEarnErr(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const e = await fetchSellerEarnings()
      setEarnings(e)
    } catch (err) {
      setEarnings(null)
      setEarnErr(err instanceof Error ? err.message : 'Failed to load earnings')
    } finally {
      setBusy(false)
    }
  }, [sessionEmail])

  useEffect(() => {
    if (panel === 'earnings') void loadEarnings()
  }, [panel, loadEarnings])

  const openConnect = async () => {
    if (!sessionEmail) {
      setConnectMsg('Sign in from Account first.')
      return
    }
    setConnectMsg(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const { url } = await startSellerConnect()
      window.open(url, '_blank', 'noopener,noreferrer')
      setConnectMsg('Complete onboarding in the new tab, then tap “Refresh status”.')
    } catch (e) {
      setConnectMsg(e instanceof Error ? e.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  const refreshConnect = async () => {
    setConnectMsg(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const s = await refreshSellerConnectStatus()
      setConnectMsg(
        s.onboardingComplete
          ? 'Stripe Connect is ready — you can publish paid listings checkout.'
          : 'Onboarding not complete yet.',
      )
    } catch (e) {
      setConnectMsg(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setBusy(false)
    }
  }

  const devRegister = async () => {
    if (!devAcct.trim()) return
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      await registerDevSellerStripe(devAcct.trim())
      setConnectMsg('Dev: connected account saved as onboarded.')
      setDevAcct('')
    } catch (e) {
      setConnectMsg(e instanceof Error ? e.message : 'Register failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fetch-home-buysell-page absolute inset-0 z-[60] flex min-h-0 flex-col bg-white"
      role="main"
      aria-label="Fetch buy and sell"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <header className="shrink-0 border-b border-zinc-200/80 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
          <div className="flex items-center justify-between gap-3">
            <FetchEyesHomeIcon className="h-9 w-9 shrink-0 text-zinc-900" />
            <div className="min-w-0 flex-1 text-center">
              <h1 className="fetch-home-map-brand-logo text-[1.25rem] font-bold leading-tight tracking-[-0.03em] text-zinc-900">
                Buy &amp; sell
              </h1>
              <p className="mt-1 text-[12px] font-medium leading-snug text-zinc-500">
                Peer listings — checkout uses Stripe Connect when configured
              </p>
            </div>
            {onMenuAccount ? (
              <button
                type="button"
                onClick={onMenuAccount}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 transition-colors active:scale-[0.97] active:bg-zinc-100"
                aria-label="Account"
              >
                <AccountNavIconFilled className="h-6 w-6" />
              </button>
            ) : (
              <div className="h-10 w-10 shrink-0" aria-hidden />
            )}
          </div>
        </header>

        {!sessionEmail ? (
          <p className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900">
            Open Account and sign in with email so the server can attach listings and payouts to you.
          </p>
        ) : null}

        {panel === 'home' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 pb-6">
            <button
              type="button"
              className="flex flex-col items-start gap-1 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 px-4 py-4 text-left shadow-sm shadow-zinc-900/[0.04] transition-[transform,background] active:scale-[0.99] active:bg-zinc-100/90"
              onClick={() => setPanel('browse')}
            >
              <span className="text-[15px] font-bold tracking-tight text-zinc-900">Browse listings</span>
              <span className="text-[13px] font-medium leading-snug text-zinc-500">
                Published items from other locals (demo store file on the server).
              </span>
            </button>
            <button
              type="button"
              className="flex flex-col items-start gap-1 rounded-2xl border border-zinc-200/90 bg-white px-4 py-4 text-left shadow-sm shadow-zinc-900/[0.04] transition-[transform,background] active:scale-[0.99] active:bg-zinc-50"
              onClick={() => setPanel('create')}
            >
              <span className="text-[15px] font-bold tracking-tight text-zinc-900">List something</span>
              <span className="text-[13px] font-medium leading-snug text-zinc-500">
                Draft on server, then publish to the feed.
              </span>
            </button>
            <button
              type="button"
              className="flex flex-col items-start gap-1 rounded-2xl border border-zinc-200/90 bg-white px-4 py-4 text-left shadow-sm shadow-zinc-900/[0.04] active:scale-[0.99] active:bg-zinc-50"
              onClick={() => setPanel('connect')}
            >
              <span className="text-[15px] font-bold tracking-tight text-zinc-900">Seller — Stripe Connect</span>
              <span className="text-[13px] font-medium leading-snug text-zinc-500">
                Onboard to receive payouts (Express account).
              </span>
            </button>
            <button
              type="button"
              className="flex flex-col items-start gap-1 rounded-2xl border border-zinc-200/90 bg-white px-4 py-4 text-left shadow-sm shadow-zinc-900/[0.04] active:scale-[0.99] active:bg-zinc-50"
              onClick={() => setPanel('earnings')}
            >
              <span className="text-[15px] font-bold tracking-tight text-zinc-900">Seller earnings</span>
              <span className="text-[13px] font-medium leading-snug text-zinc-500">
                Ledger from paid listing orders (after webhooks / demo confirm).
              </span>
            </button>
          </div>
        ) : null}

        {panel === 'browse' ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 pt-2">
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-[13px] font-semibold text-zinc-800 active:bg-zinc-50"
                onClick={() => setPanel('home')}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-full bg-zinc-900 px-3 py-1.5 text-[13px] font-semibold text-white active:opacity-90"
                onClick={() => void loadBrowse()}
                disabled={busy}
              >
                Refresh
              </button>
            </div>
            {listErr ? (
              <p className="text-[13px] font-medium text-red-600">{listErr}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {listings.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white p-3 text-left shadow-sm active:bg-zinc-50"
                    onClick={() => setSelected(l)}
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                      {l.images?.[0]?.url ? (
                        <img
                          src={listingImageAbsoluteUrl(l.images[0].url)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-zinc-900">{l.title}</p>
                      <p className="text-[13px] font-semibold tabular-nums text-zinc-600">
                        {formatAudFromCents(l.priceCents)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {!busy && listings.length === 0 && !listErr ? (
              <p className="mt-6 text-center text-[14px] text-zinc-500">No published listings yet.</p>
            ) : null}
          </div>
        ) : null}

        {panel === 'create' ? (
          <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
            <button
              type="button"
              className="self-start rounded-full border border-zinc-200 px-3 py-1.5 text-[13px] font-semibold"
              onClick={() => setPanel('home')}
            >
              Back
            </button>
            <label className="block">
              <span className="text-[12px] font-semibold text-zinc-700">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-[15px]"
                placeholder="IKEA desk"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-zinc-700">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-xl border border-zinc-200 px-3 py-2 text-[15px]"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-zinc-700">Price (AUD)</span>
              <input
                value={priceAud}
                onChange={(e) => setPriceAud(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-[15px]"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-zinc-700">Photo (optional)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 w-full text-[13px] text-zinc-700"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            {createErr ? <p className="text-[13px] text-red-600">{createErr}</p> : null}
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-zinc-900 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
              onClick={() => void handleCreate()}
            >
              {busy ? 'Saving…' : 'Create & publish'}
            </button>
          </div>
        ) : null}

        {panel === 'connect' ? (
          <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
            <button
              type="button"
              className="self-start rounded-full border border-zinc-200 px-3 py-1.5 text-[13px] font-semibold"
              onClick={() => setPanel('home')}
            >
              Back
            </button>
            <p className="text-[13px] leading-snug text-zinc-600">
              Starts Stripe Express onboarding in a new tab. Set{' '}
              <span className="font-mono text-[11px]">STRIPE_CONNECT_RETURN_URL</span> /{' '}
              <span className="font-mono text-[11px]">STRIPE_CONNECT_REFRESH_URL</span> on the server for production.
            </p>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-violet-600 py-3 text-[15px] font-semibold text-white"
              onClick={() => void openConnect()}
            >
              Open Connect onboarding
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl border border-zinc-200 py-3 text-[15px] font-semibold"
              onClick={() => void refreshConnect()}
            >
              Refresh status
            </button>
            {connectMsg ? <p className="text-[13px] text-zinc-700">{connectMsg}</p> : null}
            {import.meta.env.DEV ? (
              <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3">
                <p className="text-[11px] font-semibold uppercase text-zinc-500">Dev only</p>
                <p className="mt-1 text-[12px] text-zinc-600">
                  Paste a test connected account id (requires server env{' '}
                  <span className="font-mono">FETCH_ALLOW_CONNECT_REGISTER_DEV=1</span> in production).
                </p>
                <input
                  value={devAcct}
                  onChange={(e) => setDevAcct(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-[12px]"
                  placeholder="acct_..."
                />
                <button
                  type="button"
                  className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-[12px] font-semibold text-white"
                  onClick={() => void devRegister()}
                >
                  Save dev account
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {panel === 'earnings' ? (
          <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
            <button
              type="button"
              className="self-start rounded-full border border-zinc-200 px-3 py-1.5 text-[13px] font-semibold"
              onClick={() => setPanel('home')}
            >
              Back
            </button>
            {earnErr ? <p className="text-[13px] text-red-600">{earnErr}</p> : null}
            {earnings ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
                <p className="text-[12px] font-semibold text-zinc-500">Totals (ledger)</p>
                <p className="mt-1 text-[15px] font-bold tabular-nums text-zinc-900">
                  Gross {formatAudFromCents(earnings.summary.grossCents)} · Fees{' '}
                  {formatAudFromCents(earnings.summary.feeCents)} · Net{' '}
                  {formatAudFromCents(earnings.summary.netCents)}
                </p>
              </div>
            ) : null}
            <button
              type="button"
              className="rounded-xl bg-zinc-900 py-3 text-[15px] font-semibold text-white"
              onClick={() => void loadEarnings()}
              disabled={busy}
            >
              Refresh earnings
            </button>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/40" role="dialog" aria-modal>
          <button
            type="button"
            className="min-h-0 flex-1"
            aria-label="Close"
            onClick={() => {
              setSelected(null)
              setStripeBuy(null)
              setBuyErr(null)
            }}
          />
          <div className="max-h-[min(88dvh,32rem)] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Listing</p>
            <h2 className="mt-1 text-[1.15rem] font-bold text-zinc-900">{selected.title}</h2>
            <p className="mt-2 text-[20px] font-extrabold tabular-nums text-zinc-900">
              {formatAudFromCents(selected.priceCents)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-snug text-zinc-600">{selected.description}</p>
            {buyErr ? <p className="mt-2 text-[12px] text-red-600">{buyErr}</p> : null}
            {stripeBuy && import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ? (
              <div className="mt-4 rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                <FetchStripePaymentElement
                  publishableKey={import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()}
                  clientSecret={stripeBuy.clientSecret}
                  submitLabel={busy ? '…' : 'Pay'}
                  disabled={busy}
                  errorText={buyErr}
                  onError={(m) => setBuyErr(m)}
                  onSuccess={() => {
                    void (async () => {
                      setBusy(true)
                      try {
                        await waitForPaymentIntentServerConfirmed(stripeBuy.paymentIntentId)
                        setSelected(null)
                        setStripeBuy(null)
                        void loadBrowse()
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
              <button
                type="button"
                disabled={busy}
                className="mt-4 w-full rounded-xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                onClick={() => void startBuy(selected)}
              >
                {busy ? '…' : 'Buy now'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {bottomNav ? (
        <div className="shrink-0 border-t border-black/[0.06] bg-white pb-[env(safe-area-inset-bottom,0px)]">
          {bottomNav}
        </div>
      ) : null}
    </div>
  )
}

export const HomeShellBuySellPage = memo(HomeShellBuySellPageInner)
