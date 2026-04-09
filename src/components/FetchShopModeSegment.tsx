/**
 * Toggle between peer buy & sell and Fetch Shop supplies — Buy & sell is the first (left) option.
 * Flat layout: no pill backgrounds; active state is a bottom border + stronger text.
 */
export type FetchShopMode = 'supplies' | 'peer'

export type FetchShopModeSegmentProps = {
  active: FetchShopMode
  onChange: (mode: FetchShopMode) => void
  className?: string
}

export function FetchShopModeSegment({ active, onChange, className = '' }: FetchShopModeSegmentProps) {
  const tabClass = (isActive: boolean) =>
    [
      'flex-1 bg-transparent py-2 text-center text-[12px] font-semibold transition-colors',
      'border-b-2 -mb-px outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2',
      isActive ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 active:text-zinc-700',
    ].join(' ')

  return (
    <div className={['w-full border-b border-zinc-200/90', className].filter(Boolean).join(' ')} role="tablist" aria-label="Shop mode">
      <div className="flex w-full min-w-0">
        <button type="button" role="tab" aria-selected={active === 'peer'} className={tabClass(active === 'peer')} onClick={() => onChange('peer')}>
          Buy &amp; sell
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'supplies'}
          className={tabClass(active === 'supplies')}
          onClick={() => onChange('supplies')}
        >
          Supplies
        </button>
      </div>
    </div>
  )
}
