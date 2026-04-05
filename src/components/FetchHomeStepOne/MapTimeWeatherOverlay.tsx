import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { BRISBANE_CENTER } from './brisbaneMap'
import {
  fetchOpenMeteoForecast,
  wmoWeatherLabel,
  type OpenMeteoWeatherSnap,
} from './openMeteoClient'

const REFRESH_WEATHER_MS = 20 * 60 * 1000
const TICK_MS = 30_000

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

function MapTimeWeatherOverlayInner() {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(() => ({
    lat: BRISBANE_CENTER.lat,
    lng: BRISBANE_CENTER.lng,
  }))
  const [weather, setWeather] = useState<OpenMeteoWeatherSnap | null>(null)
  const [weatherError, setWeatherError] = useState(false)
  const [nowLabel, setNowLabel] = useState(() =>
    formatNow(Intl.DateTimeFormat().resolvedOptions().timeZone),
  )

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

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 top-0 z-[40] flex justify-center px-3 pt-[max(0.45rem,env(safe-area-inset-top))]"
      aria-live="polite"
    >
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
    </div>
  )
}

export const MapTimeWeatherOverlay = memo(MapTimeWeatherOverlayInner)
