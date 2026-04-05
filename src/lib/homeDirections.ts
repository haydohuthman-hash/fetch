/**
 * Shared Google Maps Directions helpers for traffic-aware routing on the home map.
 */

export function stripDirectionsHtml(html: string): string {
  if (!html) return ''
  if (typeof document === 'undefined') {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim()
}

export function drivingTrafficDirectionsRequest(
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
): google.maps.DirectionsRequest {
  return {
    origin,
    destination,
    travelMode: google.maps.TravelMode.DRIVING,
    drivingOptions: {
      departureTime: new Date(),
      trafficModel: google.maps.TrafficModel.BEST_GUESS,
    },
  }
}

export function legDurationTrafficAndDistance(leg: google.maps.DirectionsLeg | undefined): {
  distanceMeters: number
  durationSeconds: number
  baseDurationSeconds: number
  trafficDelaySeconds: number | null
} {
  if (!leg) {
    return {
      distanceMeters: 0,
      durationSeconds: 0,
      baseDurationSeconds: 0,
      trafficDelaySeconds: null,
    }
  }
  const base = leg.duration?.value ?? 0
  const inTraffic = leg.duration_in_traffic?.value
  const distanceMeters = leg.distance?.value ?? 0
  const delay =
    inTraffic != null && base > 0 && inTraffic > base ? inTraffic - base : null
  const durationSeconds =
    inTraffic != null && inTraffic > 0 ? inTraffic : base
  return {
    distanceMeters,
    durationSeconds,
    baseDurationSeconds: base,
    trafficDelaySeconds: delay,
  }
}

export function firstStepPlainInstruction(
  route: google.maps.DirectionsRoute | undefined,
): string | null {
  const step = route?.legs?.[0]?.steps?.[0]
  if (!step?.instructions) return null
  const t = stripDirectionsHtml(step.instructions)
  return t || null
}

export function overviewPathFromRoute(
  route: google.maps.DirectionsRoute,
): google.maps.LatLngLiteral[] {
  const overview = route.overview_path ?? []
  return overview.map((ll) => ({ lat: ll.lat(), lng: ll.lng() }))
}

/** Lightweight step row for turn-by-turn UI (client-side only). */
export type DirectionsStepLite = {
  instruction: string
  distanceMeters: number
  end: google.maps.LatLngLiteral
  maneuver?: string
}

export function extractLegStepsFromLeg(
  leg: google.maps.DirectionsLeg | undefined,
): DirectionsStepLite[] {
  if (!leg?.steps?.length) return []
  const out: DirectionsStepLite[] = []
  for (const s of leg.steps) {
    const loc = s.end_location
    if (!loc || !s.instructions) continue
    const instruction = stripDirectionsHtml(s.instructions)
    if (!instruction) continue
    out.push({
      instruction,
      distanceMeters: s.distance?.value ?? 0,
      end: { lat: loc.lat(), lng: loc.lng() },
      maneuver: s.maneuver || undefined,
    })
  }
  return out
}

const R = 6371000

/** Stable pseudo-random offset from pickup for simulated driver anchor (deterministic per booking id). */
export function stableDriverAnchorFromPickup(
  bookingId: string,
  pickup: google.maps.LatLngLiteral,
): google.maps.LatLngLiteral {
  let h = 0
  for (const c of bookingId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const angle = ((h % 360) * Math.PI) / 180
  const dist = 0.009 + (h % 800) / 50000
  return {
    lat: pickup.lat + Math.sin(angle) * dist,
    lng: pickup.lng + Math.cos(angle) * dist,
  }
}

function toRad(d: number): number {
  return (d * Math.PI) / 180
}

/**
 * Extract driving origin/destination phrases from home chat text.
 * Used when the server does not return `navigation` but the user clearly named places.
 */
export function parseDrivingEndpointsFromUserText(raw: string): {
  originText?: string
  destText: string
} | null {
  const text = raw.trim()
  if (text.length < 3) return null

  const fromTo = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/is)
  if (fromTo) {
    const a = fromTo[1]!.trim().replace(/\s+/g, ' ')
    const b = fromTo[2]!.trim().replace(/\s+/g, ' ')
    if (a.length >= 3 && b.length >= 3) return { originText: a, destText: b }
  }

  const driveTo = text.match(/^(?:drive|nav(?:igate)?|directions?)\s+(?:me\s+)?to\s+(.+)/i)
  if (driveTo) {
    const d = driveTo[1]!.trim()
    if (d.length >= 3) return { destText: d }
  }

  const parts = text.split(/\s+to\s+/i)
  if (parts.length === 2) {
    const a = parts[0]!.trim()
    const b = parts[1]!.trim()
    const looksAddressy =
      /\d/.test(text) ||
      /\b(st|street|rd|road|ave|avenue|dr|drive|ct|court|way|pl|place|cres|parade|hwy|highway)\b/i.test(
        text,
      ) ||
      /,/.test(text)
    if (a.length >= 4 && b.length >= 4 && looksAddressy) {
      return { originText: a, destText: b }
    }
  }

  if (looksLikeLooseAddressLine(text)) return { destText: text }
  return null
}

function looksLikeLooseAddressLine(t: string): boolean {
  if (t.length < 8) return false
  if (/\d/.test(t)) return true
  if (
    /\b(st|street|rd|road|ave|avenue|dr|drive|ct|court|way|pl|place|cres|parade|hwy|highway)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/,/.test(t)) return true
  return t.length >= 14
}

export function haversineMeters(
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral,
): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Advance past steps whose end we've already reached (within `passMeters` of the step end).
 */
export function pickStepIndexAfterPassingEnds(
  user: google.maps.LatLngLiteral,
  steps: readonly DirectionsStepLite[],
  passMeters = 42,
): number {
  if (steps.length === 0) return 0
  let i = 0
  while (
    i < steps.length - 1 &&
    haversineMeters(user, steps[i]!.end) < passMeters
  ) {
    i += 1
  }
  return i
}

/** e.g. "In 220 m" / "In 1.2 km" */
export function formatStepDistanceLabel(meters: number): string | null {
  if (!Number.isFinite(meters) || meters <= 0) return null
  if (meters < 1000) return `In ${Math.round(meters)} m`
  const km = meters / 1000
  const rounded = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10
  const kmStr = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)
  return `In ${kmStr} km`
}

