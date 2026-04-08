/**
 * Premium “early access” panel when the user is outside the SEQ pilot region
 * or location is unavailable — compact so it fits the half sheet without scrolling.
 */
export type SeqRegionComingSoonPanelProps = {
  onWatchDrops: () => void
  className?: string
  /** No coordinates (permission off, timeout, or unsupported) — extra nudge to enable location. */
  locationUnavailable?: boolean
}

const WAITLIST_HINT = '5,948 near you waiting'

export function SeqRegionComingSoonPanel({
  onWatchDrops,
  className = '',
  locationUnavailable = false,
}: SeqRegionComingSoonPanelProps) {
  return (
    <div
      className={[
        'fetch-seq-coming-soon fetch-seq-coming-soon--light flex flex-col gap-1 px-0.5 pb-0 pt-0 [text-wrap:pretty]',
        className,
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-white">
          Early access
        </span>
        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-700">
          SEQ pilot
        </span>
      </div>

      <div>
        <h2 className="text-[0.96rem] font-semibold leading-tight tracking-[-0.02em] text-zinc-900">
          Your city is next
        </h2>
        <p className="mt-0.5 text-[10px] font-medium leading-snug text-zinc-600">
          Fast crews are live in SEQ. Join now for first access when your zone unlocks.
        </p>
        {locationUnavailable ? (
          <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-medium leading-snug text-amber-950">
            Turn on location to preview your map.
          </p>
        ) : null}
      </div>

      <ul className="space-y-0 text-[9px] leading-tight text-zinc-700">
        <li className="flex gap-1">
          <span className="text-emerald-600" aria-hidden>
            ●
          </span>
          <span>Moves, junk, delivery in under 60 mins.</span>
        </li>
        <li className="flex gap-1">
          <span className="text-emerald-600" aria-hidden>
            ●
          </span>
          <span>Heavy items, helpers, cleaning on demand.</span>
        </li>
      </ul>

      <div className="rounded-lg bg-cyan-50/90 px-2 py-1">
        <p className="min-w-0 truncate text-[9px] font-medium text-cyan-900">
          <span className="fetch-seq-waitlist-pulse font-semibold tabular-nums text-cyan-700">
            {WAITLIST_HINT.split(' ')[0]}
          </span>
          {WAITLIST_HINT.slice(WAITLIST_HINT.indexOf(' '))}
        </p>
      </div>

      <button
        type="button"
        onClick={onWatchDrops}
        className="relative w-full overflow-hidden rounded-xl bg-black px-3 py-2 text-[12px] font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.28)] transition-[transform,filter] active:scale-[0.98] active:brightness-95"
      >
        Get priority access
      </button>
    </div>
  )
}
