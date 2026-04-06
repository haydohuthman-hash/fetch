import { useJsApiLoader } from '@react-google-maps/api'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { HomeBookingSheetSnap } from './FetchHomeBookingSheet'
import {
  fetchExplorePlacePhotoCards,
  formatDistanceLabel,
  MAPS_EXPLORE_CATEGORY_CHIPS,
  MAPS_EXPLORE_NEARBY_RADIUS_M,
  nearbySearchByTypes,
  nearbySearchKeyword,
  runAdventureNearbyBatch,
  type ExploreMapPoi,
  type ExplorePlacePhotoCard,
  type MapsExploreCategoryChipId,
} from '../lib/mapsExplorePlaces'
import { BRISBANE_POPULAR_PLACES } from '../lib/brisbanePopularPlaces'
import {
  loadRecentNavDestinations,
  type RecentNavDestination,
} from '../lib/recentNavDestinations'
import type { SavedAddress } from '../lib/savedAddresses'
import { haversineMeters } from '../lib/homeDirections'
import { useFetchVoice } from '../voice/FetchVoiceContext'
import { primeVoicePlaybackFromUserGesture } from '../voice/fetchVoice'
import { voiceFlowDebug, voiceFlowSttError } from '../voice/voiceFlowDebug'

const GOOGLE_MAP_LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry']

function MapsExploreSearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M16.2 16.2 21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function MapsExploreMicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M17 11v1a5 5 0 0 1-10 0v-1M12 18v3M8 22h8"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  )
}

type PlacePredictionRow = { description: string; placeId: string }

function isAutocompleteAddressInput(s: string): boolean {
  const t = s.trim()
  if (t.length < 3) return false
  if (/\d/.test(t)) return true
  if (
    /\b(st|street|rd|road|ave|avenue|dr|drive|ct|court|way|pl|place|cres|parade|hwy|highway)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/,/.test(t) && t.length >= 6) return true
  return t.length >= 14
}

export type MapsExploreSheetProps = {
  /** Same readiness flag as home map (shared JS loader). */
  mapsJsReady: boolean
  userMapLocation: google.maps.LatLngLiteral | null
  savedAddresses: readonly SavedAddress[]
  onStartNavigationToPlace: (place: {
    lat: number
    lng: number
    label: string
    placeId?: string
  }) => void
  onExplorePoisChange: (pois: ExploreMapPoi[]) => void
  /** Address field focus or place suggestions open — parent expands sheet to full. */
  onMapsAddressFieldExpandedChange: (expanded: boolean) => void
  onShowPlaceOnMap: (lat: number, lng: number) => void
  /** Closed sheet: address field portals into this host (peek bar). */
  mapsPeekHost?: HTMLDivElement | null
  sheetSnap?: HomeBookingSheetSnap
}

