import type { ReactNode } from 'react'

export type TripSheetCardProps = {
  title: string
  subtitle?: ReactNode
  secondaryAction?: { label: string; onClick: () => void; ariaLabel?: string } | null
  helpAction?: { onClick: () => void } | null
  estimateStrip?: ReactNode
  footer?: ReactNode
  children: ReactNode
  /** When false, render children only (rollout / legacy). */
  enabled?: boolean
}

/**
 * Single trip-card shell: header row, optional estimate, scrollable body, pinned footer.
 */
export function TripSheetCard({
  title,
  subtitle,
  secondaryAction,
  helpAction,
  estimateStrip,
  footer,
  children,
  enabled = true,
}: TripSheetCardProps) {
  if (!enabled) return <>{children}</>

  return (
    <section
      className="fetch-trip-sheet-card flex min-h-0 w-full flex-1 flex-col gap-0"
      aria-label={title}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-fetch-charcoal/[0.06] pb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal">
              {title}
            </h2>
            {helpAction ? (
              <button
                type="button"
                onClick={helpAction.onClick}
                className="shrink-0 text-[11px] font-semibold text-fetch-charcoal/75 underline decoration-fetch-charcoal/25 underline-offset-2 transition-opacity hover:opacity-80"
              >
                Help
              </button>
            ) : null}
          </div>
          {subtitle ? (
            <div className="mt-1 text-[12px] font-medium leading-snug text-fetch-muted/90 [text-wrap:pretty]">
              {subtitle}
            </div>
          ) : null}
        </div>
        {secondaryAction ? (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            aria-label={secondaryAction.ariaLabel ?? secondaryAction.label}
            className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
          >
            {secondaryAction.label}
          </button>
        ) : null}
      </header>
      {estimateStrip ? <div className="mt-2.5 shrink-0">{estimateStrip}</div> : null}
      <div className="fetch-trip-sheet-card__body mt-2.5 min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
      {footer ? (
        <div className="fetch-trip-sheet-card__footer mt-3 shrink-0 border-t border-fetch-charcoal/[0.06] pt-3">
          {footer}
        </div>
      ) : null}
    </section>
  )
}
