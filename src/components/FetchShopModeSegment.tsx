/**
 * Toggle between Fetch Shop supplies and peer buy & sell — lives under the Fetch Shop header.
 */
export type FetchShopMode = 'supplies' | 'peer'

export type FetchShopModeSegmentProps = {
  active: FetchShopMode
  onChange: (mode: FetchShopMode) => void
  className?: string
}

export function FetchShopModeSegment({ active, onChange, className = '' }: FetchShopModeSegmentProps) {
  return (
    <div
      className={['w-full', className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label="Shop mode"
    >
      <div className="flex rounded-full border border-zinc-200/90 bg-zinc-100/90 p-1 shadow-inner shadow-zinc-900/[0.02]">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'supplies'}
          className={[
            'min-h-[2.25rem] flex-1 rounded-full px-3 text-[13px] font-semibold transition-all',
            active === 'supplies'
              ? 'bg-white text-zinc-900 shadow-sm shadow-zinc-900/10'
              : 'text-zinc-600 active:bg-zinc-200/50',
          ].join(' ')}
          onClick={() => onChange('supplies')}
        >
          Supplies
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'peer'}
          className={[
            'min-h-[2.25rem] flex-1 rounded-full px-3 text-[13px] font-semibold transition-all',
            active === 'peer'
              ? 'bg-white text-zinc-900 shadow-sm shadow-zinc-900/10'
              : 'text-zinc-600 active:bg-zinc-200/50',
          ].join(' ')}
          onClick={() => onChange('peer')}
        >
          Buy &amp; sell
        </button>
      </div>
    </div>
  )
}
