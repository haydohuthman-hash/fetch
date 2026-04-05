import type { ReactNode } from 'react'

type AppleMapsNavRoutePanelProps = {
  destinationLabel: string
  etaMinutes: number
  distanceMeters: number
  onClose: () => void
  onGo: () => void
  onFromMyLocation: () => void
  children?: ReactNode
  footerLink?: ReactNode
}

function formatLegDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

function TransportIcon({
  label,
  active,
  children,
}: {
  label: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={!active}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      className={[
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors',
        active
          ? 'bg-white text-neutral-900 shadow-md ring-1 ring-black/8'
          : 'bg-neutral-200/90 text-neutral-400',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/**
 * Apple Maps–style route sheet: To / From, mode chips, ETA row, green GO.
 * Web app cannot match 3D / lane guidance; this matches the route planning sheet affordances.
 */
export function AppleMapsNavRoutePanel({
  destinationLabel,
  etaMinutes,
  distanceMeters,
  onClose,
  onGo,
  onFromMyLocation,
  children,
  footerLink,
}: AppleMapsNavRoutePanelProps) {
  const dist = formatLegDistance(distanceMeters)

  return (
    <div
      className="fetch-apple-nav-route-panel flex flex-col gap-0 rounded-[28px] bg-white text-neutral-900 shadow-[0_12px_48px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06]"
      data-sheet-no-drag
    >
      <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
        <span className="h-1 w-9 rounded-full bg-neutral-300/90" />
      </div>

      <div className="flex items-start gap-3 px-4 pb-1 pt-0.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-neutral-500">To</p>
          <h2 className="line-clamp-3 text-[22px] font-bold leading-[1.15] tracking-[-0.03em] text-neutral-950">
            {destinationLabel}
          </h2>
          <button
            type="button"
            onClick={onFromMyLocation}
            className="mt-1.5 text-left text-[15px] font-semibold text-[#007AFF] transition-opacity hover:opacity-80 active:opacity-70"
          >
            From My Location
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200/90 active:scale-[0.96]"
          aria-label="End directions"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div
        className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Travel mode"
      >
        <TransportIcon label="Driving" active>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11h14M5 11v8h2m12-8v8h2M7 19h10"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="7" cy="15" r="1.25" fill="currentColor" />
            <circle cx="17" cy="15" r="1.25" fill="currentColor" />
          </svg>
        </TransportIcon>
        <TransportIcon label="Walking">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M9 22v-6l-2-5 3-3 3 3-2 5v6M14 8l3 2 2 5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </TransportIcon>
        <TransportIcon label="Transit">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M8 6h8v10H8V6zM6 19h12M9 16h.01M15 16h.01"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </TransportIcon>
        <TransportIcon label="Cycling">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="6" cy="17" r="3" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="18" cy="17" r="3" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M6 17h4l2-7 3 3h3M14 10l-2 7"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </TransportIcon>
        <TransportIcon label="Ride">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 17h14v-2l-2-5H7l-2 5v2zM7 10V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </TransportIcon>
      </div>

      <div className="mx-4 mb-3 flex min-h-[5.5rem] items-center gap-3 rounded-[22px] bg-neutral-100/95 px-3.5 py-3 ring-1 ring-black/[0.04]">
        <div className="min-w-0 flex-1">
          <p className="text-[28px] font-bold leading-none tracking-[-0.04em] text-neutral-950 tabular-nums">
            {Math.max(1, etaMinutes)} min
          </p>
          <p className="mt-1.5 text-[14px] font-medium text-neutral-500">
            {dist} · Fastest route
          </p>
        </div>
        <button
          type="button"
          onClick={onGo}
          className="shrink-0 rounded-[20px] bg-[#34C759] px-9 py-3 text-[20px] font-bold tracking-wide text-white shadow-[0_4px_14px_rgba(52,199,89,0.45)] transition-[transform,filter] active:scale-[0.97] active:brightness-95"
        >
          GO
        </button>
      </div>

      {children ? <div className="border-t border-neutral-200/80 px-2 pb-2 pt-1">{children}</div> : null}

      {footerLink ? <div className="border-t border-neutral-200/80 px-4 py-2">{footerLink}</div> : null}
    </div>
  )
}
