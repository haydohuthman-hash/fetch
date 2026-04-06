import type { BrainNode } from './fetchBrainGraph'

export type FetchBrainMindState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** Dots on the outer ring (with jitter). */
const BRAIN_RING_N = 250
/** Interior disk fill — uniform area sampling up to the ring so the circle reads solid. */
const BRAIN_INNER_N = 980
/** Total anchors = ring + interior. */
export const BRAIN_ANCHOR_N = BRAIN_RING_N + BRAIN_INNER_N
const CHILD_PER_ANCHOR = 8
/** Max angle jitter (rad) — keeps dots on a ring but slightly irregular. */
const RING_ANGLE_JITTER = 0.42
/** Fractional radius jitter ± half this range. */
const RING_RADIUS_JITTER = 0.07

function hash01(i: number, seed = 0) {
  let h = (i + 1) * 374761393 + seed * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function n2(x: number, y: number, t: number) {
  return (
    Math.sin(x * 0.019 + t * 1.1) * Math.cos(y * 0.017 - t * 0.9) * 0.5 +
    Math.sin(x * 0.031 + y * 0.023 + t * 2.3) * 0.25
  )
}

type Rgb = { r: number; g: number; b: number }

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.max(0, Math.min(1, t))
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  }
}

/** Dot body: dark blue-greys on dark theme; light blues, greys, and slate accents on light. */
export function brainPaletteCore(t01: number, theme: 'light' | 'dark'): Rgb {
  const u = ((t01 % 1) + 1) % 1
  if (theme === 'dark') {
    if (u < 0.5) return lerpRgb({ r: 12, g: 20, b: 40 }, { r: 26, g: 38, b: 68 }, u / 0.5)
    return lerpRgb({ r: 26, g: 38, b: 68 }, { r: 38, g: 52, b: 86 }, (u - 0.5) / 0.5)
  }
  if (u < 0.34) return lerpRgb({ r: 228, g: 234, b: 242 }, { r: 206, g: 214, b: 226 }, u / 0.34)
  if (u < 0.68) return lerpRgb({ r: 191, g: 219, b: 254 }, { r: 186, g: 230, b: 253 }, (u - 0.34) / 0.34)
  return lerpRgb({ r: 96, g: 112, b: 136 }, { r: 62, g: 76, b: 96 }, (u - 0.68) / 0.32)
}

/** Neon rim / glow — electric light blues (dark) or brighter sky blues (light). */
function neonTintedWithGlow(t01: number, theme: 'light' | 'dark', userGlow: Rgb): Rgb {
  return lerpRgb(brainPaletteNeon(t01, theme), userGlow, 0.36)
}

export function brainPaletteNeon(t01: number, theme: 'light' | 'dark'): Rgb {
  const u = ((t01 % 1) + 1) % 1
  const darkNeons: Rgb[] = [
    { r: 56, g: 189, b: 248 },
    { r: 125, g: 211, b: 252 },
    { r: 96, g: 165, b: 250 },
    { r: 34, g: 211, b: 238 },
  ]
  const lightNeons: Rgb[] = [
    { r: 14, g: 165, b: 233 },
    { r: 59, g: 130, b: 246 },
    { r: 6, g: 182, b: 212 },
    { r: 56, g: 189, b: 248 },
  ]
  const pal = theme === 'dark' ? darkNeons : lightNeons
  const x = u * pal.length
  const i = Math.floor(x) % pal.length
  const j = (i + 1) % pal.length
  return lerpRgb(pal[i]!, pal[j]!, x - Math.floor(x))
}

/** @deprecated Use brainPaletteNeon — kept for ingest/bloom call sites. */
export function brainHueRgbFrom01(t: number, theme: 'light' | 'dark'): Rgb {
  return brainPaletteNeon(t, theme)
}

