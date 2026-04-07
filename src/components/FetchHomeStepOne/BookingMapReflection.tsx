import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Marker, Polyline } from '@react-google-maps/api'
import {
  MarkerClusterer,
  SuperClusterAlgorithm,
  defaultOnClusterClickHandler,
  type Renderer,
} from '@googlemaps/markerclusterer'
import type { BookingStage } from '../../lib/assistant'
import type { LiveTrackingLegPhase } from '../../lib/booking/liveTrackingLeg'
import { haversineMeters } from '../../lib/homeDirections'
import type { ExploreMapPoi } from '../../lib/mapsExplorePlaces'
import { playUiFeedback } from '../../voice/fetchFeedback'
import {
  fitPickupAndDriver,
  fitPickupAndDropoff,
  fitPickupDropoffAndDriver,
  nudgeMapCenterTowardTop,
} from './brisbaneMap'

function isAdventureClusterKind(kind: ExploreMapPoi['kind']): boolean {
  return kind === 'park' || kind === 'natural' || kind === 'adventure'
}

export type MapAccentRgb = { r: number; g: number; b: number }

/** Camera framing during marketplace live tracking (driver + leg destination). */
export type LiveTrackingMapFit = {
  driver: google.maps.LatLngLiteral
  pickup: google.maps.LatLngLiteral | null
  dropoff: google.maps.LatLngLiteral | null
  phase: LiveTrackingLegPhase
}

const DEFAULT_ACCENT: MapAccentRgb = { r: 200, g: 16, b: 46 }

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

type BookingMapReflectionProps = {
  /** Human-readable places — geocoded automatically; no map taps. */
  pickup: string | null
  dropoff: string | null
  pickupCoords?: google.maps.LatLngLiteral | null
  dropoffCoords?: google.maps.LatLngLiteral | null
  routePath?: google.maps.LatLngLiteral[] | null
  map: google.maps.Map | null
  stage: BookingStage
  /** Pin rings, pulses, marker fill — match booking stage. */
  accentRgb?: MapAccentRgb
  /** Shown as a distinct blue pin when geolocation is allowed. */
  userLocationCoords?: google.maps.LatLngLiteral | null
  /** Skip pan/zoom/fit automation (orb tunnel owns the camera). */
  suspendCameraAutomation?: boolean
  /** When true, keep panning to `userLocationCoords` (navigation follow). */
  cameraFollowUser?: boolean
  /** Live traffic tint on roads — only while a real route is active (see `mapNavStrip`). */
  showTrafficLayer?: boolean
  /** Maps tab / nearby search — below user dot, above base map. */
  explorePois?: readonly ExploreMapPoi[]
  /** Chat turn-by-turn: calm camera, optional pin dedupe with user dot. */
  navigationRouteActive?: boolean
  /** Driver → pickup path from Directions (traffic). */
  driverToPickupPath?: google.maps.LatLngLiteral[] | null
  /** When set during search/match/live, overrides straight-line driver animation. */
  driverLivePosition?: google.maps.LatLngLiteral | null
  /** Maps tab: user-dropped pin at map center. */
  droppedPinCoords?: google.maps.LatLngLiteral | null
  /** Fit map to driver + active leg when a live Directions polyline is showing. */
  liveTrackingFit?: LiveTrackingMapFit | null
  /** Increment when the user confirms pickup so lock-in fanfare runs even if coords match the preview. */
  pickupLockInCelebrateKey?: number
}

/**
 * Visual-only map layer: mirrors conversation state (pins + route).
 * All locations come from text/voice/scanner — never from map clicks.
 */
