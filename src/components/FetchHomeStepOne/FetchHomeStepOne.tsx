import { useState } from 'react'
import type { BookingStage } from '../../lib/assistant'
import { FakeMapBackground } from './FakeMapBackground'
import { GoogleMapLayer } from './GoogleMapLayer'
import { BookingMapReflection, type MapAccentRgb } from './BookingMapReflection'

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
}

/**
 * Full-screen map shell only (no booking flow). Hero map for the starting screen.
 */
export function FetchHomeStepOne({
  onMapsJavaScriptReady,
  pickup = null,
  dropoff = null,
  pickupCoords = null,
  dropoffCoords = null,
  routePath = null,
  mapStage = 'idle',
  mapAccentRgb,
}: FetchHomeStepOneProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''

  return (
    <div className="relative h-full min-h-dvh w-full overflow-hidden bg-[#0e0f12]">
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
            />
          </GoogleMapLayer>
        ) : (
          <FakeMapBackground />
        )}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-[radial-gradient(ellipse_110%_78%_at_50%_100%,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.28)_32%,rgba(0,0,0,0.12)_54%,transparent_76%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-[linear-gradient(to_top,rgba(14,15,18,0.55)_0%,rgba(14,15,18,0.25)_44%,transparent_100%)]"
        aria-hidden
      />
    </div>
  )
}

export default FetchHomeStepOne