export type BrainParticleBuffers = {
  n: number
  px: Float32Array
  py: Float32Array
  hx: Float32Array
  hy: Float32Array
  sx: Float32Array
  sy: Float32Array
  hubNear01: Float32Array
  hue01: Float32Array
  phase: Float32Array
  open01: Float32Array
  /** 0 = ring dot, 1 = interior (random in disk). */
  innerByte: Uint8Array
  hubX: Float32Array
  hubY: Float32Array
  hubPull: Float32Array
  hubCount: number
}

export function createBrainParticleField(
  w: number,
  h: number,
  _graphNodes: BrainNode[],
): BrainParticleBuffers | null {
  if (w < 80 || h < 80) return null

  const n = BRAIN_ANCHOR_N
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const hx = new Float32Array(n)
  const hy = new Float32Array(n)
  const sx = new Float32Array(n)
  const sy = new Float32Array(n)
  const hubNear01 = new Float32Array(n)
  const hue01 = new Float32Array(n)
  const phase = new Float32Array(n)
  const open01 = new Float32Array(n)
  const innerByte = new Uint8Array(n)

  const cx = w * 0.5
  const cy = h * 0.4
  const m = Math.min(w, h)
  /** Nominal ring radius — interior fills the same circle (minus hairline gap to avoid double-stacking on ring). */
  const ringR = m * 0.375
  const innerMaxR = ringR * 0.988

  const hubX = new Float32Array(0)
  const hubY = new Float32Array(0)
  const hubPull = new Float32Array(0)

  for (let i = 0; i < BRAIN_RING_N; i++) {
    innerByte[i] = 0
    const theta =
      -Math.PI / 2 +
      (i / BRAIN_RING_N) * Math.PI * 2 +
      (hash01(i, 88) - 0.5) * RING_ANGLE_JITTER
    const rJ = ringR * (1 + (hash01(i, 89) - 0.5) * RING_RADIUS_JITTER)
    hx[i] = cx + Math.cos(theta) * rJ
    hy[i] = cy + Math.sin(theta) * rJ
    hubNear01[i] = 0.5 + hash01(i, 60) * 0.42
    hue01[i] = hash01(i, 71)
    phase[i] = hash01(i, 72) * Math.PI * 2
    open01[i] = 0
    sx[i] = hash01(i, 5) * w
    sy[i] = hash01(i, 6) * h
    px[i] = sx[i]!
    py[i] = sy[i]!
  }

  for (let j = 0; j < BRAIN_INNER_N; j++) {
    const i = BRAIN_RING_N + j
    innerByte[i] = 1
    const ru = hash01(i, 201)
    const tv = hash01(i, 202)
    /** sqrt(ru) ⇒ uniform density over disk area (not hollow, not center-piled). */
    const r = innerMaxR * Math.sqrt(ru)
    const th = tv * Math.PI * 2
    let ix = cx + Math.cos(th) * r
    let iy = cy + Math.sin(th) * r
    ix += (hash01(i, 203) - 0.5) * ringR * 0.045
    iy += (hash01(i, 204) - 0.5) * ringR * 0.045
    const dx = ix - cx
    const dy = iy - cy
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-4
    if (d > innerMaxR) {
      const s = innerMaxR / d
      ix = cx + dx * s
      iy = cy + dy * s
    }
    hx[i] = ix
    hy[i] = iy
    hubNear01[i] = 0.28 + hash01(i, 205) * 0.35
    hue01[i] = hash01(i, 206)
    phase[i] = hash01(i, 207) * Math.PI * 2
    open01[i] = 0
    sx[i] = hash01(i, 5) * w
    sy[i] = hash01(i, 6) * h
    px[i] = sx[i]!
    py[i] = sy[i]!
  }

  return {
    n,
    px,
    py,
    hx,
    hy,
    sx,
    sy,
    hubNear01,
    hue01,
    phase,
    open01,
    innerByte,
    hubX,
    hubY,
    hubPull,
    hubCount: 0,
  }
}

function easeOutCubic(t: number) {
  const u = Math.max(0, Math.min(1, t))
  return 1 - (1 - u) ** 3
}

