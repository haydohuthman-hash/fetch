import type { BookingRoute } from '../assistant/types'

/**
 * Lat/lng path for the map from stored booking route (`path` or encoded `polyline`).
 * Polyline decoding requires Maps JS `geometry` library (call when `mapsJsReady`).
 */
export function routePathFromBookingRoute(
  route: BookingRoute | null | undefined,
  mapsJsReady: boolean,
): google.maps.LatLngLiteral[] | null {
  if (!route) return null
  if (route.path && route.path.length >= 2) {
    return route.path.map((p) => ({ lat: p.lat, lng: p.lng }))
  }
  if (
    mapsJsReady &&
    route.polyline &&
    typeof google !== 'undefined' &&
    google.maps?.geometry?.encoding
  ) {
    try {
      const decoded = google.maps.geometry.encoding.decodePath(route.polyline)
      return decoded.map((ll) => ({ lat: ll.lat(), lng: ll.lng() }))
    } catch {
      return null
    }
  }
  return null
}
