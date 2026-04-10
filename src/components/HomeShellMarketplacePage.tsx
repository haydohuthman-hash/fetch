import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { HardwareProduct } from '../lib/hardwareCatalog'
import { SUPPLY_PRODUCTS, type SupplyProduct } from '../lib/suppliesCatalog'
import { waitForPaymentIntentServerConfirmed } from '../lib/booking/api'
import { confirmDemoPaymentIntent, isStripePublishableConfigured } from '../lib/paymentCheckout'
import { fetchStoreCatalog, storeCheckout, syncCheckoutCustomerSession, type StoreCatalogProduct } from '../lib/storeApi'
import { publicProductToSupplyProduct } from '../lib/publicProduct'
import { useFetchProducts } from '../lib/useFetchProducts'
import { formatDropHandle } from '../lib/drops/profileStore'
import { syncCustomerSessionCookie } from '../lib/fetchServerSession'
import { loadSession } from '../lib/fetchUserSession'
import {
  checkoutListing,
  fetchListing,
  fetchPublishedListings,
  listingImageAbsoluteUrl,
  type PeerListing,
} from '../lib/listingsApi'
import { AccountNavIconFilled } from './icons/HomeShellNavIcons'
import type { BuySellDropsListingHandoff } from './HomeShellBuySellPage'
import { HomeShellBuySellPage } from './HomeShellBuySellPage'
import type { HomeShellTab } from './FetchHomeBookingSheet'
import { FetchStripePaymentElement } from './FetchStripePaymentElement'

export type MarketplaceDropsProductHandoff = {
  productId: string
  /** `sheet` opens product detail; `buyNow` adds one to cart and opens cart. */
  mode: 'sheet' | 'buyNow'
}

export type HomeShellMarketplacePageProps = {
  bottomNav: React.ReactNode
  hardwareProducts: readonly HardwareProduct[]
  onMenuAccount?: () => void
  onRequestHomeShellTab?: (tab: HomeShellTab) => void
  dropsProductHandoff?: MarketplaceDropsProductHandoff | null
  onDropsProductHandoffConsumed?: () => void
  onOpenListingChat?: (listingId: string) => void | Promise<void>
  onBookDriver?: () => void
  dropsListingHandoff?: BuySellDropsListingHandoff | null
  onDropsListingHandoffConsumed?: () => void
}

function formatAud(n: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(n)
}

function hashStringHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

/** Placeholder distance for flat-lay listing cards (real geo not wired yet). */
function listingDistanceMi(productId: string): string {
  const tenths = (hashStringHue(productId) % 14) + 3
  return `${(tenths / 10).toFixed(1)} mi`
}

function formatAudFromCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function peerListingCompareAtCents(l: PeerListing): number {
  const c = l.compareAtCents
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : 0
}

function peerListingSavingsPercent(l: PeerListing): number | null {
  const now = l.priceCents ?? 0
  const was = peerListingCompareAtCents(l)
  if (was <= 0 || now <= 0 || was <= now) return null
  return Math.min(99, Math.round(((was - now) / was) * 100))
}

function peerListingPublicSellerLine(l: PeerListing): string | null {
  const raw = l.profileDisplayName?.trim()
  if (!raw) return null
  return formatDropHandle(raw)
}

function PeerListingSheetMapPin({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 21.25s-5.75-5.1-5.75-10.5A5.75 5.75 0 1117.75 10.75c0 5.4-5.75 10.5-5.75 10.5z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="10.25" r="2.2" fill="currentColor" />
    </svg>
  )
}

function MarketplaceMapPinIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 21s7-4.35 7-10a7 7 0 10-14 0c0 5.65 7 10 7 10z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MarketplaceChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MarketplaceFilterLinesIcon({ className }: { className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 7h16M6.5 12h11M9 17h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

const showMarketplaceAdminEntry =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_STORE_ADMIN === '1'

function apiCatalogRowToSupplyProduct(row: StoreCatalogProduct, staticP: SupplyProduct | undefined): SupplyProduct {
  const compare =
    row.compareAtAud != null && Number.isFinite(row.compareAtAud) && row.compareAtAud > 0
      ? row.compareAtAud
      : undefined
  const ext = {
    ...(row.productSource === 'amazon' ? { productSource: 'amazon' as const } : {}),
    ...(row.externalListing ? { externalListing: true as const } : {}),
    ...(row.affiliateUrl?.trim() ? { affiliateUrl: row.affiliateUrl.trim() } : {}),
    ...(row.asin ? { asin: row.asin } : {}),
  }
  if (staticP) {
    return {
      ...staticP,
      priceAud: row.priceAud,
      title: row.title,
      subtitle: row.subtitle,
      coverImageUrl: row.coverImageUrl,
      description: row.description?.trim() || staticP.description,
      ...(row.subcategoryId ? { subcategoryId: row.subcategoryId } : {}),
      ...(row.subcategoryLabel ? { subcategoryLabel: row.subcategoryLabel } : {}),
      ...(compare != null ? { compareAtAud: compare } : {}),
      ...ext,
    }
  }
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    subtitle: row.subtitle,
    priceAud: row.priceAud,
    categoryId: row.categoryId,
    previewStyle: 'slate',
    specs: [row.subtitle],
    description: row.description?.trim() || row.subtitle,
    coverImageUrl: row.coverImageUrl,
    ...(row.subcategoryId ? { subcategoryId: row.subcategoryId } : {}),
    ...(row.subcategoryLabel ? { subcategoryLabel: row.subcategoryLabel } : {}),
    ...(compare != null ? { compareAtAud: compare } : {}),
    ...ext,
  }
}

function supplyProductShowsCompare(p: SupplyProduct): boolean {
  const was = p.compareAtAud ?? 0
  const now = p.priceAud
  return was > 0 && (now <= 0 || was > now)
}

function isExternalAffiliateProduct(p: SupplyProduct): boolean {
  return Boolean(p.externalListing && (p.affiliateUrl ?? '').trim())
}

function formatListingPriceAud(p: SupplyProduct): string {
  if (isExternalAffiliateProduct(p) && p.priceAud <= 0) return 'See on Amazon'
  return formatAud(p.priceAud)
}

function CartIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M9 8V6a3 3 0 116 0v2M5 9h14l-1.2 9.04A2 2 0 0115.82 20H8.18a2 2 0 01-1.98-1.96L5 9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MarketplaceBrowseHeaderActions({
  cartItemCount,
  onCart,
  onAccount,
  showAdmin,
  onAdmin,
}: {
  cartItemCount: number
  onCart: () => void
  onAccount?: () => void
  showAdmin?: boolean
  onAdmin?: () => void
}) {
  const cartLabel =
    cartItemCount > 0
      ? `Open cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`
      : 'Open cart'

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {showAdmin && onAdmin ? (
        <button
          type="button"
          onClick={onAdmin}
          className="mr-0.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-700 active:bg-violet-50"
        >
          Admin
        </button>
      ) : null}
      <button
        type="button"
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 transition-colors active:scale-[0.97] active:bg-zinc-100"
        aria-label={cartLabel}
        onClick={onCart}
      >
        <CartIcon />
        {cartItemCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-bold tabular-nums text-white">
            {cartItemCount > 99 ? '99+' : cartItemCount}
          </span>
        ) : null}
      </button>
      {onAccount ? (
        <button
          type="button"
          onClick={onAccount}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 transition-colors active:scale-[0.97] active:bg-zinc-100"
          aria-label="Profile"
        >
          <AccountNavIconFilled className="h-6 w-6" />
        </button>
      ) : null}
    </div>
  )
}

