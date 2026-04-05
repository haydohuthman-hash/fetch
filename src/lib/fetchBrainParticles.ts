import type { BrainNode } from './fetchBrainGraph'

export type FetchBrainMindState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** Slightly below prior cap — fewer verts/step + draw work, still reads dense. */
const N = 2600
const CELL = 36
const GRID_BUCKET = 12

function hash01(i: number, seed = 0) {
  let h = (i + 1) * 374761393 + seed * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth 2D value noise-ish for organic flow */
function n2(x: number, y: number, t: number) {
  return (
    Math.sin(x * 0.019 + t * 1.1) * Math.cos(y * 0.017 - t * 0.9) * 0.5 +
    Math.sin(x * 0.031 + y * 0.023 + t * 2.3) * 0.25
  )
}

export type BrainParticleBuffers = {
  n: number
  px: Float32Array
  py: Float32Array
  vx: Float32Array
  vy: Float32Array
  hx: Float32Array
  hy: Float32Array
  /** Memory cortex: same plexus shell, slightly tighter than field. */
  cortexHx: Float32Array
  cortexHy: Float32Array
  sx: Float32Array
  sy: Float32Array
  layer: Uint8Array
  /** 0–1: near a hub → brighter dot / stronger bloom. */
  hubNear01: Float32Array
  hubX: Float32Array
  hubY: Float32Array
  hubPull: Float32Array
  hubCount: number
}

const N_SYNTH_HUBS = 6

function samplePlexusHome(
  i: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  hubXa: Float32Array,
  hubYa: Float32Array,
  totalHubs: number,
  scale: number,
  salt: number,
): { x: number; y: number; hubNear01: number } {
  const m = Math.min(w, h)
  const rIn = m * 0.11 * scale
  const rOut = m * 0.46 * scale
  const theta = hash01(i, 1 + salt) * Math.PI * 2 + hash01(i, 2 + salt) * 0.08
  const shellPick = hash01(i, 41 + salt)
  let r: number
  if (shellPick < 0.11) {
    r = m * (0.035 + Math.sqrt(hash01(i, 42 + salt)) * 0.095) * scale
  } else {
    r = rIn + Math.sqrt(hash01(i, 43 + salt)) * (rOut - rIn)
  }
  const jx = 0.88 + hash01(i, 48 + salt) * 0.2
  const jy = 0.86 + hash01(i, 49 + salt) * 0.18
  let x = cx + Math.cos(theta) * r * jx
  let y = cy + Math.sin(theta) * r * jy

  if (hash01(i, 44 + salt) < 0.4) {
    const hk = Math.floor(hash01(i, 45 + salt) * totalHubs) % totalHubs
    const pull = 0.18 + hash01(i, 46 + salt) * 0.48
    x += (hubXa[hk]! - x) * pull
    y += (hubYa[hk]! - y) * pull
  }

  let minD = 1e9
  for (let k = 0; k < totalHubs; k++) {
    const dx = x - hubXa[k]!
    const dy = y - hubYa[k]!
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < minD) minD = d
  }
  const norm = m * 0.24
  const hubNear01 = Math.max(0, Math.min(1, 1 - minD / norm))
  return { x, y, hubNear01 }
}

