import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FETCH_MAPBOX_STYLE_URL } from '../../lib/mapboxStyle'
import { addMapbox3DBuildingsLayer } from '../../lib/mapbox3dBuildings'
import { getRoute, type LngLat } from '../../lib/mapboxRoute'
import { FetchEyesHomeIcon } from '../icons/HomeShellNavIcons'

const STORAGE_KEY = 'fetch_welcome_map_demo_v1'

const ARENA_CENTER: [number, number] = [153.0344, -27.4695]
const PICKUP: LngLat = [153.03135, -27.46628]
const DROPOFF: LngLat = [153.0379, -27.47258]
/** Where the driver is when matched — slightly northwest of pickup */
const DRIVER_START: [number, number] = [153.0288, -27.4638]

const ROUTE_SRC = 'fetch-welcome-demo-route'
const ROUTE_LAYER = 'fetch-welcome-demo-route-line'
const APPROACH_SRC = 'fetch-welcome-demo-approach'
const APPROACH_LAYER = 'fetch-welcome-demo-approach-line'
const DEMO_MS = 15_000

type Phase = 'intro' | 'playing' | 'done'

type BannerStep = { t: number; title: string; subtitle: string; eta: string | null }

const STEPS: BannerStep[] = [
  { t: 0, title: 'Searching for a Fetcher…', subtitle: 'Scanning nearby drivers for your couch pickup', eta: null },
  { t: 3.8, title: 'Fetcher found!', subtitle: 'Alex · 4.9★ · Van · 3 min away', eta: '3 min' },
  { t: 5.6, title: 'Fetcher on the way', subtitle: 'Heading to collect your couch', eta: '2 min' },
  { t: 8.0, title: 'Picking up your couch', subtitle: 'Alex has arrived at the pickup', eta: '1 min' },
  { t: 10.2, title: 'Delivering to buyer', subtitle: 'Couch loaded · En route to drop-off', eta: '<1 min' },
  { t: 12.0, title: 'Delivered!', subtitle: 'Your buyer has received the couch 🎉', eta: null },
  { t: 13.5, title: 'Welcome to Fetch', subtitle: 'That was a demo — real deliveries work just like this.', eta: null },
]

const DRIVER_APPEAR_SEC = 3.8
const DRIVER_DONE_SEC = 12.0
const PULSE_STOP_SEC = 3.8

/* ── confetti (physics particles) ── */

type Particle = {
  el: HTMLElement; x: number; y: number
  vx: number; vy: number; spin: number; spinV: number; opacity: number
}

const CONFETTI_COLORS = ['#22c55e', '#10b981', '#34d399', '#fbbf24', '#f59e0b', '#60a5fa', '#a78bfa', '#fb7185', '#e879f9', '#fff']

function launchConfetti(container: HTMLElement) {
  const COUNT = 72
  const GRAVITY = 980
  const rect = container.getBoundingClientRect()
  const cx = rect.width * 0.5
  const cy = rect.height * 0.48
  const particles: Particle[] = []
  for (let i = 0; i < COUNT; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9
    const speed = 420 + Math.random() * 680
    const el = document.createElement('div')
    const size = 5 + Math.random() * 7
    const isRect = Math.random() > 0.35
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0',
      width: `${size}px`, height: `${size * (isRect ? 0.5 : 1)}px`,
      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      borderRadius: isRect ? '2px' : '50%',
      pointerEvents: 'none', zIndex: '100', willChange: 'transform', opacity: '1',
    })
    container.appendChild(el)
    particles.push({
      el, x: cx + (Math.random() - 0.5) * 30, y: cy,
      vx: Math.cos(angle) * speed * (0.7 + Math.random() * 0.6),
      vy: Math.sin(angle) * speed * (0.7 + Math.random() * 0.6),
      spin: 0, spinV: (Math.random() - 0.5) * 900, opacity: 1,
    })
  }
  let prev = performance.now()
  const tick = () => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - prev) / 1000)
    prev = now
    let alive = false
    for (const p of particles) {
      p.vy += GRAVITY * dt; p.vx *= 0.988
      p.x += p.vx * dt; p.y += p.vy * dt
      p.spin += p.spinV * dt
      if (p.y > rect.height * 0.85) p.opacity -= dt * 2.5
      else if (p.opacity > 0.6) p.opacity -= dt * 0.2
      p.opacity = Math.max(0, p.opacity)
      p.el.style.transform = `translate(${p.x}px,${p.y}px) rotate(${p.spin}deg)`
      p.el.style.opacity = String(p.opacity)
      if (p.opacity > 0.01 && p.y < rect.height + 40) alive = true
    }
    if (alive) requestAnimationFrame(tick)
    else particles.forEach(pp => pp.el.remove())
  }
  requestAnimationFrame(tick)
}

