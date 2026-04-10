import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FETCH_MAPBOX_STYLE_URL } from '../../lib/mapboxStyle'
/** Brisbane CBD — fallback when no user location */
const FALLBACK_CENTER: [number, number] = [153.0251, -27.4698]
const DEFAULT_ZOOM = 13
const DEFAULT_PITCH = 38
const ROUTE_SOURCE_ID = 'fetch-mapbox-route'
const ROUTE_LAYER_ID = 'fetch-mapbox-route-line'

export type MapboxMapLayerProps = {
  accessToken: string
  onMapReady?: (map: mapboxgl.Map) => void
  onJavaScriptReady?: (ready: boolean) => void
  /** Device location — map eases here when it updates. */
  userLocationCoords?: google.maps.LatLngLiteral | null
  /** Pickup marker. */
  pickupCoords?: google.maps.LatLngLiteral | null
  /** Booking / preview route (lat/lng path). */
  routePath?: google.maps.LatLngLiteral[] | null
}

function lngLatFromGoogle(c: google.maps.LatLngLiteral): [number, number] {
  return [c.lng, c.lat]
}

function createDotMarker(className: string): HTMLElement {
  const el = document.createElement('div')
  el.className = className
  el.setAttribute('role', 'presentation')
  return el
}

function syncRouteLayer(map: mapboxgl.Map, path: google.maps.LatLngLiteral[] | null | undefined) {
  const coords =
    path && path.length >= 2
      ? path.map((p) => [p.lng, p.lat] as [number, number])
      : null

  if (!coords) {
    if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID)
    if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID)
    return
  }

  const geojson = {
    type: 'Feature' as const,
    properties: {} as Record<string, never>,
    geometry: { type: 'LineString' as const, coordinates: coords },
  }

  const src = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined
  if (src) {
    src.setData(geojson)
  } else {
    map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson })
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#111827',
        'line-width': 4,
        'line-opacity': 0.88,
      },
    })
  }
}

/**
 * Production Mapbox GL map for the Fetch home viewport.
 */
export function MapboxMapLayer({
  accessToken,
  onMapReady,
  onJavaScriptReady,
  userLocationCoords = null,
  pickupCoords = null,
  routePath = null,
}: MapboxMapLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const onMapReadyRef = useRef(onMapReady)
  const onJsReadyRef = useRef(onJavaScriptReady)

  useEffect(() => {
    onMapReadyRef.current = onMapReady
    onJsReadyRef.current = onJavaScriptReady
  }, [onMapReady, onJavaScriptReady])

  const initialCenterRef = useRef<[number, number]>(FALLBACK_CENTER)
  useLayoutEffect(() => {
    initialCenterRef.current = userLocationCoords
      ? lngLatFromGoogle(userLocationCoords)
      : FALLBACK_CENTER
  }, [userLocationCoords])

  const [mapReady, setMapReady] = useState(false)
  const mapBootReportedRef = useRef(false)

  useEffect(() => {
    const el = rootRef.current
    const token = accessToken.trim()
    mapBootReportedRef.current = false
    if (!el || !token) {
      onJsReadyRef.current?.(false)
      return
    }

    let cancelled = false
    const reportBootOnce = (ready: boolean) => {
      if (mapBootReportedRef.current && ready) return
      if (ready) mapBootReportedRef.current = true
      onJsReadyRef.current?.(ready)
    }

    const bootFailsafe = window.setTimeout(() => {
      if (cancelled) return
      reportBootOnce(true)
    }, 16_000)

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: el,
      style: FETCH_MAPBOX_STYLE_URL,
      center: initialCenterRef.current,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: 0,
      antialias: true,
      attributionControl: true,
      fadeDuration: 220,
    })

    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()

    mapRef.current = map

    if (import.meta.env.DEV) {
      map.getContainer().style.background = 'red'
    }

    const onMapError = (e: mapboxgl.ErrorEvent) => {
      const err = e.error as Error | undefined
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[MapboxMapLayer]', err?.message ?? e)
      }
      queueMicrotask(() => reportBootOnce(true))
    }
    map.on('error', onMapError)

    const onLoad = () => {
      if (cancelled) return
      window.clearTimeout(bootFailsafe)
      if (import.meta.env.DEV) {
        map.getContainer().style.background = ''
      }
      requestAnimationFrame(() => map.resize())
      window.setTimeout(() => map.resize(), 300)

      reportBootOnce(true)
      onMapReadyRef.current?.(map)
      setMapReady(true)
    }
    map.once('load', onLoad)

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el)

    return () => {
      cancelled = true
      window.clearTimeout(bootFailsafe)
      ro.disconnect()
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      pickupMarkerRef.current?.remove()
      pickupMarkerRef.current = null
      if (import.meta.env.DEV) {
        try {
          map.getContainer().style.background = ''
        } catch {
          /* map torn down */
        }
      }
      mapRef.current = null
      map.off('error', onMapError)
      map.remove()
      setMapReady(false)
      mapBootReportedRef.current = false
      onJsReadyRef.current?.(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return

    if (userLocationCoords) {
      map.easeTo({
        center: lngLatFromGoogle(userLocationCoords),
        duration: 1100,
        easing: (t) => 1 - (1 - t) * (1 - t),
        pitch: DEFAULT_PITCH,
        bearing: 0,
      })
    }

    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    if (userLocationCoords) {
      const userDot = createDotMarker(
        'fetch-mapbox-user-dot h-3 w-3 rounded-full border-2 border-white bg-sky-500 shadow-md',
      )
      userMarkerRef.current = new mapboxgl.Marker({ element: userDot })
        .setLngLat(lngLatFromGoogle(userLocationCoords))
        .addTo(map)
    }
  }, [mapReady, userLocationCoords?.lat, userLocationCoords?.lng])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return

    pickupMarkerRef.current?.remove()
    pickupMarkerRef.current = null
    if (pickupCoords) {
      const pickupDot = createDotMarker(
        'fetch-mapbox-pickup-dot h-4 w-4 rounded-full border-2 border-white bg-emerald-600 shadow-md',
      )
      pickupMarkerRef.current = new mapboxgl.Marker({ element: pickupDot })
        .setLngLat(lngLatFromGoogle(pickupCoords))
        .addTo(map)
    }
  }, [mapReady, pickupCoords?.lat, pickupCoords?.lng])

  const routeKey =
    routePath && routePath.length >= 2
      ? routePath.map((p) => `${p.lat},${p.lng}`).join('|')
      : ''

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    syncRouteLayer(map, routePath ?? null)
  }, [mapReady, routeKey])

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto z-0 box-border min-h-[320px] min-w-0 overflow-hidden rounded-t-none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100vh',
        minHeight: 320,
        zIndex: 0,
      }}
      aria-label="Fetch map"
    />
  )
}