function globalBreatheScale(
  t: number,
  mind: FetchBrainMindState,
  speechAmp: number,
  reducedMotion: boolean,
  cortexCalm: boolean,
): number {
  if (reducedMotion) {
    return 1 + (mind === 'speaking' ? speechAmp * 0.048 : 0)
  }
  const base = cortexCalm ? 0.014 : 0.038
  const g = 1 + base * Math.sin(t * 1.12) + (cortexCalm ? 0.006 * Math.sin(t * 0.68) : 0)
  const speak = mind === 'speaking' ? 0.034 + speechAmp * 0.092 : 0
  return g + speak
}

export function stepBrainParticles(
  buf: BrainParticleBuffers,
  w: number,
  h: number,
  t: number,
  mind: FetchBrainMindState,
  dissolve01: number,
  speechAmp: number,
  dt: number,
  cortexCalm = false,
  cortexSpread01 = 0,
  reducedMotion = false,
) {
  const { n, px, py, hx, hy, sx, sy, phase, open01 } = buf
  const d = easeOutCubic(dissolve01)
  const cx = w * 0.5
  const cy = h * 0.4
  const spread = Math.max(0, Math.min(1, cortexSpread01))
  const spreadMul = 1 + spread * 0.08

  const gScale = globalBreatheScale(t, mind, speechAmp, reducedMotion, cortexCalm)

  let wantOpen = 0
  if (mind === 'listening' || mind === 'thinking') wantOpen = 1
  else if (mind === 'speaking') wantOpen = 0.4

  const openLerpUp = wantOpen > 0.5 ? 2.6 : 1.05
  const openLerpDown = wantOpen < 0.2 ? 1.35 : openLerpUp

  for (let i = 0; i < n; i++) {
    const targetOpen =
      wantOpen * (0.9 + 0.1 * Math.sin(t * 1.35 + phase[i]! * 0.3)) +
      (mind === 'speaking' ? 0.16 * Math.sin(t * 3.1 + i * 0.2) + speechAmp * 0.22 : 0)
    const lo = openLerpUp + (openLerpDown - openLerpUp) * (1 - wantOpen)
    open01[i]! += (Math.max(0, Math.min(1, targetOpen)) - open01[i]!) * Math.min(1, dt * lo)

    const perDot = 1 + (reducedMotion ? 0 : 0.017) * Math.sin(t * 1.12 + phase[i]!)
    const radial = gScale * perDot * spreadMul
    let tx = cx + (hx[i]! - cx) * radial
    let ty = cy + (hy[i]! - cy) * radial

    if (!reducedMotion && dissolve01 > 0.99) {
      const nx = i * 0.31
      const ny = i * 0.27
      const wob =
        (mind === 'listening' ? 2.8 : mind === 'thinking' ? 3.4 : mind === 'speaking' ? 7.2 : 1.6) *
        (mind === 'speaking' ? 0.3 + speechAmp * 0.12 : 0.22)
      tx += n2(nx, ny, t + i * 0.05) * wob
      ty += n2(ny, nx, t * 0.97 + i * 0.04) * wob
    }

    if (dissolve01 < 0.999) {
      px[i] = sx[i]! + (tx - sx[i]!) * d
      py[i] = sy[i]! + (ty - sy[i]!) * d
    } else {
      px[i] = tx
      py[i] = ty
    }

  }
}

/** @deprecated Grid only kept for API compatibility; dots mode does not use spatial hashing. */
export type BrainParticleScratch = {
  cols: number
  rows: number
  grid: Int32Array
  gridCount: Int32Array
}

export function ensureBrainParticleScratch(
  _w: number,
  _h: number,
  prev: BrainParticleScratch | null,
  _cellSize = 36,
): BrainParticleScratch {
  const cols = 1
  const rows = 1
  if (prev && prev.cols === cols && prev.rows === rows) return prev
  return {
    cols,
    rows,
    grid: new Int32Array(0),
    gridCount: new Int32Array(0),
  }
}