/* ── map helpers ── */

function createPin(className: string, label: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'fetch-welcome-demo-marker-wrap'
  const dot = document.createElement('div')
  dot.className = className
  dot.setAttribute('role', 'presentation')
  const cap = document.createElement('div')
  cap.className = 'fetch-welcome-demo-marker-cap'
  cap.textContent = label
  wrap.appendChild(dot); wrap.appendChild(cap)
  return wrap
}

function createPickupWithPulse(label: string): { root: HTMLElement; stopPulse: () => void } {
  const wrap = document.createElement('div')
  wrap.className = 'fetch-welcome-demo-marker-wrap'
  const r1 = document.createElement('div')
  r1.className = 'fetch-welcome-demo-pulse-ring'
  const r2 = document.createElement('div')
  r2.className = 'fetch-welcome-demo-pulse-ring fetch-welcome-demo-pulse-ring--delay'
  const dot = document.createElement('div')
  dot.className = 'fetch-map-pin fetch-map-pin--pickup'
  dot.setAttribute('role', 'presentation')
  const cap = document.createElement('div')
  cap.className = 'fetch-welcome-demo-marker-cap'
  cap.textContent = label
  wrap.appendChild(r1); wrap.appendChild(r2); wrap.appendChild(dot); wrap.appendChild(cap)
  return { root: wrap, stopPulse: () => { r1.remove(); r2.remove() } }
}

/** Build the driver marker using pure inline styles (no Tailwind dep) */
function makeDriverMarkerElement(): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, {
    width: '36px', height: '36px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%', border: '2.5px solid #fff',
    background: '#047857', fontSize: '18px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
    transition: 'transform 0.08s linear',
  })
  el.textContent = '🚐'
  el.setAttribute('role', 'presentation')
  return el
}

function showFullRoute(map: mapboxgl.Map, coords: [number, number][]) {
  if (coords.length < 2) return
  const src = map.getSource(ROUTE_SRC) as mapboxgl.GeoJSONSource | undefined
  if (!src) return
  src.setData({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } })
  try { map.setPaintProperty(ROUTE_LAYER, 'line-opacity', 0.88) } catch { /* */ }
}

/** Interpolate position along a polyline. u=0 → first point, u=1 → last point. */
function lerpPolyline(pts: [number, number][], u: number): [number, number] {
  if (pts.length === 0) return [0, 0]
  if (pts.length === 1) return pts[0]!
  const t = Math.max(0, Math.min(1, u))
  const idx = t * (pts.length - 1)
  const i0 = Math.floor(idx)
  const i1 = Math.min(pts.length - 1, i0 + 1)
  const f = idx - i0
  const a = pts[i0]!
  const b = pts[i1]!
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

/* ── exports ── */

export type FetchMapWelcomeDemoProps = { accessToken: string; onComplete: () => void }

export function welcomeMapDemoAlreadySeen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return true }
}
export function markWelcomeMapDemoSeen(): void {
  try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* */ }
}

/* ── component ── */

