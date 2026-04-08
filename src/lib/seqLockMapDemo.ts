import { useEffect, useMemo, useState } from 'react'
import type { BookingStage } from './assistant/types'
import { haversineMeters } from './homeDirections'

/** South Bank → Fortitude Valley — readable urban leg on the real map. */
export const SEQ_LOCK_DEMO_PICKUP: google.maps.LatLngLiteral = {
  lat: -27.4753,
  lng: 153.0214,
}
export const SEQ_LOCK_DEMO_DROPOFF: google.maps.LatLngLiteral = {
  lat: -27.4568,
  lng: 153.0388,
}

/** Extra fitBounds inset so the full demo route stays in view above the sheet. */
export const SEQ_LOCK_DEMO_MAP_PADDING: google.maps.Padding = {
  top: 96,
  right: 56,
  bottom: 300,
  left: 56,
}

function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

function pointAlongPolyline(
  path: google.maps.LatLngLiteral[],
  t: number,
): google.maps.LatLngLiteral | null {
  if (path.length < 2) return null
  const u = Math.max(0, Math.min(1, t))
  let total = 0
  const segLens: number[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const len = haversineMeters(path[i]!, path[i + 1]!)
    segLens.push(len)
    total += len
  }
  if (total < 0.5) return path[0] ?? null
  let dist = u * total
  for (let i = 0; i < segLens.length; i++) {
    const sl = segLens[i]!
    if (dist <= sl || i === segLens.length - 1) {
      const ratio = sl < 0.5 ? 0 : Math.min(1, dist / sl)
      const a = path[i]!
      const b = path[i + 1]!
      return {
        lat: a.lat + (b.lat - a.lat) * ratio,
        lng: a.lng + (b.lng - a.lng) * ratio,
      }
    }
    dist -= sl
  }
  return path[path.length - 1] ?? null
}

function curvedRoute(
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral,
  pointCount: number,
): google.maps.LatLngLiteral[] {
  const out: google.maps.LatLngLiteral[] = []
  for (let i = 0; i < pointCount; i++) {
    const t = i / Math.max(1, pointCount - 1)
    const lat = a.lat + (b.lat - a.lat) * t
    const lng = a.lng + (b.lng - a.lng) * t
    const bump = Math.sin(t * Math.PI) * 0.0024
    out.push({ lat: lat + bump * 0.28, lng: lng + bump })
  }
  return out
}

function driverStartPoint(
  pickup: google.maps.LatLngLiteral,
  dropoff: google.maps.LatLngLiteral,
): google.maps.LatLngLiteral {
  const vx = pickup.lat - dropoff.lat
  const vy = pickup.lng - dropoff.lng
  const len = Math.hypot(vx, vy) || 1
  const scale = 0.011 / len
  return { lat: pickup.lat + vx * scale, lng: pickup.lng + vy * scale }
}

export type SeqLockMapDemo = {
  pickupLabel: string
  dropoffLabel: string
  pickupCoords: google.maps.LatLngLiteral
  dropoffCoords: google.maps.LatLngLiteral
  routePath: google.maps.LatLngLiteral[]
  driverToPickupPath: google.maps.LatLngLiteral[] | null
  driverLivePosition: google.maps.LatLngLiteral | null
  mapStage: BookingStage
  statusLine: string
}

const T_SEARCH_MS = 4200
const T_MATCH_MS = 3400
const T_LIVE_MS = 7200
const T_PAUSE_MS = 700
const TOTAL_MS = T_SEARCH_MS + T_MATCH_MS + T_LIVE_MS + T_PAUSE_MS

/**
 * Looped map story for region-locked home: matching → driver to A → en route to B.
 * Only meaningful when the parent passes the result into the Google map layer.
 */
export function useSeqLockMapDemo(active: boolean): SeqLockMapDemo | null {
  const [phaseMs, setPhaseMs] = useState(0)
  const [loopIdx, setLoopIdx] = useState(0)

  useEffect(() => {
    if (!active) {
      setPhaseMs(0)
      return
    }
    const id = window.setInterval(() => {
      setPhaseMs((p) => {
        const next = p + 100
        if (next >= TOTAL_MS) {
          setLoopIdx((i) => i + 1)
          return 0
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [active])

  const routePath = useMemo(() => {
    if (!active) return []
    return curvedRoute(SEQ_LOCK_DEMO_PICKUP, SEQ_LOCK_DEMO_DROPOFF, 52)
  }, [active, loopIdx])

  const driverToPickupFull = useMemo(() => {
    if (!active) return []
    const d0 = driverStartPoint(SEQ_LOCK_DEMO_PICKUP, SEQ_LOCK_DEMO_DROPOFF)
    return curvedRoute(d0, SEQ_LOCK_DEMO_PICKUP, 26)
  }, [active, loopIdx])

  return useMemo(() => {
    if (!active) return null

    let mapStage: BookingStage = 'searching'
    let driverToPickupPath: google.maps.LatLngLiteral[] | null = driverToPickupFull
    let driverLivePosition: google.maps.LatLngLiteral | null = null
    let statusLine = 'Finding the nearest crew…'

    if (phaseMs < T_SEARCH_MS) {
      mapStage = 'searching'
      const u = easeInOut(phaseMs / T_SEARCH_MS) * 0.9
      driverLivePosition = pointAlongPolyline(driverToPickupFull, u)
    } else if (phaseMs < T_SEARCH_MS + T_MATCH_MS) {
      mapStage = 'matched'
      const sub = (phaseMs - T_SEARCH_MS) / T_MATCH_MS
      const u = 0.9 + easeInOut(sub) * 0.1
      driverLivePosition = pointAlongPolyline(driverToPickupFull, u)
      statusLine = 'Driver matched — heading to pickup'
    } else if (phaseMs < T_SEARCH_MS + T_MATCH_MS + T_LIVE_MS) {
      mapStage = 'live'
      driverToPickupPath = null
      const sub = (phaseMs - T_SEARCH_MS - T_MATCH_MS) / T_LIVE_MS
      const u = easeInOut(sub)
      driverLivePosition = pointAlongPolyline(routePath, u)
      statusLine = 'En route to drop-off'
    } else {
      mapStage = 'live'
      driverToPickupPath = null
      driverLivePosition = SEQ_LOCK_DEMO_DROPOFF
      statusLine = 'Arrived — thanks for watching'
    }

    return {
      pickupLabel: 'South Bank',
      dropoffLabel: 'Fortitude Valley',
      pickupCoords: SEQ_LOCK_DEMO_PICKUP,
      dropoffCoords: SEQ_LOCK_DEMO_DROPOFF,
      routePath,
      driverToPickupPath,
      driverLivePosition,
      mapStage,
      statusLine,
    }
  }, [active, phaseMs, routePath, driverToPickupFull])
}