function findWebBrainNode(nodes: BrainNode[]): BrainNode | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    if (n.kind === 'web' || n.id.startsWith('web-')) return n
  }
  return null
}

export function drawBrainParticles(
  ctx: CanvasRenderingContext2D,
  buf: BrainParticleBuffers,
  w: number,
  h: number,
  t: number,
  theme: 'light' | 'dark',
  mind: FetchBrainMindState,
  dissolve01: number,
  speechAmp: number,
  glowRgb: { r: number; g: number; b: number },
  _scratch: BrainParticleScratch,
  cortexCalm = false,
  cortexSpread01 = 0,
  _cellSize = 36,
  reducedMotion = false,
  graphNodes: BrainNode[] = [],
) {
  const { n, px, py, hubNear01, hue01, open01, phase, innerByte } = buf
  const dMix = Math.max(0.35, Math.min(1, dissolve01))
  const isLight = theme === 'light'
  const cx = w * 0.5
  const cy = h * 0.4
  const m = Math.min(w, h)
  const twoPi = Math.PI * 2
  const gScale = globalBreatheScale(t, mind, speechAmp, reducedMotion, cortexCalm)
  const spread = Math.max(0, Math.min(1, cortexSpread01))

  ctx.fillStyle = isLight ? '#f8fafc' : '#000000'
  ctx.fillRect(0, 0, w, h)

  /** Flat dots only — no halos / radial blooms (minimal glow, much faster). */
  for (let i = 0; i < n; i++) {
    const open = open01[i]!
    const hn = hubNear01[i]!
    const isInner = innerByte[i] === 1
    const innerScale = isInner ? 0.74 : 1
    const coreRgb = brainPaletteCore(hue01[i]!, theme)
    const neonRgb = brainPaletteNeon(hue01[i]!, theme)
    const x = px[i]!
    const y = py[i]!

    const rLarge =
      m *
      (0.018 + hn * 0.008 + spread * 0.002) *
      innerScale *
      (1 - open * 0.78) *
      dMix *
      (mind === 'speaking' ? 1 + speechAmp * 0.52 : 1)

    const rCorePx = Math.max(2.5, rLarge)
    const speakNeonBoost = mind === 'speaking' ? 1 + speechAmp * 0.45 : 1
    const alphaNeon =
      (isLight ? 0.42 : 0.56) *
      (0.4 + dMix * 0.6) *
      (0.75 + open * 0.25) *
      speakNeonBoost *
      0.52

    const coreA =
      (isLight ? 0.88 : 0.92) * (0.35 + dMix * 0.65) * (1 - open * 0.35) * 0.92

    const rBody = Math.max(1.2, rCorePx * 0.42)

    const childAlpha =
      open *
      (isLight ? 0.72 : 0.78) *
      dMix *
      (mind === 'speaking' ? 1 + speechAmp * 0.5 : 1) *
      0.58
    const speakOrbit = mind === 'speaking' ? 1 + speechAmp * 0.62 : 1
    const orbit = m * (0.034 + hn * 0.01) * open * (isInner ? 0.82 : 1) * speakOrbit
    const rChild =
      (1.8 + open * 2.8) *
      (0.85 + dMix * 0.15) *
      innerScale *
      (mind === 'speaking' ? 1 + speechAmp * 0.4 : 1)

    const childCap = isInner ? 6 : CHILD_PER_ANCHOR

    ctx.fillStyle = `rgba(${neonRgb.r},${neonRgb.g},${neonRgb.b},${Math.min(1, alphaNeon)})`
    ctx.beginPath()
    ctx.arc(x, y, rCorePx * 1.08, 0, twoPi)
    ctx.fill()
    ctx.fillStyle = `rgba(${coreRgb.r},${coreRgb.g},${coreRgb.b},${coreA})`
    ctx.beginPath()
    ctx.arc(x, y, rBody, 0, twoPi)
    ctx.fill()

    for (let k = 0; k < childCap; k++) {
      if (open < 0.04) break
      const ang =
        (k / childCap) * twoPi + t * (reducedMotion ? 0 : 0.55) + phase[i]! * 0.08
      const ck = hash01(i * 16 + k, 80)
      const childHue = ((hue01[i]! + ck * 0.22) % 1 + 1) % 1
      const cr = neonTintedWithGlow(childHue, theme, glowRgb)
      const ox = x + Math.cos(ang) * orbit
      const oy = y + Math.sin(ang) * orbit
      const ca = childAlpha * (0.55 + ck * 0.45)
      ctx.fillStyle = `rgba(${cr.r},${cr.g},${cr.b},${ca})`
      ctx.beginPath()
      ctx.arc(ox, oy, rChild, 0, twoPi)
      ctx.fill()
    }
  }

  const webNode = findWebBrainNode(graphNodes)
  if (webNode) {
    const wx = (webNode.x / 1000) * w
    const wy = (webNode.y / 700) * h
    const tx = cx + (wx - cx) * gScale * spreadMulFromSpread(spread)
    const ty = cy + (wy - cy) * gScale * spreadMulFromSpread(spread) * 0.98
    const pulse = reducedMotion ? 1 : 1 + 0.07 * Math.sin(t * 1.9)
    const rw = m * 0.026 * pulse * dMix
    const wr = isLight ? 16 : 45
    const wg = isLight ? 185 : 212
    const wb = isLight ? 129 : 191
    ctx.fillStyle = `rgba(${wr},${wg},${wb},${isLight ? 0.22 : 0.32})`
    ctx.beginPath()
    ctx.arc(tx, ty, rw * 1.12, 0, twoPi)
    ctx.fill()
    ctx.fillStyle = `rgba(${wr + 30},${wg + 25},${wb + 20},${isLight ? 0.78 : 0.75})`
    ctx.beginPath()
    ctx.arc(tx, ty, rw * 0.55, 0, twoPi)
    ctx.fill()
  }

}

