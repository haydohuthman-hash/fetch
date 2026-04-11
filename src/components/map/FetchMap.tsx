import mapboxgl from 'mapbox-gl'
import { useEffect, useRef } from 'react'
import { addMapbox3DBuildingsLayer } from '../../lib/mapbox3dBuildings'
import { FETCH_MAPBOX_STYLE_URL } from '../../lib/mapboxStyle'
import { getRoute, type LngLat } from '../../lib/mapboxRoute'

/**
 * Story Bridge — camera frames the span with strong 3D tilt (lng, lat).
 * Bearing ~-42° runs along the deck toward the CBD / river bend.
 */
const STORY_BRIDGE_CENTER: [number, number] = [153.0346, -27.4696]

/** CBD / northern approach — pickup */
const PICKUP: LngLat = [153.03125, -27.46635]
/** Kangaroo Point — southern approach — dropoff */
const DROPOFF: LngLat = [153.03785, -27.47265]

const INITIAL = {
  center: STORY_BRIDGE_CENTER,
  /** Close enough for extruded buildings + bridge read at 3D tilt */
  zoom: 15.85,
  pitch: 72,
  bearing: -42,
}

export type FetchMapProps = {
  accessToken: string
  className?: string
}

function createPin(className: string): HTMLElement {
  const el = document.createElement('div')
  el.className = className
  el.setAttribute('role', 'presentation')
  return el
}

export function FetchMap({ accessToken, className = '' }: FetchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    const token = accessToken.trim()
    if (!el || !token) return

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: el,
      style: FETCH_MAPBOX_STYLE_URL,
      center: INITIAL.center,
      zoom: INITIAL.zoom,
      pitch: INITIAL.pitch,
      bearing: INITIAL.bearing,
      antialias: true,
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')

    const pickupMarker = new mapboxgl.Marker({ element: createPin('fetch-map-pin fetch-map-pin--pickup') })
      .setLngLat(PICKUP)
      .addTo(map)

    const dropMarker = new mapboxgl.Marker({ element: createPin('fetch-map-pin fetch-map-pin--dropoff') })
      .setLngLat(DROPOFF)
      .addTo(map)

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el)

    let cancelled = false

    const onStyleLoad = () => {
      addMapbox3DBuildingsLayer(map, 'fetch-3d-buildings')
    }
    map.on('styledata', onStyleLoad)

    map.once('load', () => {
      if (cancelled) return
      addMapbox3DBuildingsLayer(map, 'fetch-3d-buildings')

      void (async () => {
        try {
          const line = await getRoute(PICKUP, DROPOFF, token)
          if (cancelled || !line) return
          if (!map.getStyle() || map.getSource('fetch-route')) return
          map.addSource('fetch-route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: line },
          })
          map.addLayer({
            id: 'fetch-route-line',
            type: 'line',
            source: 'fetch-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#0f0f0f',
              'line-width': 5,
              'line-opacity': 0.9,
            },
          })
        } catch {
          /* map may be torn down mid-request */
        }
      })()

      const reduceMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      if (!reduceMotion) {
        map.easeTo({
          zoom: INITIAL.zoom + 0.45,
          pitch: Math.min(INITIAL.pitch + 5, 80),
          bearing: INITIAL.bearing - 6,
          duration: 2800,
          easing: (t) => 1 - (1 - t) * (1 - t),
          essential: true,
        })
      }
    })

    return () => {
      cancelled = true
      ro.disconnect()
      map.off('styledata', onStyleLoad)
      pickupMarker.remove()
      dropMarker.remove()
      map.remove()
    }
  }, [accessToken])

  if (!accessToken.trim()) return null

  return (
    <div
      ref={containerRef}
      className={['h-full min-h-[100dvh] w-full', className].filter(Boolean).join(' ')}
      aria-label="Fetch map"
    />
  )
}
