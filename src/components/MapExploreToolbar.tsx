/**
 * Maps tab: Street View, drop pin at map center, mystery adventure.
 * Sits on the map (pointer-events) — keep clear of sheet + orb.
 */
export type MapExploreToolbarProps = {
  onStreetView: () => void
  onDropPin: () => void
  onMystery: () => void
  mysteryLoading?: boolean
}

export function MapExploreToolbar({
  onStreetView,
  onDropPin,
  onMystery,
  mysteryLoading = false,
}: MapExploreToolbarProps) {
  return (
    <div className="fetch-map-explore-toolbar pointer-events-none fixed right-3 top-0 z-[44] flex max-h-[min(52vh,28rem)] flex-col justify-start pt-[max(6rem,calc(env(safe-area-inset-top,0px)+4.75rem))] pr-[env(safe-area-inset-right,0px)]">
      <div className="pointer-events-auto flex flex-col gap-2">
      <button
        type="button"
        onClick={onStreetView}
        className="fetch-map-explore-tool-btn fetch-home-sheet-chrome-btn flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-transform active:scale-[0.94]"
        aria-label="Open Street View"
        title="Street View"
      >
        <StreetViewGlyph className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onDropPin}
        className="fetch-map-explore-tool-btn fetch-home-sheet-chrome-btn flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-transform active:scale-[0.94]"
        aria-label="Drop pin at map center"
        title="Drop pin"
      >
        <PinGlyph className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onMystery}
        disabled={mysteryLoading}
        className="fetch-map-explore-tool-btn fetch-home-sheet-chrome-btn flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-transform active:scale-[0.94] disabled:opacity-50"
        aria-label="Mystery adventure nearby"
        title="Mystery adventure"
      >
        <SparklesGlyph className="h-5 w-5" />
      </button>
      </div>
    </div>
  )
}

function StreetViewGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 10c0-1.5 1.2-2.7 2.7-2.7h2.6c1.5 0 2.7 1.2 2.7 2.7v1.3c0 .8-.4 1.5-1 1.9l-.9.6v1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" />
    </svg>
  )
}

function PinGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.25" stroke="currentColor" strokeWidth="1.65" />
    </svg>
  )
}

function SparklesGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.2 4.2L17 8l-3.8 1.8L12 14l-1.2-4.2L7 8l3.8-1.8L12 2zM19 13l.7 2.4L22 16l-2.3 1.1L19 19.5l-.7-2.4L16 16l2.3-1.1L19 13zM5 14l.9 3.1L9 18l-3.1 1.4L5 22.5 3.9 19.4 1 18l3.1-1.4L5 14z" />
    </svg>
  )
}
