import type { BookingPricing } from '../../lib/assistant/types'

export type TripPriceEstimateStripProps = {
  pricing: BookingPricing
}

/** Compact estimate row after route is firm (before / beside full quote UI). */
export function TripPriceEstimateStrip({ pricing }: TripPriceEstimateStripProps) {
  const main =
    pricing.totalPrice != null
      ? `$${pricing.totalPrice}`
      : `$${pricing.minPrice}–$${pricing.maxPrice}`

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-fetch-charcoal/10 bg-fetch-charcoal/[0.03] px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-fetch-muted/75">
        Estimate
      </span>
      <div className="text-right">
        <span className="text-[16px] font-bold tabular-nums tracking-[-0.02em] text-fetch-charcoal">
          {main}
        </span>
        <span className="ml-1 text-[10px] font-semibold text-fetch-muted/70">AUD</span>
      </div>
    </div>
  )
}
