import { useEffect, useRef, useState } from 'react'
import {
  expressionFromLegacyState,
  legacySphereClassFromExpression,
  resolveOrbExpressionTargets,
  stepOrbFaceTargets,
  type FetchOrbExpression,
  type OrbFaceTargets,
  type OrbMouthKind,
} from '../lib/orb/fetchOrbExpressions'
import { getSpeechAmplitude } from '../voice/fetchVoice'

export type {
  FetchOrbExpression,
  FetchOrbFlowMoment,
  OrbFaceTargets,
} from '../lib/orb/fetchOrbExpressions'
export { expressionForFlowMoment } from '../lib/orb/fetchOrbExpressions'

const SIZE_CLASS: Record<'sm' | 'md' | 'lg' | 'xl' | 'fab' | 'dock', string> = {
  sm: 'h-[3.1rem] w-[3.1rem]',
  md: 'h-[4.2rem] w-[4.2rem]',
  lg: 'h-[6.1rem] w-[6.1rem]',
  xl: 'h-[12rem] w-[12rem]',
  fab: 'h-[4.15rem] w-[4.15rem]',
  dock: 'h-[9rem] w-[9rem]',
}

/** @deprecated Prefer FetchOrbExpression + fetchOrbExpressions */
export type FetchAssistantOrbState =
  | 'idle'
  | 'aware'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'confirmed'

export type JarvisOrbState =
  | FetchAssistantOrbState
  | 'processing'
  | 'responding'
  | 'completed'

export type MapAttentionCue = 'none' | 'pickup' | 'route' | 'driver'

export type JarvisNeuralOrbProps = {
  /** When set, drives the face; otherwise derived from `state` + `speaking`. */
  expression?: FetchOrbExpression
  speaking?: boolean
  state?: JarvisOrbState
  activity?: number
  voiceLevel?: number
  awakened?: boolean
  confirmationNonce?: number
  mapAttention?: MapAttentionCue
  /** Shift gaze upward (e.g. toward assistant card above the orb). */
  lookAtCard?: boolean
  /** RGB glow color for underglow + inner warm. Defaults to soft white. */
  glowColor?: GlowRGB
  size?: keyof typeof SIZE_CLASS
  className?: string
  ariaLive?: boolean
}

const DEFAULT_GLOW = { r: 220, g: 225, b: 235 }
type GlowRGB = { r: number; g: number; b: number }
const IDLE_BREATH = (Math.PI * 2) / 3.35
/** ~20% larger face vs prior (eyes + spacing + mouth track together). */
const FACE_SCALE = 1.2
/** Half-width of each pill eye (of R); bumped for a wider read. */
const BASE_HW = 0.106 * FACE_SCALE
const BASE_HH = 0.184 * FACE_SCALE
const BASE_SPREAD = 0.244 * FACE_SCALE
const ORB_LID_SHADE = 'rgba(10,11,14,0.97)'

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeOutCubic(t: number) {
  const u = clamp01(t)
  return 1 - (1 - u) ** 3
}

function drawExpressivePillEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  blinkOpen: number,
  intensity: number,
  upperLid: number,
  lowerLid: number,
  browTension: number,
) {
  const op = clamp01(blinkOpen)
  const fullH = halfH * 2
  const h = Math.max(fullH * op, 0.28)
  const w = halfW * 2
  const x = cx - halfW
  const y = cy - h / 2
  const corner = Math.min(halfW * 0.95, h * 0.48)
  const int = clamp01(intensity)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'

  /* Outer soft glow — makes eyes feel like light, not shapes */
  ctx.shadowColor = `rgba(210,215,225,${0.38 * int})`
  ctx.shadowBlur = halfW * 4.5
  ctx.fillStyle = `rgba(200,205,215,${0.14 * int})`
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, corner)
  ctx.fill()
  ctx.shadowBlur = 0

  /* Inner gradient — off-white with subtle falloff */
  const lg = ctx.createRadialGradient(
    cx, cy, 0,
    cx, cy, Math.max(w, h) * 0.65,
  )
  lg.addColorStop(0, `rgba(220,224,232,${0.82 * int})`)
  lg.addColorStop(0.55, `rgba(210,214,222,${0.68 * int})`)
  lg.addColorStop(1, `rgba(180,185,198,${0.38 * int})`)
  ctx.fillStyle = lg
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, corner)
  ctx.fill()
  ctx.restore()

  if (browTension > 0.03) {
    const browH = Math.min(h * (0.18 + browTension * 0.22), h * 0.45)
    ctx.save()
    const g = ctx.createLinearGradient(x, y, x, y + browH)
    g.addColorStop(0, `rgba(6,7,10,${0.42 * browTension})`)
    g.addColorStop(1, 'rgba(6,7,10,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(x, y - 0.5, w, browH + 1, Math.min(corner * 0.6, 6))
    ctx.fill()
    ctx.restore()
  }

  /* Eyelid masks */
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  if (upperLid > 0.02) {
    const cover = h * clamp01(upperLid)
    ctx.fillStyle = ORB_LID_SHADE
    ctx.beginPath()
    ctx.rect(x - 1.5, y - 1, w + 3, cover + 0.5)
    ctx.fill()
  }
  if (lowerLid > 0.02) {
    const cover = h * clamp01(lowerLid)
    ctx.fillStyle = ORB_LID_SHADE
    ctx.beginPath()
    ctx.rect(x - 1.5, y + h - cover - 0.5, w + 3, cover + 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawPupilDot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  shiftX: number,
  shiftY: number,
  alpha: number,
) {
  if (alpha < 0.04) return
  const a = clamp01(alpha)
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = `rgba(14,16,22,${0.5 * a})`
  ctx.beginPath()
  ctx.ellipse(cx + shiftX, cy + shiftY, R * 0.017, R * 0.021, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Mouth arc along y0 from (cx-w) to (cx+w). Uses +sagitta·sin(t) so the bulge goes toward +y
 * in canvas space; with how this orb is composited on device, that reads as a smile (the prior
 * −sagitta version was consistently read as a frown).
 */
function strokeSmileArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y0: number,
  halfW: number,
  sagitta: number,
  segments = 28,
) {
  const w = Math.max(halfW, 0.5)
  const s = Math.max(sagitta, 0.25)
  ctx.beginPath()
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI
    const x = cx + w * Math.cos(Math.PI - t)
    const y = y0 + s * Math.sin(t)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function drawOrbMouth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  kind: OrbMouthKind,
  energy: number,
  phase: number,
  faceInt: number,
  lipOpen: number,
) {
  const fi = clamp01(faceInt)
  if (fi < 0.03 || kind === 'none') return
  const en = clamp01(energy)
  /* Below eye row (~eyeYMul −0.1, tall pills); tabbie-style smile sits mid-lower face */
  const my = cy + R * (0.168 * FACE_SCALE)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  /* Flat light-on-dark read; `screen` was washing the mouth out */
  ctx.globalCompositeOperation = 'source-over'

  switch (kind) {
    case 'hint_arc': {
      const w = R * 0.128 * FACE_SCALE
      const sagBase = R * FACE_SCALE * (0.055 + 0.048 * en)
      const wobble = Math.sin(phase * 0.55) * R * 0.005 * FACE_SCALE * (0.4 + en * 0.45)
      const talkPulse =
        en > 0.78
          ? Math.sin(phase * 6.2) * R * 0.009 * FACE_SCALE * (en - 0.78) * 3.2
          : 0
      const sagitta = Math.max(R * FACE_SCALE * 0.032, sagBase + wobble + talkPulse)
      const alpha = clamp01((0.62 + en * 0.34) * (0.75 + fi * 0.28))
      ctx.strokeStyle = `rgba(252,252,255,${alpha})`
      ctx.lineWidth = Math.max(1.15, R * 0.0092)
      strokeSmileArc(ctx, cx, my, w, sagitta)
      break
    }
    case 'speak_line': {
      const lip = clamp01(lipOpen)
      /* Damp procedural motion while audio drives the mouth — avoids fighting RMS jitter */
      const proc = clamp01(1 - lip * 0.94)
      const ph = phase * 0.62
      const jaw = 0.55 + 0.45 * Math.sin(ph * 1.35) * (0.35 + proc * 0.65)
      const w =
        R *
        0.108 *
        FACE_SCALE *
        (0.9 +
          proc *
            (0.07 * en * Math.sin(ph * 1.6) + 0.028 * en * Math.sin(ph * 2.8)))
      const wobble =
        proc *
        (Math.sin(ph * 1.35) * R * 0.0065 * en +
          Math.sin(ph * 2.4) * R * 0.0032 * en)
      const y0 = my + wobble
      const baseAlpha = (0.48 + en * 0.36) * (0.72 + fi * 0.26)

      /* No smile arc while speaking — oval from audio only; flat line when closed. */
      if (lip > 0.022) {
        const rw = w * (0.52 + lip * 0.62)
        const rh =
          R *
          FACE_SCALE *
          (0.02 + lip * 0.092 * (0.65 + 0.35 * jaw) + 0.018 * en)
        ctx.strokeStyle = `rgba(252,252,255,${baseAlpha * (0.55 + lip * 0.45)})`
        ctx.lineWidth = Math.max(1.15, R * (0.0085 + lip * 0.018 + en * 0.0035))
        ctx.beginPath()
        ctx.ellipse(cx, y0 + rh * 0.2, rw, rh, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        const halfW = w * 0.26
        ctx.strokeStyle = `rgba(252,252,255,${baseAlpha * 0.72})`
        ctx.lineWidth = Math.max(1.05, R * 0.0082)
        ctx.beginPath()
        ctx.moveTo(cx - halfW, y0)
        ctx.lineTo(cx + halfW, y0)
        ctx.stroke()
      }
      break
    }
    case 'flat': {
      const w = R * 0.1 * FACE_SCALE
      const sagitta = R * 0.038 * FACE_SCALE
      ctx.strokeStyle = `rgba(236,238,244,${0.45 * fi})`
      ctx.lineWidth = Math.max(1, R * 0.009)
      strokeSmileArc(ctx, cx, my, w, sagitta)
      break
    }
    case 'soft_o': {
      const rw = R * 0.042 * FACE_SCALE + Math.sin(phase * 2.2) * R * 0.005 * en
      const rh = R * 0.034 * FACE_SCALE
      ctx.strokeStyle = `rgba(252,252,255,${0.52 * fi})`
      ctx.lineWidth = Math.max(1, R * 0.011)
      ctx.beginPath()
      ctx.ellipse(cx, my + rh * 0.18, rw, rh, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    default:
      break
  }
  ctx.restore()
}

export function useFetchOrbVoiceLevel(active: boolean): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setLevel(0)
      return
    }

    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null
    let audioCtx: AudioContext | null = null

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        audioCtx = new AudioContext()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.72
        audioCtx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Uint8Array(analyser.fftSize)

        let frame = 0
        const loop = () => {
          if (cancelled) return
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let j = 0; j < buf.length; j += 1) {
            const v = (buf[j]! - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / buf.length)
          const shaped = Math.min(1, Math.pow(rms * 4.8, 0.62))
          frame += 1
          if (frame % 3 === 0) {
            setLevel((prev) => prev * 0.55 + shaped * 0.45)
          }
          raf = window.requestAnimationFrame(loop)
        }
        raf = window.requestAnimationFrame(loop)
      } catch {
        if (!cancelled) setLevel(0)
      }
    }

    void start()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      stream?.getTracks().forEach((track) => track.stop())
      void audioCtx?.close()
    }
  }, [active])

  return level
}