export function createBrainParticleField(
  w: number,
  h: number,
  graphNodes: BrainNode[],
): BrainParticleBuffers | null {
  if (w < 80 || h < 80) return null

  const px = new Float32Array(N)
  const py = new Float32Array(N)
  const vx = new Float32Array(N)
  const vy = new Float32Array(N)
  const hx = new Float32Array(N)
  const hy = new Float32Array(N)
  const cortexHx = new Float32Array(N)
  const cortexHy = new Float32Array(N)
  const sx = new Float32Array(N)
  const sy = new Float32Array(N)
  const layer = new Uint8Array(N)
  const hubNear01 = new Float32Array(N)

  const hubs = graphNodes.filter((n) => n.kind === 'core' || n.kind === 'hub' || n.kind === 'nav')
  const graphHubN = Math.max(1, hubs.length)
  const totalHubs = graphHubN + N_SYNTH_HUBS
  const hubX = new Float32Array(totalHubs)
  const hubY = new Float32Array(totalHubs)
  const hubPull = new Float32Array(totalHubs)

  if (hubs.length === 0) {
    hubX[0] = w * 0.5
    hubY[0] = h * 0.42
    hubPull[0] = 2.0
  } else {
    for (let k = 0; k < graphHubN; k++) {
      const node = hubs[k]!
      hubX[k] = (node.x / 1000) * w
      hubY[k] = (node.y / 700) * h
      hubPull[k] =
        node.kind === 'core' ? 2.2 : node.kind === 'nav' ? 1.5 : 1.15
    }
  }

  const cx = w * 0.5
  const cy = h * 0.4
  const synthR = Math.min(w, h) * 0.27
  for (let s = 0; s < N_SYNTH_HUBS; s++) {
    const ang = -Math.PI / 2 + (s / N_SYNTH_HUBS) * Math.PI * 2
    const k = graphHubN + s
    hubX[k] = cx + Math.cos(ang) * synthR
    hubY[k] = cy + Math.sin(ang) * synthR * 0.9
    hubPull[k] = 1.28
  }

  for (let i = 0; i < N; i++) {
    const f = samplePlexusHome(i, w, h, cx, cy, hubX, hubY, totalHubs, 1, 0)
    hx[i] = f.x
    hy[i] = f.y
    const c = samplePlexusHome(i, w, h, cx, cy, hubX, hubY, totalHubs, 0.93, 100)
    cortexHx[i] = c.x
    cortexHy[i] = c.y
    hubNear01[i] = Math.max(f.hubNear01, c.hubNear01) * 0.92 + hash01(i, 60) * 0.08

    sx[i] = hash01(i, 5) * w
    sy[i] = hash01(i, 6) * h
    layer[i] = i % 3
    px[i] = sx[i]
    py[i] = sy[i]
  }

  return {
    n: N,
    px,
    py,
    vx,
    vy,
    hx,
    hy,
    cortexHx,
    cortexHy,
    sx,
    sy,
    layer,
    hubNear01,
    hubX,
    hubY,
    hubPull,
    hubCount: totalHubs,
  }
}