export function MapsExploreSheet({
  mapsJsReady,
  userMapLocation,
  savedAddresses,
  onStartNavigationToPlace,
  onExplorePoisChange,
  onMapsAddressFieldExpandedChange,
  onShowPlaceOnMap,
  mapsPeekHost = null,
  sheetSnap = 'full',
}: MapsExploreSheetProps) {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const { isLoaded: mapsJsLoaded } = useJsApiLoader({
    id: 'fetch-google-maps',
    googleMapsApiKey: mapsApiKey,
    version: 'weekly',
    libraries: GOOGLE_MAP_LIBRARIES,
    preventGoogleFontsLoading: true,
  })

  const [addressInput, setAddressInput] = useState('')
  const [placePredictions, setPlacePredictions] = useState<PlacePredictionRow[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [recents, setRecents] = useState<RecentNavDestination[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [adventureLoading, setAdventureLoading] = useState(false)
  const [chipLoadingId, setChipLoadingId] = useState<
    MapsExploreCategoryChipId | null
  >(null)
  const [nearbyError, setNearbyError] = useState<string | null>(null)
  const [lastExplorePois, setLastExplorePois] = useState<ExploreMapPoi[]>([])
  const [activeExploreCategory, setActiveExploreCategory] = useState<
    'nearby' | MapsExploreCategoryChipId | null
  >(null)
  const [photoEnriched, setPhotoEnriched] = useState<ExplorePlacePhotoCard[]>([])
  const photoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const photoRequestGen = useRef(0)

  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const predictDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestBlurCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const mapsSttRef = useRef<{ abort: () => void } | null>(null)
  const [mapsSttListening, setMapsSttListening] = useState(false)
  const { speakLine, playUiEvent } = useFetchVoice()

  const loaderReady = mapsJsReady && mapsJsLoaded && mapsApiKey.length > 0

  const stopMapsAddressStt = useCallback(() => {
    if (mapsSttRef.current) {
      try {
        mapsSttRef.current.abort()
      } catch {
        /* ignore */
      }
      mapsSttRef.current = null
    }
    setMapsSttListening(false)
  }, [])

  const startMapsAddressStt = useCallback(() => {
    primeVoicePlaybackFromUserGesture()
    const w = window as unknown as Record<string, unknown>
    const SpeechRec = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => {
          lang: string
          interimResults: boolean
          maxAlternatives: number
          onstart: (() => void) | null
          onresult: ((e: {
            resultIndex: number
            results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
          }) => void) | null
          onerror: ((e: Event) => void) | null
          onend: (() => void) | null
          start: () => void
          abort: () => void
        })
      | undefined
    if (!SpeechRec) {
      voiceFlowSttError('SpeechRecognition API missing (maps explore)')
      void speakLine("Voice search isn't available in this browser.", {
        debounceKey: 'maps_explore_no_stt',
        debounceMs: 3200,
      })
      return
    }
    stopMapsAddressStt()
    const rec = new SpeechRec()
    rec.lang = 'en-AU'
    rec.interimResults = false
    rec.maxAlternatives = 1
    mapsSttRef.current = rec
    rec.onstart = () => {
      voiceFlowDebug('listening', { source: 'maps_explore_stt' })
      setMapsSttListening(true)
      playUiEvent('listening_start')
    }
    rec.onresult = (event) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const row = event.results[i]
        if (row?.isFinal) text += row[0]?.transcript ?? ''
      }
      if (!text.trim() && event.results.length > 0) {
        const last = event.results[event.results.length - 1]
        text = last?.[0]?.transcript ?? ''
      }
      const trimmed = text.trim()
      playUiEvent('listening_end')
      if (trimmed) {
        setAddressInput(trimmed)
        onMapsAddressFieldExpandedChange(true)
        inputRef.current?.focus()
      }
    }
    rec.onerror = (ev) => {
      const e = ev as { error?: string }
      voiceFlowSttError(`maps explore STT: ${e.error ?? 'unknown'}`, { error: e.error })
      setMapsSttListening(false)
      mapsSttRef.current = null
      playUiEvent('error')
    }
    rec.onend = () => {
      setMapsSttListening(false)
      mapsSttRef.current = null
    }
    try {
      rec.start()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      voiceFlowSttError(`maps explore rec.start: ${msg}`)
      setMapsSttListening(false)
      mapsSttRef.current = null
    }
  }, [onMapsAddressFieldExpandedChange, playUiEvent, speakLine, stopMapsAddressStt])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (mapsSttRef.current) {
        try {
          mapsSttRef.current.abort()
        } catch {
          /* ignore */
        }
        mapsSttRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setRecents(loadRecentNavDestinations())
  }, [])

  useEffect(() => {
    if (!mapsJsLoaded || typeof google === 'undefined') return
    acServiceRef.current = new google.maps.places.AutocompleteService()
    const el = document.createElement('div')
    placesServiceRef.current = new google.maps.places.PlacesService(el)
    return () => {
      acServiceRef.current = null
      placesServiceRef.current = null
    }
  }, [mapsJsLoaded])

  const placeSuggestionsVisible = suggestOpen && placePredictions.length > 0
  useEffect(() => {
    if (placeSuggestionsVisible) onMapsAddressFieldExpandedChange(true)
  }, [placeSuggestionsVisible, onMapsAddressFieldExpandedChange])

  const exploreCenter = useMemo((): google.maps.LatLngLiteral | null => {
    return userMapLocation
  }, [userMapLocation])

  const photoSourcePois = useMemo(() => {
    return lastExplorePois.filter(
      (p) =>
        (p.kind === 'park' ||
          p.kind === 'natural' ||
          p.kind === 'adventure') &&
        p.placeId,
    )
  }, [lastExplorePois])

  const applyPois = useCallback(
    (pois: ExploreMapPoi[]) => {
      setLastExplorePois(pois)
      onExplorePoisChange(pois)
    },
    [onExplorePoisChange],
  )

  const queueRecentsRefresh = useCallback(() => {
    window.setTimeout(() => {
      if (mountedRef.current) setRecents(loadRecentNavDestinations())
    }, 1100)
  }, [])

  const startNavFromMaps = useCallback(
    (place: { lat: number; lng: number; label: string; placeId?: string }) => {
      onStartNavigationToPlace(place)
      queueRecentsRefresh()
    },
    [onStartNavigationToPlace, queueRecentsRefresh],
  )

  const runFindNearby = useCallback(() => {
    const svc = placesServiceRef.current
    const loc = exploreCenter
    if (!svc || !loc) {
      setNearbyError('Turn on location to search near you.')
      return
    }
    setNearbyError(null)
    setNearbyLoading(true)
    void nearbySearchKeyword(svc, loc, MAPS_EXPLORE_NEARBY_RADIUS_M, 'point of interest', 18).then(
      (pois) => {
        if (!mountedRef.current) return
        setNearbyLoading(false)
        if (!pois.length) {
          setNearbyError('No places found nearby. Try again later.')
          applyPois([])
          return
        }
        setActiveExploreCategory('nearby')
        applyPois(pois)
      },
    )
  }, [exploreCenter, applyPois])

  const runRefreshAdventures = useCallback(() => {
    const svc = placesServiceRef.current
    const loc = exploreCenter
    if (!svc || !loc) {
      setNearbyError('Turn on location for parks and adventures.')
      return
    }
    setNearbyError(null)
    setAdventureLoading(true)
    void runAdventureNearbyBatch(svc, loc, MAPS_EXPLORE_NEARBY_RADIUS_M).then((pois) => {
      if (!mountedRef.current) return
      setAdventureLoading(false)
      if (!pois.length) {
        setNearbyError('No adventures found nearby.')
        applyPois([])
        return
      }
      setActiveExploreCategory('nature')
      applyPois(pois)
    })
  }, [exploreCenter, applyPois])

  const runCategoryChip = useCallback(
    (chipId: MapsExploreCategoryChipId) => {
      const svc = placesServiceRef.current
      const loc = exploreCenter
      const spec = MAPS_EXPLORE_CATEGORY_CHIPS.find((c) => c.id === chipId)
      if (!svc || !loc || !spec) {
        setNearbyError('Turn on location to search near you.')
        return
      }
      setNearbyError(null)
      setChipLoadingId(chipId)
      void nearbySearchByTypes(
        svc,
        loc,
        MAPS_EXPLORE_NEARBY_RADIUS_M,
        [...spec.types],
        10,
      ).then((pois) => {
        if (!mountedRef.current) return
        setChipLoadingId(null)
        if (!pois.length) {
          setNearbyError('No places found for that category.')
          applyPois([])
          return
        }
        setActiveExploreCategory(chipId)
        applyPois(pois)
      })
    },
    [exploreCenter, applyPois],
  )

  useEffect(() => {
    if (!loaderReady || !exploreCenter) return
    const svc = placesServiceRef.current
    if (!svc) return
    setNearbyError(null)
    setAdventureLoading(true)
    void runAdventureNearbyBatch(svc, exploreCenter, MAPS_EXPLORE_NEARBY_RADIUS_M).then(
      (pois) => {
        if (!mountedRef.current) return
        setAdventureLoading(false)
        if (!pois.length) {
          setNearbyError('No adventures found nearby.')
          applyPois([])
          return
        }
        setActiveExploreCategory('nature')
        applyPois(pois)
      },
    )
  }, [loaderReady, exploreCenter?.lat, exploreCenter?.lng, applyPois])

  useEffect(() => {
    const runId = ++photoRequestGen.current
    if (photoDebounceRef.current) {
      clearTimeout(photoDebounceRef.current)
      photoDebounceRef.current = null
    }
    const svc = placesServiceRef.current
    if (!loaderReady || !svc || photoSourcePois.length === 0) {
      setPhotoEnriched([])
      return
    }
    photoDebounceRef.current = window.setTimeout(() => {
      photoDebounceRef.current = null
      void fetchExplorePlacePhotoCards(svc, photoSourcePois, {
        max: 6,
        staggerMs: 110,
      }).then((cards) => {
        if (!mountedRef.current || runId !== photoRequestGen.current) return
        setPhotoEnriched(cards)
      })
    }, 450)
    return () => {
      if (photoDebounceRef.current) {
        clearTimeout(photoDebounceRef.current)
        photoDebounceRef.current = null
      }
    }
  }, [loaderReady, photoSourcePois])

  const applyPlacePrediction = useCallback(
    (row: PlacePredictionRow) => {
      const svc = placesServiceRef.current
      const finish = (text: string) => {
        setAddressInput(text)
        setPlacePredictions([])
        setSuggestOpen(false)
        setActiveSuggestionIndex(-1)
      }
      if (!svc || !row.placeId) {
        finish(row.description)
        return
      }
      svc.getDetails(
        {
          placeId: row.placeId,
          fields: ['formatted_address', 'geometry', 'place_id', 'name'],
        },
        (place, status) => {
          if (!mountedRef.current) return
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            finish(row.description)
            return
          }
          const label = place.formatted_address ?? place.name ?? row.description
          const loc = place.geometry?.location
          if (loc) {
            startNavFromMaps({
              lat: loc.lat(),
              lng: loc.lng(),
              label,
              placeId: place.place_id ?? row.placeId,
            })
          }
          finish(label)
        },
      )
    },
    [startNavFromMaps],
  )

  useEffect(() => {
    if (predictDebounceRef.current) {
      clearTimeout(predictDebounceRef.current)
      predictDebounceRef.current = null
    }
    const line = addressInput.trim()
    if (!loaderReady || !line || !isAutocompleteAddressInput(line)) {
      setPlacePredictions([])
      setSuggestOpen(false)
      setActiveSuggestionIndex(-1)
      return
    }
    predictDebounceRef.current = window.setTimeout(() => {
      predictDebounceRef.current = null
      const ac = acServiceRef.current
      if (!ac || typeof google === 'undefined') return
      const center = exploreCenter ?? { lat: -27.4705, lng: 153.026 }
      const circle = new google.maps.Circle({
        center,
        radius: exploreCenter ? 85_000 : 220_000,
      })
      ac.getPlacePredictions(
        {
          input: line.slice(0, 120),
          componentRestrictions: { country: 'au' },
          locationBias: circle,
        },
        (predictions, status) => {
          if (!mountedRef.current) return
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !predictions?.length
          ) {
            setPlacePredictions([])
            setSuggestOpen(false)
            setActiveSuggestionIndex(-1)
            return
          }
          const rows = predictions
            .slice(0, 6)
            .map((p) => ({
              description: p.description ?? '',
              placeId: p.place_id ?? '',
            }))
            .filter((r) => r.placeId && r.description)
          setPlacePredictions(rows)
          setSuggestOpen(rows.length > 0)
          setActiveSuggestionIndex(-1)
        },
      )
    }, 200)
    return () => {
      if (predictDebounceRef.current) {
        clearTimeout(predictDebounceRef.current)
        predictDebounceRef.current = null
      }
    }
  }, [addressInput, loaderReady, exploreCenter])

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!placeSuggestionsVisible) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSuggestionIndex((i) =>
          Math.min(placePredictions.length - 1, i + 1),
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSuggestionIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        const idx = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0
        const row = placePredictions[idx]
        if (row) {
          e.preventDefault()
          applyPlacePrediction(row)
        }
      } else if (e.key === 'Escape') {
        setPlacePredictions([])
        setSuggestOpen(false)
      }
    },
    [
      placeSuggestionsVisible,
      placePredictions,
      activeSuggestionIndex,
      applyPlacePrediction,
    ],
  )

  const distanceFromUser = useCallback(
    (lat: number, lng: number) => {
      if (!userMapLocation) return ''
      return formatDistanceLabel(haversineMeters(userMapLocation, { lat, lng }))
    },
    [userMapLocation],
  )

  const savedOrPopularRows = useMemo(() => {
    if (savedAddresses.length > 0) {
      return {
        heading: 'Saved places',
        subtitle: null as string | null,
        rows: savedAddresses.map((a) => ({
          id: a.id,
          label: a.label,
          address: a.address,
          lat: a.lat,
          lng: a.lng,
          placeId: `saved_${a.id}`,
        })),
      }
    }
    return {
      heading: 'Popular in Brisbane',
      subtitle: 'Add Home and Work in Account to see your own places.',
      rows: BRISBANE_POPULAR_PLACES.map((p) => ({
        id: p.id,
        label: p.label,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        placeId: `popular_${p.id}`,
      })),
    }
  }, [savedAddresses])

  const usePeekPortal = mapsPeekHost != null && sheetSnap === 'closed'
  const showListsAndChips = !usePeekPortal
  const exploreBusy =
    nearbyLoading || adventureLoading || chipLoadingId !== null

  const parksPhotoCards = useMemo(
    () => photoEnriched.filter((c) => c.kind === 'park' || c.kind === 'natural'),
    [photoEnriched],
  )
  const adventurePhotoCards = useMemo(
    () => photoEnriched.filter((c) => c.kind === 'adventure'),
    [photoEnriched],
  )

  const addressSearchFields = (
    <>
      <label className="sr-only" htmlFor="fetch-maps-address-input">
        Search address or place
      </label>
      <div className="fetch-maps-explore-search-row flex min-w-0 items-stretch gap-1.5">
        <div className="fetch-maps-explore-search-inner relative min-w-0 flex-1">
          <MapsExploreSearchIcon className="fetch-maps-explore-input-icon absolute left-3 top-1/2 z-[1] h-[18px] w-[18px] -translate-y-1/2" />
          <input
            ref={inputRef}
            id="fetch-maps-address-input"
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            onFocus={() => onMapsAddressFieldExpandedChange(true)}
            onBlur={() => {
              if (suggestBlurCloseRef.current) clearTimeout(suggestBlurCloseRef.current)
              suggestBlurCloseRef.current = window.setTimeout(() => {
                suggestBlurCloseRef.current = null
                setSuggestOpen(false)
                setPlacePredictions([])
                onMapsAddressFieldExpandedChange(false)
              }, 220)
            }}
            placeholder="Search address or place"
            autoComplete="off"
            className={
              usePeekPortal
                ? 'fetch-home-address-input fetch-maps-explore-input fetch-home-stage-field-input fetch-stage-text-input w-full rounded-xl border py-2.5 pl-10 pr-11 text-[15px] font-semibold leading-snug tracking-[-0.01em] shadow-sm outline-none ring-0'
                : 'fetch-home-address-input fetch-maps-explore-input fetch-home-stage-field-input fetch-stage-text-input w-full rounded-2xl border py-3 pl-10 pr-11 text-[16px] font-semibold leading-snug tracking-[-0.01em] shadow-sm outline-none ring-0'
            }
            data-sheet-no-drag
          />
          {addressInput.trim() ? (
            <button
              type="button"
              className="fetch-maps-explore-input-clear absolute right-1.5 top-1/2 z-[1] -translate-y-1/2 rounded-full p-1.5"
              aria-label="Clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAddressInput('')
                setPlacePredictions([])
                setSuggestOpen(false)
              }}
            >
              ×
            </button>
          ) : (
            <button
              type="button"
              className={[
                'fetch-maps-explore-input-mic absolute right-1.5 top-1/2 z-[1] -translate-y-1/2 rounded-full p-1.5 transition-colors',
                mapsSttListening ? 'fetch-maps-explore-input-mic--listening' : '',
              ].join(' ')}
              aria-label="Voice search"
              title="Voice search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (mapsSttListening) stopMapsAddressStt()
                else startMapsAddressStt()
              }}
            >
              <MapsExploreMicIcon className="mx-auto block" />
            </button>
          )}
          {placeSuggestionsVisible ? (
            <ul
              className="fetch-maps-explore-suggestions absolute left-0 right-0 top-full z-[80] mt-1 max-h-52 overflow-y-auto rounded-2xl border py-1 shadow-lg"
              role="listbox"
            >
              {placePredictions.map((row, idx) => (
                <li key={row.placeId} role="option" aria-selected={idx === activeSuggestionIndex}>
                  <button
                    type="button"
                    className={[
                      'fetch-maps-explore-suggestion-item w-full px-3 py-2.5 text-left text-[13px] font-medium',
                      idx === activeSuggestionIndex ? 'fetch-maps-explore-suggestion-item--active' : '',
                    ].join(' ')}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyPlacePrediction(row)}
                  >
                    {row.description}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </>
  )

  const addressHero = (
    <div
      className={
        usePeekPortal
          ? 'fetch-maps-explore-hero fetch-maps-explore-hero--peek w-full'
          : 'fetch-maps-explore-hero'
      }
    >
      {usePeekPortal ? (
        <div className="fetch-maps-explore-search-shell fetch-maps-explore-search-shell--peek">
          {addressSearchFields}
        </div>
      ) : (
        addressSearchFields
      )}
    </div>
  )

  return (
    <>
      {usePeekPortal && mapsPeekHost ? createPortal(addressHero, mapsPeekHost) : null}
      <div className="fetch-maps-explore-sheet flex flex-col gap-3 pb-1">
        {showListsAndChips ? addressHero : null}

      {showListsAndChips ? (
        <>
          {nearbyError ? (
            <p className="fetch-maps-explore-banner rounded-xl border px-3 py-2 text-[12px]">{nearbyError}</p>
          ) : null}

          <div className="fetch-maps-explore-find-nearby">
            <h2 className="fetch-maps-explore-section-heading">Find nearby</h2>
            <div
              className="fetch-maps-explore-category-grid grid grid-cols-2 gap-2 sm:grid-cols-3"
              role="group"
              aria-label="Explore categories"
            >
              <button
                type="button"
                disabled={exploreBusy || !loaderReady}
                onClick={runFindNearby}
                className={[
                  'fetch-maps-explore-category-card flex flex-col items-start gap-2 rounded-2xl p-3 text-left transition-[background,box-shadow,transform] disabled:opacity-45',
                  activeExploreCategory === 'nearby'
                    ? 'fetch-maps-explore-category-card--active'
                    : '',
                ].join(' ')}
              >
                <span className="fetch-maps-explore-category-card__icon" aria-hidden>
                  <CategoryIconNearby />
                </span>
                <span className="fetch-maps-explore-category-card__title">
                  {nearbyLoading ? 'Searching…' : 'Around you'}
                </span>
                <span className="fetch-maps-explore-category-card__hint">Points of interest</span>
              </button>
              <button
                type="button"
                disabled={exploreBusy || !loaderReady}
                onClick={runRefreshAdventures}
                className={[
                  'fetch-maps-explore-category-card flex flex-col items-start gap-2 rounded-2xl p-3 text-left transition-[background,box-shadow,transform] disabled:opacity-45',
                  activeExploreCategory === 'nature'
                    ? 'fetch-maps-explore-category-card--active'
                    : '',
                ].join(' ')}
              >
                <span className="fetch-maps-explore-category-card__icon" aria-hidden>
                  <CategoryIconParks />
                </span>
                <span className="fetch-maps-explore-category-card__title">
                  {adventureLoading ? 'Loading…' : 'Parks'}
                </span>
                <span className="fetch-maps-explore-category-card__hint">Nature and trails</span>
              </button>
              {MAPS_EXPLORE_CATEGORY_CHIPS.filter((c) => c.id !== 'nature').map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={exploreBusy || !loaderReady}
                  onClick={() => runCategoryChip(c.id)}
                  className={[
                    'fetch-maps-explore-category-card flex flex-col items-start gap-2 rounded-2xl p-3 text-left transition-[background,box-shadow,transform] disabled:opacity-45',
                    activeExploreCategory === c.id ? 'fetch-maps-explore-category-card--active' : '',
                  ].join(' ')}
                >
                  <span className="fetch-maps-explore-category-card__icon" aria-hidden>
                    {c.id === 'fuel' ? (
                      <CategoryIconFuel />
                    ) : c.id === 'food' ? (
                      <CategoryIconFood />
                    ) : c.id === 'cafe' ? (
                      <CategoryIconCafe />
                    ) : (
                      <CategoryIconShops />
                    )}
                  </span>
                  <span className="fetch-maps-explore-category-card__title">
                    {chipLoadingId === c.id ? 'Loading…' : c.label}
                  </span>
                  <span className="fetch-maps-explore-category-card__hint">
                    {c.id === 'fuel'
                      ? 'Petrol and diesel'
                      : c.id === 'food'
                        ? 'Dining'
                        : c.id === 'cafe'
                          ? 'Coffee and snacks'
                          : 'Groceries and retail'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {parksPhotoCards.length > 0 ? (
            <section className="fetch-maps-explore-section fetch-maps-explore-carousel-section">
              <h3 className="fetch-maps-explore-section-label mb-2">Parks and nature</h3>
              <div className="fetch-maps-explore-carousel flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1">
                {parksPhotoCards.map((c) => (
                  <article
                    key={c.placeId}
                    className="fetch-maps-explore-carousel-card snap-start shrink-0 overflow-hidden rounded-2xl"
                  >
                    {c.photoUrl ? (
                      <img
                        src={c.photoUrl}
                        alt=""
                        className="fetch-maps-explore-carousel-card__img h-[104px] w-[200px] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="fetch-maps-explore-carousel-card__placeholder flex h-[104px] w-[200px] items-end bg-gradient-to-br from-emerald-500/35 via-sky-500/25 to-fetch-charcoal/20 p-2">
                        <span className="text-[11px] font-semibold text-white/95 drop-shadow">
                          {c.title}
                        </span>
                      </div>
                    )}
                    <div className="fetch-maps-explore-carousel-card__body space-y-1.5 p-2.5">
                      {c.photoUrl ? (
                        <p className="fetch-maps-explore-carousel-card__title line-clamp-2 text-[13px] font-semibold leading-tight">
                          {c.title}
                        </p>
                      ) : null}
                      <p className="fetch-maps-explore-carousel-card__meta text-[11px]">
                        {distanceFromUser(c.lat, c.lng)}
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className="fetch-maps-explore-link-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                          onClick={() => onShowPlaceOnMap(c.lat, c.lng)}
                        >
                          Map
                        </button>
                        <button
                          type="button"
                          className="fetch-maps-explore-secondary-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                          onClick={() =>
                            startNavFromMaps({
                              lat: c.lat,
                              lng: c.lng,
                              label: c.title,
                              placeId: c.placeId,
                            })
                          }
                        >
                          Go
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {adventurePhotoCards.length > 0 ? (
            <section className="fetch-maps-explore-section fetch-maps-explore-carousel-section">
              <h3 className="fetch-maps-explore-section-label mb-2">Places to visit</h3>
              <div className="fetch-maps-explore-carousel flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1">
                {adventurePhotoCards.map((c) => (
                  <article
                    key={c.placeId}
                    className="fetch-maps-explore-carousel-card snap-start shrink-0 overflow-hidden rounded-2xl"
                  >
                    {c.photoUrl ? (
                      <img
                        src={c.photoUrl}
                        alt=""
                        className="fetch-maps-explore-carousel-card__img h-[104px] w-[200px] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="fetch-maps-explore-carousel-card__placeholder flex h-[104px] w-[200px] items-end bg-gradient-to-br from-amber-500/40 via-orange-500/25 to-fetch-charcoal/25 p-2">
                        <span className="text-[11px] font-semibold text-white/95 drop-shadow">
                          {c.title}
                        </span>
                      </div>
                    )}
                    <div className="fetch-maps-explore-carousel-card__body space-y-1.5 p-2.5">
                      {c.photoUrl ? (
                        <p className="fetch-maps-explore-carousel-card__title line-clamp-2 text-[13px] font-semibold leading-tight">
                          {c.title}
                        </p>
                      ) : null}
                      <p className="fetch-maps-explore-carousel-card__meta text-[11px]">
                        {distanceFromUser(c.lat, c.lng)}
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className="fetch-maps-explore-link-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                          onClick={() => onShowPlaceOnMap(c.lat, c.lng)}
                        >
                          Map
                        </button>
                        <button
                          type="button"
                          className="fetch-maps-explore-secondary-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                          onClick={() =>
                            startNavFromMaps({
                              lat: c.lat,
                              lng: c.lng,
                              label: c.title,
                              placeId: c.placeId,
                            })
                          }
                        >
                          Go
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

      <section className="fetch-maps-explore-section">
        <h3 className="fetch-maps-explore-section-label">Recents</h3>
        {recents.length === 0 ? (
          <p className="fetch-maps-explore-muted-text text-[12px]">
            Directions you start appear here.
          </p>
        ) : (
          <ul className="fetch-maps-explore-divided-list">
            {recents.slice(0, 6).map((r) => (
              <li key={`${keyForRecent(r)}`} className="fetch-maps-explore-divided-list__item">
                <div className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="fetch-maps-explore-list-title text-[13px] font-semibold leading-snug">
                      {r.label}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="fetch-maps-explore-link-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                      onClick={() => onShowPlaceOnMap(r.lat, r.lng)}
                    >
                      Map
                    </button>
                    <button
                      type="button"
                      className="fetch-maps-explore-secondary-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                      onClick={() =>
                        startNavFromMaps({
                          lat: r.lat,
                          lng: r.lng,
                          label: r.label,
                          placeId: r.placeId,
                        })
                      }
                    >
                      Go
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fetch-maps-explore-section">
        <h3 className="fetch-maps-explore-section-label">{savedOrPopularRows.heading}</h3>
        {savedOrPopularRows.subtitle ? (
          <p className="fetch-maps-explore-muted-text mb-2 text-[12px] leading-relaxed">
            {savedOrPopularRows.subtitle}
          </p>
        ) : null}
        <ul className="fetch-maps-explore-divided-list">
          {savedOrPopularRows.rows.map((row) => (
            <li key={row.id} className="fetch-maps-explore-divided-list__item">
              <div className="flex items-start justify-between gap-3 py-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    startNavFromMaps({
                      lat: row.lat,
                      lng: row.lng,
                      label: row.address,
                      placeId: row.placeId,
                    })
                  }
                >
                  <p className="fetch-maps-explore-list-title text-[13px] font-semibold leading-snug">
                    {row.label}
                  </p>
                  <p className="fetch-maps-explore-list-address mt-0.5 text-[12px] leading-snug">
                    {row.address}
                  </p>
                </button>
                <div className="flex shrink-0 gap-1 self-center">
                  <button
                    type="button"
                    className="fetch-maps-explore-link-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                    onClick={() => onShowPlaceOnMap(row.lat, row.lng)}
                  >
                    Map
                  </button>
                  <button
                    type="button"
                    className="fetch-maps-explore-secondary-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                    onClick={() =>
                      startNavFromMaps({
                        lat: row.lat,
                        lng: row.lng,
                        label: row.address,
                        placeId: row.placeId,
                      })
                    }
                  >
                    Go
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="fetch-maps-explore-section min-h-0 flex-1">
        <h3 className="fetch-maps-explore-section-label">Parks and adventures</h3>
        {lastExplorePois.length === 0 && !adventureLoading ? (
          <p className="fetch-maps-explore-muted-text text-[12px]">
            Enable location to see parks, attractions, and natural spots nearby.
          </p>
        ) : (
          <ul className="fetch-maps-explore-divided-list">
            {lastExplorePois.map((p) => (
              <li key={p.id} className="fetch-maps-explore-divided-list__item">
                <div className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="fetch-maps-explore-list-title text-[13px] font-semibold leading-snug">
                      {p.title}
                    </p>
                    <p className="fetch-maps-explore-list-meta mt-0.5 text-[11px]">
                      {[p.kind, distanceFromUser(p.lat, p.lng)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1 self-center">
                    <button
                      type="button"
                      className="fetch-maps-explore-link-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                      onClick={() => onShowPlaceOnMap(p.lat, p.lng)}
                    >
                      Map
                    </button>
                    <button
                      type="button"
                      className="fetch-maps-explore-secondary-btn rounded-lg px-2 py-1 text-[11px] font-semibold"
                      onClick={() =>
                        startNavFromMaps({
                          lat: p.lat,
                          lng: p.lng,
                          label: p.title,
                          placeId: p.placeId,
                        })
                      }
                    >
                      Go
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
        </>
      ) : null}
    </div>
    </>
  )
}

function keyForRecent(r: RecentNavDestination): string {
  return `${r.placeId ?? ''}:${r.lat}:${r.lng}:${r.at}`
}

function CategoryIconNearby({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  )
}

function CategoryIconParks({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22v-7" />
      <path d="M9 8h6" />
      <path d="M6.5 15H9" />
      <path d="M15 15h2.5" />
      <path d="M12 15a3 3 0 0 0 3-3V9a3 3 0 0 0-6 0v3a3 3 0 0 0 3 3Z" />
      <path d="M7 16c-1.5 0-2.5-1-2.5-2.5S5.5 11 7 11" />
      <path d="M17 16c1.5 0 2.5-1 2.5-2.5S18.5 11 17 11" />
    </svg>
  )
}

function CategoryIconFuel({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M3 10h12" />
      <path d="M15 7h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-3" />
      <path d="M19 10V6" />
    </svg>
  )
}

function CategoryIconFood({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  )
}

function CategoryIconCafe({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <line x1="6" y1="2" x2="6" y2="4" />
      <line x1="10" y1="2" x2="10" y2="4" />
      <line x1="14" y1="2" x2="14" y2="4" />
    </svg>
  )
}

function CategoryIconShops({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}