/** Minimum time cart skeleton is shown so it reads as a deliberate load state (not a flash). */
const CART_OPEN_SKELETON_MS = 650
const VIEW_CART_RIPPLE_CLEANUP_MS = 420
/** Initial marketplace browse shell while the tab is opening (no network — UX polish). */
const MARKETPLACE_BOOT_SKELETON_MS = 600

function MarketplaceViewCartButton({
  cartItemCount,
  ariaLabel,
  onOpen,
}: {
  cartItemCount: number
  ariaLabel: string
  onOpen: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const rippleSeq = useRef(0)
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])

  const onPointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    const el = btnRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const id = ++rippleSeq.current
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setRipples((prev) => [...prev, { id, x, y }])
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id))
    }, VIEW_CART_RIPPLE_CLEANUP_MS)
  }, [])

  return (
    <button
      ref={btnRef}
      type="button"
      onPointerDown={onPointerDown}
      onClick={onOpen}
      aria-label={ariaLabel}
      className="fetch-marketplace-view-cart-btn relative flex w-full items-center gap-3 overflow-hidden rounded-xl bg-black px-4 py-3.5 text-left text-[15px] font-semibold tracking-tight text-white transition-[transform,opacity] active:scale-[0.99] active:opacity-90"
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="fetch-marketplace-view-cart-ripple pointer-events-none absolute rounded-full bg-white/35"
          style={{
            left: r.x,
            top: r.y,
            width: 8,
            height: 8,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
      <CartIcon className="relative z-[1] h-[22px] w-[22px] shrink-0 text-white" />
      <span className="relative z-[1] min-w-0 flex-1">View cart</span>
      {cartItemCount > 0 ? (
        <span className="relative z-[1] shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-bold tabular-nums">
          {cartItemCount > 99 ? '99+' : cartItemCount}
        </span>
      ) : null}
    </button>
  )
}

function MarketplaceBrowseBootSkeleton() {
  return (
    <div
      className="fetch-home-marketplace-body pointer-events-none flex min-h-0 flex-1 flex-col bg-[#064e3b] select-none"
      aria-hidden
    >
      <div className="mx-auto flex w-full max-w-[min(100%,430px)] min-h-0 flex-1 flex-col px-3 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
        <div className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-white/90 px-3 shadow-md ring-1 ring-black/[0.06]">
          <div className="h-5 w-5 shrink-0 rounded-full bg-zinc-200/80" />
          <div className="h-4 min-w-0 flex-1 rounded-md bg-zinc-200/70" />
          <div className="h-6 w-6 shrink-0 rounded-full bg-zinc-200/60" />
          <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-200/55" />
        </div>
        <div className="fetch-home-marketplace-flat-sheet mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.75rem] bg-[#f2efe8] shadow-lg ring-1 ring-black/[0.05]">
          <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3.5">
            <div className="h-5 w-24 rounded-md bg-zinc-300/50" />
            <div className="flex gap-1">
              <div className="h-10 w-10 rounded-full bg-zinc-300/40" />
              <div className="h-10 w-10 rounded-full bg-zinc-300/40" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">
            <div className="rounded-2xl bg-white/60 p-2.5 ring-1 ring-black/[0.06]">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
                    <div className="aspect-square bg-zinc-200/45" />
                    <div className="space-y-2 p-2.5">
                      <div className="h-3.5 rounded bg-zinc-200/70" />
                      <div className="h-3 w-2/3 rounded bg-zinc-200/60" />
                      <div className="h-2.5 w-1/2 rounded bg-zinc-200/50" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const SupplyProductThumb = memo(function SupplyProductThumb({
  alt,
  ...img
}: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div
        className="mx-auto h-12 w-12 rounded-lg bg-zinc-100"
        aria-hidden
      />
    )
  }
  return (
    <img
      alt={alt}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      {...img}
    />
  )
})

type MarketplaceSubView = 'browse' | 'cart' | 'checkout' | 'orderComplete'

function HomeShellMarketplacePageInner({
  bottomNav,
  onMenuAccount,
  onRequestHomeShellTab,
  dropsProductHandoff = null,
  onDropsProductHandoffConsumed,
  onOpenListingChat,
  onBookDriver,
  dropsListingHandoff = null,
  onDropsListingHandoffConsumed,
}: HomeShellMarketplacePageProps) {
  const navigate = useNavigate()
  const { loading: productsApiLoading, products: apiProductList } = useFetchProducts()

  const [locationQuery, setLocationQuery] = useState('Los Angeles, CA')
  const [cartQtyById, setCartQtyById] = useState<Record<string, number>>({})
  const [subView, setSubView] = useState<MarketplaceSubView>('browse')
  const [productSheet, setProductSheet] = useState<SupplyProduct | null>(null)
  const [checkoutName, setCheckoutName] = useState('')
  const [checkoutEmail, setCheckoutEmail] = useState('')
  const [checkoutAddress, setCheckoutAddress] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [stripeStoreCheckout, setStripeStoreCheckout] = useState<{
    clientSecret: string
    paymentIntentId: string
    storeOrderId: string
  } | null>(null)
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null)
  const [cartEnterLoading, setCartEnterLoading] = useState(false)
  const [cartOpenSeq, setCartOpenSeq] = useState(0)
  const [marketplaceBootLoading, setMarketplaceBootLoading] = useState(true)
  const [catalogProducts, setCatalogProducts] = useState<SupplyProduct[] | null>(null)
  const [peerListings, setPeerListings] = useState<PeerListing[]>([])
  const [peerListErr, setPeerListErr] = useState<string | null>(null)
  const [peerListLoading, setPeerListLoading] = useState(false)
  const [peerListingSheet, setPeerListingSheet] = useState<PeerListing | null>(null)
  const [peerStripeBuy, setPeerStripeBuy] = useState<{
    clientSecret: string
    paymentIntentId: string
  } | null>(null)
  const [peerBuyErr, setPeerBuyErr] = useState<string | null>(null)
  const [peerCheckoutBusy, setPeerCheckoutBusy] = useState(false)
  const [sellerToolsOpen, setSellerToolsOpen] = useState(false)
  const dropsListingHandoffDoneRef = useRef<string | null>(null)

  const sessionEmail = loadSession()?.email?.trim() ?? ''

  const loadPeerListings = useCallback(async () => {
    setPeerListErr(null)
    setPeerListLoading(true)
    try {
      const r = await fetchPublishedListings({ limit: 64 })
      setPeerListings(r.listings)
    } catch (e) {
      setPeerListings([])
      setPeerListErr(e instanceof Error ? e.message : 'Could not load community listings')
    } finally {
      setPeerListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPeerListings()
  }, [loadPeerListings])

  const applyFallbackCatalog = useCallback(async () => {
    try {
      const rows = await fetchStoreCatalog()
      const staticById = new Map(SUPPLY_PRODUCTS.map((p) => [p.id, p]))
      setCatalogProducts(rows.map((row) => apiCatalogRowToSupplyProduct(row, staticById.get(row.id))))
    } catch {
      setCatalogProducts([...SUPPLY_PRODUCTS])
    }
  }, [])

  useEffect(() => {
    if (productsApiLoading) return
    void (async () => {
      if (apiProductList.length > 0) {
        setCatalogProducts(apiProductList.map(publicProductToSupplyProduct))
      } else {
        await applyFallbackCatalog()
      }
    })()
  }, [productsApiLoading, apiProductList, applyFallbackCatalog])

  const productById = useMemo(() => {
    const list = catalogProducts ?? [...SUPPLY_PRODUCTS]
    return new Map(list.map((p) => [p.id, p] as const))
  }, [catalogProducts])

  /** Browse grid: community peer listings only (no Fetch store / supplier catalog). */
  const gridRows = useMemo(
    () => peerListings.map((l) => ({ kind: 'peer' as const, listing: l })),
    [peerListings],
  )

  const openSellerInDrops = useCallback(() => {
    onRequestHomeShellTab?.('reels')
  }, [onRequestHomeShellTab])

  const closePeerListingSheet = useCallback(() => {
    setPeerListingSheet(null)
    setPeerStripeBuy(null)
    setPeerBuyErr(null)
  }, [])

  const startPeerBuy = useCallback(
    async (listing: PeerListing) => {
      setPeerBuyErr(null)
      setPeerStripeBuy(null)
      setPeerCheckoutBusy(true)
      try {
        await syncCustomerSessionCookie()
        const { paymentIntent } = await checkoutListing(listing.id)
        if (paymentIntent.provider === 'stripe') {
          if (!isStripePublishableConfigured()) {
            setPeerBuyErr('Set VITE_STRIPE_PUBLISHABLE_KEY to pay with Stripe.')
            return
          }
          if (!paymentIntent.clientSecret) {
            setPeerBuyErr('Missing Stripe client secret.')
            return
          }
          setPeerStripeBuy({ clientSecret: paymentIntent.clientSecret, paymentIntentId: paymentIntent.id })
          return
        }
        await confirmDemoPaymentIntent(paymentIntent)
        closePeerListingSheet()
        void loadPeerListings()
      } catch (e) {
        setPeerBuyErr(e instanceof Error ? e.message : 'Checkout failed')
      } finally {
        setPeerCheckoutBusy(false)
      }
    },
    [closePeerListingSheet, loadPeerListings],
  )

  const cartLines = useMemo(() => {
    const out: { product: SupplyProduct; qty: number }[] = []
    for (const [id, qty] of Object.entries(cartQtyById)) {
      if (qty <= 0) continue
      const product = productById.get(id)
      if (product && !isExternalAffiliateProduct(product)) out.push({ product, qty })
    }
    return out
  }, [cartQtyById, productById])

  const cartItemCount = useMemo(
    () => cartLines.reduce((sum, { qty }) => sum + qty, 0),
    [cartLines],
  )

  const cartTotalAud = useMemo(
    () => cartLines.reduce((sum, { product, qty }) => sum + product.priceAud * qty, 0),
    [cartLines],
  )

  const addOne = useCallback((p: SupplyProduct) => {
    if (isExternalAffiliateProduct(p)) return
    setCartQtyById((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))
  }, [])

  const setQty = useCallback((id: string, qty: number) => {
    setCartQtyById((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }, [])

  const goBrowse = useCallback(() => {
    setCompletedOrderId(null)
    setStripeStoreCheckout(null)
    setCheckoutError(null)
    setSubView('browse')
  }, [])

  const goCart = useCallback(() => {
    setCartEnterLoading(true)
    setCartOpenSeq((n) => n + 1)
    setSubView('cart')
  }, [])

  const dropsProductHandoffDoneRef = useRef<string | null>(null)
  useEffect(() => {
    if (!dropsProductHandoff) {
      dropsProductHandoffDoneRef.current = null
      return
    }
    const sig = `${dropsProductHandoff.productId}:${dropsProductHandoff.mode}`
    if (dropsProductHandoffDoneRef.current === sig) return
    const p = productById.get(dropsProductHandoff.productId)
    if (!p) {
      onDropsProductHandoffConsumed?.()
      return
    }
    dropsProductHandoffDoneRef.current = sig
    setPeerListingSheet(null)
    setCompletedOrderId(null)
    setStripeStoreCheckout(null)
    setCheckoutError(null)
    setSubView('browse')
    if (dropsProductHandoff.mode === 'sheet' || isExternalAffiliateProduct(p)) {
      setProductSheet(p)
    } else {
      addOne(p)
      goCart()
    }
    onDropsProductHandoffConsumed?.()
  }, [dropsProductHandoff, productById, addOne, goCart, onDropsProductHandoffConsumed])

  useEffect(() => {
    if (!dropsListingHandoff) {
      dropsListingHandoffDoneRef.current = null
      return
    }
    const { listingId, mode } = dropsListingHandoff
    const sig = `${listingId}:${mode}`
    if (dropsListingHandoffDoneRef.current === sig) return
    dropsListingHandoffDoneRef.current = sig

    const run = async () => {
      let listing = peerListings.find((l) => l.id === listingId)
      if (!listing) {
        try {
          const fetched = await fetchListing(listingId)
          listing = fetched
          setPeerListings((prev) => (prev.some((x) => x.id === fetched.id) ? prev : [fetched, ...prev]))
        } catch {
          dropsListingHandoffDoneRef.current = null
          onDropsListingHandoffConsumed?.()
          return
        }
      }
      setProductSheet(null)
      setSubView('browse')
      setPeerListingSheet(listing)
      if (mode === 'buyNow') {
        queueMicrotask(() => void startPeerBuy(listing))
      }
      onDropsListingHandoffConsumed?.()
    }
    void run()
  }, [dropsListingHandoff, peerListings, onDropsListingHandoffConsumed, startPeerBuy])

  const goCheckout = useCallback(() => setSubView('checkout'), [])

  const placeStoreOrder = useCallback(async () => {
    if (cartLines.length === 0) return
    setCheckoutBusy(true)
    setCheckoutError(null)
    setStripeStoreCheckout(null)
    try {
      await syncCheckoutCustomerSession(checkoutEmail)
      const lines = cartLines.map(({ product, qty }) => ({ productId: product.id, qty }))
      const idem =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const { storeOrder, paymentIntent } = await storeCheckout(
        {
          lines,
          shipping: {
            name: checkoutName,
            email: checkoutEmail,
            address: checkoutAddress,
          },
        },
        idem,
      )
      if (paymentIntent.provider === 'stripe') {
        if (!isStripePublishableConfigured()) {
          setCheckoutError(
            'Stripe is enabled on the server. Set VITE_STRIPE_PUBLISHABLE_KEY in the app env for checkout.',
          )
          return
        }
        if (!paymentIntent.clientSecret) {
          setCheckoutError('Missing Stripe client secret.')
          return
        }
        setStripeStoreCheckout({
          clientSecret: paymentIntent.clientSecret,
          paymentIntentId: paymentIntent.id,
          storeOrderId: storeOrder.id,
        })
        return
      }
      await confirmDemoPaymentIntent(paymentIntent)
      setCompletedOrderId(storeOrder.id)
      setCartQtyById({})
      setCheckoutName('')
      setCheckoutEmail('')
      setCheckoutAddress('')
      setSubView('orderComplete')
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setCheckoutBusy(false)
    }
  }, [cartLines, checkoutAddress, checkoutEmail, checkoutName])

  useEffect(() => {
    if (!productSheet && !peerListingSheet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (peerListingSheet) {
        closePeerListingSheet()
      } else {
        setProductSheet(null)
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [productSheet, peerListingSheet, closePeerListingSheet])

  useEffect(() => {
    if (subView === 'checkout' && cartLines.length === 0) {
      setCartEnterLoading(true)
      setCartOpenSeq((n) => n + 1)
      setSubView('cart')
    }
  }, [subView, cartLines.length])

  useEffect(() => {
    if (subView !== 'cart') {
      setCartEnterLoading(false)
      return
    }
    const tid = window.setTimeout(() => setCartEnterLoading(false), CART_OPEN_SKELETON_MS)
    return () => window.clearTimeout(tid)
  }, [subView, cartOpenSeq])

  useEffect(() => {
    const tid = window.setTimeout(() => setMarketplaceBootLoading(false), MARKETPLACE_BOOT_SKELETON_MS)
    return () => window.clearTimeout(tid)
  }, [])

  const checkoutValid =
    checkoutName.trim().length > 0 &&
    checkoutEmail.trim().length > 0 &&
    checkoutAddress.trim().length > 0

  const browseShellClass =
    subView === 'browse'
      ? 'bg-[#064e3b]'
      : 'bg-white'

  return (
    <div
      className={[
        'fetch-home-marketplace-page absolute inset-0 z-[60] flex min-h-0 flex-col',
        browseShellClass,
      ].join(' ')}
      role="main"
      aria-label="Marketplace"
      aria-busy={marketplaceBootLoading}
    >
        {marketplaceBootLoading ? (
          <MarketplaceBrowseBootSkeleton />
        ) : (
        <div
          className={[
            'fetch-home-marketplace-body flex min-h-0 flex-1 flex-col',
            subView === 'browse' ? 'bg-transparent' : 'bg-white',
          ].join(' ')}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {subView === 'browse' ? null : subView === 'cart' ? (
              <header className="shrink-0 border-b border-zinc-200/80 bg-white px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 active:bg-zinc-100"
                    aria-label="Back to shop"
                    onClick={goBrowse}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M15 6l-6 6 6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <h1 className="min-h-[1.75rem] min-w-0 flex-1 text-[1.2rem] font-bold tracking-[-0.03em] text-zinc-900">
                    {cartEnterLoading ? (
                      <span
                        className="mt-0.5 inline-block h-[1.35rem] w-[4.25rem] rounded-md bg-zinc-200/85 animate-pulse"
                        aria-hidden
                      />
                    ) : (
                      'Cart'
                    )}
                  </h1>
                </div>
              </header>
            ) : subView === 'checkout' ? (
              <header className="shrink-0 border-b border-zinc-200/80 bg-white px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 active:bg-zinc-100"
                    aria-label="Back to cart"
                    onClick={goCart}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M15 6l-6 6 6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <h1 className="text-[1.2rem] font-bold tracking-[-0.03em] text-zinc-900">Checkout</h1>
                </div>
              </header>
            ) : (
              <header className="shrink-0 border-b border-zinc-200/80 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
                <h1 className="text-center text-[1.2rem] font-bold tracking-[-0.03em] text-zinc-900">
                  Order confirmed
                </h1>
              </header>
            )}

            {subView === 'browse' ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="mx-auto flex w-full max-w-[min(100%,430px)] min-h-0 flex-1 flex-col px-3 pb-0 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
                  <div className="flex shrink-0 items-center gap-2 rounded-full bg-white px-3.5 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.06]">
                    <MarketplaceMapPinIcon className="shrink-0 text-zinc-900" />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-[15px] font-medium leading-tight text-zinc-900 outline-none placeholder:text-zinc-400"
                      value={locationQuery}
                      onChange={(e) => setLocationQuery(e.target.value)}
                      aria-label="Location"
                      placeholder="City or area"
                      autoComplete="address-level2"
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-1 text-zinc-700 transition-colors active:bg-zinc-100"
                      aria-label="Location options"
                    >
                      <MarketplaceChevronDownIcon className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-1.5 text-zinc-900 transition-colors active:bg-zinc-100"
                      aria-label="Filters"
                    >
                      <MarketplaceFilterLinesIcon className="h-[22px] w-[22px]" />
                    </button>
                  </div>

                  <div className="fetch-home-marketplace-flat-sheet mt-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-t-[1.75rem] shadow-[0_-8px_36px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.05]">
                    <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-1 text-left text-[17px] font-bold tracking-tight text-zinc-900 active:opacity-80"
                        >
                          <span className="truncate">Near you</span>
                          <MarketplaceChevronDownIcon className="shrink-0 text-zinc-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSellerToolsOpen(true)}
                          className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[13px] font-bold text-emerald-950 ring-1 ring-emerald-200/90 active:bg-emerald-100/80"
                        >
                          Sell
                        </button>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <MarketplaceBrowseHeaderActions
                          cartItemCount={cartItemCount}
                          onCart={goCart}
                          onAccount={onMenuAccount}
                          showAdmin={showMarketplaceAdminEntry}
                          onAdmin={() => navigate('/admin/products')}
                        />
                        <button
                          type="button"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-900 transition-colors active:bg-zinc-200/60"
                          aria-label="Filters"
                        >
                          <MarketplaceFilterLinesIcon />
                        </button>
                      </div>
                    </div>

                    <div className="fetch-home-marketplace-grid-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] px-3 pb-3">
                      {peerListErr ? (
                        <div className="mb-3 rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3">
                          <p className="text-[13px] font-bold text-amber-950">Community listings</p>
                          <p className="mt-1 text-[12px] leading-snug text-amber-900/85">{peerListErr}</p>
                          <button
                            type="button"
                            className="mt-3 rounded-xl bg-amber-950 px-4 py-2 text-[12px] font-bold text-white active:opacity-90"
                            onClick={() => void loadPeerListings()}
                          >
                            Retry
                          </button>
                        </div>
                      ) : null}

                      <div
                        className="rounded-2xl bg-white/70 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ring-1 ring-black/[0.06]"
                        aria-busy={peerListLoading}
                      >
                        {gridRows.length === 0 ? (
                          <p className="py-12 text-center text-[13px] font-medium text-zinc-500">
                            No community listings yet.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            {gridRows.map((row) => (
                              <article
                                key={`peer-${row.listing.id}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setProductSheet(null)
                                  setPeerListingSheet(row.listing)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setProductSheet(null)
                                    setPeerListingSheet(row.listing)
                                  }
                                }}
                                className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05] transition-[transform,box-shadow] focus-visible:outline focus-visible:ring-2 focus-visible:ring-zinc-900 active:scale-[0.99]"
                              >
                                <div className="relative aspect-square w-full shrink-0 bg-zinc-100">
                                  {row.listing.images?.[0]?.url ? (
                                    <img
                                      src={listingImageAbsoluteUrl(row.listing.images[0].url)}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-[11px] font-medium text-zinc-400">
                                      No photo
                                    </div>
                                  )}
                                  <span className="absolute left-1.5 top-1.5 z-[1] rounded-md bg-violet-600 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                                    Community
                                  </span>
                                </div>
                                <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-2">
                                  <h3 className="line-clamp-2 text-[14px] font-bold leading-snug tracking-tight text-zinc-900">
                                    {row.listing.title}
                                  </h3>
                                  <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                                    {peerListingCompareAtCents(row.listing) > 0 &&
                                    (row.listing.priceCents ?? 0) > 0 &&
                                    peerListingCompareAtCents(row.listing) > (row.listing.priceCents ?? 0) ? (
                                      <span className="text-[12px] font-bold tabular-nums text-zinc-400 line-through decoration-zinc-300">
                                        {formatAudFromCents(peerListingCompareAtCents(row.listing))}
                                      </span>
                                    ) : null}
                                    <p className="text-[15px] font-extrabold tabular-nums tracking-tight text-zinc-900">
                                      {formatAudFromCents(row.listing.priceCents ?? 0)}
                                    </p>
                                  </div>
                                  <p className="mt-1 line-clamp-1 text-[11px] font-medium text-zinc-500">
                                    Community
                                    {peerListingPublicSellerLine(row.listing)
                                      ? ` · ${peerListingPublicSellerLine(row.listing)}`
                                      : ''}{' '}
                                    · {listingDistanceMi(row.listing.id)}
                                  </p>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="min-h-[max(0.5rem,env(safe-area-inset-bottom,0px))] shrink-0" aria-hidden />
                    </div>

                    {cartItemCount > 0 ? (
                      <div className="shrink-0 border-t border-black/[0.06] bg-[#f0ebe3]/95 px-3 py-2.5 backdrop-blur-md">
                        <MarketplaceViewCartButton
                          cartItemCount={cartItemCount}
                          onOpen={goCart}
                          ariaLabel={`View cart, ${cartItemCount} items, ${formatAud(cartTotalAud)}`}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : subView === 'cart' ? (
              <div
                className="flex min-h-0 flex-1 flex-col bg-white"
                role="region"
                aria-label="Shopping cart"
                aria-busy={cartEnterLoading}
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
                  {cartEnterLoading ? (
                    <ul className="fetch-marketplace-cart-skel space-y-4" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <li
                          key={i}
                          className="flex gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/70 p-3"
                        >
                          <div className="h-16 w-16 shrink-0 rounded-xl bg-zinc-200/70" />
                          <div className="min-w-0 flex-1 space-y-2 py-0.5">
                            <div className="h-4 max-w-[78%] rounded-md bg-zinc-200/80" />
                            <div className="h-3 max-w-[40%] rounded-md bg-zinc-200/60" />
                            <div className="h-8 w-[7.5rem] rounded-lg bg-zinc-200/70" />
                          </div>
                          <div className="h-5 w-14 shrink-0 rounded-md bg-zinc-200/75" />
                        </li>
                      ))}
                    </ul>
                  ) : cartLines.length === 0 ? (
                    <p className="py-16 text-center text-[15px] font-medium text-zinc-500">
                      Your cart is empty.
                    </p>
                  ) : (
                    <ul className="space-y-4">
                      {cartLines.map(({ product: p, qty }) => (
                        <li
                          key={p.id}
                          className="flex gap-3 rounded-2xl border border-zinc-200/90 bg-zinc-50/50 p-3"
                        >
                          <button
                            type="button"
                            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white"
                            aria-label={`View ${p.title} details`}
                            onClick={() => setProductSheet(p)}
                          >
                            <SupplyProductThumb
                              src={p.coverImageUrl}
                              alt=""
                              className="max-h-full max-w-full object-contain p-1"
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold leading-snug text-zinc-900">{p.title}</p>
                            <p className="mt-0.5 text-[12px] text-zinc-500">{formatAud(p.priceAud)} each</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex items-center gap-1 rounded-lg bg-white p-0.5 ring-1 ring-zinc-200/80">
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-[16px] font-semibold text-zinc-700 active:bg-zinc-100"
                                  aria-label={`Decrease ${p.title}`}
                                  onClick={() => setQty(p.id, qty - 1)}
                                >
                                  −
                                </button>
                                <span className="min-w-[1.5rem] text-center text-[14px] font-bold tabular-nums text-zinc-900">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-[16px] font-semibold text-zinc-700 active:bg-zinc-100"
                                  aria-label={`Increase ${p.title}`}
                                  onClick={() => setQty(p.id, qty + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[14px] font-extrabold tabular-nums text-zinc-900">
                              {formatAud(p.priceAud * qty)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="shrink-0 space-y-3 border-t border-zinc-200/80 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
                  {cartEnterLoading ? (
                    <div className="fetch-marketplace-cart-skel space-y-3" aria-hidden>
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-4 w-20 rounded-md bg-zinc-200/75" />
                        <div className="h-8 w-28 rounded-lg bg-zinc-200/80" />
                      </div>
                      <div className="h-3 w-full max-w-sm rounded-md bg-zinc-100" />
                      <div className="h-12 w-full rounded-xl bg-zinc-200/55" />
                      <div className="h-12 w-full rounded-xl bg-zinc-200/45" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold text-zinc-600">Subtotal</span>
                        <span className="text-[1.25rem] font-extrabold tabular-nums text-zinc-900">
                          {formatAud(cartTotalAud)}
                        </span>
                      </div>
                      <p className="text-[12px] leading-snug text-zinc-500">
                        Shipping and taxes are estimated at checkout (demo).
                      </p>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-zinc-200/90 bg-white py-3 text-[15px] font-semibold text-zinc-900 active:bg-zinc-50"
                        onClick={goBrowse}
                      >
                        Continue shopping
                      </button>
                      <button
                        type="button"
                        disabled={cartLines.length === 0}
                        className="w-full rounded-xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 active:opacity-90"
                        onClick={goCheckout}
                      >
                        Checkout
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : subView === 'checkout' ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
                <div className="mx-auto max-w-md space-y-4">
                  <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/60 px-4 py-3">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Order summary</p>
                    <p className="mt-1 text-[1.125rem] font-extrabold tabular-nums text-zinc-900">
                      {formatAud(cartTotalAud)}
                      <span className="text-[13px] font-semibold text-zinc-500">
                        {' '}
                        · {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}
                      </span>
                    </p>
                  </div>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-zinc-700">Full name</span>
                    <input
                      type="text"
                      value={checkoutName}
                      onChange={(e) => setCheckoutName(e.target.value)}
                      autoComplete="name"
                      className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-3 text-[15px] text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                      placeholder="Alex Fetch"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-zinc-700">Email</span>
                    <input
                      type="email"
                      value={checkoutEmail}
                      onChange={(e) => setCheckoutEmail(e.target.value)}
                      autoComplete="email"
                      className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-3 text-[15px] text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-zinc-700">Delivery address</span>
                    <textarea
                      value={checkoutAddress}
                      onChange={(e) => setCheckoutAddress(e.target.value)}
                      autoComplete="street-address"
                      rows={3}
                      className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200/90 bg-white px-3 py-3 text-[15px] text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                      placeholder="Street, suburb, state, postcode"
                    />
                  </label>
                  {checkoutError ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-800">
                      {checkoutError}
                    </p>
                  ) : null}
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-3">
                    <p className="text-[12px] font-semibold text-zinc-700">Payment</p>
                    <p className="mt-1 text-[13px] leading-snug text-zinc-500">
                      {stripeStoreCheckout && import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim()
                        ? 'Pay securely with your card. Totals are set by the server from the catalog.'
                        : 'Uses your saved card from Account when the server is in demo mode; otherwise Stripe card form below when publishable key is set.'}
                    </p>
                  </div>
                  {stripeStoreCheckout && import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-950 px-4 py-4">
                      <FetchStripePaymentElement
                        publishableKey={import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()}
                        clientSecret={stripeStoreCheckout.clientSecret}
                        submitLabel={checkoutBusy ? 'Confirming…' : 'Pay now'}
                        disabled={checkoutBusy}
                        errorText={checkoutError}
                        onError={(msg) => setCheckoutError(msg)}
                        onSuccess={() => {
                          void (async () => {
                            setCheckoutBusy(true)
                            setCheckoutError(null)
                            try {
                              await waitForPaymentIntentServerConfirmed(stripeStoreCheckout.paymentIntentId)
                              setCompletedOrderId(stripeStoreCheckout.storeOrderId)
                              setStripeStoreCheckout(null)
                              setCartQtyById({})
                              setCheckoutName('')
                              setCheckoutEmail('')
                              setCheckoutAddress('')
                              setSubView('orderComplete')
                            } catch (e) {
                              setCheckoutError(
                                e instanceof Error ? e.message : 'Payment confirmation failed.',
                              )
                            } finally {
                              setCheckoutBusy(false)
                            }
                          })()
                        }}
                      />
                      <button
                        type="button"
                        disabled={checkoutBusy}
                        className="mt-3 w-full text-[12px] font-medium text-zinc-400 underline decoration-zinc-600"
                        onClick={() => {
                          setStripeStoreCheckout(null)
                          setCheckoutError(null)
                        }}
                      >
                        Cancel card payment
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!checkoutValid || cartLines.length === 0 || checkoutBusy}
                      className="w-full rounded-xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 active:opacity-90"
                      onClick={() => void placeStoreOrder()}
                    >
                      {checkoutBusy ? 'Processing…' : 'Place order'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-[17px] font-bold text-zinc-900">Thanks — your order is placed</p>
                {completedOrderId ? (
                  <p className="mt-2 font-mono text-[13px] text-zinc-600">Order {completedOrderId}</p>
                ) : null}
                <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-zinc-500">
                  You&apos;ll receive confirmation by email once fulfilment is wired to your address.
                </p>
                <button
                  type="button"
                  className="mt-8 w-full max-w-xs rounded-xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white active:opacity-90"
                  onClick={goBrowse}
                >
                  Back to shop
                </button>
              </div>
            )}
          </div>
        </div>
        )}

        {bottomNav ? (
          <div className="fetch-home-marketplace-shell-footer shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
            {bottomNav}
          </div>
        ) : null}

      {productSheet
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex flex-col justify-end" role="presentation">
              <button
                type="button"
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                aria-label="Close product details"
                onClick={() => setProductSheet(null)}
              />
              <div
                className="relative z-[1] flex max-h-[min(92dvh,40rem)] flex-col rounded-t-[1.25rem] border border-zinc-200/90 bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.12)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="fetch-marketplace-product-sheet-title"
              >
                <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                  <div className="flex max-h-[12rem] w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-50">
                    <SupplyProductThumb
                      src={productSheet.coverImageUrl}
                      alt={productSheet.title}
                      className="max-h-[12rem] w-full object-contain object-center p-4"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {supplyProductShowsCompare(productSheet) ? (
                      <span className="text-[1.05rem] font-bold tabular-nums text-zinc-400 line-through decoration-zinc-300">
                        {formatAud(productSheet.compareAtAud ?? 0)}
                      </span>
                    ) : null}
                    <span className="text-[1.35rem] font-extrabold tabular-nums tracking-tight text-zinc-900">
                      {formatListingPriceAud(productSheet)}
                    </span>
                    {supplyProductShowsCompare(productSheet) &&
                    productSheet.compareAtAud &&
                    productSheet.priceAud > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[12px] font-extrabold text-emerald-900">
                        Save{' '}
                        {Math.min(
                          99,
                          Math.round(
                            ((productSheet.compareAtAud - productSheet.priceAud) / productSheet.compareAtAud) *
                              100,
                          ),
                        )}
                        %
                      </span>
                    ) : null}
                  </div>
                  <h2
                    id="fetch-marketplace-product-sheet-title"
                    className="mt-1 text-[1.2rem] font-bold leading-tight tracking-[-0.03em] text-zinc-900"
                  >
                    {productSheet.title}
                  </h2>
                  <p className="mt-1 text-[14px] font-medium text-zinc-500">{productSheet.subtitle}</p>
                  <p className="mt-3 text-[14px] leading-relaxed text-zinc-600">{productSheet.description}</p>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Includes</p>
                  <ul className="mt-2 list-disc space-y-1.5 border-t border-zinc-100 pt-3 pl-5 text-[13px] leading-snug text-zinc-700">
                    {productSheet.specs.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div className="mt-5 flex flex-col gap-2">
                    {isExternalAffiliateProduct(productSheet) && productSheet.affiliateUrl ? (
                      <>
                        <a
                          href={productSheet.affiliateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex w-full items-center justify-center rounded-xl bg-amber-500 py-3.5 text-[15px] font-semibold text-amber-950 active:opacity-90"
                        >
                          View on Amazon
                        </a>
                        <p className="text-center text-[11px] font-medium leading-snug text-zinc-500">
                          Opens in a new tab. Purchases may support Fetch via our affiliate link.
                        </p>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="w-full rounded-xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white active:opacity-90"
                          onClick={() => {
                            addOne(productSheet)
                          }}
                        >
                          Add to cart
                        </button>
                        {(cartQtyById[productSheet.id] ?? 0) > 0 ? (
                          <div className="flex items-center justify-center gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/80 py-2">
                            <span className="text-[13px] font-semibold text-zinc-600">In cart</span>
                            <div className="flex items-center gap-1 rounded-lg bg-white p-0.5 ring-1 ring-zinc-200/80">
                              <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center rounded-md text-[17px] font-semibold text-zinc-700 active:bg-zinc-100"
                                aria-label="Decrease quantity"
                                onClick={() =>
                                  setQty(productSheet.id, (cartQtyById[productSheet.id] ?? 0) - 1)
                                }
                              >
                                −
                              </button>
                              <span className="min-w-[1.5rem] text-center text-[15px] font-bold tabular-nums text-zinc-900">
                                {cartQtyById[productSheet.id] ?? 0}
                              </span>
                              <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center rounded-md text-[17px] font-semibold text-zinc-700 active:bg-zinc-100"
                                aria-label="Increase quantity"
                                onClick={() =>
                                  setQty(productSheet.id, (cartQtyById[productSheet.id] ?? 0) + 1)
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="w-full py-2 text-[14px] font-semibold text-zinc-600 active:text-zinc-900"
                          onClick={() => {
                            setProductSheet(null)
                            goCart()
                          }}
                        >
                          View cart
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="w-full py-2 text-[13px] font-semibold text-zinc-500 active:text-zinc-800"
                      onClick={() => setProductSheet(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {peerListingSheet
        ? createPortal(
            (() => {
              const selected = peerListingSheet
              const sellerEm = selected.sellerEmail?.trim().toLowerCase() ?? ''
              const viewerEm = sessionEmail.trim().toLowerCase()
              const isViewerSeller = Boolean(sellerEm && viewerEm && sellerEm === viewerEm)
              return (
                <div className="fixed inset-0 z-[200] flex flex-col justify-end" role="presentation">
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                    aria-label="Close listing details"
                    onClick={closePeerListingSheet}
                  />
                  <div
                    className="relative z-[1] flex max-h-[min(92dvh,40rem)] min-h-0 flex-col rounded-t-[1.25rem] border border-zinc-200/90 bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.12)]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="fetch-marketplace-peer-sheet-title"
                  >
                    <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden />
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-3">
                      {selected.images && selected.images.length > 0 ? (
                        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {[...selected.images]
                            .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
                            .map((im) => (
                              <img
                                key={im.url}
                                src={listingImageAbsoluteUrl(im.url)}
                                alt=""
                                className="h-44 w-44 shrink-0 rounded-2xl border border-zinc-200/80 object-cover shadow-sm"
                              />
                            ))}
                        </div>
                      ) : (
                        <div className="mb-3 flex h-36 items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-[12px] font-medium text-zinc-400">
                          No photos
                        </div>
                      )}
                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">
                        Community listing
                      </p>
                      <h2
                        id="fetch-marketplace-peer-sheet-title"
                        className="mt-1 text-[1.15rem] font-bold text-zinc-900"
                      >
                        {selected.title}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        {peerListingCompareAtCents(selected) > 0 &&
                        (selected.priceCents ?? 0) > 0 &&
                        peerListingCompareAtCents(selected) > (selected.priceCents ?? 0) ? (
                          <span className="text-[16px] font-bold tabular-nums text-zinc-400 line-through decoration-zinc-300">
                            {formatAudFromCents(peerListingCompareAtCents(selected))}
                          </span>
                        ) : null}
                        <p className="text-[20px] font-extrabold tabular-nums text-zinc-900">
                          {formatAudFromCents(selected.priceCents ?? 0)}
                        </p>
                        {peerListingSavingsPercent(selected) != null ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[12px] font-extrabold text-emerald-900">
                            Save {peerListingSavingsPercent(selected)}%
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-zinc-800">
                          {selected.condition || 'used'}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-zinc-800">
                          {selected.category || 'general'}
                        </span>
                        {selected.locationLabel?.trim() ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-900">
                            <PeerListingSheetMapPin className="h-3.5 w-3.5 shrink-0" />
                            {selected.locationLabel.trim()}
                          </span>
                        ) : null}
                        {selected.sku?.trim() ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-950">
                            SKU {selected.sku.trim()}
                          </span>
                        ) : null}
                        {selected.acceptsOffers ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900">
                            Offers welcome
                          </span>
                        ) : null}
                        {selected.fetchDelivery ? (
                          <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white">
                            Fetch delivery
                          </span>
                        ) : null}
                      </div>
                      {selected.profileAuthorId?.trim() ? (
                        <div className="mt-3 flex items-center gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-white text-lg leading-none">
                            {(() => {
                              const av = selected.profileAvatar?.trim()
                              if (av && /^https?:\/\//i.test(av)) {
                                return <img src={av} alt="" className="h-full w-full object-cover" />
                              }
                              return <span aria-hidden>{av && av.length <= 8 ? av : '🏪'}</span>
                            })()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Seller</p>
                            <p className="truncate text-[14px] font-semibold text-zinc-900">
                              {peerListingPublicSellerLine(selected) ?? '@seller'}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-[12px] font-bold text-white active:bg-zinc-800"
                            onClick={openSellerInDrops}
                          >
                            View in Drops
                          </button>
                        </div>
                      ) : null}
                      {selected.keywords?.trim() ? (
                        <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                          <span className="font-semibold text-zinc-600">Search terms: </span>
                          {selected.keywords.trim()}
                        </p>
                      ) : null}
                      <p className="mt-3 whitespace-pre-wrap text-[13px] leading-snug text-zinc-600">
                        {selected.description}
                      </p>
                      {sessionEmail && onOpenListingChat && !isViewerSeller ? (
                        <button
                          type="button"
                          disabled={peerCheckoutBusy}
                          className="mt-3 w-full rounded-xl border border-zinc-300 bg-white py-3 text-[15px] font-semibold text-zinc-900 shadow-sm active:bg-zinc-50 disabled:opacity-50"
                          onClick={() => void onOpenListingChat(selected.id)}
                        >
                          Message seller
                        </button>
                      ) : null}
                    </div>
                    <div className="shrink-0 border-t border-zinc-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                      {peerBuyErr ? (
                        <p className="mb-2 text-[12px] font-medium text-red-600">{peerBuyErr}</p>
                      ) : null}
                      {peerStripeBuy && import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ? (
                        <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                          <FetchStripePaymentElement
                            publishableKey={import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()}
                            clientSecret={peerStripeBuy.clientSecret}
                            submitLabel={peerCheckoutBusy ? '…' : 'Pay'}
                            disabled={peerCheckoutBusy}
                            errorText={peerBuyErr}
                            onError={(m) => setPeerBuyErr(m)}
                            onSuccess={() => {
                              void (async () => {
                                const stripe = peerStripeBuy
                                if (!stripe) return
                                setPeerCheckoutBusy(true)
                                setPeerBuyErr(null)
                                try {
                                  await waitForPaymentIntentServerConfirmed(stripe.paymentIntentId)
                                  closePeerListingSheet()
                                  void loadPeerListings()
                                } catch (e) {
                                  setPeerBuyErr(e instanceof Error ? e.message : 'Confirm failed')
                                } finally {
                                  setPeerCheckoutBusy(false)
                                }
                              })()
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={peerCheckoutBusy || isViewerSeller}
                          className="w-full rounded-xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                          onClick={() => void startPeerBuy(selected)}
                        >
                          {peerCheckoutBusy ? '…' : 'Buy now'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="mt-3 w-full py-2 text-[13px] font-semibold text-zinc-500 active:text-zinc-800"
                        onClick={closePeerListingSheet}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )
            })(),
            document.body,
          )
        : null}

      {sellerToolsOpen ? (
        <div className="absolute inset-0 z-[70] flex min-h-0 flex-col bg-zinc-100">
          <HomeShellBuySellPage
            bottomNav={bottomNav}
            onMenuAccount={onMenuAccount}
            onOpenListingChat={onOpenListingChat}
            onRequestHomeShellTab={onRequestHomeShellTab}
            onBookDriver={onBookDriver}
            overlayMode
            onOverlayClose={() => {
              setSellerToolsOpen(false)
              void loadPeerListings()
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

export const HomeShellMarketplacePage = memo(HomeShellMarketplacePageInner)
