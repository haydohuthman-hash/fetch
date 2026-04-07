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
import type { HardwareProduct } from '../lib/hardwareCatalog'
import {
  SUPPLY_PRODUCTS,
  bundleRetailTotalAud,
  getMarketplaceBundleForCategory,
  getSupplyProductsByCategory,
  resolveBundleProducts,
  type MarketplaceBundleDef,
  type SupplyCategoryId,
  type SupplyProduct,
} from '../lib/suppliesCatalog'
import { waitForPaymentIntentServerConfirmed } from '../lib/booking/api'
import { confirmDemoPaymentIntent, isStripePublishableConfigured } from '../lib/paymentCheckout'
import { storeCheckout, syncCheckoutCustomerSession } from '../lib/storeApi'
import { FetchEyesMarketplaceIntroIcon } from './icons/HomeShellNavIcons'
import { FetchStripePaymentElement } from './FetchStripePaymentElement'

export type HomeShellMarketplacePageProps = {
  bottomNav: React.ReactNode
  hardwareProducts: readonly HardwareProduct[]
  onMenuAccount?: () => void
}

function formatAud(n: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(n)
}

const CATEGORY_HEADLINE: Record<SupplyCategoryId, string> = {
  drinks: 'Drinks',
  cleaning: 'Cleaning supplies',
  packing: 'Moving supplies',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  livingRoom: 'Living room',
  laundry: 'Laundry',
  storage: 'Storage',
}

const MARKETPLACE_CATEGORY_ORDER: { id: SupplyCategoryId; label: string }[] = [
  { id: 'drinks', label: 'Drinks' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'packing', label: 'Moving' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'bathroom', label: 'Bath' },
  { id: 'livingRoom', label: 'Living' },
  { id: 'laundry', label: 'Laundry' },
  { id: 'storage', label: 'Storage' },
]

/** Title + what’s in the category (under each wide promo card). Delivery line is shared below. */
const CATEGORY_BANNER_LINES: Record<SupplyCategoryId, readonly [string, string]> = {
  drinks: [
    CATEGORY_HEADLINE.drinks,
    'Soft drinks, sparkling water, sports hydration, and chilled teas.',
  ],
  cleaning: [
    CATEGORY_HEADLINE.cleaning,
    'Bundles, sprays, mops, and cloths for a full-home reset.',
  ],
  packing: [
    CATEGORY_HEADLINE.packing,
    'Cartons, tape, wrap, and pads sized for local moves.',
  ],
  kitchen: [
    CATEGORY_HEADLINE.kitchen,
    'Kettles, utensils, dinnerware, and dish racks for day one.',
  ],
  bedroom: [
    CATEGORY_HEADLINE.bedroom,
    'Sheets, pillows, and blackout options for the first night.',
  ],
  bathroom: [
    CATEGORY_HEADLINE.bathroom,
    'Towels, shower curtains, mats, and dispensers in one pass.',
  ],
  livingRoom: [
    CATEGORY_HEADLINE.livingRoom,
    'Lighting, throws, and small touches that make it feel home.',
  ],
  laundry: [
    CATEGORY_HEADLINE.laundry,
    'Hampers, detergent, hangers, and airers for real loads.',
  ],
  storage: [
    CATEGORY_HEADLINE.storage,
    'Bins, vacuum bags, and cubes for closets and under-bed.',
  ],
}

const MARKETPLACE_DELIVERY_PROMO = 'Tomorrow or next day delivery available.'

function categoryBannerImageSrc(id: SupplyCategoryId): string | null {
  if (id === 'drinks') return '/marketplace/drinks-bundle-banner.png'
  if (id === 'cleaning') return '/marketplace/clean-bundle-banner.png'
  if (id === 'packing') return '/marketplace/moving-bundle-banner.png'
  if (id === 'kitchen') return '/marketplace/kitchen-bundle-banner.png'
  if (id === 'bedroom') return '/marketplace/bedroom-bundle-banner.png'
  if (id === 'bathroom') return '/marketplace/bathroom-bundle-banner.png'
  if (id === 'laundry') return '/marketplace/laundry-bundle-banner.png'
  if (id === 'storage') return '/marketplace/storage-bundle-banner.png'
  if (id === 'livingRoom') return '/marketplace/living-room-bundle-banner.png'
  return null
}

