import { useEffect, useRef } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'

const GOOGLE_MAP_LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry']

export type ResolvedPlace = {
  formattedAddress: string
  placeId: string
  coords: { lat: number; lng: number }
  name?: string
  suburb?: string
}

type PlacesAddressAutocompleteProps = {
  apiKey: string
  /** Remount when switching pickup vs dropoff so Autocomplete rebinds cleanly. */
  field: 'pickup' | 'dropoff'
  placeholder: string
  disabled?: boolean
  autoFocus?: boolean
  onResolved: (place: ResolvedPlace) => void
  className?: string
}

/**
 * Standalone Places Autocomplete (not nested under `GoogleMap` — uses programmatic `Autocomplete`).
 */
export function PlacesAddressAutocomplete({
  apiKey,
  field,
  placeholder,
  disabled = false,
  autoFocus = false,
  onResolved,
  className,
}: PlacesAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onResolvedRef = useRef(onResolved)
  onResolvedRef.current = onResolved

  const { isLoaded } = useJsApiLoader({
    id: 'fetch-google-maps',
    googleMapsApiKey: apiKey,
    version: 'weekly',
    libraries: GOOGLE_MAP_LIBRARIES,
  })

  useEffect(() => {
    if (!isLoaded || !inputRef.current || disabled) return
    const input = inputRef.current
    const ac = new google.maps.places.Autocomplete(input, {
      fields: ['formatted_address', 'geometry', 'name', 'place_id', 'address_components'],
      componentRestrictions: { country: 'au' },
    })
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      const loc = place.geometry?.location
      const formattedAddress = place.formatted_address
      const placeId = place.place_id
      if (!loc || !formattedAddress || !placeId) return
      const suburb =
        place.address_components?.find((c) =>
          c.types.includes('locality'),
        )?.long_name ??
        place.address_components?.find((c) =>
          c.types.includes('sublocality') || c.types.includes('sublocality_level_1'),
        )?.long_name
      onResolvedRef.current({
        formattedAddress,
        placeId,
        coords: { lat: loc.lat(), lng: loc.lng() },
        name: place.name,
        suburb,
      })
    })
    return () => {
      listener.remove()
      google.maps.event.clearInstanceListeners(ac)
    }
  }, [isLoaded, field, disabled])

  return (
    <input
      ref={inputRef}
      type="text"
      autoComplete="street-address"
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className={className}
      aria-label={placeholder}
    />
  )
}