function spreadMulFromSpread(spread: number) {
  return 1 + spread * 0.08
}

/**
 * Large neon “data” motes: driven while listening (steady rush) or assistant speaking (amplitude burst).
 * Spawn beyond the viewport, rush inward with a big glow, shrink and fade as they feed the core.
 */
export const BRAIN_MEMORY_INGEST_N = 56

export type BrainMemoryIngestBuffers = {
  n: number
  px: Float32Array
  py: Float32Array
  vx: Float32Array
  vy: Float32Array
  seed: Float32Array
}

export function createBrainMemoryIngestBuffers(): BrainMemoryIngestBuffers {
  const n = BRAIN_MEMORY_INGEST_N
  return {
    n,
    px: new Float32Array(n),
    py: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    seed: new Float32Array(n),
  }
}

function spawnMoteOutsideViewport(
  buf: BrainMemoryIngestBuffers,
  i: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
) {
  const ext = Math.max(w, h) * (0.12 + hash01(i, 21) * 0.1)
  const side = Math.floor(hash01(i, 22) * 4)
  const u = hash01(i, 23)
  switch (side) {
    case 0:
      buf.px[i] = u * w
      buf.py[i] = -ext - hash01(i, 24) * h * 0.2
      break
    case 1:
      buf.px[i] = w + ext + hash01(i, 24) * w * 0.15
      buf.py[i] = u * h
      break
    case 2:
      buf.px[i] = u * w
      buf.py[i] = h + ext + hash01(i, 24) * h * 0.2
      break
    default:
      buf.px[i] = -ext - hash01(i, 24) * w * 0.15
      buf.py[i] = u * h
      break
  }
  const dx = cx - buf.px[i]!
  const dy = cy - buf.py[i]!
  const d = Math.sqrt(dx * dx + dy * dy) + 1e-3
  const base = 0.55 + buf.seed[i]! * 0.65
  buf.vx[i] = (dx / d) * base * (4 + hash01(i, 25) * 6)
  buf.vy[i] = (dy / d) * base * (4 + hash01(i, 26) * 6)
}

