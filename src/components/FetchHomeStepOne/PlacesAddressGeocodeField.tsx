import { useCallback, useEffect, useRef, useState } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { fetchPerfExtra, fetchPerfIsEnabled } from '../../lib/fetchPerf'
import type { ResolvedPlace } from './PlacesAddressAutocomplete'

const GOOGLE_MAP_LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry']

type PlacesAddressGeocodeFieldProps = {
  apiKey: string
  field: 'pickup' | 'dropoff'
  placeholder: string
  disabled?: boolean
  autoFocus?: boolean
  initialDisplayValue?: string
  onResolved: (place: ResolvedPlace) => void
  className?: string
}

/**
 * Free-text address field without Places Autocomplete predictions.
 * Resolves via Geocoder when the user presses Enter or taps Confirm.
 */
export function PlacesAddressGeocodeField({
  apiKey,
  field,
  placeholder,
  disabled = false,
  autoFocus = false,
  initialDisplayValue = '',
  onResolved,
  className,
}: PlacesAddressGeocodeFieldProps) {
  const [value, setValue] = useState(initialDisplayValue)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onResolvedRef = useRef(onResolved)
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)

  useEffect(() => {
    onResolvedRef.current = onResolved
  }, [onResolved])

  const { isLoaded } = useJsApiLoader({
    id: 'fetch-google-maps',
    googleMapsApiKey: apiKey,
    version: 'weekly',
    libraries: GOOGLE_MAP_LIBRARIES,
  })

  useEffect(() => {
    if (!isLoaded || !fetchPerfIsEnabled()) return
    fetchPerfExtra('maps_js_api_loaded', { field, phase: 'geocode_field_ready' })
  }, [isLoaded, field])

  useEffect(() => {
    if (!isLoaded) return
    geocoderRef.current = new google.maps.Geocoder()
  }, [isLoaded])

  const runGeocode = useCallback(() => {
    const q = value.trim()
    if (!q || !geocoderRef.current || disabled || pending) return
    setError(null)
    setPending(true)
    geocoderRef.current.geocode(
      { address: q, componentRestrictions: { country: 'au' } },
      (results, status) => {
        setPending(false)
        if (fetchPerfIsEnabled()) {
          fetchPerfExtra('maps_geocode_result', { field, status: String(status) })
        }
        if (status !== 'OK' || !results?.length) {
          setError(
            status === 'ZERO_RESULTS'
              ? 'No match found. Check the address and try again.'
              : 'Could not verify that address. Try again.',
          )
          return
        }
        const r = results[0]
        const loc = r.geometry?.location
        const formattedAddress = r.formatted_address
        const placeId = r.place_id
        if (!loc || !formattedAddress || !placeId) {
          setError('Could not read coordinates for that address.')
          return
        }
        const suburb =
          r.address_components?.find((c) => c.types.includes('locality'))?.long_name ??
          r.address_components?.find(
            (c) => c.types.includes('sublocality') || c.types.includes('sublocality_level_1'),
          )?.long_name
        onResolvedRef.current({
          formattedAddress,
          placeId,
          coords: { lat: loc.lat(), lng: loc.lng() },
          suburb,
        })
      },
    )
  }, [value, disabled, pending, field])

  return (
    <div className="mt-2 flex flex-col gap-2">
      <input
        type="text"
        autoComplete="street-address"
        disabled={disabled || pending}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            runGeocode()
          }
        }}
        placeholder={placeholder}
        className={className}
        aria-label={placeholder}
        aria-invalid={error != null}
        aria-describedby={error ? `${field}-geocode-err` : undefined}
      />
      <button
        type="button"
        disabled={disabled || pending || !value.trim()}
        onClick={() => runGeocode()}
        className="fetch-stage-primary-btn rounded-2xl px-3 py-2.5 text-center text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {pending ? 'Checking address…' : 'Confirm address'}
      </button>
      {error ? (
        <p id={`${field}-geocode-err`} className="text-[12px] font-medium text-red-600/90">
          {error}
        </p>
      ) : null}
    </div>
  )
}