function easeOutCubic(t: number) {
  const u = Math.max(0, Math.min(1, t))
  return 1 - (1 - u) ** 3
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
  /** Cortex UI: keep particles nearly still — only a light inhale/exhale on the field. */
  cortexCalm = false,
  /** Deeper cortex zoom (0–1): spread homes toward the viewport edge. */
  cortexSpread01 = 0,
) {
  const { n, px, py, vx, vy, hx, hy, cortexHx, cortexHy, sx, sy, layer, hubX, hubY, hubPull, hubCount } =
    buf
  const d = easeOutCubic(dissolve01)
  const cx = w * 0.5
  const cy = h * 0.4
  const wHeart = 1.05
  const idleHeartBreathe =
    1 +
    0.014 * Math.sin(t * wHeart) +
    0.0068 * Math.sin(2 * t * wHeart + 0.45)
  const breatheFreq = mind === 'speaking' ? 1.78 : 1.32
  const breatheAmp = mind === 'speaking' ? 0.026 : 0.012
  const breatheNormal =
    mind === 'idle'
      ? idleHeartBreathe
      : 1 + Math.sin(t * breatheFreq) * breatheAmp
  const breathe = cortexCalm
    ? 1 + 0.0042 * Math.sin(t * 0.68) + 0.0019 * Math.sin(t * 1.36 + 0.4)
    : breatheNormal

  const spread = Math.max(0, Math.min(1, cortexSpread01))
  const spreadMul = 1 + spread * 1.05

  for (let i = 0; i < n; i++) {
    const rawHx = cortexCalm ? cortexHx[i]! : hx[i]!
    const rawHy = cortexCalm ? cortexHy[i]! : hy[i]!
    let hxb = cx + (rawHx - cx) * breathe * spreadMul
    let hyb = cy + (rawHy - cy) * breathe * (spreadMul * (0.97 + spread * 0.04))

    if (cortexCalm && spread > 0.04) {
      const mx = Math.max(Math.abs(hxb - cx), Math.abs(hyb - cy))
      const cap = Math.min(w, h) * (0.46 + spread * 0.12)
      if (mx > cap * 0.98) {
        const s = (cap * 0.98) / mx
        hxb = cx + (hxb - cx) * s
        hyb = cy + (hyb - cy) * s
      }
    }

    if (dissolve01 < 0.999) {
      px[i] = sx[i]! + (hxb - sx[i]!) * d
      py[i] = sy[i]! + (hyb - sy[i]!) * d
      vx[i] = 0
      vy[i] = 0
      continue
    }

    let ax = 0
    let ay = 0

    const kHome = cortexCalm
      ? 0.0088
      : mind === 'speaking'
        ? 0.055 + speechAmp * 0.09
        : mind === 'thinking'
          ? 0.038
          : mind === 'listening'
            ? 0.054
            : 0.021

    ax += (hxb - px[i]!) * kHome
    ay += (hyb - py[i]!) * kHome

    const hubAgg = cortexCalm
      ? 0.24 * (1 - spread * 0.55)
      : mind === 'listening'
        ? 1.35
        : mind === 'idle'
          ? 0.58
          : mind === 'speaking'
            ? 0.7
            : 1

    for (let k = 0; k < hubCount; k++) {
      const dx = hubX[k]! - px[i]!
      const dy = hubY[k]! - py[i]!
      const dist = Math.sqrt(dx * dx + dy * dy) + 8
      const pull = (hubPull[k]! * 520) / (dist * dist)
      ax += (dx / dist) * pull * hubAgg
      ay += (dy / dist) * pull * hubAgg
    }

    const nx = px[i]! * 0.011
    const ny = py[i]! * 0.011
    const nt = t + layer[i]! * 0.31

    if (cortexCalm) {
      const dx0 = px[i]! - cx
      const dy0 = py[i]! - cy
      const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) + 1e-4
      const voidR = Math.min(w, h) * (0.1 + spread * 0.04)
      if (d0 < voidR) {
        const u = (voidR - d0) / voidR
        const push = u * u * (0.11 + spread * 0.14)
        ax -= (dx0 / d0) * push
        ay -= (dy0 / d0) * push
      }
      const gate = Math.sin(t * 0.07) ** 26
      const idleDrift = n2(nx, ny, nt * 0.28) * 0.32
      const idleMind = n2(nx * 1.02, ny * 1.02, nt * 0.38) * 1.15 * gate
      ax += idleDrift + idleMind
      ay += n2(ny, nx, nt * 0.27) * 0.32 + n2(ny * 1.02, nx * 1.02, nt * 0.37) * 1.15 * gate
    } else if (mind === 'idle') {
      const dx0 = px[i]! - cx
      const dy0 = py[i]! - cy
      const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) + 1e-4
      const voidR = Math.min(w, h) * 0.09
      if (d0 < voidR) {
        const u = (voidR - d0) / voidR
        const push = u * u * 0.038
        ax -= (dx0 / d0) * push
        ay -= (dy0 / d0) * push
      }
      const burstGate = Math.sin(t * 0.09) ** 24
      const idleDrift = n2(nx, ny, nt * 0.42) * 0.95
      const idleMind = n2(nx * 1.08, ny * 1.06, nt * 0.62) * 2.35 * burstGate
      ax += idleDrift + idleMind
      ay += n2(ny, nx, nt * 0.4) * 0.95 + n2(ny * 1.06, nx * 1.08, nt * 0.6) * 2.35 * burstGate
    } else if (mind === 'listening') {
      const ang = t * 1.14 + i * 0.01
      ax += Math.cos(ang) * 5.2 + n2(nx, ny, nt) * 6.5
      ay += Math.sin(ang) * 5.2 + n2(ny, nx, nt) * 6.5
      ax -= (px[i]! - cx) * 0.018
      ay -= (py[i]! - cy) * 0.018
    } else if (mind === 'thinking') {
      ax += n2(nx * 1.25, ny * 1.25, nt * 2.05) * 11
      ay += n2(ny * 1.25, nx * 1.25, nt * 1.88) * 11
    } else {
      const amp = Math.max(0.22, speechAmp)
      ax += n2(nx, ny, nt * 2.1) * (9 + amp * 14)
      ay += n2(ny, nx, nt * 2.1) * (9 + amp * 14)
      const dxC = px[i]! - cx
      const dyC = py[i]! - cy
      const distC = Math.sqrt(dxC * dxC + dyC * dyC) + 14
      const push = (amp * 34) / distC
      ax += (dxC / distC) * push
      ay += (dyC / distC) * push
    }

    const damp = cortexCalm
      ? 0.978
      : mind === 'idle'
        ? 0.965
        : mind === 'thinking'
          ? 0.91
          : mind === 'speaking'
            ? 0.88 + speechAmp * 0.06
            : 0.9

    const phys = (cortexCalm ? 14 : mind === 'idle' ? 26 : 52) * dt
    vx[i] = (vx[i]! + ax * phys) * damp
    vy[i] = (vy[i]! + ay * phys) * damp

    px[i]! += vx[i]! * phys
    py[i]! += vy[i]! * phys

    if (px[i]! < -40) px[i]! = w + 20
    if (px[i]! > w + 40) px[i]! = -20
    if (py[i]! < -40) py[i]! = h + 20
    if (py[i]! > h + 40) py[i]! = -20
  }
}

