import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FetchHardwareShopFlow } from '../FetchHardwareShopFlow'
import { FetchHomeSideMenu } from '../FetchHomeSideMenu'
import {
  countUnreadHomeAlerts,
  loadHomeActivities,
  loadHomeAlerts,
  markAllHomeAlertsRead,
  type HomeActivityEntry,
  type HomeAlertRecord,
} from '../../lib/homeActivityFeed'
import type { HardwareProduct } from '../../lib/hardwareCatalog'
import { HARDWARE_PRODUCTS } from '../../lib/hardwareCatalog'
import { BRISBANE_CENTER } from './brisbaneMap'
import {
  fetchOpenMeteoForecast,
  wmoWeatherLabel,
  type OpenMeteoWeatherSnap,
} from './openMeteoClient'

const REFRESH_WEATHER_MS = 20 * 60 * 1000
const TICK_MS = 30_000

export type MapNavStatusStrip = {
  /** `explore` = traffic / map follow — not turn-by-turn. */
  layout?: 'route' | 'explore'
  /** Apple Maps–style black instruction card + white trip bar (chat driving nav only). */
  navChrome?: 'default' | 'apple'
  /** Whole-trip distance for the bottom summary bar (meters). */
  tripDistanceMeters?: number | null
  nextTurn: string | null
  /** e.g. "In 220 m" until the current maneuver */
  distanceToManeuverLabel?: string | null
  etaMinutes: number
  /** Local clock time at destination, e.g. "3:42 pm" */
  arrivalClock?: string | null
  trafficDelaySeconds: number | null
  /** Correlates `aria-live` updates when ETA or steps change */
  liveRegionKey: string
  /** When set, replaces the default ETA / traffic summary line (e.g. legacy overrides). */
  secondaryLine?: string | null
  exploreTitle?: string | null
  exploreSubtitle?: string | null
}

