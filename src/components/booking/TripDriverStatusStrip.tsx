import type { BookingDriver } from '../../lib/assistant/types'

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

export type TripDriverStatusStripProps = {
  driver: BookingDriver | null
  statusLabel: string
  statusTone?: 'neutral' | 'emphasis'
  etaLine?: string | null
  detailLine?: string | null
  leading?: 'avatar' | 'spinner'
}

/**
 * Uber-style driver / matching row: avatar or spinner, name & vehicle, status + ETA.
 */
export function TripDriverStatusStrip({
  driver,
  statusLabel,
  statusTone = 'neutral',
  etaLine,
  detailLine,
  leading = 'avatar',
}: TripDriverStatusStripProps) {
  const name = driver?.name?.trim() || 'Finding a driver'
  const vehicleBits = [driver?.vehicle, driver?.rating != null ? `${driver.rating}★` : null].filter(
    Boolean,
  ) as string[]

  return (
    <div className="flex items-stretch gap-3 rounded-xl border border-fetch-charcoal/10 bg-fetch-charcoal/[0.035] px-3 py-2.5">
      {leading === 'spinner' ? (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fetch-charcoal/[0.06]">
          <div className="fetch-stage-spinner h-4 w-4 shrink-0 animate-spin rounded-full" aria-hidden />
        </div>
      ) : (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fetch-charcoal/[0.08] text-[12px] font-bold tracking-tight text-fetch-charcoal/90"
          aria-hidden
        >
          {initialsFromName(name)}
        </div>
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-[13px] font-semibold leading-tight text-fetch-charcoal">{name}</p>
        {vehicleBits.length > 0 ? (
          <p className="mt-0.5 truncate text-[11px] font-medium text-fetch-muted/85">{vehicleBits.join(' · ')}</p>
        ) : detailLine ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-fetch-muted/80">
            {detailLine}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1 text-right">
        <span
          className={[
            'inline-flex max-w-[9.5rem] items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight',
            statusTone === 'emphasis'
              ? 'bg-fetch-charcoal text-white'
              : 'bg-fetch-charcoal/[0.08] text-fetch-charcoal/85',
          ].join(' ')}
        >
          {statusLabel}
        </span>
        {etaLine ? (
          <span className="text-[11px] font-semibold tabular-nums text-fetch-charcoal/80">{etaLine}</span>
        ) : null}
      </div>
    </div>
  )
}