export type BrainParticleScratch = {
  cols: number
  rows: number
  grid: Int32Array
  gridCount: Int32Array
}

export function ensureBrainParticleScratch(
  w: number,
  h: number,
  prev: BrainParticleScratch | null,
  /** Smaller cells = denser neighbor queries (cortex mesh). */
  cellSize: number = CELL,
): BrainParticleScratch {
  const cols = Math.ceil(w / cellSize) + 2
  const rows = Math.ceil(h / cellSize) + 2
  const cells = cols * rows
  if (prev && prev.cols === cols && prev.rows === rows) {
    prev.gridCount.fill(0)
    return prev
  }
  return {
    cols,
    rows,
    grid: new Int32Array(cells * GRID_BUCKET),
    gridCount: new Int32Array(cells),
  }
}

function plexusLineStrokeDark(glowRgb: { r: number; g: number; b: number }, alpha: number) {
  const r = Math.round(248 + (glowRgb.r - 248) * 0.2)
  const g = Math.round(252 + (glowRgb.g - 252) * 0.2)
  const b = Math.round(255 + (glowRgb.b - 255) * 0.22)
  return `rgba(${r},${g},${b},${alpha})`
}

function plexusLineStrokeLight(glowRgb: { r: number; g: number; b: number }, alpha: number) {
  const r = Math.round(26 + (glowRgb.r - 26) * 0.32)
  const g = Math.round(36 + (glowRgb.g - 36) * 0.32)
  const b = Math.round(54 + (glowRgb.b - 54) * 0.32)
  return `rgba(${r},${g},${b},${alpha})`
}

