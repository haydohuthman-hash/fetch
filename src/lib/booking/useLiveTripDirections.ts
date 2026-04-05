import { useEffect, useRef, useState } from 'react'
import type { BookingDriverLocation, BookingLifecycleStatus } from '../assistant/types'
import {
  drivingTrafficDirectionsRequest,
  firstStepPlainInstruction,
  legDurationTrafficAndDistance,
  overviewPathFromRoute,
} from '../homeDirections'
import { resolveLiveTrackingEndpoints, type LiveTrackingLegPhase } from './liveTrackingLeg'

export type LiveTripDirectionsState = {
  path: google.maps.LatLngLiteral[] | null
  etaSeconds: number | null
  /** Smoothed duration for along-path animation when GPS is stale */
  durationSeconds: number | null
  trafficDelaySeconds: number | null
  nextStep: string | null
  distanceMeters: number | null
  phase: LiveTrackingLegPhase | null
}

const EMPTY: LiveTripDirectionsState = {
  path: null,
  etaSeconds: null,
  durationSeconds: null,
  trafficDelaySeconds: null,
  nextStep: null,
  distanceMeters: null,
  phase: null,
}

const DEFAULT_INTERVAL_MS = 72_000

export type UseLiveTripDirectionsArgs = {
  mapsJsReady: boolean
  enabled: boolean
  bookingId: string | null
  status: BookingLifecycleStatus | null
  pickupCoords: { lat: number; lng: number } | null
  dropoffCoords: { lat: number; lng: number } | null
  driverLocation: BookingDriverLocation | null
  gpsFreshMs: number
  /** Live device GPS for driver app (customer app passes null). */
  liveDeviceGps: google.maps.LatLngLiteral | null
  liveDeviceGpsFresh: boolean
  refreshIntervalMs?: number
  /** Fires when route request starts successfully (for animation reset). */
  onRouteComputed?: () => void
}

/**
 * Traffic-aware Directions for the active live leg (pickup vs dropoff). Shared by home + driver map.
 */
export function useLiveTripDirections({
  mapsJsReady,
  enabled,
  bookingId,
  status,
  pickupCoords,
  dropoffCoords,
  driverLocation,
  gpsFreshMs,
  liveDeviceGps,
  liveDeviceGpsFresh,
  refreshIntervalMs = DEFAULT_INTERVAL_MS,
  onRouteComputed,
}: UseLiveTripDirectionsArgs): LiveTripDirectionsState {
  const [state, setState] = useState<LiveTripDirectionsState>(EMPTY)
  const onComputedRef = useRef(onRouteComputed)
  onComputedRef.current = onRouteComputed

  useEffect(() => {
    if (!enabled || !mapsJsReady || typeof google === 'undefined' || !bookingId) {
      setState(EMPTY)
      return
    }

    let cancelled = false

    const run = () => {
      if (cancelled) return
      /** Driver app: device GPS only (matches DriverDashboardView). Customer: polled `driverLocation`. */
      const locNow =
        liveDeviceGpsFresh && liveDeviceGps
          ? ({
              lat: liveDeviceGps.lat,
              lng: liveDeviceGps.lng,
              updatedAt: Date.now(),
            } satisfies BookingDriverLocation)
          : driverLocation

      const ep = resolveLiveTrackingEndpoints({
        status,
        bookingId,
        pickupCoords,
        dropoffCoords,
        driverLocation: locNow,
        gpsFreshMs,
      })
      if (!ep) {
        if (!cancelled) setState(EMPTY)
        return
      }

      const svc = new google.maps.DirectionsService()
      svc.route(
        drivingTrafficDirectionsRequest(ep.origin, ep.destination),
        (result, routeStatus) => {
          if (cancelled || routeStatus !== 'OK' || !result?.routes[0]) return
          const route = result.routes[0]
          const leg = route.legs?.[0]
          const path = overviewPathFromRoute(route)
          const { distanceMeters, durationSeconds, trafficDelaySeconds } =
            legDurationTrafficAndDistance(leg)
          onComputedRef.current?.()
          setState({
            path: path.length >= 2 ? path : null,
            etaSeconds: durationSeconds,
            durationSeconds: Math.max(45, durationSeconds),
            trafficDelaySeconds,
            nextStep: firstStepPlainInstruction(route),
            distanceMeters: distanceMeters > 0 ? distanceMeters : null,
            phase: ep.phase,
          })
        },
      )
    }

    run()
    const iv = window.setInterval(run, refreshIntervalMs)
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [
    mapsJsReady,
    enabled,
    bookingId,
    status,
    pickupCoords?.lat,
    pickupCoords?.lng,
    dropoffCoords?.lat,
    dropoffCoords?.lng,
    driverLocation?.lat,
    driverLocation?.lng,
    driverLocation?.updatedAt,
    gpsFreshMs,
    liveDeviceGps?.lat,
    liveDeviceGps?.lng,
    liveDeviceGpsFresh,
    refreshIntervalMs,
  ])

  return state
}