function CategoryBannerGradient({ id }: { id: SupplyCategoryId }) {
  const tone: Record<SupplyCategoryId, string> = {
    drinks: 'from-rose-100/85 via-orange-50/75 to-amber-50/85',
    cleaning: 'from-emerald-100/90 via-teal-50/80 to-cyan-50/90',
    packing: 'from-violet-100/90 via-indigo-50/80 to-sky-50/90',
    kitchen: 'from-amber-100/85 via-orange-50/75 to-rose-50/80',
    bedroom: 'from-fuchsia-100/80 via-purple-50/75 to-violet-50/85',
    bathroom: 'from-sky-100/85 via-blue-50/75 to-indigo-50/80',
    livingRoom: 'from-amber-50/90 via-stone-100/80 to-zinc-50/90',
    laundry: 'from-cyan-100/80 via-slate-50/75 to-blue-50/85',
    storage: 'from-slate-200/85 via-zinc-100/80 to-neutral-50/90',
  }
  return (
    <div
      className={[
        'flex h-full w-full items-center justify-center bg-gradient-to-br',
        tone[id],
      ].join(' ')}
      aria-hidden
    >
      <span className="px-6 text-center text-[15px] font-bold tracking-tight text-zinc-800/75">
        {CATEGORY_HEADLINE[id]}
      </span>
    </div>
  )
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
      className="fetch-home-marketplace-body pointer-events-none flex min-h-0 flex-1 flex-col bg-white select-none"
      aria-hidden
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-zinc-200/80 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 shrink-0 rounded-2xl bg-zinc-200/75" />
            <div className="h-7 w-16 rounded-lg bg-zinc-200/80" />
          </div>
        </header>

        <div className="shrink-0 border-b border-zinc-200/70 bg-white px-4 pb-2 pt-1">
          <div className="mx-auto flex h-[2.65rem] max-w-[min(100%,22rem)] gap-1">
            <div className="min-h-0 flex-1 rounded-[0.85rem] bg-zinc-200/45" />
            <div className="min-h-0 flex-1 rounded-[0.85rem] bg-zinc-200/30" />
          </div>
        </div>

        <div className="fetch-home-marketplace-grid-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white [-webkit-overflow-scrolling:touch] px-4 py-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="fetch-marketplace-boot-skel mb-8 last:mb-0">
              <div className="aspect-[21/9] w-full rounded-2xl bg-zinc-200/55" />
              <div className="mt-3 space-y-2">
                <div className="h-5 max-w-[14rem] rounded-md bg-zinc-200/80" />
                <div className="h-3.5 max-w-full rounded-md bg-zinc-200/60" />
                <div className="h-3.5 max-w-[92%] rounded-md bg-zinc-200/50" />
              </div>
            </div>
          ))}
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
type MarketplaceBrowseShelf = 'categories' | 'products'

