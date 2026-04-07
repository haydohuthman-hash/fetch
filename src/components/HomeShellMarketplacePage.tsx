import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
} from 'react'
import type { HardwareProduct } from '../lib/hardwareCatalog'
import {
  SUPPLY_PRODUCTS,
  getSupplyProductsByCategory,
  type SupplyCategoryId,
  type SupplyProduct,
} from '../lib/suppliesCatalog'
import { FetchEyesHomeIcon } from './icons/HomeShellNavIcons'
import { HomeServiceTypeIllustration } from './icons/HomeServiceTypeIllustrations'

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
  cleaning: 'Cleaning supplies',
  packing: 'Moving supplies',
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

function HomeShellMarketplacePageInner({ bottomNav }: HomeShellMarketplacePageProps) {
  const [category, setCategory] = useState<SupplyCategoryId>('cleaning')
  const [cartQtyById, setCartQtyById] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)

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

  useEffect(() => {
    if (!cartOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCartOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cartOpen])

  return (
    <div
      className="fetch-home-marketplace-page absolute inset-0 z-[60] flex min-h-0 flex-col bg-white"
      role="main"
      aria-label="Marketplace"
    >
        <div className="fetch-home-marketplace-body flex min-h-0 flex-1 flex-row bg-white">
          <aside
            className="fetch-home-marketplace-rail flex w-[5.5rem] shrink-0 flex-col items-stretch border-r border-zinc-200/80 bg-zinc-50/90 px-2"
            aria-label="Marketplace categories"
          >
            <div
              className="flex w-full flex-col items-center pt-[max(0.75rem,env(safe-area-inset-top,0px))]"
              aria-hidden
            >
              <FetchEyesHomeIcon className="h-9 w-9 text-zinc-900" />
            </div>
            <div className="mt-3 flex min-h-0 flex-1 flex-col items-stretch gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                onClick={() => setCategory('cleaning')}
                className="flex min-h-[4.25rem] w-full flex-col items-center justify-center gap-1 rounded-2xl bg-white px-1 py-2 shadow-sm shadow-zinc-900/5 transition-colors active:scale-[0.98]"
                aria-label="Cleaning supplies"
                aria-pressed={category === 'cleaning'}
              >
                <HomeServiceTypeIllustration jobType="cleaning" className="h-11 w-11 shrink-0" />
                <span className="max-w-full text-center text-[9px] font-bold leading-tight tracking-tight text-zinc-800">
                  Cleaning
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCategory('packing')}
                className="flex min-h-[4.25rem] w-full flex-col items-center justify-center gap-1 rounded-2xl bg-white px-1 py-2 shadow-sm shadow-zinc-900/5 transition-colors active:scale-[0.98]"
                aria-label="Moving supplies"
                aria-pressed={category === 'packing'}
              >
                <HomeServiceTypeIllustration jobType="homeMoving" className="h-11 w-11 shrink-0" />
                <span className="max-w-full text-center text-[9px] font-bold leading-tight tracking-tight text-zinc-800">
                  Moving
                </span>
              </button>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="relative shrink-0 border-b border-zinc-200/80 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
              <div className="flex items-start justify-between gap-3">
                <h1 className="fetch-home-map-brand-logo min-w-0 flex-1 text-[1.25rem] font-bold leading-tight tracking-[-0.03em] text-zinc-900">
                  {CATEGORY_HEADLINE[category]}
                </h1>
                <button
                  type="button"
                  className="relative -mr-1 -mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 transition-colors active:scale-[0.97] active:bg-zinc-100"
                  aria-label={cartItemCount > 0 ? `Cart, ${cartItemCount} items` : 'Cart, empty'}
                  aria-expanded={cartOpen}
                  onClick={() => setCartOpen((v) => !v)}
                >
                  <CartIcon />
                  {cartItemCount > 0 ? (
                    <span className="absolute right-0.5 top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-bold tabular-nums text-white">
                      {cartItemCount > 99 ? '99+' : cartItemCount}
                    </span>
                  ) : null}
                </button>
              </div>

              {cartOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[65] bg-black/20"
                    aria-label="Close cart"
                    onClick={() => setCartOpen(false)}
                  />
                  <div
                    className="absolute right-2 top-[calc(100%-0.25rem)] z-[70] w-[min(calc(100vw-2rem),18rem)] max-h-[min(70dvh,24rem)] overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-lg shadow-zinc-900/10"
                    role="dialog"
                    aria-label="Shopping cart"
                  >
                    <div className="max-h-[min(70dvh,24rem)] overflow-y-auto overscroll-contain px-3 py-3">
                      {cartLines.length === 0 ? (
                        <p className="py-6 text-center text-[13px] font-medium text-zinc-500">
                          Your cart is empty.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {cartLines.map(({ product: p, qty }) => (
                            <li
                              key={p.id}
                              className="flex gap-2 border-b border-zinc-100 pb-3 last:border-0 last:pb-0"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold leading-snug text-zinc-900">
                                  {p.title}
                                </p>
                                <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500">
                                  {formatAud(p.priceAud)} each
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5">
                                  <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] font-semibold text-zinc-700 active:bg-white"
                                    aria-label={`Decrease ${p.title}`}
                                    onClick={() => setQty(p.id, qty - 1)}
                                  >
                                    −
                                  </button>
                                  <span className="min-w-[1.25rem] text-center text-[12px] font-bold tabular-nums text-zinc-900">
                                    {qty}
                                  </span>
                                  <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] font-semibold text-zinc-700 active:bg-white"
                                    aria-label={`Increase ${p.title}`}
                                    onClick={() => setQty(p.id, qty + 1)}
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="text-[11px] font-bold tabular-nums text-zinc-900">
                                  {formatAud(p.priceAud * qty)}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {cartLines.length > 0 ? (
                      <div className="border-t border-zinc-200/80 bg-zinc-50/80 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-semibold text-zinc-600">Total</span>
                          <span className="text-[14px] font-extrabold tabular-nums text-zinc-900">
                            {formatAud(cartTotalAud)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="mt-2 w-full rounded-xl bg-zinc-900 py-2.5 text-[13px] font-semibold text-white active:opacity-90"
                          onClick={() => setCartOpen(false)}
                        >
                          Continue shopping
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </header>

            <div className="fetch-home-marketplace-grid-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white [-webkit-overflow-scrolling:touch]">
              <div className="grid grid-cols-2 gap-1.5 px-2.5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {products.length === 0 ? (
                  <p className="col-span-2 py-10 text-center text-[13px] font-medium text-zinc-500">
                    No products in this category.
                  </p>
                ) : (
                  products.map((p) => (
                    <article
                      key={p.id}
                      className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-white"
                    >
                      <div className="flex h-[5.25rem] w-full shrink-0 items-center justify-center bg-zinc-50/80">
                        <SupplyProductThumb
                          src={p.coverImageUrl}
                          alt={p.title}
                          className="max-h-full max-w-full object-contain object-center p-1.5"
                        />
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1.5">
                        <div className="flex items-start justify-between gap-1.5">
                          <h2 className="line-clamp-2 min-w-0 flex-1 text-[11px] font-bold leading-snug tracking-tight text-zinc-900">
                            {p.title}
                          </h2>
                          <button
                            type="button"
                            className="relative -top-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-white text-[16px] font-semibold leading-none text-zinc-900 shadow-sm shadow-zinc-900/10 active:scale-95 active:bg-zinc-50"
                            aria-label={`Add ${p.title} to cart`}
                            onClick={() => addOne(p)}
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-px text-[14px] font-extrabold leading-none tabular-nums tracking-tight text-zinc-900">
                          {formatAud(p.priceAud)}
                        </p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {bottomNav ? (
          <div className="shrink-0 border-t border-black/[0.06] bg-white pb-[env(safe-area-inset-bottom,0px)]">
            {bottomNav}
          </div>
        ) : null}
    </div>
  )
}

export const HomeShellMarketplacePage = memo(HomeShellMarketplacePageInner)
