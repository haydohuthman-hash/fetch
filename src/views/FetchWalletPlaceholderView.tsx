import { useCallback } from 'react'

export type FetchWalletPlaceholderViewProps = {
  variant: 'cashOut' | 'credits'
  onBack: () => void
}

/**
 * Placeholder surfaces for Stripe Connect payouts and credits purchase — structured for future wiring.
 */
export default function FetchWalletPlaceholderView({ variant, onBack }: FetchWalletPlaceholderViewProps) {
  const title = variant === 'cashOut' ? 'Cash out' : 'Add credits'
  const subtitle =
    variant === 'cashOut'
      ? 'Connect a payout method and withdraw your marketplace earnings. This flow will link to Stripe Connect when enabled.'
      : 'Top up Fetch credits for bookings and marketplace purchases. Payment methods will appear here when billing is enabled.'

  const handleBack = useCallback(() => {
    onBack()
  }, [onBack])

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-950/90 via-zinc-950 to-black px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <header className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/90 backdrop-blur-sm active:scale-[0.97]"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </header>

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/35 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <p className="text-[13px] leading-relaxed text-emerald-100/85">{subtitle}</p>
        <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200/70">Coming next</p>
          <ul className="mt-2 space-y-1.5 text-[12px] text-white/70">
            {variant === 'cashOut' ? (
              <>
                <li>Stripe Connect Express onboarding</li>
                <li>Ledger → payout reconciliation</li>
                <li>Minimum threshold &amp; fee disclosure</li>
              </>
            ) : (
              <>
                <li>Stripe Payment Element checkout</li>
                <li>Credits ledger + balance sync</li>
                <li>Receipts in account history</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
