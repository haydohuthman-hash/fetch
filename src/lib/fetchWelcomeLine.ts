/**
 * Builds a longer, friendly home welcome for TTS with local time + weather (Open-Meteo, no API key).
 */

const DEFAULT_LAT = -27.4698
const DEFAULT_LNG = 153.0251

function timeOfDayGreeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Natural date/time line for speech, e.g. "It's Tuesday, April 4, at 3:45 PM." */
export function formatCurrentDateTimeForSpeech(date: Date = new Date(), locale?: string): string {
  const loc = locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined)
  const dayWeek = new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(date)
  const monthDay = new Intl.DateTimeFormat(loc, { month: 'long', day: 'numeric' }).format(date)
  const time = new Intl.DateTimeFormat(loc, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
  return `It's ${dayWeek}, ${monthDay}, at ${time}.`
}

function wmoCodeToPhrase(code: number): string {
  if (code === 0) return 'clear skies'
  if (code === 1) return 'mainly clear weather'
  if (code === 2) return 'partly cloudy skies'
  if (code === 3) return 'overcast conditions'
  if (code === 45 || code === 48) return 'foggy conditions'
  if (code >= 51 && code <= 55) return 'light drizzle'
  if (code === 56 || code === 57) return 'freezing drizzle'
  if (code >= 61 && code <= 65) return 'rain'
  if (code === 66 || code === 67) return 'freezing rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain showers'
  if (code === 85 || code === 86) return 'snow showers'
  if (code >= 95 && code <= 99) return 'thunderstorms nearby'
  return 'mixed conditions'
}

type GeoCoords = { lat: number; lng: number }

/** Rough metro box — enough for personality lines, not geofencing. */
function isProbablyBrisbane(coords: GeoCoords): boolean {
  return (
    coords.lat >= -27.72 &&
    coords.lat <= -27.32 &&
    coords.lng >= 152.62 &&
    coords.lng <= 153.38
  )
}

/** Time- and place-aware aside woven into the welcome (TTS). */
function buildLocationTimePersonality(now: Date, coords: GeoCoords): string {
  const h = now.getHours()
  const bris = isProbablyBrisbane(coords)
  const chunks: string[] = []

  if (h >= 22 || h < 5) {
    chunks.push(
      "Late one, huh? If tonight's a stretch I can line something up for tomorrow instead.",
    )
  } else if (h >= 17 && h < 22) {
    chunks.push("Evening stretch — say what you need and we'll get it moving.")
  }

  if (bris) {
    const nightish = h >= 18 || h < 6
    chunks.push(
      nightish
        ? "Brisbane's humming tonight — plenty of drivers on the road."
        : "Solid driver coverage around Brisbane today — matching shouldn't take long.",
    )
  }

  return chunks.join(' ')
}

function getCoordsWithFallback(timeoutMs = 2000): Promise<GeoCoords> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ lat: DEFAULT_LAT, lng: DEFAULT_LNG })
      return
    }
    const done = (c: GeoCoords) => {
      clearTimeout(tid)
      resolve(c)
    }
    const tid = window.setTimeout(() => done({ lat: DEFAULT_LAT, lng: DEFAULT_LNG }), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => done({ lat: DEFAULT_LAT, lng: DEFAULT_LNG }),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: timeoutMs },
    )
  })
}

async function fetchWeatherSpeechPhrase(coords: GeoCoords): Promise<string> {
  const u = new URL('https://api.open-meteo.com/v1/forecast')
  u.searchParams.set('latitude', String(coords.lat))
  u.searchParams.set('longitude', String(coords.lng))
  u.searchParams.set('current', 'temperature_2m,weather_code')
  u.searchParams.set('wind_speed_unit', 'kmh')

  const ac = new AbortController()
  const abortT = window.setTimeout(() => ac.abort(), 3200)
  let res: Response
  try {
    res = await fetch(u.toString(), { signal: ac.signal })
  } finally {
    window.clearTimeout(abortT)
  }
  if (!res.ok) throw new Error('weather_http')
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number }
  }
  const t = data.current?.temperature_2m
  const code = data.current?.weather_code
  if (typeof t !== 'number' || typeof code !== 'number') throw new Error('weather_shape')

  const rounded = Math.round(t)
  const sky = wmoCodeToPhrase(code)
  return `Around your area it's about ${rounded} degrees with ${sky}.`
}

async function weatherPhraseWithFallback(coords: GeoCoords): Promise<string> {
  try {
    return await fetchWeatherSpeechPhrase(coords)
  } catch {
    return "I couldn't quite reach the weather service, but I'm ready whenever you are."
  }
}

export type HomeWelcomeOptions = {
  /** Signed-in user's first name, or null for guests */
  firstName: string | null
  /** Max wait for weather before using a short fallback line */
  weatherWaitMs?: number
}

/**
 * Longer friendly welcome including time-of-day, clock/calendar, and weather (best effort).
 */
export async function buildHomeWelcomeLine(options: HomeWelcomeOptions): Promise<string> {
  const { firstName, weatherWaitMs = 3200 } = options
  const now = new Date()
  const greeting = timeOfDayGreeting(now)
  const when = formatCurrentDateTimeForSpeech(now)

  const coords = await getCoordsWithFallback()

  const weatherLine = await Promise.race([
    weatherPhraseWithFallback(coords),
    new Promise<string>((resolve) =>
      window.setTimeout(
        () => resolve("Weather's taking a moment — I'll keep it quick."),
        weatherWaitMs,
      ),
    ),
  ])

  const personality = buildLocationTimePersonality(now, coords)

  if (firstName) {
    return [
      `Hi ${firstName}! ${greeting}.`,
      when,
      weatherLine,
      personality,
      `Great to see you again — I'm Fetch, here to make today easier.`,
      `Tap me to chat, choose a service to book and get a driver, or tap Nav for maps and directions.`,
    ]
      .filter((s) => s.trim().length > 0)
      .join(' ')
  }

  return [
    `${greeting}!`,
    when,
    weatherLine,
    personality,
    `I'm Fetch — thanks for stopping by.`,
    `Tap me to chat, pick a service to book and match a driver, or open Nav for turn-by-turn directions.`,
  ]
    .filter((s) => s.trim().length > 0)
    .join(' ')
}