export function drawBrainParticles(
  ctx: CanvasRenderingContext2D,
  buf: BrainParticleBuffers,
  w: number,
  h: number,
  theme: 'light' | 'dark',
  mind: FetchBrainMindState,
  dissolve01: number,
  speechAmp: number,
  glowRgb: { r: number; g: number; b: number },
  scratch: BrainParticleScratch,
  cortexCalm = false,
  cortexSpread01 = 0,
  cellSize: number = CELL,
  reducedMotion = false,
) {
  const { n, px, py, layer, hubNear01 } = buf
  const { cols, rows, grid, gridCount } = scratch
  const spread = Math.max(0, Math.min(1, cortexSpread01))
  const dMix = Math.max(0.35, Math.min(1, dissolve01))

  const isLight = theme === 'light'
  ctx.fillStyle = isLight ? '#f8fafc' : '#000000'
  ctx.fillRect(0, 0, w, h)

  for (let i = 0; i < n; i++) {
    const xi = Math.floor(px[i]! / cellSize)
    const yi = Math.floor(py[i]! / cellSize)
    if (xi < 0 || yi < 0 || xi >= cols || yi >= rows) continue
    const c = xi + yi * cols
    const o = c * GRID_BUCKET
    const gc = gridCount[c]!
    if (gc < GRID_BUCKET) {
      grid[o + gc] = i
      gridCount[c] = gc + 1
    }
  }

  const speakBoost =
    !cortexCalm && mind === 'speaking' ? Math.floor(speechAmp * 380) : 0
  const fieldLineCap = Math.min(3400, 1400 + Math.floor(dMix * 1800) + speakBoost)
  const cortexMeshCap = Math.min(
    5600,
    1400 + Math.floor(spread * 2200) + Math.floor(dMix * 1100),
  )
  const lineCap = cortexCalm ? cortexMeshCap : fieldLineCap
  const neigh = cortexCalm ? 2 : 1
  const dMin = 1.8
  const dMaxField = 44 + dMix * 8
  const dMax = cortexCalm ? 52 + spread * 18 : dMaxField
  let lines = 0
  let lineW = isLight ? 0.34 : 0.3
  if (cortexCalm) {
    lineW = isLight ? 0.52 : 0.46 + spread * 0.08
  }
  if (!cortexCalm && mind === 'speaking') {
    lineW += 0.12 + speechAmp * 0.16
  }
  ctx.lineWidth = lineW

  for (let i = 0; i < n && lines < lineCap; i++) {
    const xi = Math.floor(px[i]! / cellSize)
    const yi = Math.floor(py[i]! / cellSize)
    for (let oy = -neigh; oy <= neigh; oy++) {
      for (let ox = -neigh; ox <= neigh; ox++) {
        const gcx = xi + ox
        const gcy = yi + oy
        if (gcx < 0 || gcy < 0 || gcx >= cols || gcy >= rows) continue
        const c = gcx + gcy * cols
        const o = c * GRID_BUCKET
        const gc = gridCount[c]!
        for (let k = 0; k < gc; k++) {
          const j = grid[o + k]!
          if (j <= i) continue
          const dx = px[i]! - px[j]!
          const dy = py[i]! - py[j]!
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > dMin && dist < dMax) {
            let a = (1 - dist / dMax) * (isLight ? 0.1 : 0.11)
            if (cortexCalm) {
              a *= 1.22 + spread * 0.55
              const pulse = 0.42 + 0.48 * (1 - dist / dMax)
              ctx.strokeStyle = `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${Math.min(0.62, a * pulse)})`
            } else if (mind === 'idle') {
              a *= 0.92
              ctx.strokeStyle = isLight
                ? plexusLineStrokeLight(glowRgb, Math.min(0.38, a * 0.95))
                : plexusLineStrokeDark(glowRgb, Math.min(0.42, a))
            } else if (mind === 'speaking') {
              const pulse = 0.72 + speechAmp * 0.55
              ctx.strokeStyle = `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${a * pulse})`
            } else {
              ctx.strokeStyle = isLight
                ? plexusLineStrokeLight(glowRgb, Math.min(0.36, a * 0.9))
                : plexusLineStrokeDark(glowRgb, Math.min(0.4, a * 0.95))
            }
            ctx.beginPath()
            ctx.moveTo(px[i]!, py[i]!)
            ctx.lineTo(px[j]!, py[j]!)
            ctx.stroke()
            lines++
            if (lines >= lineCap) break
          }
        }
        if (lines >= lineCap) break
      }
      if (lines >= lineCap) break
    }
  }

  const drawLongChords = cortexCalm || mind === 'idle'
  if (drawLongChords) {
    const longCap = cortexCalm
      ? Math.min(900, 220 + Math.floor(spread * 620))
      : Math.min(520, 260 + Math.floor(dMix * 280))
    const maxLong = cortexCalm
      ? Math.min(w, h) * (0.5 + spread * 0.16)
      : Math.min(w, h) * 0.52
    const step = cortexCalm ? 11 : 12
    ctx.save()
    ctx.lineWidth = cortexCalm
      ? (isLight ? 0.4 : 0.36) + spread * 0.06
      : isLight
        ? 0.32
        : 0.28
    let longN = 0
    for (let i = 0; i < n && longN < longCap; i += step) {
      const j = (i * 97 + 1543) % n
      if (j <= i) continue
      const dx = px[i]! - px[j]!
      const dy = py[i]! - py[j]!
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 42 && dist < maxLong) {
        const fall = 1 - dist / maxLong
        const baseA = fall * (cortexCalm ? 0.045 + spread * 0.09 : 0.038 + dMix * 0.05)
        ctx.strokeStyle = cortexCalm
          ? `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${baseA})`
          : isLight
            ? plexusLineStrokeLight(glowRgb, Math.min(0.28, baseA * 6.5))
            : plexusLineStrokeDark(glowRgb, Math.min(0.32, baseA * 6.5))
        ctx.beginPath()
        ctx.moveTo(px[i]!, py[i]!)
        ctx.lineTo(px[j]!, py[j]!)
        ctx.stroke()
        longN++
      }
    }
    ctx.restore()
  }

  const drawMind: FetchBrainMindState = cortexCalm ? 'idle' : mind
  const twoPi = Math.PI * 2

  for (let i = 0; i < n; i++) {
    const L = layer[i]!
    const hn = hubNear01[i]!
    let s = L === 0 ? 1.22 : L === 1 ? 0.98 : 0.78
    s *= 0.88 + hn * 0.38
    if (drawMind === 'speaking') {
      s += (0.1 + speechAmp * 0.28) * (L === 0 ? 1 : 0.48)
    }
    if (cortexCalm) {
      s *= 1.05 + spread * 0.08 + L * 0.04
    }
    const baseA = isLight ? 0.2 + L * 0.11 : 0.11 + L * 0.09
    let a = baseA * (0.35 + dMix * 0.65)
    a *= 0.82 + hn * 0.38
    if (cortexCalm) {
      a *= 1.02
    }
    const x = px[i]!
    const y = py[i]!

    if (cortexCalm) {
      const gA = (0.1 + spread * 0.14 + L * 0.03) * (0.4 + dMix * 0.6)
      ctx.fillStyle = `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${Math.min(0.5, gA)})`
      const gR = s * (2.1 + spread * 0.45)
      ctx.beginPath()
      ctx.arc(x, y, gR, 0, twoPi)
      ctx.fill()
    }

    if (drawMind === 'speaking') {
      a += (0.06 + speechAmp * 0.35) * (L === 0 ? 1 : 0.5)
      ctx.fillStyle = `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${Math.min(1, a)})`
    } else if (drawMind === 'listening') {
      ctx.fillStyle = isLight
        ? `rgba(30,58,95,${Math.min(1, a * 1.15)})`
        : `rgba(190,215,255,${Math.min(1, a * 1.12)})`
    } else if (drawMind === 'thinking') {
      ctx.fillStyle = isLight
        ? `rgba(40,44,56,${Math.min(1, a * 1.08)})`
        : `rgba(232,236,248,${Math.min(1, a * 1.06)})`
    } else if (cortexCalm) {
      const coreA = (0.82 + spread * 0.12) * (0.35 + dMix * 0.65)
      ctx.fillStyle = isLight
        ? `rgba(18,22,30,${Math.min(1, coreA)})`
        : `rgba(4,6,12,${Math.min(1, coreA * 1.05)})`
    } else if (isLight) {
      const ink = 0.18 + L * 0.08 + hn * 0.22
      const r = Math.round(18 + glowRgb.r * 0.04)
      const g = Math.round(24 + glowRgb.g * 0.04)
      const b = Math.round(38 + glowRgb.b * 0.06)
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, ink * (0.4 + dMix * 0.6))})`
    } else {
      const wh = 0.28 + L * 0.14 + hn * 0.42
      ctx.fillStyle = `rgba(252,254,255,${Math.min(1, wh * (0.45 + dMix * 0.55))})`
    }

    ctx.beginPath()
    ctx.arc(x, y, s, 0, twoPi)
    ctx.fill()

    if (cortexCalm && L === 0 && i % 2 === 0) {
      ctx.fillStyle = `rgba(${Math.min(255, glowRgb.r + 40)},${Math.min(255, glowRgb.g + 35)},${Math.min(255, glowRgb.b + 28)},${0.14 + spread * 0.12})`
      ctx.beginPath()
      ctx.arc(x, y, s * 0.42, 0, twoPi)
      ctx.fill()
    }
  }

  // Soft hub bloom without `ctx.filter` (full-surface blur is a major GPU bottleneck).
  if (!reducedMotion && dMix > 0.5) {
    ctx.save()
    const op = isLight ? 'multiply' : 'screen'
    const stride = 7
    const maxBloom = 240
    let drawn = 0
    for (let i = 0; i < n && drawn < maxBloom; i += stride) {
      const hn = hubNear01[i]!
      if (hn < 0.34) continue
      const L = layer[i]!
      const x = px[i]!
      const y = py[i]!
      const rad = (L === 0 ? 5.2 : 3.6) * (0.5 + hn * 0.95) * dMix
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
      if (isLight) {
        const a = 0.22 + hn * 0.38
        g.addColorStop(0, `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${a})`)
        g.addColorStop(0.45, `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${a * 0.35})`)
        g.addColorStop(1, `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},0)`)
      } else {
        const a = 0.12 + hn * 0.32
        g.addColorStop(0, `rgba(255,255,255,${a})`)
        g.addColorStop(0.4, `rgba(255,255,255,${a * 0.4})`)
        g.addColorStop(1, 'rgba(255,255,255,0)')
      }
      ctx.globalCompositeOperation = op
      ctx.globalAlpha = isLight ? 0.55 : 0.5
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, twoPi)
      ctx.fill()
      drawn++
    }
    ctx.restore()
  }
}

/**
 * Large neon “data” motes: only meaningful while the user is speaking (listening).
 * Spawn beyond the viewport, rush inward with a big glow, shrink and fade as they feed the core.
 */
export const BRAIN_MEMORY_INGEST_N = 36

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
  glowRgb: { r: number; g: number; b: number },
) {
  if (strength01 < 0.04) return
  const isLight = theme === 'light'
  ctx.save()
  if (!isLight) ctx.globalCompositeOperation = 'screen'
  const cx = w * 0.5
  const cy = h * 0.4
  const br = Math.min(255, glowRgb.r + (isLight ? 22 : 62))
  const bg = Math.min(255, glowRgb.g + (isLight ? 26 : 52))
  const bb = Math.min(255, glowRgb.b + (isLight ? 42 : 48))
  const maxD = Math.hypot(w, h) * 0.62

  for (let i = 0; i < buf.n; i++) {
    const dx = buf.px[i]! - cx
    const dy = buf.py[i]! - cy
    const dist = Math.sqrt(dx * dx + dy * dy) + 1e-4
    const far01 = Math.min(1, dist / maxD)
    const nearCore = Math.min(1, dist / 56)
    const tw = 0.5 + buf.seed[i]! * 0.5
    const rCore = (2.2 + buf.seed[i]! * 3.8) * (0.35 + nearCore * 0.85)
    const rGlow = rCore * (2.8 + far01 * 9.5 + strength01 * 3.2)
    const feedAlpha =
      strength01 *
      tw *
      (0.35 + far01 * 0.65) *
      (0.15 + (1 - nearCore) * (1 - nearCore)) *
      (isLight ? 0.5 : 0.62)

    const g = ctx.createRadialGradient(
      buf.px[i]!,
      buf.py[i]!,
      0,
      buf.px[i]!,
      buf.py[i]!,
      rGlow,
    )
    g.addColorStop(0, `rgba(${br},${bg},${bb},${Math.min(1, feedAlpha * 1.45)})`)
    g.addColorStop(0.12, `rgba(${br},${bg},${bb},${feedAlpha * 0.95})`)
    g.addColorStop(0.45, `rgba(${br},${bg},${bb},${feedAlpha * 0.32})`)
    g.addColorStop(1, `rgba(${br},${bg},${bb},0)`)

    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(buf.px[i]!, buf.py[i]!, rGlow, 0, Math.PI * 2)
    ctx.fill()

    const coreA = Math.min(1, feedAlpha * 1.8 * (0.4 + far01 * 0.6))
    ctx.fillStyle = `rgba(255,255,255,${coreA * (isLight ? 0.5 : 0.78)})`
    ctx.beginPath()
    ctx.arc(buf.px[i]!, buf.py[i]!, rCore * 0.55, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