export function resetBrainMemoryIngest(buf: BrainMemoryIngestBuffers, w: number, h: number) {
  const cx = w * 0.5
  const cy = h * 0.4
  for (let i = 0; i < buf.n; i++) {
    buf.seed[i] = hash01(i, 14)
    spawnMoteOutsideViewport(buf, i, w, h, cx, cy)
  }
}

export function stepBrainMemoryIngest(
  buf: BrainMemoryIngestBuffers,
  w: number,
  h: number,
  cx: number,
  cy: number,
  strength01: number,
  dt: number,
) {
  if (strength01 < 0.02) return
  const phys = 52 * dt * (0.6 + strength01 * 0.5)
  const swirl = 7.2 * strength01
  const absorbR = 22 + 10 * strength01
  for (let i = 0; i < buf.n; i++) {
    const dx = cx - buf.px[i]!
    const dy = cy - buf.py[i]!
    const dist = Math.sqrt(dx * dx + dy * dy) + 14
    const pull = (strength01 * 9200) / (dist * dist)
    let ax = (dx / dist) * pull
    let ay = (dy / dist) * pull
    ax += (-dy / dist) * swirl * (0.4 + buf.seed[i]! * 0.6)
    ay += (dx / dist) * swirl * (0.4 + buf.seed[i]! * 0.6)
    buf.vx[i] = (buf.vx[i]! + ax * phys) * 0.86
    buf.vy[i] = (buf.vy[i]! + ay * phys) * 0.86
    buf.px[i]! += buf.vx[i]! * phys
    buf.py[i]! += buf.vy[i]! * phys
    const dx2 = cx - buf.px[i]!
    const dy2 = cy - buf.py[i]!
    const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
    if (d2 < absorbR) {
      spawnMoteOutsideViewport(buf, i, w, h, cx, cy)
    }
  }
}

/** @deprecated Listening-driven ingest no longer uses a fixed envelope window. */
export function memoryIngestEnvelope(_elapsedMs: number): number {
  return 1
}

export function memoryIngestDurationMs(): number {
  return 999999
}

export function drawBrainMemoryIngest(
  ctx: CanvasRenderingContext2D,
  buf: BrainMemoryIngestBuffers,
  w: number,
  h: number,
  theme: 'light' | 'dark',
  strength01: number,
  _glowRgb: { r: number; g: number; b: number },
) {
  if (strength01 < 0.04) return
  const isLight = theme === 'light'
  ctx.save()
  const cx = w * 0.5
  const cy = h * 0.4
  const maxD = Math.hypot(w, h) * 0.62

  for (let i = 0; i < buf.n; i++) {
    const dx = buf.px[i]! - cx
    const dy = buf.py[i]! - cy
    const dist = Math.sqrt(dx * dx + dy * dy) + 1e-4
    const far01 = Math.min(1, dist / maxD)
    const nearCore = Math.min(1, dist / 56)
    const tw = 0.5 + buf.seed[i]! * 0.5
    const hueT = (buf.seed[i]! * 0.73 + i * 0.019) % 1
    const { r: br, g: bg, b: bb } = brainHueRgbFrom01(hueT, theme)
    const rCore = (2.2 + buf.seed[i]! * 3.8) * (0.35 + nearCore * 0.85)
    const feedAlpha =
      strength01 *
      tw *
      (0.35 + far01 * 0.65) *
      (0.15 + (1 - nearCore) * (1 - nearCore)) *
      (isLight ? 0.28 : 0.34)

    ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.min(1, feedAlpha * 0.85)})`
    ctx.beginPath()
    ctx.arc(buf.px[i]!, buf.py[i]!, rCore * 1.15, 0, Math.PI * 2)
    ctx.fill()

    const coreA = Math.min(1, feedAlpha * 0.95 * (0.4 + far01 * 0.6))
    ctx.fillStyle = `rgba(255,255,255,${coreA * (isLight ? 0.35 : 0.5)})`
    ctx.beginPath()
    ctx.arc(buf.px[i]!, buf.py[i]!, rCore * 0.48, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
