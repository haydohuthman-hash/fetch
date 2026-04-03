import { GoogleMap, useJsApiLoader } from '@react-google-maps/api'
import type { ReactNode } from 'react'
import { useCallback, useRef } from 'react'
import { BRISBANE_CENTER } from './brisbaneMap'

const GOOGLE_MAP_LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry']

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1b1f' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5a5e66' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#12131a' }, { weight: 4 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#16171c' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#181a1f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#242630' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1e2028' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4a4e58' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#1e2026' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#1a1c22' }] },
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#1c1d22' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#18191e' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d0e14' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a3e48' }] },
]

type GoogleMapLayerProps = {
  apiKey: string
  onMapReady?: (map: google.maps.Map) => void
  onJavaScriptReady?: (ready: boolean) => void
  ambientDrift?: boolean
  children?: ReactNode
}

export function GoogleMapLayer({
  apiKey,
  onMapReady,
  onJavaScriptReady,
  children,
}: GoogleMapLayerProps) {
  const mapRef = useRef<google.maps.Map | null>(null)

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'fetch-google-maps',
    googleMapsApiKey: apiKey,
    version: 'weekly',
    libraries: GOOGLE_MAP_LIBRARIES,
  })

  const onLoadedRef = useRef(false)

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      if (onLoadedRef.current) return
      onLoadedRef.current = true
      mapRef.current = map
      onMapReady?.(map)
      onJavaScriptReady?.(true)
    },
    [onMapReady, onJavaScriptReady],
  )

  if (loadError) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-[#0e0f12] px-4 text-center text-[13px] text-fetch-muted"
        role="alert"
      >
        Map could not load.
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="absolute inset-0 bg-[#0e0f12]" aria-busy aria-label="Loading map" />
    )
  }

  return (
    <GoogleMap
      mapContainerClassName="absolute inset-0 h-full w-full"
      center={BRISBANE_CENTER}
      zoom={11}
      onLoad={onLoad}
      options={{
        disableDefaultUI: true,
        zoomControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy',
        keyboardShortcuts: false,
        clickableIcons: false,
        disableDoubleClickZoom: true,
        styles: DARK_MAP_STYLES,
      }}
    >
      {children}
    </GoogleMap>
  )
}