export function BookingMapReflection({
  pickup,
  dropoff,
  pickupCoords = null,
  dropoffCoords = null,
  routePath: realRoutePath = null,
  map,
  stage,
  accentRgb: accentRgbProp,
  userLocationCoords = null,
  suspendCameraAutomation = false,
  cameraFollowUser = false,
  showTrafficLayer = false,
  explorePois = [],
  navigationRouteActive = false,
  driverToPickupPath = null,
  driverLivePosition = null,
  droppedPinCoords = null,
  liveTrackingFit = null,
  pickupLockInCelebrateKey = 0,
}: BookingMapReflectionProps) {
  const accentRgb = accentRgbProp ?? DEFAULT_ACCENT
  const accentHex = useMemo(
    () => rgbToHex(accentRgb.r, accentRgb.g, accentRgb.b),
    [accentRgb.r, accentRgb.g, accentRgb.b],
  )
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[]>([])
  const [pickupPos, setPickupPos] = useState<google.maps.LatLngLiteral | null>(null)
  const [dropoffPos, setDropoffPos] = useState<google.maps.LatLngLiteral | null>(null)

  const [showPickupPin, setShowPickupPin] = useState(false)
  const [showDropoffPin, setShowDropoffPin] = useState(false)
  const [routeRevealCenter, setRouteRevealCenter] = useState<google.maps.LatLngLiteral | null>(null)
  const [routeRevealRadius, setRouteRevealRadius] = useState(0)
  const [routeRevealOpacity, setRouteRevealOpacity] = useState(0)

  const [conversationPulseCenter, setConversationPulseCenter] = useState<google.maps.LatLngLiteral | null>(null)
  const [conversationPulseRadius, setConversationPulseRadius] = useState(0)
  const [conversationPulseOpacity, setConversationPulseOpacity] = useState(0)

  const [pinDropRingCenter, setPinDropRingCenter] = useState<google.maps.LatLngLiteral | null>(null)
  const [pinDropRingRadius, setPinDropRingRadius] = useState(0)
  const [pinDropRingOpacity, setPinDropRingOpacity] = useState(0)
  const [pinDropFillRadius, setPinDropFillRadius] = useState(0)
  const [pinDropFillOpacity, setPinDropFillOpacity] = useState(0)
  const [pinDropRing2Radius, setPinDropRing2Radius] = useState(0)
  const [pinDropRing2Opacity, setPinDropRing2Opacity] = useState(0)
  const pinDropRingTimer = useRef<number | null>(null)

  const [lockInGoldCenter, setLockInGoldCenter] = useState<google.maps.LatLngLiteral | null>(null)
  const [lockInGoldRadius, setLockInGoldRadius] = useState(0)
  const [lockInGoldStroke, setLockInGoldStroke] = useState(0)
  const lockInGoldTimerRef = useRef<number | null>(null)
  const [pickupBounceCelebrate, setPickupBounceCelebrate] = useState(false)

  const [searchPulseRadius, setSearchPulseRadius] = useState(0)
  const [searchPulseOpacity, setSearchPulseOpacity] = useState(0)
  const [searchSweepIdx, setSearchSweepIdx] = useState(0)
  const [searchActivityTick, setSearchActivityTick] = useState(0)
  const [anticipatedDropoffPos, setAnticipatedDropoffPos] =
    useState<google.maps.LatLngLiteral | null>(null)
  const [anticipationPulseRadius, setAnticipationPulseRadius] = useState(0)
  const [anticipationPulseOpacity, setAnticipationPulseOpacity] = useState(0)

  const [driverPos, setDriverPos] = useState<google.maps.LatLngLiteral | null>(null)
  const driverAnimProgressRef = useRef(0)
  const [driverRevealPulseRadius, setDriverRevealPulseRadius] = useState(0)
  const [driverRevealPulseOpacity, setDriverRevealPulseOpacity] = useState(0)
  const [showDriverMarker, setShowDriverMarker] = useState(false)
  const [driverMarkerOpacity, setDriverMarkerOpacity] = useState(0)
  const [driverMarkerScale, setDriverMarkerScale] = useState(0.86)
  const routeAnimTimer = useRef<number | null>(null)
  const searchSweepTimer = useRef<number | null>(null)
  const searchPulseTimer = useRef<number | null>(null)
  const driverMoveTimer = useRef<number | null>(null)
  const conversationPulseTimer = useRef<number | null>(null)
  const routeRevealPulseTimer = useRef<number | null>(null)
  const anticipationPulseTimer = useRef<number | null>(null)
  const searchActivityTimer = useRef<number | null>(null)
  const driverRevealPulseTimer = useRef<number | null>(null)
  const driverMarkerIntroTimer = useRef<number | null>(null)
  const lastDriverRevealKeyRef = useRef<string | null>(null)
  const revealTimersRef = useRef<number[]>([])
  const lastPickupKeyRef = useRef<string | null>(null)
  const lastLockInCelebrateKeyHandledRef = useRef(0)
  const lastDropoffKeyRef = useRef<string | null>(null)
  const exploreClustererRef = useRef<MarkerClusterer | null>(null)
  const exploreClusterMarkersRef = useRef<google.maps.Marker[]>([])

  useEffect(() => {
    if (!map || !showTrafficLayer) return
    const layer = new google.maps.TrafficLayer()
    layer.setMap(map)
    return () => {
      layer.setMap(null)
    }
  }, [map, showTrafficLayer])

  useEffect(() => {
    if (suspendCameraAutomation || !map || !cameraFollowUser || !userLocationCoords) return
    map.panTo(userLocationCoords)
    const z = map.getZoom() ?? 14
    if (z < 15) map.setZoom(Math.min(16, 15))
  }, [
    map,
    suspendCameraAutomation,
    cameraFollowUser,
    userLocationCoords?.lat,
    userLocationCoords?.lng,
  ])

  const markerIcon = useMemo(
    () => ({
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: accentHex,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    }),
    [accentHex],
  )

  const userLocationIcon = useMemo(
    () => ({
      path: google.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: '#0d8bd9',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2.5,
    }),
    [],
  )

  const exploreAdventureKey = useMemo(
    () =>
      explorePois
        .filter((p) => isAdventureClusterKind(p.kind))
        .map((p) => `${p.id}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`)
        .join('|'),
    [explorePois],
  )

  const droppedPinIcon = useMemo((): google.maps.Icon | undefined => {
    if (typeof google === 'undefined') return undefined
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path fill="#e11d48" stroke="#fff" stroke-width="2" d="M18 2C10.27 2 4 8.27 4 16c0 11 14 28 14 28s14-17 14-28C32 8.27 25.73 2 18 2z"/><circle cx="18" cy="16" r="5" fill="#fff"/></svg>`
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(36, 46),
      anchor: new google.maps.Point(18, 46),
    }
  }, [])

  useEffect(() => {
    const disposeMarkers = () => {
      if (exploreClustererRef.current) {
        exploreClustererRef.current.clearMarkers(true)
        exploreClustererRef.current.setMap(null)
        exploreClustererRef.current = null
      }
      for (const m of exploreClusterMarkersRef.current) {
        m.setMap(null)
        if (typeof google !== 'undefined') google.maps.event.clearInstanceListeners(m)
      }
      exploreClusterMarkersRef.current = []
    }

    if (!map || typeof google === 'undefined') {
      disposeMarkers()
      return
    }

    disposeMarkers()

    const pois = explorePois.filter((p) => isAdventureClusterKind(p.kind))
    if (pois.length === 0) return

    const adventureRenderer: Renderer = {
      render(cluster) {
        const n = cluster.count
        const position = cluster.position
        const svg = encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58" viewBox="0 0 58 58"><defs><linearGradient id="g" x1="15%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#c4b5fd"/><stop offset="55%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#34d399"/></linearGradient><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.28"/></filter></defs><circle cx="29" cy="29" r="23" fill="url(#g)" stroke="rgba(255,255,255,0.92)" stroke-width="2.5" filter="url(#s)"/><circle cx="29" cy="29" r="26" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/></svg>`,
        )
        return new google.maps.Marker({
          position,
          icon: {
            url: `data:image/svg+xml,${svg}`,
            scaledSize: new google.maps.Size(58, 58),
            anchor: new google.maps.Point(29, 29),
          },
          label: {
            text: String(n),
            color: '#0f172a',
            fontSize: n > 99 ? '10px' : '13px',
            fontWeight: '700',
          },
          zIndex: Number(google.maps.Marker.MAX_ZINDEX) + n,
        })
      },
    }

    const markers = pois.map((p) => {
      const scale = p.kind === 'park' ? 7 : p.kind === 'natural' ? 6.5 : 6.5
      const fillColor =
        p.kind === 'park' ? '#22c55e' : p.kind === 'natural' ? '#06b6d4' : '#f59e0b'
      return new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        title: p.title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor,
          fillOpacity: 0.92,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
        },
      })
    })
    exploreClusterMarkersRef.current = markers

    exploreClustererRef.current = new MarkerClusterer({
      map,
      markers,
      algorithm: new SuperClusterAlgorithm({ radius: 84, maxZoom: 17 }),
      renderer: adventureRenderer,
      onClusterClick: defaultOnClusterClickHandler,
    })

    return disposeMarkers
  }, [map, exploreAdventureKey])

  const clearRevealTimers = () => {
    for (const t of revealTimersRef.current) window.clearTimeout(t)
    revealTimersRef.current = []
  }

  const runPinDropRing = (
    center: google.maps.LatLngLiteral,
    mode: 'standard' | 'massive' = 'standard',
  ) => {
    const massive = mode === 'massive'
    setPinDropRingCenter(center)
    setPinDropRingRadius(massive ? 26 : 14)
    setPinDropRingOpacity(massive ? 0.78 : 0.62)
    setPinDropFillRadius(massive ? 18 : 10)
    setPinDropFillOpacity(massive ? 0.48 : 0.34)
    setPinDropRing2Radius(massive ? 22 : 12)
    setPinDropRing2Opacity(0)
    if (pinDropRingTimer.current != null) window.clearInterval(pinDropRingTimer.current)
    const started = Date.now()
    const DUR = massive ? 2800 : 1680
    const r0 = massive ? 26 : 14
    const r1Expand = massive ? 1120 : 340
    const r2Start = massive ? 20 : 10
    const r2Expand = massive ? 980 : 300
    const burstMs = massive ? 520 : 400
    const lag = massive ? 320 : 200
    const tick = massive ? 40 : 48
    pinDropRingTimer.current = window.setInterval(() => {
      const elapsed = Date.now() - started
      if (elapsed > DUR) {
        setPinDropRingOpacity(0)
        setPinDropRingRadius(0)
        setPinDropFillRadius(0)
        setPinDropFillOpacity(0)
        setPinDropRing2Radius(0)
        setPinDropRing2Opacity(0)
        setPinDropRingCenter(null)
        if (pinDropRingTimer.current != null) window.clearInterval(pinDropRingTimer.current)
        pinDropRingTimer.current = null
        return
      }
      const t = elapsed / DUR
      const easeOut = 1 - Math.pow(1 - Math.min(1, t), massive ? 2.05 : 2.42)
      const ringOp0 = massive ? 0.78 : 0.62
      setPinDropRingRadius(r0 + easeOut * r1Expand)
      setPinDropRingOpacity(ringOp0 * Math.pow(1 - t, massive ? 0.55 : 0.66))
      const burst = Math.sin((Math.min(1, elapsed / burstMs) * Math.PI) / 2)
      const fillBurst = massive ? 240 : 118
      const fillDrift = massive ? 85 : 55
      setPinDropFillRadius((massive ? 12 : 8) + burst * fillBurst + t * fillDrift)
      setPinDropFillOpacity((massive ? 0.5 : 0.38) * burst * (1 - t * (massive ? 0.88 : 0.92)))
      const t2 = Math.max(0, elapsed - lag) / (DUR - lag)
      if (elapsed >= lag) {
        const e2 = 1 - Math.pow(1 - Math.min(1, t2), massive ? 1.95 : 2.15)
        setPinDropRing2Radius(r2Start + e2 * r2Expand)
        setPinDropRing2Opacity((massive ? 0.58 : 0.48) * Math.pow(1 - t2, massive ? 0.62 : 0.74))
      }
    }, tick)
  }

  const runLockInGoldBurst = (center: google.maps.LatLngLiteral) => {
    if (lockInGoldTimerRef.current != null) window.clearInterval(lockInGoldTimerRef.current)
    setLockInGoldCenter(center)
    setLockInGoldRadius(18)
    setLockInGoldStroke(0.72)
    const started = Date.now()
    const DUR = 1320
    lockInGoldTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - started
      if (elapsed > DUR) {
        setLockInGoldCenter(null)
        setLockInGoldRadius(0)
        setLockInGoldStroke(0)
        if (lockInGoldTimerRef.current != null) {
          window.clearInterval(lockInGoldTimerRef.current)
          lockInGoldTimerRef.current = null
        }
        return
      }
      const t = elapsed / DUR
      const ease = 1 - Math.pow(1 - t, 2.35)
      setLockInGoldRadius(18 + ease * 360)
      setLockInGoldStroke(0.72 * Math.pow(1 - t, 0.5))
    }, 40)
  }

  const runConversationPulse = (center: google.maps.LatLngLiteral) => {
    setConversationPulseCenter(center)
    setConversationPulseRadius(36)
    setConversationPulseOpacity(0.32)
    if (conversationPulseTimer.current != null) window.clearInterval(conversationPulseTimer.current)
    const started = Date.now()
    const PULSE_MS = 520
    conversationPulseTimer.current = window.setInterval(() => {
      const elapsed = Date.now() - started
      if (elapsed > PULSE_MS) {
        setConversationPulseOpacity(0)
        setConversationPulseRadius(0)
        if (conversationPulseTimer.current != null) window.clearInterval(conversationPulseTimer.current)
        conversationPulseTimer.current = null
        return
      }
      const t = elapsed / PULSE_MS
      const ease = 1 - Math.pow(1 - t, 1.65)
      setConversationPulseRadius(36 + ease * 108)
      setConversationPulseOpacity(0.32 * Math.pow(1 - t, 0.55))
    }, 48)
  }

  const runLocationLockInFanfare = (center: google.maps.LatLngLiteral) => {
    runConversationPulse(center)
    runPinDropRing(center)
    const t1 = window.setTimeout(() => runConversationPulse(center), 260)
    const t2 = window.setTimeout(() => runLockInGoldBurst(center), 140)
    revealTimersRef.current.push(t1, t2)
  }

  useEffect(
    () => () => {
      if (routeAnimTimer.current != null) window.clearInterval(routeAnimTimer.current)
      if (searchSweepTimer.current != null) window.clearInterval(searchSweepTimer.current)
      if (searchPulseTimer.current != null) window.clearInterval(searchPulseTimer.current)
      if (driverMoveTimer.current != null) window.clearInterval(driverMoveTimer.current)
      if (conversationPulseTimer.current != null) window.clearInterval(conversationPulseTimer.current)
      if (routeRevealPulseTimer.current != null) window.clearInterval(routeRevealPulseTimer.current)
      if (anticipationPulseTimer.current != null) window.clearInterval(anticipationPulseTimer.current)
      if (searchActivityTimer.current != null) window.clearInterval(searchActivityTimer.current)
      if (driverRevealPulseTimer.current != null) window.clearInterval(driverRevealPulseTimer.current)
      if (driverMarkerIntroTimer.current != null) window.clearInterval(driverMarkerIntroTimer.current)
      if (lockInGoldTimerRef.current != null) window.clearInterval(lockInGoldTimerRef.current)
      lockInGoldTimerRef.current = null
      clearRevealTimers()
    },
    [],
  )

  const geocodeAddress = (address: string): Promise<google.maps.LatLngLiteral | null> => {
    return new Promise((resolve) => {
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode({ address: `${address}, Queensland, Australia`, region: 'AU' }, (res, status) => {
        if (status === 'OK' && res?.[0]?.geometry?.location) {
          const p = res[0].geometry.location
          resolve({ lat: p.lat(), lng: p.lng() })
        } else {
          resolve(null)
        }
      })
    })
  }

  useEffect(() => {
    if (!pickup) {
      setRoutePath([])
      setPickupPos(null)
      setDropoffPos(null)
      setShowPickupPin(false)
      setShowDropoffPin(false)
      lastPickupKeyRef.current = null
      lastDropoffKeyRef.current = null
      setAnticipatedDropoffPos(null)
      return
    }

    let active = true
    void (async () => {
      const p = pickupCoords ?? (await geocodeAddress(pickup))
      if (!active) return
      setPickupPos(p)

      if (!dropoff || pickup.trim() === dropoff.trim()) {
        setDropoffPos(null)
        setRoutePath([])
        return
      }

      const d = dropoffCoords ?? (await geocodeAddress(dropoff))
      if (!active) return
      setDropoffPos(d)
      if (!(p && d)) {
        setRoutePath([])
      }
    })()
    return () => {
      active = false
    }
  }, [pickup, dropoff, pickupCoords?.lat, pickupCoords?.lng, dropoffCoords?.lat, dropoffCoords?.lng, map])

  useEffect(() => {
    if (!realRoutePath || realRoutePath.length < 2) {
      setRoutePath([])
      return
    }
    if (routeAnimTimer.current != null) window.clearInterval(routeAnimTimer.current)
    let idx = 2
    setRoutePath(realRoutePath.slice(0, idx))
    const step = Math.max(1, Math.ceil(realRoutePath.length / 24))
    routeAnimTimer.current = window.setInterval(() => {
      idx += step
      if (idx >= realRoutePath.length) {
        setRoutePath(realRoutePath)
        if (routeAnimTimer.current != null) window.clearInterval(routeAnimTimer.current)
        routeAnimTimer.current = null
        return
      }
      setRoutePath(realRoutePath.slice(0, idx))
    }, 24)
    return () => {
      if (routeAnimTimer.current != null) window.clearInterval(routeAnimTimer.current)
      routeAnimTimer.current = null
    }
  }, [realRoutePath])

  useEffect(() => {
    if (suspendCameraAutomation) return
    if (navigationRouteActive && cameraFollowUser) return
    if (!map) return

    const activeDriverLeg =
      driverToPickupPath != null &&
      driverToPickupPath.length >= 2 &&
      (stage === 'searching' || stage === 'matched' || stage === 'live')

    if (liveTrackingFit && activeDriverLeg) {
      const { driver, pickup: pFit, dropoff: dFit, phase } = liveTrackingFit
      if (phase === 'to_pickup' && pFit) {
        fitPickupAndDriver(map, pFit, driver)
        return
      }
      if (phase === 'to_dropoff' && pFit && dFit) {
        fitPickupDropoffAndDriver(map, pFit, dFit, driver)
        return
      }
    }

    if (!pickupPos || !dropoffPos) return
    fitPickupAndDropoff(map, pickupPos, dropoffPos)
  }, [
    suspendCameraAutomation,
    navigationRouteActive,
    cameraFollowUser,
    map,
    pickupPos?.lat,
    pickupPos?.lng,
    dropoffPos?.lat,
    dropoffPos?.lng,
    realRoutePath,
    liveTrackingFit?.driver.lat,
    liveTrackingFit?.driver.lng,
    liveTrackingFit?.pickup?.lat,
    liveTrackingFit?.pickup?.lng,
    liveTrackingFit?.dropoff?.lat,
    liveTrackingFit?.dropoff?.lng,
    liveTrackingFit?.phase,
    driverToPickupPath?.length,
    driverToPickupPath?.[0]?.lat,
    driverToPickupPath?.[0]?.lng,
    stage,
  ])

  useEffect(() => {
    if (!pickupPos || dropoffPos) {
      setAnticipatedDropoffPos(null)
      setAnticipationPulseOpacity(0)
      if (anticipationPulseTimer.current != null) window.clearInterval(anticipationPulseTimer.current)
      anticipationPulseTimer.current = null
      return
    }

    const seed = ((pickupPos.lat * 1173 + pickupPos.lng * 911) % 1 + 1) % 1
    const angle = (seed * 2 + 0.6) * Math.PI
    const latOffset = Math.sin(angle) * 0.014
    const lngOffset = Math.cos(angle) * 0.018
    const target = { lat: pickupPos.lat + latOffset, lng: pickupPos.lng + lngOffset }
    setAnticipatedDropoffPos(target)

    if (map && !suspendCameraAutomation) {
      const mid = {
        lat: (pickupPos.lat + target.lat) / 2,
        lng: (pickupPos.lng + target.lng) / 2,
      }
      map.panTo(mid)
      map.setZoom(Math.min(15.6, (map.getZoom() ?? 13) + 0.12))
    }

    const t0 = Date.now()
    if (anticipationPulseTimer.current != null) window.clearInterval(anticipationPulseTimer.current)
    anticipationPulseTimer.current = window.setInterval(() => {
      const t = ((Date.now() - t0) % 1800) / 1800
      setAnticipationPulseRadius(34 + t * 120)
      setAnticipationPulseOpacity(0.13 * (1 - t))
    }, 36)

    return () => {
      if (anticipationPulseTimer.current != null) window.clearInterval(anticipationPulseTimer.current)
      anticipationPulseTimer.current = null
    }
  }, [pickupPos?.lat, pickupPos?.lng, dropoffPos?.lat, dropoffPos?.lng, map, suspendCameraAutomation])

  useEffect(() => {
    if (!pickupPos) {
      setShowPickupPin(false)
      lastPickupKeyRef.current = null
      return
    }
    const key = `${pickupPos.lat.toFixed(6)}:${pickupPos.lng.toFixed(6)}`
    if (lastPickupKeyRef.current === key) return
    lastPickupKeyRef.current = key

    if (navigationRouteActive) {
      setShowPickupPin(true)
      return
    }

    setShowPickupPin(false)
    playUiFeedback('pin_drop')
    runPinDropRing(pickupPos, 'massive')
    const showPin = window.setTimeout(() => setShowPickupPin(true), 220)
    const cameraZoom = window.setTimeout(() => {
      if (!map || suspendCameraAutomation) return
      map.panTo(pickupPos)
      map.setZoom(16)
      try { map.setTilt(60) } catch { /* vector only */ }
      try { map.setHeading(40) } catch { /* vector only */ }
      /* Pin sits top-center: pan geographic center down so pickup reads under the sheet lip */
      const nudge = () => nudgeMapCenterTowardTop(map, 0.48)
      requestAnimationFrame(() => requestAnimationFrame(nudge))
    }, 300)
    revealTimersRef.current.push(showPin, cameraZoom)
  }, [
    pickupPos?.lat,
    pickupPos?.lng,
    map,
    suspendCameraAutomation,
    navigationRouteActive,
  ])

  useEffect(() => {
    if (pickupLockInCelebrateKey < 1) return
    if (pickupLockInCelebrateKey <= lastLockInCelebrateKeyHandledRef.current) return
    lastLockInCelebrateKeyHandledRef.current = pickupLockInCelebrateKey
    if (!pickupPos) return

    setShowPickupPin(true)
    runLocationLockInFanfare(pickupPos)
    setPickupBounceCelebrate(true)
    const bounceEnd = window.setTimeout(() => setPickupBounceCelebrate(false), 1850)

    const cameraZoom = window.setTimeout(() => {
      if (!map || suspendCameraAutomation) return
      map.panTo(pickupPos)
      const z = map.getZoom() ?? 14
      map.setZoom(Math.min(17.6, Math.max(z, 15) + 0.55))
      try {
        map.setTilt(56)
      } catch {
        /* vector only */
      }
      try {
        map.setHeading(38)
      } catch {
        /* vector only */
      }
      const nudge = () => nudgeMapCenterTowardTop(map, 0.32)
      requestAnimationFrame(() => requestAnimationFrame(nudge))
    }, 120)

    return () => {
      window.clearTimeout(bounceEnd)
      window.clearTimeout(cameraZoom)
    }
  }, [
    pickupLockInCelebrateKey,
    pickupPos?.lat,
    pickupPos?.lng,
    map,
    suspendCameraAutomation,
  ])

  useEffect(() => {
    if (!dropoffPos) {
      setShowDropoffPin(false)
      lastDropoffKeyRef.current = null
      return
    }
    const key = `${dropoffPos.lat.toFixed(6)}:${dropoffPos.lng.toFixed(6)}`
    if (lastDropoffKeyRef.current === key) return
    lastDropoffKeyRef.current = key

    if (navigationRouteActive) {
      setShowDropoffPin(true)
      return
    }

    setShowDropoffPin(false)
    runConversationPulse(dropoffPos)
    runPinDropRing(dropoffPos)
    const showPin = window.setTimeout(() => setShowDropoffPin(true), 220)
    const cameraNudge = window.setTimeout(() => {
      if (!map || suspendCameraAutomation) return
      const z = map.getZoom() ?? 12
      if (pickupPos) {
        const mid = {
          lat: (pickupPos.lat + dropoffPos.lat) / 2,
          lng: (pickupPos.lng + dropoffPos.lng) / 2,
        }
        map.panTo(mid)
      } else {
        map.panTo(dropoffPos)
      }
      map.setZoom(Math.min(17, z + 0.32))
      const frac = pickupPos ? 0.22 : 0.34
      requestAnimationFrame(() => requestAnimationFrame(() => nudgeMapCenterTowardTop(map, frac)))
    }, 340)
    revealTimersRef.current.push(showPin, cameraNudge)
  }, [
    dropoffPos?.lat,
    dropoffPos?.lng,
    pickupPos?.lat,
    pickupPos?.lng,
    map,
    suspendCameraAutomation,
    navigationRouteActive,
  ])

  useEffect(() => {
    if (navigationRouteActive) {
      setRouteRevealOpacity(0)
      if (routeRevealPulseTimer.current != null) window.clearInterval(routeRevealPulseTimer.current)
      routeRevealPulseTimer.current = null
      return
    }
    if (!pickupPos || !dropoffPos) {
      setRouteRevealOpacity(0)
      if (routeRevealPulseTimer.current != null) window.clearInterval(routeRevealPulseTimer.current)
      routeRevealPulseTimer.current = null
      return
    }
    setRouteRevealCenter({
      lat: (pickupPos.lat + dropoffPos.lat) / 2,
      lng: (pickupPos.lng + dropoffPos.lng) / 2,
    })
    setRouteRevealRadius(56)
    setRouteRevealOpacity(0.14)
    const routeRevealStarted = Date.now()
    if (routeRevealPulseTimer.current != null) window.clearInterval(routeRevealPulseTimer.current)
    routeRevealPulseTimer.current = window.setInterval(() => {
      const elapsed = Date.now() - routeRevealStarted
      if (elapsed > 560) {
        setRouteRevealOpacity(0)
        setRouteRevealRadius(0)
        if (routeRevealPulseTimer.current != null) window.clearInterval(routeRevealPulseTimer.current)
        routeRevealPulseTimer.current = null
        return
      }
      const t = elapsed / 560
      setRouteRevealRadius(56 + t * 140)
      setRouteRevealOpacity(0.14 * (1 - t))
    }, 26)
    return () => {
      if (routeRevealPulseTimer.current != null) window.clearInterval(routeRevealPulseTimer.current)
      routeRevealPulseTimer.current = null
    }
  }, [
    navigationRouteActive,
    pickupPos?.lat,
    pickupPos?.lng,
    dropoffPos?.lat,
    dropoffPos?.lng,
  ])

  useEffect(() => {
    if (stage !== 'searching' || !pickupPos) {
      if (searchPulseTimer.current != null) window.clearInterval(searchPulseTimer.current)
      setSearchPulseOpacity(0)
      if (searchActivityTimer.current != null) window.clearInterval(searchActivityTimer.current)
      searchActivityTimer.current = null
      return
    }
    const t0 = Date.now()
    searchPulseTimer.current = window.setInterval(() => {
      const t = ((Date.now() - t0) % 1200) / 1200
      setSearchPulseRadius(56 + t * 180)
      setSearchPulseOpacity(0.24 * (1 - t))
    }, 32)
    searchActivityTimer.current = window.setInterval(() => {
      setSearchActivityTick((v) => (v + 1) % 1200)
    }, 120)
    return () => {
      if (searchPulseTimer.current != null) window.clearInterval(searchPulseTimer.current)
      searchPulseTimer.current = null
      if (searchActivityTimer.current != null) window.clearInterval(searchActivityTimer.current)
      searchActivityTimer.current = null
    }
  }, [stage, pickupPos?.lat, pickupPos?.lng])

  useEffect(() => {
    if (stage !== 'searching' || routePath.length < 3) {
      setSearchSweepIdx(0)
      if (searchSweepTimer.current != null) window.clearInterval(searchSweepTimer.current)
      searchSweepTimer.current = null
      return
    }
    setSearchSweepIdx(0)
    searchSweepTimer.current = window.setInterval(() => {
      setSearchSweepIdx((v) => {
        const next = v + 1
        return next >= routePath.length ? 0 : next
      })
    }, 70)
    return () => {
      if (searchSweepTimer.current != null) window.clearInterval(searchSweepTimer.current)
      searchSweepTimer.current = null
    }
  }, [stage, routePath])

  useEffect(() => {
    if ((stage !== 'matched' && stage !== 'searching' && stage !== 'live') || !pickupPos) {
      if (driverMoveTimer.current != null) window.clearInterval(driverMoveTimer.current)
      setDriverPos(null)
      driverAnimProgressRef.current = 0
      setShowDriverMarker(false)
      return
    }

    if (
      driverLivePosition &&
      (stage === 'searching' || stage === 'matched' || stage === 'live')
    ) {
      if (driverMoveTimer.current != null) window.clearInterval(driverMoveTimer.current)
      driverMoveTimer.current = null
      setDriverPos(driverLivePosition)
      setShowDriverMarker(true)
      setDriverMarkerOpacity(1)
      setDriverMarkerScale(1)
      return () => {
        if (driverMoveTimer.current != null) window.clearInterval(driverMoveTimer.current)
        driverMoveTimer.current = null
      }
    }

    const heading = ((pickupPos.lat + pickupPos.lng) * 997) % 360
    const angle = (heading * Math.PI) / 180
    const latOffset = Math.sin(angle) * 0.02
    const lngOffset = Math.cos(angle) * 0.025
    const start = { lat: pickupPos.lat + latOffset, lng: pickupPos.lng + lngOffset }

    const points: google.maps.LatLngLiteral[] = []
    const total = 32
    for (let i = 0; i <= total; i++) {
      const t = i / total
      points.push({
        lat: start.lat + (pickupPos.lat - start.lat) * t,
        lng: start.lng + (pickupPos.lng - start.lng) * t,
      })
    }

    setDriverPos(points[0] ?? null)
    driverAnimProgressRef.current = stage === 'matched' ? 0.36 : 0.14

    if (driverMoveTimer.current != null) window.clearInterval(driverMoveTimer.current)
    driverMoveTimer.current = window.setInterval(() => {
      const next = Math.min(0.96, driverAnimProgressRef.current + 0.012)
      driverAnimProgressRef.current = next
      const idx = Math.max(0, Math.min(points.length - 1, Math.round(next * (points.length - 1))))
      setDriverPos(points[idx] ?? null)
    }, 120)

    return () => {
      if (driverMoveTimer.current != null) window.clearInterval(driverMoveTimer.current)
      driverMoveTimer.current = null
    }
  }, [stage, pickupPos?.lat, pickupPos?.lng, driverLivePosition?.lat, driverLivePosition?.lng])

  useEffect(() => {
    if (driverLivePosition) {
      return
    }
    if (stage !== 'matched' || !pickupPos || !driverPos) {
      if (driverRevealPulseTimer.current != null) window.clearInterval(driverRevealPulseTimer.current)
      if (driverMarkerIntroTimer.current != null) window.clearInterval(driverMarkerIntroTimer.current)
      setDriverRevealPulseOpacity(0)
      if (stage !== 'matched') {
        setShowDriverMarker(false)
        setDriverMarkerOpacity(0)
      }
      return
    }

    const revealKey = `${driverPos.lat.toFixed(6)}:${driverPos.lng.toFixed(6)}`
    if (lastDriverRevealKeyRef.current === revealKey) return
    lastDriverRevealKeyRef.current = revealKey

    setShowDriverMarker(false)
    setDriverMarkerOpacity(0)
    setDriverMarkerScale(0.86)

    if (driverRevealPulseTimer.current != null) window.clearInterval(driverRevealPulseTimer.current)
    const started = Date.now()
    driverRevealPulseTimer.current = window.setInterval(() => {
      const elapsed = Date.now() - started
      if (elapsed > 540) {
        setDriverRevealPulseOpacity(0)
        setDriverRevealPulseRadius(0)
        if (driverRevealPulseTimer.current != null) window.clearInterval(driverRevealPulseTimer.current)
        driverRevealPulseTimer.current = null
        return
      }
      const t = elapsed / 540
      setDriverRevealPulseRadius(32 + t * 118)
      setDriverRevealPulseOpacity(0.2 * (1 - t))
    }, 24)

    const markerStartTimer = window.setTimeout(() => {
      setShowDriverMarker(true)
      const animStart = Date.now()
      if (driverMarkerIntroTimer.current != null) window.clearInterval(driverMarkerIntroTimer.current)
      driverMarkerIntroTimer.current = window.setInterval(() => {
        const t = Math.min(1, (Date.now() - animStart) / 320)
        setDriverMarkerOpacity(t)
        setDriverMarkerScale(0.86 + 0.14 * t)
        if (t >= 1) {
          if (driverMarkerIntroTimer.current != null) window.clearInterval(driverMarkerIntroTimer.current)
          driverMarkerIntroTimer.current = null
        }
      }, 20)
    }, 220)
    revealTimersRef.current.push(markerStartTimer)
  }, [stage, pickupPos?.lat, pickupPos?.lng, driverPos?.lat, driverPos?.lng, driverLivePosition])

  const searchSweepPos =
    stage === 'searching' && routePath.length > 0
      ? routePath[Math.min(searchSweepIdx, routePath.length - 1)] ?? null
      : null
  const searchActivityDots =
    stage === 'searching' && pickupPos
      ? [
          { lat: pickupPos.lat + 0.00052, lng: pickupPos.lng - 0.00018, phase: 0 },
          { lat: pickupPos.lat + 0.0001, lng: pickupPos.lng + 0.00048, phase: 3 },
          { lat: pickupPos.lat - 0.00044, lng: pickupPos.lng + 0.00008, phase: 6 },
        ]
      : []

  const hidePickupPinNearUser =
    navigationRouteActive &&
    userLocationCoords &&
    pickupPos &&
    haversineMeters(userLocationCoords, pickupPos) < 52

  return (
    <>
      {routeRevealCenter && routeRevealOpacity > 0 ? (
        <Circle
          center={routeRevealCenter}
          radius={routeRevealRadius}
          options={{
            fillColor: accentHex,
            fillOpacity: routeRevealOpacity,
            strokeOpacity: 0,
            clickable: false,
            zIndex: 0,
          }}
        />
      ) : null}
      {stage === 'searching' && searchSweepPos ? (
        <Circle
          center={searchSweepPos}
          radius={54}
          options={{
            fillColor: accentHex,
            fillOpacity: 0.12,
            strokeOpacity: 0,
            clickable: false,
            zIndex: 1,
          }}
        />
      ) : null}
      {driverToPickupPath &&
      driverToPickupPath.length >= 2 &&
      (stage === 'searching' || stage === 'matched' || stage === 'live') ? (
        <Polyline
          path={driverToPickupPath}
          options={{
            strokeColor: '#1f6feb',
            strokeOpacity: 0.92,
            strokeWeight: 5,
            zIndex: 2,
            clickable: false,
          }}
        />
      ) : null}
      {routePath.length >= 2 ? (
        <Polyline
          path={routePath}
          options={{
            strokeColor: navigationRouteActive ? '#0A84FF' : accentHex,
            strokeOpacity: navigationRouteActive ? 0.94 : 0.88,
            strokeWeight: navigationRouteActive ? 5.5 : 4,
            zIndex: navigationRouteActive ? 1 : 2,
            clickable: false,
            geodesic: true,
          }}
        />
      ) : null}
      {explorePois.length > 0 && typeof google !== 'undefined'
        ? explorePois
            .filter((p) => !isAdventureClusterKind(p.kind))
            .map((p) => {
              const scale =
                p.kind === 'fuel'
                  ? 6.25
                  : 6
              const fillColor =
                p.kind === 'fuel'
                  ? '#ef4444'
                  : p.kind === 'food'
                    ? '#f97316'
                    : p.kind === 'cafe'
                      ? '#a855f7'
                      : p.kind === 'shop'
                        ? '#64748b'
                        : '#8b5cf6'
              return (
                <Marker
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  title={p.title}
                  zIndex={2}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale,
                    fillColor,
                    fillOpacity: 0.92,
                    strokeColor: '#ffffff',
                    strokeWeight: 1.5,
                  }}
                />
              )
            })
        : null}
      {droppedPinCoords && droppedPinIcon ? (
        <Marker
          position={droppedPinCoords}
          title="Dropped pin"
          zIndex={6}
          icon={droppedPinIcon}
        />
      ) : null}
      {userLocationCoords ? (
        <Marker
          position={userLocationCoords}
          title="Your location"
          icon={userLocationIcon}
          animation={
            navigationRouteActive ? undefined : google.maps.Animation.DROP
          }
          zIndex={5}
        />
      ) : null}
      {showPickupPin && pickupPos && !hidePickupPinNearUser ? (
        <Marker
          position={pickupPos}
          label={{ text: 'A', color: '#ffffff', fontWeight: '700' }}
          animation={
            navigationRouteActive
              ? undefined
              : pickupBounceCelebrate
                ? google.maps.Animation.BOUNCE
                : google.maps.Animation.DROP
          }
          icon={markerIcon}
          zIndex={3}
        />
      ) : null}
      {showDropoffPin && dropoffPos ? (
        <Marker
          position={dropoffPos}
          title={navigationRouteActive ? 'Destination' : 'Drop-off'}
          animation={
            navigationRouteActive ? undefined : google.maps.Animation.DROP
          }
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: navigationRouteActive ? 10 : 8,
            fillColor: navigationRouteActive ? '#34C759' : '#252a35',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: navigationRouteActive ? 2.5 : 2,
          }}
          zIndex={4}
        />
      ) : null}
      {showDriverMarker && driverPos ? (
        <Marker
          position={driverPos}
          label={{ text: 'D', color: '#ffffff', fontWeight: '700' }}
          opacity={driverMarkerOpacity}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7 * driverMarkerScale,
            fillColor: '#1f6feb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          }}
          zIndex={4}
        />
      ) : null}
      {stage === 'matched' && pickupPos && driverRevealPulseOpacity > 0 ? (
        <Circle
          center={pickupPos}
          radius={driverRevealPulseRadius}
          options={{
            fillColor: '#1f6feb',
            fillOpacity: driverRevealPulseOpacity,
            strokeOpacity: 0,
            clickable: false,
            zIndex: 1,
          }}
        />
      ) : null}
      {anticipatedDropoffPos && !dropoffPos ? (
        <Circle
          center={anticipatedDropoffPos}
          radius={18}
          options={{
            fillColor: '#252a35',
            fillOpacity: 0.08,
            strokeColor: '#252a35',
            strokeOpacity: 0.25,
            strokeWeight: 1,
            clickable: false,
            zIndex: 0,
          }}
        />
      ) : null}
      {conversationPulseCenter && conversationPulseOpacity > 0 ? (
        <Circle
          center={conversationPulseCenter}
          radius={conversationPulseRadius}
          options={{
            fillColor: accentHex,
            fillOpacity: conversationPulseOpacity,
            strokeOpacity: 0,
            clickable: false,
            zIndex: 0,
          }}
        />
      ) : null}
      {pinDropRingCenter && pinDropFillOpacity > 0 ? (
        <Circle
          center={pinDropRingCenter}
          radius={pinDropFillRadius}
          options={{
            fillColor: accentHex,
            fillOpacity: pinDropFillOpacity,
            strokeOpacity: 0,
            clickable: false,
            zIndex: 4,
          }}
        />
      ) : null}
      {pinDropRingCenter && pinDropRing2Opacity > 0 ? (
        <Circle
          center={pinDropRingCenter}
          radius={pinDropRing2Radius}
          options={{
            fillColor: 'transparent',
            fillOpacity: 0,
            strokeColor: accentHex,
            strokeOpacity: pinDropRing2Opacity,
            strokeWeight: 2,
            clickable: false,
            zIndex: 5,
          }}
        />
      ) : null}
      {pinDropRingCenter && pinDropRingOpacity > 0 ? (
        <Circle
          center={pinDropRingCenter}
          radius={pinDropRingRadius}
          options={{
            fillColor: 'transparent',
            fillOpacity: 0,
            strokeColor: accentHex,
            strokeOpacity: pinDropRingOpacity,
            strokeWeight: 3.5,
            clickable: false,
            zIndex: 6,
          }}
        />
      ) : null}
      {lockInGoldCenter && lockInGoldStroke > 0 ? (
        <Circle
          center={lockInGoldCenter}
          radius={lockInGoldRadius}
          options={{
            fillColor: 'transparent',
            fillOpacity: 0,
            strokeColor: '#f0b429',
            strokeOpacity: lockInGoldStroke,
            strokeWeight: 4,
            clickable: false,
            zIndex: 7,
          }}
        />
      ) : null}
      {anticipatedDropoffPos && anticipationPulseOpacity > 0 && !dropoffPos ? (
        <Circle
          center={anticipatedDropoffPos}
          radius={anticipationPulseRadius}
          options={{
            fillColor: '#252a35',
            fillOpacity: anticipationPulseOpacity,
            strokeOpacity: 0,
            clickable: false,
            zIndex: 0,
          }}
        />
      ) : null}
      {pickupPos && searchPulseOpacity > 0 ? (
        <Circle
          center={pickupPos}
          radius={searchPulseRadius}
          options={{
            fillColor: accentHex,
            fillOpacity: searchPulseOpacity,
            strokeOpacity: 0,
            clickable: false,
            zIndex: 0,
          }}
        />
      ) : null}
      {searchActivityDots.map((dot, idx) => {
        const phase = ((searchActivityTick + dot.phase * 10) % 30) / 30
        const opacity = 0.06 + (1 - phase) * 0.18
        const radius = 10 + phase * 12
        return (
          <Circle
            key={`search-dot-${idx}`}
            center={{ lat: dot.lat, lng: dot.lng }}
            radius={radius}
            options={{
              fillColor: accentHex,
              fillOpacity: opacity,
              strokeOpacity: 0,
              clickable: false,
              zIndex: 1,
            }}
          />
        )
      })}
    </>
  )
}