export function JarvisNeuralOrb({
  expression: expressionProp,
  speaking = false,
  state,
  activity = 0,
  voiceLevel,
  awakened = false,
  confirmationNonce = 0,
  mapAttention = 'none',
  lookAtCard = false,
  glowColor = DEFAULT_GLOW,
  size = 'md',
  className = '',
  ariaLive = true,
}: JarvisNeuralOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const liftRef = useRef<HTMLDivElement>(null)
  const underglowRef = useRef<HTMLDivElement>(null)

  const expressionRef = useRef(expressionProp)
  const stateRef = useRef(state)
  const speakingRef = useRef(speaking)
  const activityRef = useRef(clamp01(activity))
  const voiceRef = useRef(clamp01(voiceLevel ?? 0))
  /* Start alert + smiling — initializing `idle` looked droopy/sad for many frames while lerping */
  const smoothRef = useRef<OrbFaceTargets>(resolveOrbExpressionTargets('awake'))

  const confirmPulseRef = useRef(0)
  const mapImpulseRef = useRef(0)
  const mapVecRef = useRef({ x: 0, y: 0 })
  const blinkRef = useRef(1)
  const blinkUntilRef = useRef(0)
  const nextBlinkRef = useRef(0)
  const shimmerPhaseRef = useRef(0)
  const mouthPhaseRef = useRef(0)
  const lipOpenVisualRef = useRef(0)
  const lastNonceRef = useRef(confirmationNonce)
  const lastMapRef = useRef(mapAttention)
  const lastExprRef = useRef<FetchOrbExpression | null>(null)
  const lookAtCardRef = useRef(lookAtCard)
  lookAtCardRef.current = lookAtCard
  const glowRef = useRef(glowColor)
  glowRef.current = glowColor

  expressionRef.current = expressionProp
  stateRef.current = state
  speakingRef.current = speaking
  activityRef.current = clamp01(activity)
  voiceRef.current = clamp01(voiceLevel ?? 0)
  void awakened

  const effectiveExpression: FetchOrbExpression =
    expressionProp ?? expressionFromLegacyState(state, speaking)

  const legacyClass = legacySphereClassFromExpression(effectiveExpression)

  useEffect(() => {
    if (confirmationNonce !== lastNonceRef.current && confirmationNonce > 0) {
      lastNonceRef.current = confirmationNonce
      confirmPulseRef.current = 1
      blinkRef.current = 0.06
      blinkUntilRef.current = performance.now() + 140
    }
  }, [confirmationNonce])

  useEffect(() => {
    if (mapAttention !== lastMapRef.current) {
      lastMapRef.current = mapAttention
      if (mapAttention === 'pickup') {
        mapVecRef.current = { x: -0.1, y: -0.12 }
        mapImpulseRef.current = 1
      } else if (mapAttention === 'route') {
        mapVecRef.current = { x: 0.14, y: 0.02 }
        mapImpulseRef.current = 1
      } else if (mapAttention === 'driver') {
        mapVecRef.current = { x: 0, y: -0.08 }
        mapImpulseRef.current = 1
        blinkRef.current = 0.08
        blinkUntilRef.current = performance.now() + 120
      } else {
        mapVecRef.current = { x: 0, y: 0 }
      }
    }
  }, [mapAttention])

  useEffect(() => {
    if (effectiveExpression !== lastExprRef.current) {
      lastExprRef.current = effectiveExpression
      if (effectiveExpression === 'surprised') {
        blinkRef.current = 1
      }
    }
  }, [effectiveExpression])

  useEffect(() => {
    if (typeof window === 'undefined') return
    nextBlinkRef.current = performance.now() + 3000 + Math.random() * 3000

    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let raf = 0
    let width = 0
    let height = 0
    let dpr = 1

    const resize = () => {
      const rect = host.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    const render = (now: number) => {
      const speak = speakingRef.current
      const act = activityRef.current
      const vMic = voiceRef.current
      const t = now * 0.001

      const expr =
        expressionRef.current ?? expressionFromLegacyState(stateRef.current, speak)
      const targetT = resolveOrbExpressionTargets(expr)
      smoothRef.current = stepOrbFaceTargets(smoothRef.current, targetT, 0.11)
      const vis = smoothRef.current

      if (confirmPulseRef.current > 0.002) {
        confirmPulseRef.current *= 0.92
      }
      if (mapImpulseRef.current > 0.002) {
        mapImpulseRef.current *= 0.965
      }

      const breath =
        1 +
        Math.sin(t * IDLE_BREATH) * vis.breathAmp +
        (expr === 'speaking' || speak ? Math.sin(t * 6.2) * 0.0026 * act : 0)

      const blinkSlow = Math.max(0.75, vis.blinkSlow)
      if (now >= blinkUntilRef.current) {
        blinkRef.current = lerp(blinkRef.current, 1, 0.3)
      } else {
        blinkRef.current = lerp(blinkRef.current, 0.032, 0.58)
      }

      if (
        now >= nextBlinkRef.current &&
        expr !== 'surprised' &&
        blinkRef.current > 0.9
      ) {
        blinkRef.current = 0.03
        blinkUntilRef.current = now + 115
        nextBlinkRef.current = now + (3000 + Math.random() * 3000) * blinkSlow
      }

      const baseLift = vis.liftPx
      let liftPx = baseLift
      if (confirmPulseRef.current > 0.08) {
        liftPx = lerp(baseLift, -16, confirmPulseRef.current * 0.35)
      }
      if (expr === 'sleepy') {
        liftPx += Math.sin(t * 0.52) * 3.6 + Math.sin(t * 0.19) * 1.5
      }

      shimmerPhaseRef.current += 0.014 * vis.shimmerSpeed * (0.5 + vis.shimmer)
      const speakMove = expr === 'speaking' || speak
      mouthPhaseRef.current += speakMove
        ? vis.mouthKind === 'speak_line'
          ? 0.078 + act * 0.065
          : 0.24 + act * 0.2
        : 0.048

      const cx = width / 2
      const cy = height / 2
      const R = (Math.min(width, height) / 2) * 0.96 * breath

      ctx.clearRect(0, 0, width, height)

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.clip()

      /* Deep matte sphere — dark center, slightly lighter edges for depth */
      const core = ctx.createRadialGradient(
        cx - R * 0.12,
        cy - R * 0.22,
        R * 0.01,
        cx,
        cy,
        R * 1.0,
      )
      core.addColorStop(0, 'rgba(6,7,9,1)')
      core.addColorStop(0.35, 'rgba(8,9,11,1)')
      core.addColorStop(0.7, 'rgba(12,13,16,1)')
      core.addColorStop(0.92, 'rgba(16,17,21,1)')
      core.addColorStop(1, 'rgba(14,15,18,1)')
      ctx.fillStyle = core
      ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4)

      /* Soft edge falloff — fades sphere into background smoothly */
      const edgeFade = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R)
      edgeFade.addColorStop(0, 'rgba(0,0,0,0)')
      edgeFade.addColorStop(0.6, 'rgba(0,0,0,0.05)')
      edgeFade.addColorStop(1, 'rgba(0,0,0,0.28)')
      ctx.fillStyle = edgeFade
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()

      const gc = glowRef.current
      const warmCore =
        (0.058 + act * 0.065) * vis.innerWarm * (0.85 + vis.redAccent * 0.08)
      const innerWarm = ctx.createRadialGradient(cx + R * 0.08, cy + R * 0.12, 0, cx, cy, R * 0.7)
      innerWarm.addColorStop(0, `rgba(${gc.r},${gc.g},${gc.b},${warmCore})`)
      innerWarm.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = innerWarm
      ctx.globalCompositeOperation = 'lighter'
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'

      /* Slow internal shimmer — faint wandering light inside the sphere */
      if (vis.shimmer > 0.02) {
        const sh = shimmerPhaseRef.current
        const gx = cx + Math.cos(sh * 0.75) * R * 0.18
        const gy = cy + Math.sin(sh * 0.55) * R * 0.14
        const sg = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 0.52)
        const amp = vis.shimmer * (0.016 + Math.sin(sh * 0.9) * 0.012)
        sg.addColorStop(0, `rgba(255,255,255,${amp})`)
        sg.addColorStop(0.5, `rgba(255,255,255,${amp * 0.3})`)
        sg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = sg
        ctx.globalCompositeOperation = 'lighter'
        ctx.beginPath()
        ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      }

      ctx.restore()

      const mx = mapVecRef.current.x * mapImpulseRef.current * R * 0.85
      const my = mapVecRef.current.y * mapImpulseRef.current * R * 0.85
      const scan =
        vis.searchScan > 0.05
          ? Math.sin(t * 2.75 * vis.shimmerSpeed) * R * 0.065 * vis.searchScan
          : 0

      /* Micro sway + drift — keeps face alive without being noticeable */
      const swayX =
        Math.sin(t * 0.72) * R * 0.018 + Math.sin(t * 0.28) * R * 0.009
      const microDriftY =
        Math.sin(t * 0.55 + 1.2) * R * 0.008 + Math.sin(t * 0.22) * R * 0.005
      const faceCx = cx + swayX
      const lookUpY = lookAtCardRef.current ? -R * 0.026 : 0
      const gazeCardY = lookAtCardRef.current ? -R * 0.052 : 0

      const listenBoost = expr === 'listening' ? 1 + vMic * 0.08 + act * 0.03 : 1
      const spread = R * BASE_SPREAD * vis.eyeSpreadMul
      const eyeY = cy + R * vis.eyeYMul + my + lookUpY + microDriftY

      const halfWL =
        R * BASE_HW * vis.eyeScaleW * (1 - vis.asymmetry) * listenBoost
      const halfWR =
        R * BASE_HW * vis.eyeScaleW * (1 + vis.asymmetry) * listenBoost
      const halfH = R * BASE_HH * vis.eyeScaleH * listenBoost

      const tilt = vis.tiltY * R
      const gazeX = (vis.pupilShiftX * R * 0.04 + scan) * 0.85
      const gazeY = vis.pupilShiftY * R * 0.035 + gazeCardY

      const sleepyPeek =
        expr === 'sleepy'
          ? Math.pow(Math.max(0, Math.sin(t * 0.64 + 0.4)), 2.05) * 0.58
          : 0
      const upperLidDraw =
        expr === 'sleepy'
          ? clamp01(vis.upperLid * (1 - sleepyPeek * 0.9))
          : vis.upperLid
      const lowerLidDraw =
        expr === 'sleepy'
          ? clamp01(vis.lowerLid * (1 - sleepyPeek * 0.5))
          : vis.lowerLid
      const eyeOpen = clamp01(
        (vis.eyeOpen + sleepyPeek * (1 - vis.eyeOpen) * 0.94) * blinkRef.current,
      )
      const faceGlow = vis.faceGlow

      drawExpressivePillEye(
        ctx,
        faceCx - spread + mx * 0.45 + gazeX * 0.25,
        eyeY - tilt,
        halfWL,
        halfH,
        eyeOpen,
        faceGlow,
        upperLidDraw,
        lowerLidDraw,
        vis.browTension,
      )
      drawExpressivePillEye(
        ctx,
        faceCx + spread + mx * 0.45 + gazeX * 0.25,
        eyeY + tilt,
        halfWR,
        halfH,
        eyeOpen,
        faceGlow,
        upperLidDraw,
        lowerLidDraw,
        vis.browTension,
      )

      drawPupilDot(
        ctx,
        faceCx - spread + mx * 0.45,
        eyeY,
        R,
        gazeX,
        gazeY,
        vis.pupilAlpha,
      )
      drawPupilDot(
        ctx,
        faceCx + spread + mx * 0.45,
        eyeY,
        R,
        gazeX,
        gazeY,
        vis.pupilAlpha,
      )

      const mouthEnergy =
        vis.mouthKind === 'speak_line'
          ? clamp01(vis.mouthEnergy * (0.58 + act * 0.42))
          : expr === 'speaking' || speak
            ? clamp01(vis.mouthEnergy * (0.72 + act * 0.28))
            : vis.mouthEnergy
      if (vis.mouthKind === 'speak_line') {
        lipOpenVisualRef.current = lerp(
          lipOpenVisualRef.current,
          clamp01(getSpeechAmplitude()),
          0.055,
        )
      } else {
        lipOpenVisualRef.current = lerp(lipOpenVisualRef.current, 0, 0.12)
      }
      const lipOpen = lipOpenVisualRef.current
      drawOrbMouth(
        ctx,
        faceCx,
        cy,
        R,
        vis.mouthKind,
        mouthEnergy,
        mouthPhaseRef.current,
        faceGlow,
        lipOpen,
      )

      /* Confirmation pulse — soft glow bloom instead of hard ring */
      if (confirmPulseRef.current > 0.01) {
        const p = easeOutCubic(confirmPulseRef.current)
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        const pr = R + (1 - p) * R * 0.38
        const pg = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, pr)
        pg.addColorStop(0, `rgba(${gc.r},${gc.g},${gc.b},${p * 0.12})`)
        pg.addColorStop(0.5, `rgba(${gc.r},${gc.g},${gc.b},${p * 0.06})`)
        pg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = pg
        ctx.beginPath()
        ctx.arc(cx, cy, pr, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      if (liftRef.current) {
        liftRef.current.style.transform = `translate3d(0, ${liftPx.toFixed(2)}px, 0)`
      }
      if (underglowRef.current) {
        const isSpeaking = expr === 'speaking' || speak
        const gMul =
          0.78 +
          act * 0.28 * vis.glowOpacity +
          (isSpeaking ? 0.26 : 0) +
          confirmPulseRef.current * 0.44
        const blur =
          42 +
          vis.glowBlurAdd +
          (isSpeaking ? 12 : 0) +
          confirmPulseRef.current * 18
        const speakLift = isSpeaking
          ? -9 + Math.sin(t * 2.4) * 2.2
          : 0
        underglowRef.current.style.opacity = String(
          clamp01(0.42 * vis.glowOpacity + act * 0.2 + (isSpeaking ? 0.22 : 0) + confirmPulseRef.current * 0.28),
        )
        underglowRef.current.style.filter = `blur(${blur}px)`
        underglowRef.current.style.transform = `translate3d(-50%, ${
          4 + vis.glowLiftPx + speakLift - confirmPulseRef.current * 10
        }px, 0) scale(${1 + gMul * 0.075})`
      }

      raf = window.requestAnimationFrame(render)
    }

    raf = window.requestAnimationFrame(render)
    return () => {
      ro.disconnect()
      window.cancelAnimationFrame(raf)
    }
  }, [size])

  const dim = SIZE_CLASS[size]

  return (
    <div
      className={['relative flex flex-col items-center', className].filter(Boolean).join(' ')}
      {...(ariaLive ? { 'aria-live': 'polite' as const } : {})}
    >
      <div
        ref={underglowRef}
        className="fetch-assistant-face-orb__underglow pointer-events-none absolute left-1/2 top-[72%] h-[58%] w-[118%] -translate-x-1/2 rounded-[50%]"
        aria-hidden
      />
      <div
        ref={liftRef}
        className={[
          'fetch-assistant-face-orb fetch-jarvis-neural-sphere relative rounded-full',
          dim,
          `fetch-jarvis-neural-sphere--${legacyClass}`,
        ].join(' ')}
        data-fetch-orb-expression={effectiveExpression}
        data-orb-size={size}
      >
        <div
          ref={hostRef}
          className="relative z-[1] h-full w-full overflow-hidden rounded-full"
        >
          <canvas
            ref={canvasRef}
            className="pointer-events-none relative z-[2] block h-full w-full"
            aria-hidden
          />
        </div>
      </div>
    </div>
  )
}
