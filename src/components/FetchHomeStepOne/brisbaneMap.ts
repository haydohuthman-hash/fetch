/** Brisbane CBD — City Botanic Gardens reference. */
export const BRISBANE_CENTER = { lat: -27.469772, lng: 153.025123 }

/**
 * South East Queensland service boundary (approximate).
 * Covers: Noosa → Sunshine Coast → Brisbane → Gold Coast → Tweed border → west to Toowoomba.
 */
export const SEQ_BOUNDARY: google.maps.LatLngLiteral[] = [
  { lat: -26.29, lng: 152.68 },
  { lat: -26.29, lng: 153.22 },
  { lat: -26.42, lng: 153.16 },
  { lat: -26.60, lng: 153.12 },
  { lat: -26.72, lng: 153.14 },
  { lat: -27.00, lng: 153.22 },
  { lat: -27.20, lng: 153.32 },
  { lat: -27.37, lng: 153.44 },
  { lat: -27.50, lng: 153.44 },
  { lat: -27.72, lng: 153.46 },
  { lat: -27.88, lng: 153.44 },
  { lat: -28.00, lng: 153.46 },
  { lat: -28.17, lng: 153.56 },
  { lat: -28.35, lng: 153.56 },
  { lat: -28.35, lng: 153.28 },
  { lat: -28.35, lng: 152.88 },
  { lat: -28.12, lng: 152.40 },
  { lat: -27.82, lng: 151.88 },
  { lat: -27.52, lng: 151.72 },
  { lat: -27.20, lng: 151.72 },
  { lat: -26.82, lng: 151.98 },
  { lat: -26.52, lng: 152.28 },
  { lat: -26.29, lng: 152.68 },
]

/** ~100 km across the map (50 km from center to each edge). */
export const SEQ_OUT_OF_REGION_MAP_HALF_SPAN_KM = 50

/**
 * Point-in-polygon for the SEQ service polygon (ray casting).
 */
export function isLatLngInSeq(lat: number, lng: number): boolean {
  const poly = SEQ_BOUNDARY
  if (poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].lat
    const xi = poly[i].lng
    const yj = poly[j].lat
    const xj = poly[j].lng
    const denom = yj - yi
    if (Math.abs(denom) < 1e-12) continue
    const cross =
      (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / denom + xi
    if (cross) inside = !inside
  }
  return inside
}

function boundsLiteralForKmFromCenter(
  lat: number,
  lng: number,
  halfSpanKm: number,
): google.maps.LatLngBoundsLiteral {
  const latDelta = halfSpanKm / 110.574
  const lngDelta = halfSpanKm / (111.32 * Math.cos((lat * Math.PI) / 180))
  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    west: lng - lngDelta,
  }
}

export function fitKmOverviewFromCenter(
  map: google.maps.Map,
  lat: number,
  lng: number,
  halfSpanKm: number,
  padding: number | google.maps.Padding = 20,
) {
  const b = boundsLiteralForKmFromCenter(lat, lng, halfSpanKm)
  const bounds = new google.maps.LatLngBounds(
    { lat: b.south, lng: b.west },
    { lat: b.north, lng: b.east },
  )
  map.fitBounds(bounds, padding)
}

/**
 * Half-span in km so the visible window is ~30 km across latitudinally
 * (≈15 km from center toward each edge).
 */
const KM_HALF_SPAN = 15

/**
 * Pans the map down by a fraction of the map height so the current geographic center
 * appears toward the top-middle of the viewport (room for the bottom sheet below).
 */
export function nudgeMapCenterTowardTop(
  map: google.maps.Map,
  fractionOfViewportHeight = 0.34,
) {
  const el = map.getDiv()
  const h = Math.max(200, el.clientHeight || 0)
  map.panBy(0, Math.round(h * fractionOfViewportHeight))
}

export function fitBrisbaneOverview(map: google.maps.Map) {
  const b = boundsLiteralForKmFromCenter(
    BRISBANE_CENTER.lat,
    BRISBANE_CENTER.lng,
    KM_HALF_SPAN,
  )
  const bounds = new google.maps.LatLngBounds(
    { lat: b.south, lng: b.west },
    { lat: b.north, lng: b.east },
  )
  map.fitBounds(bounds, 16)
}

/** Fit so pickup and driver positions are both visible. */
export function fitPickupAndDriver(
  map: google.maps.Map,
  pickup: google.maps.LatLngLiteral,
  driver: google.maps.LatLngLiteral,
  padding: number | google.maps.Padding = 56,
) {
  const bounds = new google.maps.LatLngBounds()
  bounds.extend(pickup)
  bounds.extend(driver)
  map.fitBounds(bounds, padding)
}

/** Pickup + drop-off: extra bottom padding keeps route above the bottom sheet. */
export const PICKUP_DROPOFF_SHEET_FIT_PADDING: google.maps.Padding = {
  top: 52,
  right: 44,
  bottom: 252,
  left: 44,
}

export function fitPickupAndDropoff(
  map: google.maps.Map,
  pickup: google.maps.LatLngLiteral,
  dropoff: google.maps.LatLngLiteral,
  padding: google.maps.Padding = PICKUP_DROPOFF_SHEET_FIT_PADDING,
) {
  const bounds = new google.maps.LatLngBounds()
  bounds.extend(pickup)
  bounds.extend(dropoff)
  map.fitBounds(bounds, padding)
}

/** Keep pickup, drop-off, and current driver position in frame during active trip. */
export function fitPickupDropoffAndDriver(
  map: google.maps.Map,
  pickup: google.maps.LatLngLiteral,
  dropoff: google.maps.LatLngLiteral,
  driver: google.maps.LatLngLiteral,
) {
  const bounds = new google.maps.LatLngBounds()
  bounds.extend(pickup)
  bounds.extend(dropoff)
  bounds.extend(driver)
  map.fitBounds(bounds, PICKUP_DROPOFF_SHEET_FIT_PADDING)
}
