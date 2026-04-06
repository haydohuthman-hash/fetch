/**
 * Geocode free-text addresses with AU bias (Maps JavaScript Geocoder).
 */
export type GeocodedAddressAu = {
  formattedAddress: string
  placeId: string
  coords: { lat: number; lng: number }
  name?: string
}

export function geocodeAddressTextAu(address: string): Promise<GeocodedAddressAu | null> {
  const q = address.trim()
  if (!q || typeof google === 'undefined') return Promise.resolve(null)

  const geocoder = new google.maps.Geocoder()
  return new Promise((resolve) => {
    geocoder.geocode(
      {
        address: q,
        componentRestrictions: { country: 'au' },
      },
      (results, status) => {
        if (status !== 'OK' || !results?.[0]) {
          resolve(null)
          return
        }
        const r = results[0]
        const loc = r.geometry?.location
        if (!loc) {
          resolve(null)
          return
        }
        const lat = loc.lat()
        const lng = loc.lng()
        resolve({
          formattedAddress: r.formatted_address,
          placeId: r.place_id && r.place_id.length > 0 ? r.place_id : `geocode:${lat.toFixed(5)},${lng.toFixed(5)}`,
          coords: { lat, lng },
          ...(r.address_components?.[0]?.long_name
            ? { name: r.address_components[0].long_name }
            : {}),
        })
      },
    )
  })
}
