import { memo, useState } from 'react'
import type { BookingStage } from '../../lib/assistant'
import { useFetchTheme } from '../../theme/FetchThemeContext'
import { FakeMapBackground } from './FakeMapBackground'
import { GoogleMapLayer } from './GoogleMapLayer'
import { BookingMapReflection, type MapAccentRgb } from './BookingMapReflection'
import { MapTimeWeatherOverlay } from './MapTimeWeatherOverlay'

export type { MapAccentRgb } from './BookingMapReflection'

export type FetchHomeStepOneProps = {
  onMapsJavaScriptReady?: (ready: boolean) => void
  pickup?: string | null
  dropoff?: string | null
  pickupCoords?: google.maps.LatLngLiteral | null
  dropoffCoords?: google.maps.LatLngLiteral | null
  routePath?: google.maps.LatLngLiteral[] | null
  /** Drives map chrome (pins / route animations). */
  mapStage?: BookingStage
  /** Pin drop pulse + marker tint — match booking stage glow. */
  mapAccentRgb?: MapAccentRgb
  /** Device location when the user allows it — “you are here” pin on the map. */
  userLocationCoords?: google.maps.LatLngLiteral | null
}

/**
 * Full-screen map shell only (no booking flow). Hero map for the starting screen.
 */
function FetchHomeStepOneInner({
  onMapsJavaScriptReady,
  pickup = null,
  dropoff = null,
  pickupCoords = null,
  dropoffCoords = null,
  routePath = null,
  mapStage = 'idle',
  mapAccentRgb,
  userLocationCoords = null,
}: FetchHomeStepOneProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const { resolved: theme } = useFetchTheme()

  return (
    <div className="relative h-full min-h-dvh w-full overflow-hidden bg-[var(--fetch-app-bg,#030308)]">
      <div className="absolute inset-0" role="presentation" aria-label="Job map preview">
        {mapsApiKey ? (
          <GoogleMapLayer
            apiKey={mapsApiKey}
            onMapReady={setMap}
            onJavaScriptReady={onMapsJavaScriptReady}
          >
            <BookingMapReflection
              pickup={pickup}
              dropoff={dropoff}
              pickupCoords={pickupCoords}
              dropoffCoords={dropoffCoords}
              routePath={routePath}
              map={map}
              stage={mapStage}
              accentRgb={mapAccentRgb}
              userLocationCoords={userLocationCoords}
            />
          </GoogleMapLayer>
        ) : (
          <FakeMapBackground variant={theme === 'light' ? 'light' : 'dark'} />
        )}
      </div>
      <MapTimeWeatherOverlay />
    </div>
  )
}

export const FetchHomeStepOne = memo(FetchHomeStepOneInner)
export default FetchHomeStepOne
