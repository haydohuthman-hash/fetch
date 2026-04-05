import { useState } from 'react'
import type {
  BookingCustomerRating,
  BookingDriver,
  BookingJobType,
  BookingPaymentIntent,
  BookingPricing,
  BookingTimelineEntry,
} from '../../lib/assistant/types'
import { requiresDropoff } from '../../lib/assistant'

const JOB_LABEL: Record<BookingJobType, string> = {
  junkRemoval: 'Junk removal',
  deliveryPickup: 'Delivery / pickup',
  heavyItem: 'Heavy item',
  homeMoving: 'Home moving',
  helper: 'Helper / labour',
  cleaning: 'Cleaning',
}

function formatJobLabel(jobType: BookingJobType | null): string {
  if (!jobType) return 'Job'
  return JOB_LABEL[jobType] ?? jobType
}

function completedAtMs(timeline: BookingTimelineEntry[]): number | null {
  const row = timeline.find((e) => e.kind === 'completed')
  return row?.createdAt ?? null
}

function formatReceiptTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toLocaleString()
  }
}

export type BookingCompletionSummaryProps = {
  jobType: BookingJobType | null
  pickupAddressText: string
  dropoffAddressText: string
  pricing: BookingPricing | null
  paymentIntent: BookingPaymentIntent | null
  timeline: BookingTimelineEntry[]
  driver: BookingDriver | null
  customerRating: BookingCustomerRating | null
  /** False for local demo booking ids — rating is only persisted server-side. */
  canPersistRating: boolean
  onSubmitRating: (stars: 1 | 2 | 3 | 4 | 5, note: string | null) => Promise<void>
  ratingBusy: boolean
  ratingError: string | null
}

export function BookingCompletionSummary({
  jobType,
  pickupAddressText,
  dropoffAddressText,
  pricing,
  paymentIntent,
  timeline,
  driver,
  customerRating,
  canPersistRating,
  onSubmitRating,
  ratingBusy,
  ratingError,
}: BookingCompletionSummaryProps) {
  const [draftStars, setDraftStars] = useState<1 | 2 | 3 | 4 | 5 | null>(null)
  const [note, setNote] = useState('')
  const showDropoff = jobType != null && requiresDropoff(jobType)
  const doneMs = completedAtMs(timeline)
  const pi = paymentIntent
  const payOk = pi?.status === 'succeeded'

  return (
    <div className="mt-3 space-y-3 border-t border-white/[0.08] pt-3">
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-fetch-muted/80">
          Receipt summary
        </h3>
        <p className="mt-1 text-[11px] font-medium text-fetch-charcoal/90">{formatJobLabel(jobType)}</p>
        <p className="mt-1 text-[11px] leading-snug text-fetch-muted/90">
          <span className="font-semibold text-fetch-charcoal/80">Pickup: </span>
          {pickupAddressText.trim() || '—'}
        </p>
        {showDropoff ? (
          <p className="mt-0.5 text-[11px] leading-snug text-fetch-muted/90">
            <span className="font-semibold text-fetch-charcoal/80">Drop-off: </span>
            {dropoffAddressText.trim() || '—'}
          </p>
        ) : null}
        {driver?.name ? (
          <p className="mt-1 text-[11px] text-fetch-muted/85">
            <span className="font-semibold text-fetch-charcoal/80">Driver: </span>
            {driver.name}
            {driver.vehicle ? ` · ${driver.vehicle}` : ''}
          </p>
        ) : null}
        {doneMs != null ? (
          <p className="mt-1 text-[10px] text-fetch-muted/70">Completed {formatReceiptTime(doneMs)}</p>
        ) : null}
      </div>

      <div className="space-y-1 rounded-xl bg-black/[0.03] px-2.5 py-2 ring-1 ring-black/[0.06]">
        {pricing ? (
          <div className="flex flex-wrap items-baseline gap-1 text-[11px]">
            <span className="text-fetch-muted/80">Quote range</span>
            <span className="font-semibold text-fetch-charcoal">
              ${pricing.minPrice} – ${pricing.maxPrice} {pricing.currency}
            </span>
          </div>
        ) : null}
        {pi ? (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-[11px]">
              <span className="text-fetch-muted/80">Charged (prepaid)</span>
              <span className="font-semibold text-fetch-charcoal">
                ${pi.amount} {pi.currency}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-[11px]">
              <span className="text-fetch-muted/80">Payment status</span>
              <span className={payOk ? 'font-medium text-emerald-800/90' : 'font-medium text-red-700/90'}>
                {pi.status.replace(/_/g, ' ')}
              </span>
            </div>
            {!payOk && pi.lastError ? (
              <p className="text-[10px] font-medium text-red-700/85">{pi.lastError}</p>
            ) : null}
            <div className="text-[10px] leading-snug text-fetch-muted/75">
              Reference <span className="font-mono text-fetch-charcoal/80">{pi.id}</span>
              {pi.instrument?.last4 ? (
                <span>
                  {' '}
                  · {pi.instrument.brand ?? 'Card'} ·••• {pi.instrument.last4}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-fetch-muted/80">No payment record on this device.</p>
        )}
        <p className="pt-1 text-[10px] leading-snug text-fetch-muted/75 [text-wrap:pretty]">
          Balance due: $0 — your card was charged up to the quoted maximum at booking. Final totals may vary
          only if pricing rules change in a future release.
        </p>
      </div>

      <div>
        <h3 className="text-[12px] font-semibold text-fetch-charcoal">Rate your experience</h3>
        {customerRating ? (
          <p className="mt-1.5 text-[11px] text-fetch-muted/85">
            You rated this job {customerRating.stars}★
            {customerRating.note ? ` — “${customerRating.note}”` : ''}.
          </p>
        ) : !canPersistRating ? (
          <p className="mt-1.5 text-[11px] leading-snug text-fetch-muted/80 [text-wrap:pretty]">
            Ratings are saved when your booking exists on Fetch servers (not local demo previews).
          </p>
        ) : (
          <>
            <div className="mt-2 flex gap-1" role="group" aria-label="Star rating">
              {([1, 2, 3, 4, 5] as const).map((n) => {
                const active = (draftStars ?? 0) >= n
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={ratingBusy}
                    onClick={() => setDraftStars(n)}
                    className={`rounded-lg px-2 py-1 text-[16px] leading-none transition-opacity ${
                      active ? 'opacity-100' : 'opacity-35'
                    } disabled:opacity-40`}
                    aria-label={`${n} stars`}
                  >
                    ★
                  </button>
                )
              })}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 280))}
              disabled={ratingBusy}
              placeholder="Optional feedback (280 chars)"
              rows={2}
              className="mt-2 w-full resize-none rounded-xl border border-black/[0.08] bg-white/80 px-2.5 py-2 text-[11px] text-fetch-charcoal placeholder:text-fetch-muted/50"
            />
            <button
              type="button"
              disabled={ratingBusy || draftStars == null}
              onClick={() => {
                if (draftStars == null) return
                const trimmed = note.trim()
                void onSubmitRating(draftStars, trimmed.length ? trimmed : null)
              }}
              className="fetch-home-secondary-btn mt-2 w-full rounded-2xl px-3 py-2 text-center text-[12px] font-semibold transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {ratingBusy ? 'Sending…' : 'Submit rating'}
            </button>
            {ratingError ? (
              <p className="mt-1.5 text-[11px] font-medium text-red-700/85">{ratingError}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