export function FetchMapWelcomeDemo({ accessToken, onComplete }: FetchMapWelcomeDemoProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const confettiRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  /** Full delivery route: PICKUP → ... → DROPOFF */
  const routeCoordsRef = useRef<[number, number][]>([])
  /** Full driver path: DRIVER_START → PICKUP → ... → DROPOFF (built once route is ready) */
  const driverPathRef = useRef<[number, number][]>([])
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const stopPulseRef = useRef<(() => void) | null>(null)
  const dropMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const rafRef = useRef(0)
  const demoStartRef = useRef<number | null>(null)
  const confettiFiredRef = useRef(false)
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  const [phase, setPhase] = useState<Phase>('intro')
  const [mapStyleReady, setMapStyleReady] = useState(false)
  const [routeReady, setRouteReady] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [progress01, setProgress01] = useState(0)
  const [loadProgress, setLoadProgress] = useState(0)
  const loadRafRef = useRef(0)
  const loadStartRef = useRef(performance.now())

  const finish = useCallback(() => { markWelcomeMapDemoSeen(); onComplete() }, [onComplete])
  const skip = useCallback(() => finish(), [finish])
  const introReady = mapStyleReady && routeReady

  /** Loading bar — fast then slow */
  useEffect(() => {
    if (introReady) { setLoadProgress(1); return }
    loadStartRef.current = performance.now()
    const tick = () => {
      const s = (performance.now() - loadStartRef.current) / 1000
      setLoadProgress(Math.min(0.92, Math.min(0.6, s / 0.8 * 0.6) + Math.max(0, s - 0.8) / 25))
      loadRafRef.current = requestAnimationFrame(tick)
    }
    loadRafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(loadRafRef.current)
  }, [introReady])

  /** Confetti on done */
  useEffect(() => {
    if (phase !== 'done' || confettiFiredRef.current || reduceMotion) return
    confettiFiredRef.current = true
    if (confettiRef.current) launchConfetti(confettiRef.current)
  }, [phase, reduceMotion])

  /** Map + route init */
  useEffect(() => {
    const el = rootRef.current
    const token = accessToken.trim()
    if (!el || !token) return

    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: el, style: FETCH_MAPBOX_STYLE_URL,
      center: ARENA_CENTER, zoom: 15.65, pitch: 68, bearing: -38,
      antialias: true, attributionControl: false,
    })
    map.scrollZoom.disable(); map.dragPan.disable()
    map.boxZoom.disable(); map.keyboard.disable()
    map.doubleClickZoom.disable(); map.touchZoomRotate.disableRotation()
    mapRef.current = map

    const onStyle = () => addMapbox3DBuildingsLayer(map, 'fetch-welcome-3d-buildings')
    map.on('styledata', onStyle)

    map.once('load', () => {
      setMapStyleReady(true)
      addMapbox3DBuildingsLayer(map, 'fetch-welcome-3d-buildings')
      void (async () => {
        const line = await getRoute(PICKUP, DROPOFF, token)
        const mid: [number, number] = [(PICKUP[0] + DROPOFF[0]) / 2, (PICKUP[1] + DROPOFF[1]) / 2]
        const routeCoords: [number, number][] =
          line?.coordinates && line.coordinates.length >= 2
            ? (line.coordinates as [number, number][])
            : [PICKUP, mid, DROPOFF]
        routeCoordsRef.current = routeCoords
        // full driver journey: approach + delivery
        driverPathRef.current = [DRIVER_START, ...routeCoords]

        const c0 = routeCoords[0]!
        const c1 = routeCoords.length > 1 ? routeCoords[1]! : ([c0[0] + 0.0001, c0[1] + 0.0001] as [number, number])

        map.addSource(ROUTE_SRC, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [c0, c1] } },
        })
        map.addLayer({
          id: ROUTE_LAYER, type: 'line', source: ROUTE_SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#064e3b', 'line-width': 5.5, 'line-opacity': 0 },
        })

        map.addSource(APPROACH_SRC, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [DRIVER_START, PICKUP] } },
        })
        map.addLayer({
          id: APPROACH_LAYER, type: 'line', source: APPROACH_SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#10b981', 'line-width': 3.5, 'line-opacity': 0, 'line-dasharray': [2, 2.5] },
        })

        if (reduceMotion) {
          showFullRoute(map, routeCoords)
          pickupMarkerRef.current = new mapboxgl.Marker({
            element: createPin('fetch-map-pin fetch-map-pin--pickup', 'Pickup · Couch'),
          }).setLngLat(PICKUP).addTo(map)
          dropMarkerRef.current = new mapboxgl.Marker({
            element: createPin('fetch-map-pin fetch-map-pin--dropoff', 'Buyer'),
          }).setLngLat(DROPOFF).addTo(map)
          map.jumpTo({ center: ARENA_CENTER, zoom: 15.5, pitch: 66, bearing: -36 })
        } else {
          map.flyTo({ center: ARENA_CENTER, zoom: 15.55, pitch: 66, bearing: -40, duration: 0 })
        }
        setRouteReady(true)
      })()
    })

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el)

    return () => {
      ro.disconnect(); map.off('styledata', onStyle)
      cancelAnimationFrame(rafRef.current); cancelAnimationFrame(loadRafRef.current)
      stopPulseRef.current?.(); stopPulseRef.current = null
      pickupMarkerRef.current?.remove(); dropMarkerRef.current?.remove(); driverMarkerRef.current?.remove()
      pickupMarkerRef.current = null; dropMarkerRef.current = null; driverMarkerRef.current = null
      if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER)
      if (map.getSource(ROUTE_SRC)) map.removeSource(ROUTE_SRC)
      if (map.getLayer(APPROACH_LAYER)) map.removeLayer(APPROACH_LAYER)
      if (map.getSource(APPROACH_SRC)) map.removeSource(APPROACH_SRC)
      map.remove(); mapRef.current = null
    }
  }, [accessToken, reduceMotion])

  /** ────── 15 s animated timeline ────── */
  useEffect(() => {
    if (phase !== 'playing' || reduceMotion || !routeReady) return
    const map = mapRef.current
    const routeCoords = routeCoordsRef.current
    const driverPath = driverPathRef.current
    if (!map || routeCoords.length < 2 || driverPath.length < 2) return

    demoStartRef.current = performance.now()
    let pulseStopped = false
    let approachShown = false
    let approachHidden = false

    // Show full delivery route + pins immediately
    showFullRoute(map, routeCoords)

    if (!pickupMarkerRef.current) {
      const { root, stopPulse } = createPickupWithPulse('Pickup · Couch')
      stopPulseRef.current = stopPulse
      pickupMarkerRef.current = new mapboxgl.Marker({ element: root }).setLngLat(PICKUP).addTo(map)
    }
    if (!dropMarkerRef.current) {
      dropMarkerRef.current = new mapboxgl.Marker({
        element: createPin('fetch-map-pin fetch-map-pin--dropoff', 'Buyer'),
      }).setLngLat(DROPOFF).addTo(map)
    }

    // Camera schedule
    const timers: number[] = []
    timers.push(window.setTimeout(() => {
      map.flyTo({ center: PICKUP, zoom: 16.15, pitch: 72, bearing: -26, duration: 2200, essential: true })
    }, 300))
    timers.push(window.setTimeout(() => {
      map.flyTo({
        center: [(DRIVER_START[0] + PICKUP[0]) / 2, (DRIVER_START[1] + PICKUP[1]) / 2],
        zoom: 15.55, pitch: 66, bearing: -30, duration: 2000, essential: true,
      })
    }, 3800))
    timers.push(window.setTimeout(() => {
      map.flyTo({
        center: [(PICKUP[0] + DROPOFF[0]) / 2, (PICKUP[1] + DROPOFF[1]) / 2],
        zoom: 15.75, pitch: 70, bearing: -42, duration: 2200, essential: true,
      })
    }, 8200))
    timers.push(window.setTimeout(() => {
      map.flyTo({ center: DROPOFF, zoom: 16.0, pitch: 70, bearing: -48, duration: 1800, essential: true })
    }, 10200))
    timers.push(window.setTimeout(() => {
      map.easeTo({ center: ARENA_CENTER, zoom: 15.4, pitch: 60, bearing: -38, duration: 2000, essential: true })
    }, 12000))

    // Per-frame tick
    const tick = () => {
      const m = mapRef.current
      const dp = driverPathRef.current
      const start = demoStartRef.current
      if (!m || !start || dp.length < 2) { rafRef.current = requestAnimationFrame(tick); return }

      const elapsed = performance.now() - start
      const tSec = elapsed / 1000
      const u = Math.min(1, elapsed / DEMO_MS)
      setProgress01(u)

      // Banner step
      let si = 0
      for (let i = STEPS.length - 1; i >= 0; i--) { if (tSec >= STEPS[i]!.t) { si = i; break } }
      setStepIndex(si)

      // Stop pulse ring
      if (!pulseStopped && tSec >= PULSE_STOP_SEC) {
        pulseStopped = true; stopPulseRef.current?.(); stopPulseRef.current = null
      }

      // Approach line
      if (!approachShown && tSec >= DRIVER_APPEAR_SEC) {
        approachShown = true
        try { m.setPaintProperty(APPROACH_LAYER, 'line-opacity', 0.7) } catch { /* */ }
      }
      if (!approachHidden && tSec >= 8.3) {
        approachHidden = true
        try { m.setPaintProperty(APPROACH_LAYER, 'line-opacity', 0) } catch { /* */ }
      }

      // ── Driver pin: smooth along full path ──
      if (tSec >= DRIVER_APPEAR_SEC) {
        const driverU = Math.min(1, (tSec - DRIVER_APPEAR_SEC) / (DRIVER_DONE_SEC - DRIVER_APPEAR_SEC))
        // ease-in-out for smooth movement
        const eased = driverU < 0.5
          ? 2 * driverU * driverU
          : 1 - Math.pow(-2 * driverU + 2, 2) / 2
        const pos = lerpPolyline(dp, eased)

        if (!driverMarkerRef.current) {
          const dEl = makeDriverMarkerElement()
          const marker = new mapboxgl.Marker({ element: dEl, anchor: 'center' })
          marker.setLngLat(pos)
          marker.addTo(m)
          driverMarkerRef.current = marker
        } else {
          driverMarkerRef.current.setLngLat(pos)
        }
      }

      if (u >= 1) {
        // snap driver to dropoff
        if (driverMarkerRef.current) driverMarkerRef.current.setLngLat(DROPOFF)
        setPhase('done')
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(rafRef.current); timers.forEach(t => window.clearTimeout(t)) }
  }, [phase, routeReady, reduceMotion])

  const startPlaying = useCallback(() => {
    if (reduceMotion) { setPhase('done'); return }
    setPhase('playing')
  }, [reduceMotion])

  const currentStep = STEPS[stepIndex] ?? STEPS[0]!

  return (
    <div className="fixed inset-0 z-[400] flex flex-col bg-zinc-950 text-white" role="dialog" aria-modal aria-label="Welcome demo">
      <div ref={rootRef} className="absolute inset-0 min-h-[100dvh] w-full" />
      <div ref={confettiRef} className="pointer-events-none absolute inset-0 z-[60] overflow-hidden" />

      {/* Playing / Done banner */}
      {(phase === 'playing' || phase === 'done') && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/12 bg-zinc-950/78 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/25 ring-1 ring-emerald-400/35">
                <FetchEyesHomeIcon className="h-5 w-5 text-emerald-200" tight />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300/85">Live demo</p>
                  {currentStep.eta && phase === 'playing' && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-300 ring-1 ring-emerald-400/25">
                      ETA {currentStep.eta}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[16px] font-bold leading-snug tracking-tight text-white">{currentStep.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-white/65">{currentStep.subtitle}</p>
                {phase === 'playing' ? (
                  <div className="mt-3 flex h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-100 ease-linear"
                      style={{ width: `${Math.round(progress01 * 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reduced-motion */}
      {reduceMotion && phase === 'intro' && introReady && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-zinc-950/78 px-4 py-3 backdrop-blur-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300/85">Demo</p>
            <p className="mt-1 text-[15px] font-bold text-white">Reduced motion</p>
            <p className="mt-1 text-[13px] text-white/60">Static preview of pickup → drop-off route.</p>
          </div>
        </div>
      )}

      {/* Intro overlay */}
      {phase === 'intro' && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-t from-black/88 via-black/25 to-black/40 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[24vh]">
          <div className="w-full max-w-md rounded-[1.35rem] border border-white/12 bg-zinc-950/82 p-6 shadow-2xl backdrop-blur-2xl">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">Welcome</p>
            <h2 className="mt-2 text-center text-[22px] font-bold leading-tight tracking-tight text-white">See how Fetch moves real stuff</h2>
            <p className="mt-3 text-center text-[14px] leading-relaxed text-white/65">
              15 seconds on the map: we find a Fetcher, pick up a couch, and deliver it to the buyer.
            </p>
            <div className="mx-auto mt-5 flex h-1.5 max-w-[16rem] overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-200 ease-out" style={{ width: `${Math.round(loadProgress * 100)}%` }} />
            </div>
            <p className="mt-2 text-center text-[11px] tabular-nums text-white/40">{introReady ? 'Ready' : 'Loading map…'}</p>
            <button type="button" disabled={!introReady} onClick={startPlaying} className="mt-4 w-full rounded-2xl bg-emerald-600 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-emerald-900/40 transition-transform enabled:active:scale-[0.98] disabled:opacity-40">
              {!introReady ? 'Loading…' : reduceMotion ? 'Continue' : 'Watch demo'}
            </button>
            <button type="button" onClick={skip} className="mt-3 w-full py-2 text-[13px] font-semibold text-white/45 hover:text-white/70">Skip</button>
          </div>
        </div>
      )}

      {/* Done CTA */}
      {phase === 'done' && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16">
          <button type="button" onClick={finish} className="w-full max-w-md rounded-2xl bg-white py-3.5 text-[15px] font-bold text-emerald-950 shadow-xl transition-transform active:scale-[0.98]">
            Continue to Fetch
          </button>
        </div>
      )}

      {/* Skip */}
      {phase === 'playing' && (
        <button type="button" onClick={skip} className="absolute right-3 top-[max(5.5rem,env(safe-area-inset-top)+4rem)] z-30 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[12px] font-semibold text-white/85 backdrop-blur-md">Skip</button>
      )}
    </div>
  )
}
