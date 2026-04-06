import { useMemo } from 'react'
import {
  loadHomeActivities,
  loadHomeAlerts,
  type HomeActivityEntry,
  type HomeAlertRecord,
} from '../lib/homeActivityFeed'

function formatWhen(at: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(at))
  } catch {
    return ''
  }
}

function priceLine(a: HomeActivityEntry): string | null {
  if (a.priceMin == null && a.priceMax == null) return null
  if (a.priceMin != null && a.priceMax != null && a.priceMin !== a.priceMax) {
    return `$${a.priceMin}–$${a.priceMax} AUD`
  }
  const n = a.priceMin ?? a.priceMax
  return n != null ? `$${n} AUD` : null
}

export function HomeShellActivityPanel({ refreshVersion }: { refreshVersion: number }) {
  const { activities, alerts } = useMemo(() => {
    void refreshVersion
    return {
      activities: loadHomeActivities(),
      alerts: loadHomeAlerts(),
    }
  }, [refreshVersion])

  const empty = activities.length === 0 && alerts.length === 0

  return (
    <div className="fetch-home-activity-panel flex w-full flex-col gap-3 px-0.5 pb-1 pt-0.5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-fetch-charcoal">Activity</h2>
        <p className="mt-0.5 text-[11px] font-medium leading-snug text-fetch-muted/90">
          Recent alerts and timeline from this device.
        </p>
      </div>

      {empty ? (
        <p className="rounded-2xl bg-fetch-soft-gray/80 px-3 py-4 text-center text-[12px] font-medium leading-snug text-fetch-muted [text-wrap:pretty]">
          Nothing here yet — bookings, quotes, and payments will show up as you use Fetch.
        </p>
      ) : null}

      {alerts.length > 0 ? (
        <section className="min-w-0" aria-label="Alerts">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-fetch-muted/80">
            Alerts
          </h3>
          <ul className="flex flex-col gap-2">
            {alerts.map((a: HomeAlertRecord) => (
              <li
                key={a.id}
                className={[
                  'rounded-2xl border border-black/[0.06] bg-white px-3 py-2.5 shadow-[0_4px_14px_rgba(0,0,0,0.04)]',
                  !a.read ? 'ring-1 ring-cyan-500/20' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <p className="text-[13px] font-semibold leading-snug text-fetch-charcoal">{a.title}</p>
                <p className="mt-0.5 text-[11px] font-medium leading-snug text-fetch-muted/90 [text-wrap:pretty]">
                  {a.body}
                </p>
                <p className="mt-1 text-[10px] font-medium text-fetch-muted/70">{formatWhen(a.at)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activities.length > 0 ? (
        <section className="min-w-0" aria-label="Timeline">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-fetch-muted/80">
            Timeline
          </h3>
          <ul className="flex flex-col gap-2">
            {activities.map((a: HomeActivityEntry) => (
              <li
                key={a.id}
                className="rounded-2xl border border-black/[0.06] bg-white px-3 py-2.5 shadow-[0_4px_14px_rgba(0,0,0,0.04)]"
              >
                <p className="text-[13px] font-semibold leading-snug text-fetch-charcoal">{a.title}</p>
                {a.subtitle ? (
                  <p className="mt-0.5 text-[11px] font-medium leading-snug text-fetch-muted/90 [text-wrap:pretty]">
                    {a.subtitle}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-fetch-muted/70">
                  <span>{formatWhen(a.at)}</span>
                  {priceLine(a) ? <span>{priceLine(a)}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
