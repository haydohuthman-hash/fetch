import type { LineString } from 'geojson'

export type LngLat = [lng: number, lat: number]

/**
 * Mapbox Directions API — driving profile, GeoJSON geometry.
 * Uses public token (restrict by URL in Mapbox dashboard).
 */
export async function getRoute(
  pickupLngLat: LngLat,
  dropoffLngLat: LngLat,
  accessToken: string,
): Promise<LineString | null> {
  const a = `${pickupLngLat[0]},${pickupLngLat[1]}`
  const b = `${dropoffLngLat[0]},${dropoffLngLat[1]}`
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${a};${b}`,
  )
  url.searchParams.set('geometries', 'geojson')
  url.searchParams.set('access_token', accessToken.trim())

  const res = await fetch(url.toString())
  if (!res.ok) return null
  const data = (await res.json()) as {
    routes?: { geometry?: LineString }[]
  }
  const g = data.routes?.[0]?.geometry
  if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates)) return null
  return g
}
