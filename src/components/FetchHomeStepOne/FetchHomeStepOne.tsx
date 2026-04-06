import { memo, useEffect, useState, type CSSProperties } from 'react'
import type { BookingStage } from '../../lib/assistant'
import { useFetchTheme } from '../../theme/FetchThemeContext'
import { FakeMapBackground } from './FakeMapBackground'
import { GoogleMapLayer } from './GoogleMapLayer'
import { MapboxMapLayer } from './MapboxMapLayer'
import type { ExploreMapPoi } from '../../lib/mapsExplorePlaces'
import {
  BookingMapReflection,
  type LiveTrackingMapFit,
  type MapAccentRgb,
} from './BookingMapReflection'
import type { HardwareProduct } from '../../lib/hardwareCatalog'
import { MapTimeWeatherOverlay, type MapNavStatusStrip } from './MapTimeWeatherOverlay'

export type { LiveTrackingMapFit, MapAccentRgb } from './BookingMapReflection'

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
  /** Orb “black hole” tunnel: heavy blur during zoom, then clarity pass. */
  mapTunnelPhase?: 'tunnel' | null
  /** Pause BookingMapReflection camera automation while the tunnel owns the map. */
  suspendMapCameraAutomation?: boolean
  /** ETA / next-turn strip below the top brand bar when a route is active. */
  mapNavStrip?: MapNavStatusStrip | null
  /** Traffic-aware driver → pickup polyline during dispatch. */
  driverToPickupPath?: google.maps.LatLngLiteral[] | null
  driverLivePosition?: google.maps.LatLngLiteral | null
  /** Center map on device location while navigating. */
  mapFollowUser?: boolean
  onMapFollowUserChange?: (next: boolean) => void
  onMapInstance?: (map: google.maps.Map | null) => void
  /**
   * Turn off Maps traffic tint (green/yellow roads) — chat nav + map explore.
   * Dispatch / booking route preview still use traffic when false.
   */
  suppressTrafficLayer?: boolean
  /** Maps explore / nearby pins. */
  explorePois?: readonly ExploreMapPoi[]
  /** Softer pins + no auto fit-bounds while follow-user chat navigation is active. */
  navigationRouteActive?: boolean
  /** Maps tab: red pin at user-chosen map center. */
  droppedPinCoords?: google.maps.LatLngLiteral | null
  /** Map overlay menu → account / auth (parent shell). */
  onHomeMapMenuAccount?: () => void
  /** Map hamburger → hardware rail catalog (defaults from `hardwareCatalog` module). */
  homeMapHardwareCatalog?: readonly HardwareProduct[]
  /** Driver dashboard map overlay (slim menu, help copy). */
  mapOverlayContext?: 'home' | 'driver'
  onDriverMapExit?: () => void
  /** Live trip: keep driver + destination in frame. */
  liveTrackingFit?: LiveTrackingMapFit | null
  /** Bump when the user confirms pickup so the map replays lock-in fanfare even if coords unchanged. */
  pickupLockInCelebrateKey?: number
  /** Compact banner above the map when a booking was started from Fetch chat. */
  chatBookingHintLabel?: string | null
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
  mapTunnelPhase = null,
  suspendMapCameraAutomation = false,
  mapNavStrip = null,
  driverToPickupPath = null,
  driverLivePosition = null,
  mapFollowUser = false,
  onMapFollowUserChange,
  onMapInstance,
  suppressTrafficLayer = false,
  explorePois = [],
  navigationRouteActive = false,
  droppedPinCoords = null,
  onHomeMapMenuAccount,
  homeMapHardwareCatalog,
  mapOverlayContext = 'home',
  onDriverMapExit,
  liveTrackingFit = null,
  pickupLockInCelebrateKey = 0,
  chatBookingHintLabel = null,
}: FetchHomeStepOneProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const mapboxToken =
    import.meta.env.VITE_MAPBOX_TOKEN?.trim() ??
    import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ??
    ''
  const { resolved: theme } = useFetchTheme()

  useEffect(() => {
    onMapInstance?.(map)
  }, [map, onMapInstance])

  const tunnelPhase = mapTunnelPhase === 'tunnel' ? 'tunnel' : 'off'
  const showRouteChrome =
    mapNavStrip != null ||
    (driverToPickupPath != null && driverToPickupPath.length >= 2)
  const showTrafficLayer = showRouteChrome && !suppressTrafficLayer
  const appleNavChrome = mapNavStrip?.navChrome === 'apple'

  return (
    <div
      className={[
        'relative h-full min-h-dvh w-full',
        mapboxToken
          ? 'overflow-x-clip overflow-y-visible bg-transparent'
          : 'overflow-hidden bg-white',
      ].join(' ')}
    >
      <div
        className={[
          'fetch-home-map-tunnel-layer absolute inset-0 flex flex-col will-change-[filter,transform]',
          mapboxToken ? 'min-h-dvh' : 'min-h-0',
          tunnelPhase === 'tunnel' ? 'fetch-home-map-tunnel-layer--active' : '',
        ].join(' ')}
        data-map-tunnel={tunnelPhase}
        role="presentation"
        style={
          {
            ['--fetch-map-header-h' as string]:
              'calc(env(safe-area-inset-top, 0px) + 3.5rem)',
          } as CSSProperties
        }
      >
        <div
          className={[
            'fetch-home-map-viewport relative z-0 mt-[var(--fetch-map-header-h)] flex-1',
            mapboxToken
              ? 'min-h-[calc(100dvh-var(--fetch-map-header-h))] overflow-visible rounded-none bg-transparent shadow-none ring-0'
              : 'min-h-0 overflow-hidden rounded-t-[1.375rem] bg-white shadow-[0_-4px_28px_rgba(15,23,42,0.05)] ring-1 ring-white',
          ].join(' ')}
          role="presentation"
        >
          <div
            className={[
              'absolute inset-0 z-0 min-h-full w-full',
              mapboxToken ? 'overflow-visible' : 'overflow-hidden rounded-t-[1.375rem]',
            ].join(' ')}
            role="presentation"
            aria-label="Job map preview"
          >
            {mapboxToken ? (
              <MapboxMapLayer
                accessToken={mapboxToken}
                onJavaScriptReady={onMapsJavaScriptReady}
                onMapReady={() => setMap(null)}
                userLocationCoords={userLocationCoords}
                pickupCoords={pickupCoords}
                routePath={routePath}
              />
            ) : mapsApiKey ? (
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
                  suspendCameraAutomation={suspendMapCameraAutomation}
                  cameraFollowUser={mapFollowUser}
                  showTrafficLayer={showTrafficLayer}
                  explorePois={explorePois}
                  navigationRouteActive={navigationRouteActive}
                  droppedPinCoords={droppedPinCoords}
                  driverToPickupPath={driverToPickupPath}
                  driverLivePosition={driverLivePosition}
                  liveTrackingFit={liveTrackingFit}
                  pickupLockInCelebrateKey={pickupLockInCelebrateKey}
                />
              </GoogleMapLayer>
            ) : (
              <FakeMapBackground variant={theme === 'light' ? 'light' : 'dark'} />
            )}
          </div>
          {showRouteChrome && onMapFollowUserChange ? (
            <div className="pointer-events-auto absolute bottom-[max(6.5rem,env(safe-area-inset-bottom)+5rem)] right-4 z-[20]">
              <button
                type="button"
                onClick={() => onMapFollowUserChange(!mapFollowUser)}
                className={[
                  'rounded-full border px-3.5 py-2 text-[11px] font-semibold shadow-lg transition-[transform,colors] active:scale-[0.97]',
                  appleNavChrome
                    ? mapFollowUser
                      ? 'border-black/10 bg-white/95 text-neutral-900 shadow-[0_4px_20px_rgba(0,0,0,0.12)] backdrop-blur-md'
                      : 'border-black/8 bg-white/90 text-neutral-800 shadow-[0_4px_20px_rgba(0,0,0,0.1)] backdrop-blur-md'
                    : mapFollowUser
                      ? 'border-emerald-400/35 bg-emerald-950/55 text-emerald-100 backdrop-blur-md'
                      : 'border-white/15 bg-black/40 text-white/88 backdrop-blur-md',
                ].join(' ')}
                aria-pressed={mapFollowUser}
              >
                {mapFollowUser ? 'Overview' : 'Follow me'}
              </button>
            </div>
          ) : null}
          {chatBookingHintLabel ? (
            <div
              className="pointer-events-none absolute left-3 right-3 top-3 z-[20] flex justify-center px-1"
              role="status"
              aria-live="polite"
            >
              <p className="max-w-full truncate rounded-full border border-white/25 bg-black/45 px-3.5 py-1.5 text-center text-[11px] font-semibold text-white/95 shadow-lg backdrop-blur-md">
                {chatBookingHintLabel}
              </p>
            </div>
          ) : null}
          <MapTimeWeatherOverlay
            navStrip={mapNavStrip}
            onMenuAccount={onHomeMapMenuAccount}
            hardwareProducts={homeMapHardwareCatalog}
            overlayContext={mapOverlayContext}
            onDriverExit={onDriverMapExit}
          />
        </div>
      </div>
    </div>
  )
}

export const FetchHomeStepOne = memo(FetchHomeStepOneInner)
export default FetchHomeStepOne
