import { Circle, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFetchTheme } from '../../theme/FetchThemeContext'
const LIBS: ('geometry')[] = ['geometry']

const LIGHT_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f3f5f7' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1b1f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

export type ServiceRadiusKm = 10 | 30 | 50

export type LocationRadiusConfirm = {
  lat: number
  lng: number
  radiusKm: ServiceRadiusKm
  label: string
}

type LocationRadiusPickerSheetProps = {
  apiKey: string
  open: boolean
  onClose: () => void
  initialCenter: google.maps.LatLngLiteral
  initialRadiusKm: ServiceRadiusKm
  onConfirm: (value: LocationRadiusConfirm) => void
}

function zoomForRadiusKm(km: ServiceRadiusKm): number {
  if (km <= 10) return 9
  if (km <= 30) return 8
  return 7
}

export function LocationRadiusPickerSheet({
  apiKey,
  open,
  onClose,
  initialCenter,
  initialRadiusKm,
  onConfirm,
}: LocationRadiusPickerSheetProps) {
  const { resolved: theme } = useFetchTheme()
  const mapRef = useRef<google.maps.Map | null>(null)
  const geocodeTimerRef = useRef<number>(0)
  const [center, setCenter] = useState<google.maps.LatLngLiteral>(initialCenter)
  const [radiusKm, setRadiusKm] = useState<ServiceRadiusKm>(initialRadiusKm)
  const [label, setLabel] = useState('')
  const [geocodeBusy, setGeocodeBusy] = useState(false)

  const { isLoaded } = useJsApiLoader({
    id: 'fetch-google-maps',
    googleMapsApiKey: apiKey,
    version: 'weekly',
    libraries: LIBS,
    preventGoogleFontsLoading: true,
  })

  useEffect(() => {
    if (!open) return
    setCenter(initialCenter)
    setRadiusKm(initialRadiusKm)
    setLabel('')
  }, [open, initialCenter.lat, initialCenter.lng, initialRadiusKm])

  const reverseGeocode = useCallback((pos: google.maps.LatLngLiteral) => {
    if (typeof google === 'undefined' || !google.maps?.Geocoder) return
    setGeocodeBusy(true)
    const geocoder = new google.maps.Geocoder()
    geocoder.geocode({ location: pos }, (results, status) => {
      setGeocodeBusy(false)
      if (status !== 'OK' || !results?.[0]) {
        setLabel('')
        return
      }
      setLabel(results[0].formatted_address ?? '')
    })
  }, [])

  useEffect(() => {
    if (!open || !isLoaded) return
    window.clearTimeout(geocodeTimerRef.current)
    geocodeTimerRef.current = window.setTimeout(() => {
      reverseGeocode(center)
    }, 280)
    return () => window.clearTimeout(geocodeTimerRef.current)
  }, [open, isLoaded, center.lat, center.lng, reverseGeocode])

  useEffect(() => {
    const m = mapRef.current
    if (!m || !open) return
    m.panTo(center)
    const z = zoomForRadiusKm(radiusKm)
    const cur = m.getZoom()
    if (cur == null || Math.abs(cur - z) >= 1) m.setZoom(z)
  }, [open, center, radiusKm])

  const onDragEnd = useCallback((e: google.maps.MapMouseEvent & { latLng?: google.maps.LatLng | null }) => {
    const ll = e.latLng
    if (!ll) return
    setCenter({ lat: ll.lat(), lng: ll.lng() })
  }, [])

  const handleDone = useCallback(() => {
    onConfirm({
      lat: center.lat,
      lng: center.lng,
      radiusKm,
      label: label.trim(),
    })
  }, [center.lat, center.lng, label, onConfirm, radiusKm])

  const mapStyles = theme === 'light' ? LIGHT_STYLES : DARK_STYLES
  const radiusM = radiusKm * 1000

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="Close area picker"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[50dvh] min-h-[min(50dvh,26rem)] w-full flex-col overflow-hidden rounded-t-[1.25rem] bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.2)] dark:bg-zinc-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fetch-location-radius-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200/90 px-3 py-2 dark:border-zinc-700/90">
          <button
            type="button"
            className="rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            onClick={onClose}
          >
            Cancel
          </button>
          <h2
            id="fetch-location-radius-title"
            className="min-w-0 flex-1 truncate text-center text-[14px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50"
          >
            Your area
          </h2>
          <button
            type="button"
            className="rounded-full bg-fetch-red px-3 py-1.5 text-[13px] font-bold text-white shadow-sm transition-transform active:scale-[0.97]"
            onClick={handleDone}
          >
            Done
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          {!isLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-[13px] text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              Loading map…
            </div>
          ) : (
            <GoogleMap
              mapContainerClassName="absolute inset-0 h-full w-full"
              center={center}
              zoom={zoomForRadiusKm(radiusKm)}
              onLoad={(m) => {
                mapRef.current = m
              }}
              options={{
                disableDefaultUI: true,
                gestureHandling: 'greedy',
                keyboardShortcuts: false,
                clickableIcons: false,
                styles: mapStyles,
                backgroundColor: theme === 'light' ? '#f3f5f7' : '#1a1b1f',
              }}
            >
              <Circle
                center={center}
                radius={radiusM}
                options={{
                  strokeColor: '#e11d48',
                  strokeOpacity: 0.85,
                  strokeWeight: 2,
                  fillColor: '#e11d48',
                  fillOpacity: 0.1,
                }}
              />
              <Marker
                position={center}
                draggable
                onDragEnd={onDragEnd}
                options={{
                  optimized: true,
                }}
              />
            </GoogleMap>
          )}
        </div>

        <div className="shrink-0 space-y-2.5 border-t border-zinc-200/90 bg-white px-3 py-3 dark:border-zinc-700/90 dark:bg-zinc-900">
          <p className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug text-zinc-600 dark:text-zinc-300">
            {geocodeBusy ? 'Finding address…' : label || 'Drag the pin to set your area centre.'}
          </p>
          <div className="flex gap-2" role="group" aria-label="Service radius">
            {([10, 30, 50] as const).map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => setRadiusKm(km)}
                className={[
                  'flex-1 rounded-full py-2 text-[12px] font-bold transition-colors',
                  radiusKm === km
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
                ].join(' ')}
              >
                {km} km
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export const SERVICE_AREA_STORAGE_KEY = 'fetch-service-area-v1'

export function loadServiceAreaFromStorage(): {
  center: google.maps.LatLngLiteral
  radiusKm: ServiceRadiusKm
  label: string
} | null {
  try {
    const raw = localStorage.getItem(SERVICE_AREA_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { lat: number; lng: number; radiusKm: number; label?: string }
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null
    const r = (p.radiusKm === 10 || p.radiusKm === 30 || p.radiusKm === 50 ? p.radiusKm : 30) as ServiceRadiusKm
    return {
      center: { lat: p.lat, lng: p.lng },
      radiusKm: r,
      label: typeof p.label === 'string' ? p.label : '',
    }
  } catch {
    return null
  }
}

export function saveServiceAreaToStorage(value: LocationRadiusConfirm) {
  try {
    localStorage.setItem(
      SERVICE_AREA_STORAGE_KEY,
      JSON.stringify({
        lat: value.lat,
        lng: value.lng,
        radiusKm: value.radiusKm,
        label: value.label,
      }),
    )
  } catch {
    /* ignore */
  }
}
