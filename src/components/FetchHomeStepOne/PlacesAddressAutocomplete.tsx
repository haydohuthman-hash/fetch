import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useJsApiLoader } from '@react-google-maps/api'
import { fetchPerfExtra, fetchPerfIsEnabled } from '../../lib/fetchPerf'

const GOOGLE_MAP_LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry']

const PREDICT_DEBOUNCE_MS = 200
const MIN_INPUT_LEN = 2

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
  /** Whether the inline suggestion list is visible (for parent sheet / snap). */
  onSuggestionsOpenChange?: (open: boolean) => void
  /** Suggestions render here (e.g. under the “Suggestions” label). */
  suggestionsMountRef?: RefObject<HTMLElement | null>
  className?: string
  /** A→B grouped UI: colored dot + borderless input row (parent supplies outer box). */
  abMarker?: 'pickup' | 'dropoff'
}

function placeFromResult(place: google.maps.places.PlaceResult): ResolvedPlace | null {
  const loc = place.geometry?.location
  const formattedAddress = place.formatted_address
  const placeId = place.place_id
  if (!loc || !formattedAddress || !placeId) return null
  const suburb =
    place.address_components?.find((c) => c.types.includes('locality'))?.long_name ??
    place.address_components?.find((c) =>
      c.types.includes('sublocality') || c.types.includes('sublocality_level_1'),
    )?.long_name
  return {
    formattedAddress,
    placeId,
    coords: { lat: loc.lat(), lng: loc.lng() },
    name: place.name,
    suburb,
  }
}

function secondaryLine(p: google.maps.places.AutocompletePrediction): string {
  const s = p.structured_formatting.secondary_text?.trim()
  if (s) return s
  const main = p.structured_formatting.main_text.trim()
  const d = p.description?.trim() ?? ''
  if (d && d !== main) {
    if (d.startsWith(main)) return d.slice(main.length).replace(/^[\s,]+/, '')
    return d
  }
  return ''
}

