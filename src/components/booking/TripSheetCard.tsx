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
  /** Tighter header/body spacing (e.g. address entry). */
  dense?: boolean
  /**
   * Map-first booking: drop the large title row; keep a slim Back / Help row only (sheet `title`
   * stays for `aria-label` / screen readers).
   */
  hideTitleHeader?: boolean
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
  dense = false,
  hideTitleHeader = false,
}: TripSheetCardProps) {
  if (!enabled) return <>{children}</>

  const slimTopChrome =
    hideTitleHeader &&
    (secondaryAction != null || helpAction != null || subtitle != null)

  return (
    <section
      className="fetch-trip-sheet-card flex min-h-0 w-full flex-1 flex-col gap-0"
      aria-label={title}
    >
      {hideTitleHeader ? (
        slimTopChrome ? (
          <div className="flex shrink-0 flex-col gap-0.5 border-b border-fetch-charcoal/[0.04] pb-1 pt-0">
            <div className="flex items-center justify-between gap-2">
              {secondaryAction ? (
                <button
                  type="button"
                  onClick={secondaryAction.onClick}
                  aria-label={secondaryAction.ariaLabel ?? secondaryAction.label}
                  className="shrink-0 text-[11px] font-semibold text-fetch-muted underline decoration-fetch-muted/40 underline-offset-2"
                >
                  {secondaryAction.label}
                </button>
              ) : (
                <span className="min-w-0 shrink" aria-hidden />
              )}
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
              <div className="text-[11px] font-medium leading-snug text-fetch-muted/90 [text-wrap:pretty]">
                {subtitle}
              </div>
            ) : null}
          </div>
        ) : (
          <h2 className="sr-only">{title}</h2>
        )
      ) : (
        <header
          className={[
            'flex shrink-0 items-start justify-between gap-2 border-b border-fetch-charcoal/[0.06]',
            dense ? 'pb-1.5' : 'pb-2.5',
          ].join(' ')}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2
                className={[
                  'font-semibold leading-tight tracking-[-0.02em] text-fetch-charcoal',
                  dense ? 'text-[14px]' : 'text-[15px]',
                ].join(' ')}
              >
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
      )}
      {estimateStrip ? (
        <div className={dense ? 'mt-1.5 shrink-0' : 'mt-2.5 shrink-0'}>{estimateStrip}</div>
      ) : null}
      <div
        className={[
          'fetch-trip-sheet-card__body min-h-0 flex-1 overflow-y-auto',
          hideTitleHeader
            ? slimTopChrome
              ? dense
                ? 'mt-1'
                : 'mt-1.5'
              : dense
                ? 'mt-0.5'
                : 'mt-1'
            : dense
              ? 'mt-1.5'
              : 'mt-2.5',
        ].join(' ')}
      >
        {children}
      </div>
      {footer ? (
        <div
          className={[
            'fetch-trip-sheet-card__footer shrink-0 border-t border-fetch-charcoal/[0.06]',
            dense ? 'mt-2 border-fetch-charcoal/[0.05] pt-2' : 'mt-3 pt-3',
          ].join(' ')}
        >
          {footer}
        </div>
      ) : null}
    </section>
  )
}