function formatTripDistanceMeters(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return ''
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

function formatNow(timeZone: string): string {
  const d = new Date()
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(d)
}

type MapTimeWeatherOverlayProps = {
  navStrip?: MapNavStatusStrip | null
  /** Side menu: jump to account / auth from parent shell. */
  onMenuAccount?: () => void
  /** Touch-panel catalog for the menu rail (defaults to `HARDWARE_PRODUCTS`). */
  hardwareProducts?: readonly HardwareProduct[]
}

function HamburgerIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M5 7h14M5 12h14M5 17h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MapTimeWeatherOverlayInner({
  navStrip = null,
  onMenuAccount,
  hardwareProducts = HARDWARE_PRODUCTS,
}: MapTimeWeatherOverlayProps) {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(() => ({
    lat: BRISBANE_CENTER.lat,
    lng: BRISBANE_CENTER.lng,
  }))
  const [weather, setWeather] = useState<OpenMeteoWeatherSnap | null>(null)
  const [weatherError, setWeatherError] = useState(false)
  const [nowLabel, setNowLabel] = useState(() =>
    formatNow(Intl.DateTimeFormat().resolvedOptions().timeZone),
  )
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const [feedPanel, setFeedPanel] = useState<'activity' | 'alerts' | null>(null)
  const [hardwareProduct, setHardwareProduct] = useState<HardwareProduct | null>(null)
  const [activityRows, setActivityRows] = useState<HomeActivityEntry[]>([])
  const [alertRows, setAlertRows] = useState<HomeAlertRecord[]>([])
  const [alertsUnreadMenu, setAlertsUnreadMenu] = useState(0)

  const dismissTopOverlay = useCallback(() => {
    if (hardwareProduct) {
      setHardwareProduct(null)
      return
    }
    if (feedPanel) {
      setFeedPanel(null)
      return
    }
    if (legalOpen) {
      setLegalOpen(false)
      return
    }
    if (helpOpen) {
      setHelpOpen(false)
      return
    }
    if (sideMenuOpen) {
      setSideMenuOpen(false)
    }
  }, [feedPanel, hardwareProduct, helpOpen, legalOpen, sideMenuOpen])

  const overlayOpen =
    sideMenuOpen ||
    helpOpen ||
    legalOpen ||
    feedPanel != null ||
    hardwareProduct != null

  useEffect(() => {
    if (sideMenuOpen) {
      setAlertsUnreadMenu(countUnreadHomeAlerts())
    }
  }, [sideMenuOpen])

  useEffect(() => {
    if (feedPanel === 'activity') {
      setActivityRows(loadHomeActivities())
    } else if (feedPanel === 'alerts') {
      markAllHomeAlertsRead()
      setAlertRows(loadHomeAlerts())
    }
  }, [feedPanel])

  useEffect(() => {
    if (!overlayOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissTopOverlay()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [overlayOpen, dismissTopOverlay])

  const timeZone = weather?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const tickClock = useCallback(() => {
    setNowLabel(formatNow(timeZone))
  }, [timeZone])

  useEffect(() => {
    tickClock()
    const id = window.setInterval(tickClock, TICK_MS)
    return () => window.clearInterval(id)
  }, [tickClock])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 12_000 },
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    let intervalId = 0

    const run = async () => {
      const ac = new AbortController()
      const t = window.setTimeout(() => ac.abort(), 14_000)
      try {
        const snap = await fetchOpenMeteoForecast(coords.lat, coords.lng, ac.signal)
        window.clearTimeout(t)
        if (!cancelled) {
          setWeather(snap)
          setWeatherError(false)
        }
      } catch {
        window.clearTimeout(t)
        if (!cancelled && !ac.signal.aborted) {
          setWeather(null)
          setWeatherError(true)
        }
      }
    }

    void run()
    intervalId = window.setInterval(() => void run(), REFRESH_WEATHER_MS)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [coords.lat, coords.lng])

  const summary = useMemo(() => {
    if (!weather) return null
    const cur = `${Math.round(weather.currentTemp)}°`
    const nowWx = `${cur} ${wmoWeatherLabel(weather.currentCode)}`
    const todayR = `Today ${Math.round(weather.todayMax)}°/${Math.round(weather.todayMin)}°`
    const tomR = `Tomorrow ${Math.round(weather.tomorrowMax)}°/${Math.round(weather.tomorrowMin)}°`
    /** Single-line copy for the bar */
    const inline = `${nowWx} · ${todayR} · ${tomR}`
    return { inline }
  }, [weather])

  const delayLabel =
    navStrip &&
    navStrip.trafficDelaySeconds != null &&
    navStrip.trafficDelaySeconds >= 60
      ? `+${Math.round(navStrip.trafficDelaySeconds / 60)} min traffic`
      : navStrip &&
          navStrip.trafficDelaySeconds != null &&
          navStrip.trafficDelaySeconds > 0
        ? 'light traffic'
        : null

  const exploreLayout = navStrip?.layout === 'explore'
  const appleDriving =
    navStrip?.layout === 'route' && navStrip.navChrome === 'apple'
  const tripDist =
    navStrip?.tripDistanceMeters != null && navStrip.tripDistanceMeters > 0
      ? formatTripDistanceMeters(navStrip.tripDistanceMeters)
      : ''
  const heroDistanceRaw = navStrip?.distanceToManeuverLabel?.replace(/^In\s+/i, '').trim() ?? ''
  const heroPrimary =
    appleDriving && heroDistanceRaw
      ? heroDistanceRaw
      : appleDriving
        ? `${Math.max(1, navStrip!.etaMinutes)} min`
        : ''

  return (
    <>
      {appleDriving && navStrip ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[max(9.5rem,calc(env(safe-area-inset-bottom)+8rem))] z-[55] flex justify-center px-4"
        >
          <div
            className="flex max-w-lg flex-1 items-center justify-between gap-3 rounded-[22px] bg-white px-4 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.06]"
            role="status"
            aria-live="polite"
          >
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold tabular-nums tracking-[-0.02em] text-neutral-900">
              {navStrip.arrivalClock ? (
                <span className="font-semibold">{navStrip.arrivalClock} arrival</span>
              ) : null}
              <span className="font-normal text-neutral-500">
                {navStrip.arrivalClock ? ' · ' : ''}
                {Math.max(1, navStrip.etaMinutes)} min
                {tripDist ? ` · ${tripDist}` : ''}
              </span>
            </p>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
              aria-hidden
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 15l6-6 6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-[40] flex flex-col items-center gap-1.5 px-3 pt-[max(0.45rem,env(safe-area-inset-top))]"
        aria-live="polite"
      >
        {navStrip ? (
          <div
            key={navStrip.liveRegionKey}
            className={[
              'flex max-w-[min(100%,36rem)] flex-col overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
              appleDriving
                ? 'gap-0 rounded-[22px] border border-white/10 bg-[#1c1c1e] px-4 pb-3 pt-3 backdrop-blur-xl'
                : 'gap-0.5 rounded-2xl border border-emerald-400/20 bg-[rgba(4,18,14,0.55)] px-3.5 py-2 backdrop-blur-md backdrop-saturate-[1.12]',
            ].join(' ')}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={exploreLayout ? 'Map and traffic' : 'Turn-by-turn navigation'}
          >
            {exploreLayout ? (
              <>
                <p className="line-clamp-2 text-[12px] font-semibold leading-snug tracking-[-0.02em] text-white/[0.94]">
                  {navStrip.exploreTitle ?? 'Map'}
                </p>
                {navStrip.exploreSubtitle ? (
                  <p className="line-clamp-2 text-[11px] font-medium leading-snug text-emerald-100/82">
                    {navStrip.exploreSubtitle}
                  </p>
                ) : null}
              </>
            ) : appleDriving ? (
              <>
                <div className="mb-2.5 flex justify-center gap-1" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={[
                        'h-1 rounded-full',
                        i >= 3 ? 'w-7 bg-white/88' : 'w-6 bg-white/22',
                      ].join(' ')}
                    />
                  ))}
                </div>
                <p className="text-[32px] font-bold leading-[1.05] tracking-[-0.04em] text-white tabular-nums">
                  {heroPrimary}
                </p>
                {navStrip.nextTurn ? (
                  <p className="mt-2 line-clamp-3 text-[16px] font-medium leading-snug text-white/[0.92]">
                    {navStrip.nextTurn}
                  </p>
                ) : null}
                <p className="mt-2 text-[13px] font-medium tabular-nums text-white/45">
                  {navStrip.secondaryLine != null && navStrip.secondaryLine !== '' ? (
                    navStrip.secondaryLine
                  ) : (
                    <>
                      {Math.max(1, navStrip.etaMinutes)} min
                      {navStrip.arrivalClock ? ` · Arrive ${navStrip.arrivalClock}` : ''}
                      {delayLabel ? ` · ${delayLabel}` : ''}
                    </>
                  )}
                </p>
                <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-white/22" aria-hidden />
              </>
            ) : (
              <>
                {navStrip.nextTurn ? (
                  <p className="line-clamp-3 text-[12px] font-semibold leading-snug tracking-[-0.02em] text-white/[0.94]">
                    {navStrip.nextTurn}
                  </p>
                ) : null}
                {navStrip.distanceToManeuverLabel ? (
                  <p className="text-[11px] font-semibold tabular-nums tracking-[-0.01em] text-emerald-200/90">
                    {navStrip.distanceToManeuverLabel}
                  </p>
                ) : null}
                <p className="text-[11px] font-medium tabular-nums text-emerald-100/85">
                  {navStrip.secondaryLine != null && navStrip.secondaryLine !== '' ? (
                    navStrip.secondaryLine
                  ) : (
                    <>
                      {Math.max(1, navStrip.etaMinutes)} min
                      {navStrip.arrivalClock ? ` · Arrive ${navStrip.arrivalClock}` : ''}
                      {delayLabel ? ` · ${delayLabel}` : !navStrip.arrivalClock ? ' · roads clear' : ''}
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        ) : null}
        {!appleDriving ? (
      <div className="fetch-map-time-weather-pill flex max-w-[min(100%,36rem)] flex-row flex-nowrap items-center gap-2 overflow-hidden rounded-full border border-white/[0.1] bg-[rgba(6,6,12,0.52)] py-1.5 pl-3.5 pr-3 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md backdrop-saturate-[1.15]">
        <span className="fetch-map-time-weather-time shrink-0 text-[12px] font-semibold tabular-nums tracking-[-0.02em] text-white/[0.94]">
          {nowLabel}
        </span>
        <span className="fetch-map-time-weather-divider h-3.5 w-px shrink-0 bg-white/15" aria-hidden />
        {summary ? (
          <span className="fetch-map-time-weather-wx min-w-0 flex-1 truncate text-[11.5px] font-medium text-white/[0.78]">
            {summary.inline}
          </span>
        ) : weatherError ? (
          <span className="fetch-map-time-weather-muted min-w-0 truncate text-[11px] font-medium text-white/45">
            Weather unavailable
          </span>
        ) : (
          <span className="fetch-map-time-weather-muted min-w-0 truncate text-[11px] font-medium text-white/45">
            Loading weather…
          </span>
        )}
      </div>
        ) : null}
        <div className="fetch-home-map-top-actions pointer-events-auto mt-0.5 flex w-full max-w-[min(100%,36rem)] flex-row items-center justify-between gap-2">
          <button
            type="button"
            id="fetch-home-map-menu-trigger"
            className="fetch-home-map-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[rgba(6,6,12,0.52)] text-white/[0.92] shadow-[0_6px_20px_rgba(0,0,0,0.28)] backdrop-blur-md backdrop-saturate-[1.15] transition-[transform,colors] active:scale-[0.97]"
            aria-label="Open menu"
            aria-expanded={sideMenuOpen}
            aria-controls="fetch-home-map-side-menu"
            onClick={() => {
              setHelpOpen(false)
              setSideMenuOpen(true)
            }}
          >
            <HamburgerIcon />
          </button>
          <button
            type="button"
            className="fetch-home-map-help-btn rounded-full border border-white/[0.12] bg-[rgba(6,6,12,0.52)] px-4 py-2 text-[12px] font-semibold tracking-[-0.02em] text-white/[0.92] shadow-[0_6px_20px_rgba(0,0,0,0.28)] backdrop-blur-md backdrop-saturate-[1.15] transition-[transform,colors] active:scale-[0.97]"
            onClick={() => {
              setSideMenuOpen(false)
              setHelpOpen(true)
            }}
          >
            Help
          </button>
        </div>
    </div>

      {typeof document !== 'undefined' && sideMenuOpen
        ? createPortal(
            <div className="fetch-home-map-menu-root fixed inset-0 z-[56]">
              <button
                type="button"
                className="absolute inset-0 bg-black/40 backdrop-blur-md transition-opacity"
                aria-label="Close menu"
                onClick={() => setSideMenuOpen(false)}
              />
              <FetchHomeSideMenu
                open
                onClose={() => setSideMenuOpen(false)}
                onAccount={onMenuAccount}
                onHelp={() => setHelpOpen(true)}
                onActivity={() => setFeedPanel('activity')}
                onAlerts={() => setFeedPanel('alerts')}
                onLegal={() => setLegalOpen(true)}
                alertsUnreadCount={alertsUnreadMenu}
                products={hardwareProducts}
                onProductView={(p) => setHardwareProduct(p)}
              />
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && helpOpen
        ? createPortal(
            <div className="fetch-home-map-help-root fixed inset-0 z-[58] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-md"
                aria-label="Close help"
                onClick={() => setHelpOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fetch-home-map-help-title"
                className="fetch-home-map-help-dialog relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[rgba(10,12,18,0.96)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <h2
                  id="fetch-home-map-help-title"
                  className="text-[16px] font-semibold tracking-[-0.02em] text-white/[0.94]"
                >
                  Quick tips
                </h2>
                <ul className="mt-3 list-disc space-y-2 pl-4 text-[13px] leading-relaxed text-white/[0.78]">
                  <li>Tap the orb to talk or type what you need.</li>
                  <li>Drag the sheet up for services, maps, and booking.</li>
                  <li>Use the menu for account and this help panel.</li>
                </ul>
                <button
                  type="button"
                  className="mt-5 w-full rounded-xl bg-emerald-500/90 py-2.5 text-[14px] font-semibold text-emerald-950 transition-colors hover:bg-emerald-400/95"
                  onClick={() => setHelpOpen(false)}
                >
                  Got it
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && legalOpen
        ? createPortal(
            <div className="fetch-home-map-legal-root fixed inset-0 z-[58] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-md"
                aria-label="Close legal"
                onClick={() => setLegalOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fetch-home-map-legal-title"
                className="relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[rgba(10,12,18,0.96)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <h2
                  id="fetch-home-map-legal-title"
                  className="text-[16px] font-semibold tracking-[-0.02em] text-white/[0.94]"
                >
                  Legal &amp; privacy
                </h2>
                <p className="mt-3 text-[13px] leading-relaxed text-white/[0.72]">
                  Fetch respects your privacy. Review our policies before purchasing hardware or using
                  location features.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <a
                    href="https://fetch.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-center text-[14px] font-medium text-emerald-200/95 transition-colors hover:bg-white/[0.08]"
                  >
                    Privacy (web)
                  </a>
                  <a
                    href="https://fetch.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-center text-[14px] font-medium text-emerald-200/95 transition-colors hover:bg-white/[0.08]"
                  >
                    Terms (web)
                  </a>
                </div>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl bg-white/[0.08] py-2.5 text-[14px] font-semibold text-white/[0.88] transition-colors hover:bg-white/[0.12]"
                  onClick={() => setLegalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && feedPanel === 'activity'
        ? createPortal(
            <div className="fetch-home-map-activity-root fixed inset-0 z-[58] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-md"
                aria-label="Close activity"
                onClick={() => setFeedPanel(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fetch-home-map-activity-title"
                className="relative z-10 flex max-h-[min(80dvh,520px)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[rgba(10,12,18,0.96)] shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <div className="border-b border-white/[0.08] px-5 py-4">
                  <h2
                    id="fetch-home-map-activity-title"
                    className="text-[16px] font-semibold tracking-[-0.02em] text-white/[0.94]"
                  >
                    Activity
                  </h2>
                  <p className="mt-1 text-[12px] text-white/50">Recent jobs and payments on this device</p>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  {activityRows.length === 0 ? (
                    <li className="px-2 py-8 text-center text-[13px] text-white/45">No activity yet</li>
                  ) : (
                    activityRows.map((row) => (
                      <li
                        key={row.id}
                        className="mb-2 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5"
                      >
                        <p className="text-[13px] font-semibold text-white/[0.9]">{row.title}</p>
                        {row.subtitle ? (
                          <p className="mt-0.5 text-[12px] text-white/55">{row.subtitle}</p>
                        ) : null}
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
                          {new Date(row.at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
                <div className="border-t border-white/[0.08] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    className="w-full rounded-xl bg-white/[0.08] py-2.5 text-[14px] font-semibold text-white/[0.88]"
                    onClick={() => setFeedPanel(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && feedPanel === 'alerts'
        ? createPortal(
            <div className="fetch-home-map-alerts-root fixed inset-0 z-[58] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-md"
                aria-label="Close alerts"
                onClick={() => setFeedPanel(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fetch-home-map-alerts-title"
                className="relative z-10 flex max-h-[min(80dvh,520px)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[rgba(10,12,18,0.96)] shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <div className="border-b border-white/[0.08] px-5 py-4">
                  <h2
                    id="fetch-home-map-alerts-title"
                    className="text-[16px] font-semibold tracking-[-0.02em] text-white/[0.94]"
                  >
                    Alerts
                  </h2>
                  <p className="mt-1 text-[12px] text-white/50">Marked as read when you open this list</p>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  {alertRows.length === 0 ? (
                    <li className="px-2 py-8 text-center text-[13px] text-white/45">No alerts</li>
                  ) : (
                    alertRows.map((row) => (
                      <li
                        key={row.id}
                        className="mb-2 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5"
                      >
                        <p className="text-[13px] font-semibold text-white/[0.9]">{row.title}</p>
                        <p className="mt-1 text-[12px] leading-snug text-white/60">{row.body}</p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
                          {new Date(row.at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
                <div className="border-t border-white/[0.08] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    className="w-full rounded-xl bg-white/[0.08] py-2.5 text-[14px] font-semibold text-white/[0.88]"
                    onClick={() => setFeedPanel(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <FetchHardwareShopFlow
        key={hardwareProduct?.id ?? 'closed'}
        product={hardwareProduct}
        onDismiss={() => setHardwareProduct(null)}
      />
    </>
  )
}

export const MapTimeWeatherOverlay = memo(MapTimeWeatherOverlayInner)
