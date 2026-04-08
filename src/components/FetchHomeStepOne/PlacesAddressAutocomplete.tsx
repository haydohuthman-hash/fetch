import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { fetchPerfExtra, fetchPerfIsEnabled } from '../../lib/fetchPerf'

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
  /** Seed the input when remounting (e.g. returning to landing with pickup already set). */
  initialDisplayValue?: string
  onResolved: (place: ResolvedPlace) => void
  /** Google `.pac-container` is visible with predictions (for parent sheet snap). */
  onSuggestionsOpenChange?: (open: boolean) => void
  /**
   * When set, visible `.pac-container` nodes are moved under this element so predictions
   * render inline (e.g. below drop-off) instead of floating over the map.
   */
  suggestionsMountRef?: RefObject<HTMLElement | null>
  className?: string
  /** A→B grouped UI: colored dot + borderless input row (parent supplies outer box). */
  abMarker?: 'pickup' | 'dropoff'
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
  initialDisplayValue = '',
  onResolved,
  onSuggestionsOpenChange,
  suggestionsMountRef,
  className,
  abMarker,
}: PlacesAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onResolvedRef = useRef(onResolved)
  onResolvedRef.current = onResolved
  const onSuggestionsOpenChangeRef = useRef(onSuggestionsOpenChange)
  onSuggestionsOpenChangeRef.current = onSuggestionsOpenChange

  const { isLoaded } = useJsApiLoader({
    id: 'fetch-google-maps',
    googleMapsApiKey: apiKey,
    version: 'weekly',
    libraries: GOOGLE_MAP_LIBRARIES,
  })

  useEffect(() => {
    if (!isLoaded || !fetchPerfIsEnabled()) return
    fetchPerfExtra('maps_js_api_loaded', { field, phase: 'autocomplete_ready' })
  }, [isLoaded, field])

  useEffect(() => {
    if (!isLoaded || !inputRef.current || disabled) return
    const input = inputRef.current
    const ac = new google.maps.places.Autocomplete(input, {
      fields: ['formatted_address', 'geometry', 'name', 'place_id', 'address_components'],
      componentRestrictions: { country: 'au' },
      types: ['address'],
    })
    const listener = ac.addListener('place_changed', () => {
      if (fetchPerfIsEnabled()) {
        fetchPerfExtra('maps_places_autocomplete_place_changed', { field })
      }
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

  useEffect(() => {
    if (!isLoaded || disabled || !inputRef.current || !onSuggestionsOpenChange) return
    const input = inputRef.current
    let reported = false

    const isPacOpen = (): boolean => {
      if (document.activeElement !== input) return false
      const lists = document.querySelectorAll('.pac-container')
      for (let i = 0; i < lists.length; i++) {
        const el = lists[i] as HTMLElement
        if (el.offsetParent !== null && el.querySelector('.pac-item')) return true
      }
      return false
    }

    const flush = () => {
      const open = isPacOpen()
      if (open === reported) return
      reported = open
      onSuggestionsOpenChangeRef.current?.(open)
    }

    const mo = new MutationObserver(() => flush())
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })
    const onFocus = () => queueMicrotask(flush)
    const onBlur = () =>
      window.setTimeout(() => {
        if (document.activeElement === input) return
        if (reported) {
          reported = false
          onSuggestionsOpenChangeRef.current?.(false)
        }
      }, 220)
    const onInput = () => queueMicrotask(flush)
    input.addEventListener('focus', onFocus)
    input.addEventListener('blur', onBlur)
    input.addEventListener('input', onInput)
    return () => {
      mo.disconnect()
      input.removeEventListener('focus', onFocus)
      input.removeEventListener('blur', onBlur)
      input.removeEventListener('input', onInput)
      if (reported) onSuggestionsOpenChangeRef.current?.(false)
    }
  }, [isLoaded, field, disabled, onSuggestionsOpenChange])

  useLayoutEffect(() => {
    const mount = suggestionsMountRef?.current
    if (!mount || !isLoaded || disabled) return

    const reparentOpenPac = () => {
      const lists = document.querySelectorAll<HTMLElement>('.pac-container')
      for (let i = 0; i < lists.length; i++) {
        const el = lists[i]
        if (el.offsetParent === null && !el.querySelector('.pac-item')) continue
        if (mount.contains(el)) continue
        mount.appendChild(el)
      }
    }

    const mo = new MutationObserver(() => reparentOpenPac())
    mo.observe(document.body, { childList: true, subtree: true })
    reparentOpenPac()

    return () => {
      mo.disconnect()
      mount.querySelectorAll('.pac-container').forEach((node) => {
        document.body.appendChild(node)
      })
    }
  }, [isLoaded, disabled, suggestionsMountRef])

  const input = (
    <input
      ref={inputRef}
      type="text"
      autoComplete="street-address"
      disabled={disabled}
      autoFocus={autoFocus}
      defaultValue={initialDisplayValue}
      placeholder={placeholder}
      className={className}
      aria-label={placeholder}
    />
  )

  if (!abMarker) return input

  return (
    <div className="fetch-home-ab-marker-row">
      <span
        className={[
          'fetch-home-ab-marker-dot',
          abMarker === 'pickup' ? 'fetch-home-ab-marker-dot--pickup' : 'fetch-home-ab-marker-dot--dropoff',
        ].join(' ')}
        aria-hidden
      />
      {input}
    </div>
  )
}
