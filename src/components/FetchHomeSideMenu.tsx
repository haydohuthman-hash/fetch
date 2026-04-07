import type { HardwareProduct } from '../lib/hardwareCatalog'

export type FetchHomeSideMenuProps = {
  open: boolean
  onClose: () => void
  /** Header title (default: Menu). */
  menuTitle?: string
  onAccount?: () => void
  /** e.g. Back to home — shown before Account when set. */
  primaryNav?: { label: string; onClick: () => void }
  onHelp: () => void
  onAlerts?: () => void
  onLegal?: () => void
  alertsUnreadCount?: number
  /** When false, hides the hardware carousel (driver / minimal menus). */
  showHardwareRail?: boolean
  products: readonly HardwareProduct[]
  onProductView: (product: HardwareProduct) => void
}

function previewGradient(style: HardwareProduct['previewStyle']) {
  switch (style) {
    case 'violet':
      return 'from-violet-600/35 via-fuchsia-500/25 to-transparent'
    case 'emerald':
      return 'from-emerald-600/35 via-teal-500/25 to-transparent'
    default:
      return 'from-slate-500/40 via-slate-600/20 to-transparent'
  }
}

export function FetchHomeSideMenu({
  open,
  onClose,
  menuTitle = 'Menu',
  onAccount,
  primaryNav,
  onHelp,
  onAlerts,
  onLegal,
  alertsUnreadCount = 0,
  showHardwareRail = true,
  products,
  onProductView,
}: FetchHomeSideMenuProps) {
  if (!open) return null

  return (
    <aside
      id="fetch-home-map-side-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fetch-home-map-side-menu-title"
      className="fetch-home-map-side-menu absolute left-0 top-0 flex h-full w-[85vw] max-w-md flex-col border-r border-white/[0.08] bg-[rgba(8,10,16,0.94)] shadow-[12px_0_48px_rgba(0,0,0,0.45)] backdrop-blur-xl backdrop-saturate-[1.2]"
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2
          id="fetch-home-map-side-menu-title"
          className="text-[15px] font-semibold tracking-[-0.02em] text-white/[0.94]"
        >
          {menuTitle}
        </h2>
        <button
          type="button"
          className="fetch-home-map-side-menu-dismiss rounded-full px-3 py-1.5 text-[13px] font-medium text-emerald-200/90 transition-colors hover:bg-white/[0.06]"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3 pb-2">
        {primaryNav ? (
          <button
            type="button"
            className="rounded-xl px-4 py-3 text-left text-[14px] font-medium text-white/[0.9] transition-colors hover:bg-white/[0.06]"
            onClick={() => {
              onClose()
              primaryNav.onClick()
            }}
          >
            {primaryNav.label}
          </button>
        ) : null}
        {onAccount ? (
          <button
            type="button"
            className="rounded-xl px-4 py-3 text-left text-[14px] font-medium text-white/[0.9] transition-colors hover:bg-white/[0.06]"
            onClick={() => {
              onClose()
              onAccount()
            }}
          >
            Account
          </button>
        ) : null}
        {onAlerts ? (
          <button
            type="button"
            className="relative rounded-xl px-4 py-3 text-left text-[14px] font-medium text-white/[0.9] transition-colors hover:bg-white/[0.06]"
            onClick={() => {
              onClose()
              onAlerts()
            }}
          >
            Alerts
            {alertsUnreadCount > 0 ? (
              <span className="ml-2 inline-flex min-w-[1.25rem] justify-center rounded-full bg-fetch-red px-1 text-[10px] font-bold text-white">
                {alertsUnreadCount > 99 ? '99+' : alertsUnreadCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-xl px-4 py-3 text-left text-[14px] font-medium text-white/[0.9] transition-colors hover:bg-white/[0.06]"
          onClick={() => {
            onClose()
            onHelp()
          }}
        >
          Help
        </button>
        {onLegal ? (
          <button
            type="button"
            className="rounded-xl px-4 py-3 text-left text-[14px] font-medium text-white/[0.9] transition-colors hover:bg-white/[0.06]"
            onClick={() => {
              onClose()
              onLegal()
            }}
          >
            Legal &amp; privacy
          </button>
        ) : null}
      </nav>

      {showHardwareRail ? (
      <div
        className="shrink-0 border-t border-white/[0.08] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
        role="region"
        aria-label="Fetch home hardware"
      >
        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
          Wall panels
        </p>
        <div
          className={[
            'flex gap-3 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]',
            '[@media(prefers-reduced-motion:no-preference)]:snap-x [@media(prefers-reduced-motion:no-preference)]:snap-mandatory',
          ].join(' ')}
        >
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onClose()
                onProductView(p)
              }}
              className={[
                'w-[min(11.5rem,72vw)] shrink-0 overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.05] text-left transition-[transform,background] active:scale-[0.98]',
                '[@media(prefers-reduced-motion:no-preference)]:snap-start',
              ].join(' ')}
            >
              <div
                className={[
                  'relative h-24 w-full bg-gradient-to-br',
                  previewGradient(p.previewStyle),
                ].join(' ')}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                    Touch
                  </span>
                </div>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[13px] font-semibold text-white/[0.92]">{p.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/50">
                  {p.subtitle}
                </p>
                <p className="mt-2 text-[12px] font-semibold text-emerald-200/90">
                  From ${p.priceAud} AUD
                </p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-violet-300/80">
                  View
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
      ) : null}
    </aside>
  )
}