function HomeShellMarketplacePageInner({ bottomNav }: HomeShellMarketplacePageProps) {
  const [category, setCategory] = useState<SupplyCategoryId>('drinks')
  const [browseShelf, setBrowseShelf] = useState<MarketplaceBrowseShelf>('categories')
  const [cartQtyById, setCartQtyById] = useState<Record<string, number>>({})
  const [subView, setSubView] = useState<MarketplaceSubView>('browse')
  const [productSheet, setProductSheet] = useState<SupplyProduct | null>(null)
  const [bundleSheet, setBundleSheet] = useState<MarketplaceBundleDef | null>(null)
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

  const productById = useMemo(
    () => new Map(SUPPLY_PRODUCTS.map((p) => [p.id, p] as const)),
    [],
  )

  const products = useMemo(() => getSupplyProductsByCategory(category), [category])

  const cartLines = useMemo(() => {
    const out: { product: SupplyProduct; qty: number }[] = []
    for (const [id, qty] of Object.entries(cartQtyById)) {
      if (qty <= 0) continue
      const product = productById.get(id)
      if (product) out.push({ product, qty })
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

  const activeBundle = useMemo(() => getMarketplaceBundleForCategory(category), [category])
  const activeBundleProducts = useMemo(
    () => (activeBundle ? resolveBundleProducts(activeBundle, productById) : []),
    [activeBundle, productById],
  )
  const activeBundleRetail = useMemo(
    () => bundleRetailTotalAud(activeBundleProducts),
    [activeBundleProducts],
  )

  const sheetBundleProducts = useMemo(
    () => (bundleSheet ? resolveBundleProducts(bundleSheet, productById) : []),
    [bundleSheet, productById],
  )
  const sheetBundleRetail = useMemo(
    () => bundleRetailTotalAud(sheetBundleProducts),
    [sheetBundleProducts],
  )

  const addBundleToCart = useCallback((bundle: MarketplaceBundleDef) => {
    setCartQtyById((prev) => {
      const next = { ...prev }
      for (const id of bundle.productIds) {
        next[id] = (next[id] ?? 0) + 1
      }
      return next
    })
    setBundleSheet(null)
    setCartEnterLoading(true)
    setCartOpenSeq((n) => n + 1)
    setSubView('cart')
  }, [])

  const goBrowse = useCallback(() => {
    setCompletedOrderId(null)
    setStripeStoreCheckout(null)
    setCheckoutError(null)
    setSubView('browse')
    setBrowseShelf('categories')
  }, [])
  const goCart = useCallback(() => {
    setCartEnterLoading(true)
    setCartOpenSeq((n) => n + 1)
    setSubView('cart')
  }, [])
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
    if (!bundleSheet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBundleSheet(null)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [bundleSheet])

  useEffect(() => {
    if (!productSheet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProductSheet(null)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [productSheet])

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

  const browseProductBannerSrc = categoryBannerImageSrc(category)

  return (
    <div
      className="fetch-home-marketplace-page absolute inset-0 z-[60] flex min-h-0 flex-col bg-white"
      role="main"
      aria-label="Fetch supplies marketplace"
      aria-busy={marketplaceBootLoading}
    >
        {marketplaceBootLoading ? (
          <MarketplaceBrowseBootSkeleton />
        ) : (
        <div className="fetch-home-marketplace-body flex min-h-0 flex-1 flex-col bg-white">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {subView === 'browse' ? (
              browseShelf === 'categories' ? (
                <header className="relative shrink-0 border-b border-zinc-200/80 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <FetchEyesMarketplaceIntroIcon className="h-9 w-9 shrink-0 text-zinc-900" />
                      <span className="fetch-home-map-brand-logo text-[1.35rem] font-bold leading-none tracking-[-0.03em] text-zinc-900">
                        Fetch
                      </span>
                    </div>
                    {cartItemCount > 0 ? (
                      <button
                        type="button"
                        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 transition-colors active:scale-[0.97] active:bg-zinc-100"
                        aria-label={`Open cart, ${cartItemCount} items`}
                        onClick={goCart}
                      >
                        <CartIcon />
                        <span className="absolute right-0.5 top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-bold tabular-nums text-white">
                          {cartItemCount > 99 ? '99+' : cartItemCount}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </header>
              ) : (
                <header className="relative shrink-0 border-b border-zinc-200/80 bg-white px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 active:bg-zinc-100"
                      aria-label="Back to categories"
                      onClick={() => setBrowseShelf('categories')}
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
                    <h1 className="fetch-home-map-brand-logo min-w-0 flex-1 text-[1.2rem] font-bold leading-tight tracking-[-0.03em] text-zinc-900">
                      {CATEGORY_HEADLINE[category]}
                    </h1>
                    {cartItemCount > 0 ? (
                      <button
                        type="button"
                        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 transition-colors active:scale-[0.97] active:bg-zinc-100"
                        aria-label={`Open cart, ${cartItemCount} items`}
                        onClick={goCart}
                      >
                        <CartIcon />
                        <span className="absolute right-0.5 top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-bold tabular-nums text-white">
                          {cartItemCount > 99 ? '99+' : cartItemCount}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </header>
              )
            ) : subView === 'cart' ? (
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
              browseShelf === 'categories' ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
                  <div className="fetch-home-marketplace-grid-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] px-4 pt-4">
                    <div className="flex flex-col gap-10 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
                      {MARKETPLACE_CATEGORY_ORDER.map((row) => {
                        const [line1, line2] = CATEGORY_BANNER_LINES[row.id]
                        const deliveryLine = MARKETPLACE_DELIVERY_PROMO
                        const imgSrc = categoryBannerImageSrc(row.id)
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => {
                              setCategory(row.id)
                              setBrowseShelf('products')
                            }}
                            className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left transition-opacity active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                            aria-label={`${row.label} supplies. ${deliveryLine} ${line2}`}
                          >
                            <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/80">
                              {imgSrc ? (
                                <img
                                  src={imgSrc}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  decoding="async"
                                  sizes="100vw"
                                />
                              ) : (
                                <CategoryBannerGradient id={row.id} />
                              )}
                            </div>
                            <div className="mt-3 space-y-1.5 px-0.5">
                              <p className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-zinc-900">
                                {line1}
                              </p>
                              <p className="text-[13px] font-semibold leading-snug text-emerald-900/90 [text-wrap:pretty]">
                                {deliveryLine}
                              </p>
                              <p className="text-[13px] font-medium leading-snug text-zinc-600 [text-wrap:pretty]">
                                {line2}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {cartItemCount > 0 ? (
                    <div className="shrink-0 border-t border-zinc-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
                      <MarketplaceViewCartButton
                        cartItemCount={cartItemCount}
                        onOpen={goCart}
                        ariaLabel={`View cart, ${cartItemCount} items, ${formatAud(cartTotalAud)}`}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="fetch-home-marketplace-grid-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white [-webkit-overflow-scrolling:touch]">
                      {activeBundle && activeBundleProducts.length > 0 ? (
                        browseProductBannerSrc ? (
                          <div className="shrink-0 border-b border-zinc-200/80 shadow-[0_10px_28px_-8px_rgba(15,23,42,0.14)]">
                            <button
                              type="button"
                              onClick={() => setBundleSheet(activeBundle)}
                              aria-label={`${activeBundle.title}. ${formatAud(activeBundle.bundlePriceAud)} bundle. View details.`}
                              className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left transition-opacity active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                            >
                              <div className="relative aspect-[21/9] w-full overflow-hidden bg-zinc-100">
                                <img
                                  src={browseProductBannerSrc}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  decoding="async"
                                  sizes="100vw"
                                />
                              </div>
                            </button>
                          </div>
                        ) : (
                          <div className="shrink-0 border-b border-zinc-100 bg-white px-3 py-3">
                            <button
                              type="button"
                              onClick={() => setBundleSheet(activeBundle)}
                              className="flex w-full items-center gap-3 rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50/60 via-white to-emerald-50/30 px-3 py-3 text-left shadow-sm shadow-violet-900/[0.04] transition-[transform,box-shadow] active:scale-[0.99] active:shadow-md"
                            >
                              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-violet-700">
                                  Bundle &amp; save
                                </span>
                                <span className="text-[14px] font-bold leading-tight tracking-tight text-zinc-900">
                                  {activeBundle.title}
                                </span>
                                <span className="text-[11px] font-medium leading-snug text-zinc-500">
                                  {formatAud(activeBundle.bundlePriceAud)} bundle ·{' '}
                                  <span className="line-through decoration-zinc-400/80">
                                    {formatAud(activeBundleRetail)}
                                  </span>{' '}
                                  separately
                                </span>
                              </div>
                              <span className="shrink-0 rounded-full bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white">
                                View
                              </span>
                            </button>
                          </div>
                        )
                      ) : null}

                      <div className="grid grid-cols-2 gap-1.5 px-2.5 py-2.5 pb-2">
                        {products.length === 0 ? (
                          <p className="col-span-2 py-10 text-center text-[13px] font-medium text-zinc-500">
                            No products in this category.
                          </p>
                        ) : (
                          products.map((p) => (
                            <article
                              key={p.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setProductSheet(p)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setProductSheet(p)
                                }
                              }}
                              className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-transparent bg-white ring-zinc-200/80 transition-[box-shadow,ring] focus-visible:outline focus-visible:ring-2 active:bg-zinc-50/80"
                            >
                              <div className="relative flex aspect-square w-full shrink-0 items-center justify-center bg-zinc-50/80">
                                <SupplyProductThumb
                                  src={p.coverImageUrl}
                                  alt={p.title}
                                  className="max-h-full max-w-full object-contain object-center p-2"
                                />
                                <button
                                  type="button"
                                  className="absolute bottom-1 right-1 z-[1] flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200/90 bg-white text-[16px] font-semibold leading-none text-zinc-900 shadow-sm shadow-zinc-900/10 transition-[transform,colors] active:scale-95 active:bg-zinc-50"
                                  aria-label={`Quick add ${p.title} to cart`}
                                  onClick={(ev) => {
                                    ev.stopPropagation()
                                    addOne(p)
                                  }}
                                >
                                  +
                                </button>
                              </div>
                              <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1.5">
                                <p className="text-[14px] font-extrabold leading-none tabular-nums tracking-tight text-zinc-900">
                                  {formatAud(p.priceAud)}
                                </p>
                                <h2 className="mt-1 line-clamp-2 min-w-0 text-[11px] font-bold leading-snug tracking-tight text-zinc-900">
                                  {p.title}
                                </h2>
                                <p className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-zinc-500">
                                  {p.subtitle}
                                </p>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                    {cartItemCount > 0 ? (
                      <div className="shrink-0 border-t border-zinc-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
                        <MarketplaceViewCartButton
                          cartItemCount={cartItemCount}
                          onOpen={goCart}
                          ariaLabel={`View cart, ${cartItemCount} items, ${formatAud(cartTotalAud)}`}
                        />
                      </div>
                    ) : null}
                  </div>
                </>
              )
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
          <div className="shrink-0 border-t border-black/[0.06] bg-white pb-[env(safe-area-inset-bottom,0px)]">
            {bottomNav}
          </div>
        ) : null}

      {bundleSheet && sheetBundleProducts.length > 0
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex flex-col justify-end" role="presentation">
              <button
                type="button"
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                aria-label="Close bundle details"
                onClick={() => setBundleSheet(null)}
              />
              <div
                className="relative z-[1] flex max-h-[min(88dvh,36rem)] flex-col rounded-t-[1.25rem] border border-zinc-200/90 bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.12)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="fetch-marketplace-bundle-sheet-title"
              >
                <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-violet-700">
                    Bundle &amp; save
                  </p>
                  <h2
                    id="fetch-marketplace-bundle-sheet-title"
                    className="mt-1 text-[1.25rem] font-bold leading-tight tracking-[-0.03em] text-zinc-900"
                  >
                    {bundleSheet.title}
                  </h2>
                  <p className="mt-2 text-[13px] font-medium leading-snug text-zinc-600">
                    {bundleSheet.marketing?.subtitle ?? bundleSheet.tagline}
                  </p>
                  {bundleSheet.marketing ? (
                    <>
                      <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        What&apos;s inside
                      </p>
                      <ul className="mt-2 list-disc space-y-1.5 border-t border-zinc-100 pt-3 pl-5 text-[13px] font-medium leading-snug text-zinc-700">
                        {bundleSheet.marketing.whatsInside.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        Perfect for
                      </p>
                      <ul className="mt-2 list-disc space-y-1.5 border-t border-zinc-100 pt-3 pl-5 text-[13px] font-medium leading-snug text-zinc-700">
                        {bundleSheet.marketing.perfectFor.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <p className="mt-4 text-[13px] font-semibold leading-snug text-zinc-800">
                        {bundleSheet.marketing.closing}
                      </p>
                    </>
                  ) : null}
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    {bundleSheet.marketing ? 'Included in your order' : 'What you get'}
                  </p>
                  <ul className="mt-2 space-y-3 border-t border-zinc-100 pt-3">
                    {sheetBundleProducts.map((p) => (
                      <li key={p.id} className="flex gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-50">
                          <SupplyProductThumb
                            src={p.coverImageUrl}
                            alt={p.title}
                            className="max-h-full max-w-full object-contain p-1"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold leading-snug text-zinc-900">{p.title}</p>
                          <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{p.subtitle}</p>
                          <p className="mt-1 text-[12px] font-semibold tabular-nums text-zinc-800">
                            {formatAud(p.priceAud)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-semibold text-zinc-500">If bought separately</span>
                      <span className="text-[13px] font-semibold tabular-nums line-through text-zinc-400">
                        {formatAud(sheetBundleRetail)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <span className="text-[14px] font-bold text-zinc-900">Bundle price</span>
                      <span className="text-[1.125rem] font-extrabold tabular-nums text-zinc-900">
                        {formatAud(bundleSheet.bundlePriceAud)}
                      </span>
                    </div>
                    {sheetBundleRetail > bundleSheet.bundlePriceAud ? (
                      <p className="mt-1.5 text-[12px] font-semibold text-emerald-700">
                        You save {formatAud(sheetBundleRetail - bundleSheet.bundlePriceAud)}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      className="w-full rounded-xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white active:opacity-90"
                      onClick={() => addBundleToCart(bundleSheet)}
                    >
                      Add bundle to cart
                    </button>
                    <button
                      type="button"
                      className="w-full py-2 text-[13px] font-semibold text-zinc-600 active:text-zinc-900"
                      onClick={() => setBundleSheet(null)}
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

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
                  <p className="mt-3 text-[1.35rem] font-extrabold tabular-nums tracking-tight text-zinc-900">
                    {formatAud(productSheet.priceAud)}
                  </p>
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
    </div>
  )
}

export const HomeShellMarketplacePage = memo(HomeShellMarketplacePageInner)