export function formatArrivalClockFromEtaSeconds(etaSeconds: number): string {
  const sec = Math.max(0, Math.round(etaSeconds))
  const arrive = new Date(Date.now() + sec * 1000)
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(arrive)
}

/** Distance line for the banner: prefer remaining distance to step end when GPS known. */
export function distanceToManeuverBannerLabel(
  user: google.maps.LatLngLiteral | null | undefined,
  step: DirectionsStepLite,
): string | null {
  if (user) {
    const m = haversineMeters(user, step.end)
    if (m < 12) return null
    return formatStepDistanceLabel(m)
  }
  return formatStepDistanceLabel(step.distanceMeters)
}

/** Minimum distance from `point` to any segment of `path` (meters). */
export function distancePointToPathMeters(
  point: google.maps.LatLngLiteral,
  path: google.maps.LatLngLiteral[],
): number {
  if (path.length === 0) return Infinity
  if (path.length === 1) return haversineMeters(point, path[0]!)
  let min = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!
    const b = path[i + 1]!
    min = Math.min(min, distancePointToSegmentMeters(point, a, b))
  }
  return min
}

/** Cross-track distance approximation for short segments (meters). */
function distancePointToSegmentMeters(
  p: google.maps.LatLngLiteral,
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral,
): number {
  const dab = haversineMeters(a, b)
  if (dab < 1) return haversineMeters(p, a)
  const dap = haversineMeters(a, p)
  const dbp = haversineMeters(b, p)
  if (dap * dab < 1e-6) return dap
  if (dbp * dab < 1e-6) return dbp
  const maxEdge = Math.max(dap, dbp)
  const minEdge = Math.min(dap, dbp)
  const s = (dap + dbp + dab) / 2
  const areaSq = Math.max(0, s * (s - dap) * (s - dbp) * (s - dab))
  const h = (2 * Math.sqrt(areaSq)) / dab
  if (dap * dab + dbp * dbp < dab * dab + 1e-6) return minEdge
  return Math.min(maxEdge, h)
}
