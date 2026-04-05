/** Open-Meteo public API — no key. https://open-meteo.com */

export type OpenMeteoWeatherSnap = {
  currentTemp: number
  currentCode: number
  todayMax: number
  todayMin: number
  tomorrowMax: number
  tomorrowMin: number
  tomorrowCode: number
  /** IANA zone from API (e.g. Australia/Brisbane) */
  timezone: string
}

export function wmoWeatherLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Cloudy'
  if (code <= 48) return 'Fog'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow showers'
  if (code <= 99) return 'Storms'
  return 'Weather'
}

export async function fetchOpenMeteoForecast(
  lat: number,
  lng: number,
  signal: AbortSignal,
): Promise<OpenMeteoWeatherSnap> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('current', 'temperature_2m,weather_code')
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min')
  url.searchParams.set('forecast_days', '3')
  url.searchParams.set('timezone', 'auto')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) {
    throw new Error(`weather ${res.status}`)
  }
  const data = (await res.json()) as {
    timezone?: string
    current?: { temperature_2m?: number; weather_code?: number }
    daily?: {
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
    }
  }

  const tz = data.timezone ?? 'UTC'
  const cur = data.current
  const d = data.daily
  if (
    cur?.temperature_2m == null ||
    cur.weather_code == null ||
    !d?.temperature_2m_max?.length ||
    !d.temperature_2m_min?.length ||
    !d.weather_code?.length
  ) {
    throw new Error('weather parse')
  }

  const tomorrowMax = d.temperature_2m_max[1] ?? d.temperature_2m_max[0]
  const tomorrowMin = d.temperature_2m_min[1] ?? d.temperature_2m_min[0]
  const tomorrowCode = d.weather_code[1] ?? d.weather_code[0]

  return {
    currentTemp: cur.temperature_2m,
    currentCode: cur.weather_code,
    todayMax: d.temperature_2m_max[0]!,
    todayMin: d.temperature_2m_min[0]!,
    tomorrowMax,
    tomorrowMin,
    tomorrowCode,
    timezone: tz,
  }
}
