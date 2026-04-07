import { memo, type ReactNode } from 'react'
import { AccountNavIconFilled, FetchEyesHomeIcon } from './icons/HomeShellNavIcons'

export type HomeShellBuySellPageProps = {
  bottomNav: ReactNode
  onMenuAccount?: () => void
}

function HomeShellBuySellPageInner({ bottomNav, onMenuAccount }: HomeShellBuySellPageProps) {
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
                Local listings — not the Fetch supplies shop
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 pb-6">
          <button
            type="button"
            className="flex flex-col items-start gap-1 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 px-4 py-4 text-left shadow-sm shadow-zinc-900/[0.04] transition-[transform,background] active:scale-[0.99] active:bg-zinc-100/90"
          >
            <span className="text-[15px] font-bold tracking-tight text-zinc-900">Browse listings</span>
            <span className="text-[13px] font-medium leading-snug text-zinc-500">
              Find items nearby — search and filters ship next.
            </span>
          </button>
          <button
            type="button"
            className="flex flex-col items-start gap-1 rounded-2xl border border-zinc-200/90 bg-white px-4 py-4 text-left shadow-sm shadow-zinc-900/[0.04] transition-[transform,background] active:scale-[0.99] active:bg-zinc-50"
          >
            <span className="text-[15px] font-bold tracking-tight text-zinc-900">List something</span>
            <span className="text-[13px] font-medium leading-snug text-zinc-500">
              Post a sale — photos, pricing, and pickup slots are coming.
            </span>
          </button>
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

export const HomeShellBuySellPage = memo(HomeShellBuySellPageInner)