/**
 * Address field backed by Places AutocompleteService + Place Details (no pac-container).
 * Renders structured main + secondary lines under `suggestionsMountRef`.
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
  const onSuggestionsOpenChangeRef = useRef(onSuggestionsOpenChange)
  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const predictDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [focused, setFocused] = useState(false)
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [portalTick, setPortalTick] = useState(0)
  const [portalHostEl, setPortalHostEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    onResolvedRef.current = onResolved
    onSuggestionsOpenChangeRef.current = onSuggestionsOpenChange
  }, [onResolved, onSuggestionsOpenChange])

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
    if (!isLoaded || typeof google === 'undefined' || disabled) {
      acServiceRef.current = null
      placesServiceRef.current = null
      return
    }
    acServiceRef.current = new google.maps.places.AutocompleteService()
    const att = document.createElement('div')
    placesServiceRef.current = new google.maps.places.PlacesService(att)
    return () => {
      acServiceRef.current = null
      placesServiceRef.current = null
    }
  }, [isLoaded, disabled])

  const newSessionToken = useCallback(() => {
    if (typeof google === 'undefined') return
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
  }, [])

  const bumpPortal = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPortalTick((n) => n + 1))
    })
  }, [])

  useLayoutEffect(() => {
    if (predictions.length > 0 && focused) bumpPortal()
  }, [predictions.length, focused, bumpPortal])

  const suggestionsOpen = focused && predictions.length > 0 && !disabled

  useLayoutEffect(() => {
    if (!suggestionsOpen) {
      queueMicrotask(() => setPortalHostEl(null))
      return
    }
    const el = suggestionsMountRef?.current ?? null
    queueMicrotask(() => setPortalHostEl(el))
  }, [suggestionsOpen, suggestionsMountRef, portalTick])

  const flushPredictions = useCallback((raw: string) => {
    const line = raw.trim()
    if (line.length < MIN_INPUT_LEN) {
      setPredictions([])
      setActiveIndex(-1)
      return
    }
    const ac = acServiceRef.current
    if (!ac || typeof google === 'undefined') return
    if (!sessionTokenRef.current) newSessionToken()
    ac.getPlacePredictions(
      {
        input: line.slice(0, 120),
        componentRestrictions: { country: 'au' },
        types: ['address'],
        sessionToken: sessionTokenRef.current ?? undefined,
      },
      (preds, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !preds?.length
        ) {
          setPredictions([])
          setActiveIndex(-1)
          return
        }
        setPredictions(preds.slice(0, 8))
        setActiveIndex(-1)
      },
    )
  }, [newSessionToken])

  const schedulePredictions = useCallback(
    (raw: string) => {
      if (predictDebounceRef.current) {
        clearTimeout(predictDebounceRef.current)
        predictDebounceRef.current = null
      }
      predictDebounceRef.current = window.setTimeout(() => {
        predictDebounceRef.current = null
        flushPredictions(raw)
      }, PREDICT_DEBOUNCE_MS)
    },
    [flushPredictions],
  )

  useEffect(() => {
    return () => {
      if (predictDebounceRef.current) {
        clearTimeout(predictDebounceRef.current)
        predictDebounceRef.current = null
      }
    }
  }, [])

  const applyPrediction = useCallback(
    (prediction: google.maps.places.AutocompletePrediction) => {
      const ps = placesServiceRef.current
      if (!ps || typeof google === 'undefined') return
      ps.getDetails(
        {
          placeId: prediction.place_id,
          fields: [
            'formatted_address',
            'geometry',
            'name',
            'place_id',
            'address_components',
          ],
          sessionToken: sessionTokenRef.current ?? undefined,
        },
        (place, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return
          const resolved = placeFromResult(place)
          if (!resolved) return
          if (fetchPerfIsEnabled()) {
            fetchPerfExtra('maps_places_autocomplete_place_changed', { field })
          }
          sessionTokenRef.current = null
          newSessionToken()
          setPredictions([])
          setActiveIndex(-1)
          const el = inputRef.current
          if (el) el.value = resolved.formattedAddress
          onResolvedRef.current(resolved)
        },
      )
    },
    [field, newSessionToken],
  )

  useEffect(() => {
    onSuggestionsOpenChangeRef.current?.(suggestionsOpen)
  }, [suggestionsOpen])

  const onInputFocus = useCallback(() => {
    setFocused(true)
    if (!sessionTokenRef.current) newSessionToken()
    bumpPortal()
    const v = inputRef.current?.value ?? ''
    if (v.trim().length >= MIN_INPUT_LEN) schedulePredictions(v)
  }, [newSessionToken, bumpPortal, schedulePredictions])

  const onInputBlur = useCallback(() => {
    window.setTimeout(() => {
      if (document.activeElement === inputRef.current) return
      setFocused(false)
      setPredictions([])
      setActiveIndex(-1)
    }, 200)
  }, [])

  const onInputChange = useCallback(() => {
    const v = inputRef.current?.value ?? ''
    schedulePredictions(v)
  }, [schedulePredictions])

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!predictions.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(predictions.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setPredictions([])
        setActiveIndex(-1)
      } else if (e.key === 'Enter') {
        const idx = activeIndex >= 0 ? activeIndex : 0
        const row = predictions[idx]
        if (row) {
          e.preventDefault()
          applyPrediction(row)
        }
      }
    },
    [predictions, activeIndex, applyPrediction],
  )

  const portalInner = suggestionsOpen ? (
    <div
      className="fetch-places-suggestions"
      role="listbox"
      aria-label="Address suggestions"
    >
      {predictions.map((p, i) => {
        const sec = secondaryLine(p)
        const active = i === activeIndex
        return (
          <button
            key={p.place_id}
            type="button"
            role="option"
            aria-selected={active}
            id={`fetch-addr-sug-${field}-${i}`}
            className={[
              'fetch-places-suggestions__item',
              active ? 'fetch-places-suggestions__item--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => applyPrediction(p)}
          >
            <span className="fetch-places-suggestions__main">
              {p.structured_formatting.main_text}
            </span>
            {sec ? <span className="fetch-places-suggestions__secondary">{sec}</span> : null}
          </button>
        )
      })}
    </div>
  ) : null

  const input = (
    <>
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
        aria-expanded={suggestionsOpen}
        aria-haspopup="listbox"
        aria-activedescendant={
          suggestionsOpen && activeIndex >= 0
            ? `fetch-addr-sug-${field}-${activeIndex}`
            : undefined
        }
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        onChange={onInputChange}
        onKeyDown={onInputKeyDown}
      />
      {portalHostEl && portalInner ? createPortal(portalInner, portalHostEl) : null}
    </>
  )

  if (!abMarker) return input

  return (
    <div className="fetch-home-ab-marker-row">
      <span
        className={[
          'fetch-home-ab-marker-dot',
          abMarker === 'pickup'
            ? 'fetch-home-ab-marker-dot--pickup'
            : 'fetch-home-ab-marker-dot--dropoff',
        ].join(' ')}
        aria-hidden
      />
      {input}
    </div>
  )
}
