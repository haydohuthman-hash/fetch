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

/* eslint-disable react-refresh/only-export-components -- re-exports orb types + voice-level hook live next to canvas orb */
/** Four-point sparkle — reference-style glow dust near the sphere rim. */
function drawOrbSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  a: number,
  warm?: boolean,
) {
  ctx.save()
  ctx.strokeStyle = warm
    ? `rgba(188, 142, 108, ${a})`
    : `rgba(224, 245, 255, ${a})`
  ctx.lineWidth = Math.max(0.55, s * 0.24)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - s, y)
  ctx.lineTo(x + s, y)
  ctx.moveTo(x, y - s * 0.92)
  ctx.lineTo(x, y + s * 0.92)
  ctx.stroke()
  ctx.fillStyle = warm
    ? `rgba(210, 168, 128, ${a * 0.85})`
    : `rgba(186, 206, 232, ${a * 0.85})`
  ctx.beginPath()
  ctx.arc(x, y, s * 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export type {
  FetchOrbExpression,
  FetchOrbFlowMoment,
  OrbFaceTargets,
} from '../lib/orb/fetchOrbExpressions'
export { expressionForFlowMoment } from '../lib/orb/fetchOrbExpressions'

const SIZE_CLASS: Record<
  'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'fab' | 'dock' | 'homeDock' | 'homeDockCompact',
  string
> = {
  sm: 'h-[3.1rem] w-[3.1rem]',
  md: 'h-[4.2rem] w-[4.2rem]',
  lg: 'h-[6.1rem] w-[6.1rem]',
  xl: 'h-[12rem] w-[12rem]',
  /** Fullscreen assistant — larger face footprint */
  xxl: 'h-[min(20rem,78vw)] w-[min(20rem,78vw)] sm:h-[22rem] sm:w-[22rem]',
  fab: 'h-[4.15rem] w-[4.15rem]',
  dock: 'h-[9rem] w-[9rem]',
  /** Home + bottom sheet — slightly smaller than dock */
  homeDock: 'h-[6.5rem] w-[6.5rem]',
  /** Maps tab: orb over map, smaller footprint */
  homeDockCompact: 'h-[4rem] w-[4rem]',
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

export type MapAttentionCue = 'none' | 'pickup' | 'route' | 'driver' | 'navigation'

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
  /** Shift gaze downward (e.g. toward content below the face). */
  lookDown?: boolean
  /** Multiplier for `lookDown` gaze offset (1 = default). */
  lookDownDepth?: number
  /** RGB glow color for inner warm + CSS --orb-glow. Defaults to soft white. */
  glowColor?: GlowRGB
  size?: keyof typeof SIZE_CLASS
  /**
   * `sphere` — dark glass orb (default).
   * `faceOnly` — eyes + mouth on a transparent canvas (no black circle).
   */
  surface?: 'sphere' | 'faceOnly'
  /**
   * `day` — white sphere with dark (black) facial features (light / daytime UI).
   * `night` — default dark glass orb with light features.
   */
  orbAppearance?: 'night' | 'day'
  /** When true, cycles moods / wave while user is idle (not listening or speaking). */
  autonomous?: boolean
  /** Pause autonomous moods (e.g. mic active or TTS). */
  suspendAutonomous?: boolean
  className?: string
  ariaLive?: boolean
}

const DEFAULT_GLOW = { r: 244, g: 246, b: 250 }
type GlowRGB = { r: number; g: number; b: number }
const IDLE_BREATH = (Math.PI * 2) / 3.35
/** ~20% larger face vs prior (eyes + spacing + mouth track together). */
const FACE_SCALE = 1.2
/** Half-width of each pill eye (of R); bumped for a wider read. */
const BASE_HW = 0.106 * FACE_SCALE
const BASE_HH = 0.184 * FACE_SCALE
const BASE_SPREAD = 0.244 * FACE_SCALE
const ORB_LID_SHADE = 'rgba(10,11,14,0.97)'
/** Day flatlay — eyelids match skin (no white bars). */
const ORB_LID_SKIN = 'rgba(218, 178, 142, 0.98)'

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
  onLightSphere: boolean,
) {
  const op = clamp01(blinkOpen)
  const fullH = halfH * 2
  const h = Math.max(fullH * op, 0.28)
  const w = halfW * 2
  const x = cx - halfW
  const y = cy - h / 2
  const corner = Math.min(halfW * 0.95, h * 0.48)
  const int = clamp01(intensity)

  if (onLightSphere) {
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    const lg = ctx.createRadialGradient(cx, cy - h * 0.12, 0, cx, cy, Math.max(w, h) * 0.72)
    lg.addColorStop(0, `rgba(48,52,62,${0.9 * int})`)
    lg.addColorStop(0.42, `rgba(24,26,32,${0.96 * int})`)
    lg.addColorStop(1, `rgba(6,7,10,${0.99 * int})`)
    ctx.fillStyle = lg
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, corner)
    ctx.fill()
    ctx.restore()

    if (browTension > 0.03) {
      const browH = Math.min(h * (0.18 + browTension * 0.22), h * 0.45)
      ctx.save()
      const g = ctx.createLinearGradient(x, y, x, y + browH)
      g.addColorStop(0, `rgba(120, 82, 58, ${0.22 * browTension})`)
      g.addColorStop(1, 'rgba(120, 82, 58, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.roundRect(x, y - 0.5, w, browH + 1, Math.min(corner * 0.6, 6))
      ctx.fill()
      ctx.restore()
    }

    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    if (upperLid > 0.02) {
      const cover = h * clamp01(upperLid)
      ctx.fillStyle = ORB_LID_SKIN
      ctx.beginPath()
      ctx.rect(x - 1.5, y - 1, w + 3, cover + 0.5)
      ctx.fill()
    }
    if (lowerLid > 0.02) {
      const cover = h * clamp01(lowerLid)
      ctx.fillStyle = ORB_LID_SKIN
      ctx.beginPath()
      ctx.rect(x - 1.5, y + h - cover - 0.5, w + 3, cover + 2)
      ctx.fill()
    }
    ctx.restore()
    return
  }

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = halfW * 0.85
  ctx.shadowOffsetY = halfH * 0.06
  const lg = ctx.createRadialGradient(cx, cy - h * 0.1, 0, cx, cy, Math.max(w, h) * 0.72)
  lg.addColorStop(0, `rgba(22,24,30,${0.92 * int})`)
  lg.addColorStop(0.45, `rgba(14,15,19,${0.97 * int})`)
  lg.addColorStop(1, `rgba(8,9,12,${0.99 * int})`)
  ctx.fillStyle = lg
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, corner)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
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
  onLightSphere: boolean,
) {
  if (alpha < 0.04) return
  const a = clamp01(alpha)
  ctx.save()
  if (onLightSphere) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgba(4,5,8,${0.94 * a})`
    ctx.beginPath()
    ctx.ellipse(cx + shiftX, cy + shiftY, R * 0.017, R * 0.021, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = `rgba(14,16,22,${0.5 * a})`
    ctx.beginPath()
    ctx.ellipse(cx + shiftX, cy + shiftY, R * 0.017, R * 0.021, 0, 0, Math.PI * 2)
    ctx.fill()
  }
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

/**
 * Stylized human lips (upper with cupid’s bow, fuller lower). `lipOpen` drives jaw drop + oral cavity.
 * No circular pulse — shape is always lip-like.
 */
function drawHumanLipsSpeak(
  ctx: CanvasRenderingContext2D,
  cx: number,
  yC: number,
  halfW: number,
  lipOpen: number,
  baseAlpha: number,
  faceInt: number,
  onLightSphere: boolean,
) {
  const lip = clamp01(lipOpen)
  const fi = clamp01(faceInt)
  const hw = Math.max(halfW, 4)
  const peakH = hw * 0.12
  const cupidDepth = hw * 0.05
  const cornerY = yC + hw * 0.012
  const jawGap = lip * hw * 0.78
  /* Closed: lips nearly meet; opens downward with `lip` */
  const lowerHang = hw * (0.052 + lip * 0.22) + jawGap
  const alphaMul = (0.72 + fi * 0.28) * baseAlpha
  const lineUpper = Math.max(1.05, hw * 0.09)
  const lineLower = Math.max(1.12, hw * 0.1)

  if (lip > 0.03) {
    const cavityH = hw * (0.14 + lip * 0.52)
    ctx.fillStyle = `rgba(4,5,8,${0.55 + lip * 0.4})`
    ctx.beginPath()
    ctx.moveTo(cx - hw * 0.9, cornerY + hw * 0.025)
    ctx.bezierCurveTo(
      cx - hw * 0.42,
      cornerY + cavityH,
      cx + hw * 0.42,
      cornerY + cavityH,
      cx + hw * 0.9,
      cornerY + hw * 0.025,
    )
    ctx.lineTo(cx + hw * 0.78, cornerY - hw * 0.01)
    ctx.bezierCurveTo(
      cx + hw * 0.28,
      cornerY + hw * 0.02,
      cx - hw * 0.28,
      cornerY + hw * 0.02,
      cx - hw * 0.78,
      cornerY - hw * 0.01,
    )
    ctx.closePath()
    ctx.fill()
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = onLightSphere
    ? `rgba(18,20,28,${alphaMul * (0.88 + lip * 0.1)})`
    : `rgba(108,112,124,${alphaMul * (0.88 + lip * 0.1)})`
  ctx.lineWidth = lineUpper
  ctx.beginPath()
  ctx.moveTo(cx - hw, cornerY)
  ctx.bezierCurveTo(
    cx - hw * 0.7,
    cornerY - peakH * 0.9,
    cx - hw * 0.26,
    cornerY - cupidDepth,
    cx,
    cornerY - cupidDepth * 0.28,
  )
  ctx.bezierCurveTo(
    cx + hw * 0.26,
    cornerY - cupidDepth,
    cx + hw * 0.7,
    cornerY - peakH * 0.9,
    cx + hw,
    cornerY,
  )
  ctx.stroke()

  const yLowerMid = cornerY + lowerHang
  ctx.strokeStyle = onLightSphere
    ? `rgba(22,24,32,${alphaMul * (0.85 + lip * 0.12)})`
    : `rgba(98,102,114,${alphaMul * (0.85 + lip * 0.12)})`
  ctx.lineWidth = lineLower
  ctx.beginPath()
  ctx.moveTo(cx - hw * 0.96, cornerY + hw * 0.028)
  ctx.bezierCurveTo(
    cx - hw * 0.32,
    yLowerMid + hw * (0.16 + lip * 0.08),
    cx + hw * 0.32,
    yLowerMid + hw * (0.16 + lip * 0.08),
    cx + hw * 0.96,
    cornerY + hw * 0.028,
  )
  ctx.stroke()

  if (lip > 0.06) {
    ctx.strokeStyle = onLightSphere
      ? `rgba(60,65,78,${0.12 + lip * 0.2})`
      : `rgba(72,76,88,${0.12 + lip * 0.2})`
    ctx.lineWidth = Math.max(0.6, lineLower * 0.32)
    ctx.beginPath()
    ctx.moveTo(cx - hw * 0.42, yLowerMid + hw * 0.04)
    ctx.quadraticCurveTo(cx, yLowerMid - hw * 0.035 * lip, cx + hw * 0.42, yLowerMid + hw * 0.04)
    ctx.stroke()
  }
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
  onLightSphere: boolean,
) {
  const fi = clamp01(faceInt)
  if (fi < 0.03 || kind === 'none') return
  const en = clamp01(energy)
  /* Slightly lower — reads more like a human mouth under the eye row */
  const my = cy + R * (0.182 * FACE_SCALE)

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
      ctx.strokeStyle = onLightSphere
        ? `rgba(20,22,30,${alpha})`
        : `rgba(100,104,118,${alpha})`
      ctx.lineWidth = Math.max(1.15, R * 0.0092)
      strokeSmileArc(ctx, cx, my, w, sagitta)
      break
    }
    case 'speak_line': {
      const lip = clamp01(lipOpen)
      const lipCurve = Math.pow(lip, 0.82)
      const proc = clamp01(1 - lipCurve * 0.92)
      const ph = phase * 0.62
      const jaw = 0.55 + 0.45 * Math.sin(ph * 1.35) * (0.35 + proc * 0.65)
      const hw =
        R *
        0.108 *
        FACE_SCALE *
        (0.94 + proc * 0.028 * en * Math.sin(ph * 1.15))
      const ySubtle =
        proc *
        (Math.sin(ph * 1.2) * R * 0.0035 * en +
          Math.sin(ph * 2.1) * R * 0.0018 * en)
      const y0 = my + ySubtle
      const baseAlpha = 0.5 + en * 0.34
      /* Human-style lips; jaw modulates how far the mouth opens */
      drawHumanLipsSpeak(
        ctx,
        cx,
        y0,
        hw,
        lipCurve * (0.55 + jaw * 0.45),
        baseAlpha,
        fi,
        onLightSphere,
      )
      break
    }
    case 'flat': {
      const w = R * 0.1 * FACE_SCALE
      const sagitta = R * 0.038 * FACE_SCALE
      ctx.strokeStyle = onLightSphere
        ? `rgba(28,30,38,${0.52 * fi})`
        : `rgba(95,99,112,${0.45 * fi})`
      ctx.lineWidth = Math.max(1, R * 0.009)
      strokeSmileArc(ctx, cx, my, w, sagitta)
      break
    }
    case 'soft_o': {
      const rw = R * 0.042 * FACE_SCALE + Math.sin(phase * 2.2) * R * 0.005 * en
      const rh = R * 0.034 * FACE_SCALE
      ctx.strokeStyle = onLightSphere
        ? `rgba(22,24,32,${0.58 * fi})`
        : `rgba(102,106,120,${0.52 * fi})`
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

/** Side mitt + finger bumps; `waveOsc` drives rotation (e.g. `t * 7.5`). */
function drawFetchWaveHand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  waveOsc: number,
  _glow: GlowRGB,
  alpha: number,
  onLightSphere: boolean,
) {
  if (alpha < 0.02) return
  ctx.save()
  const hx = cx + R * 0.7
  const hy = cy + R * 0.06
  ctx.translate(hx, hy)
  ctx.rotate(-0.38 + Math.sin(waveOsc) * 0.5)
  ctx.globalAlpha = clamp01(alpha)

  const palmW = R * 0.24
  const palmH = R * 0.28
  const rr = Math.min(R * 0.06, palmW * 0.22)
  const fill = onLightSphere
    ? 'rgba(18,20,28,0.92)'
    : 'rgba(26,28,36,0.92)'
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(-palmW * 0.32, -palmH * 0.15, palmW, palmH, rr)
  } else {
    ctx.rect(-palmW * 0.32, -palmH * 0.15, palmW, palmH)
  }
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = onLightSphere ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)'
  ctx.lineWidth = Math.max(1, R * 0.011)
  ctx.stroke()

  for (let i = 0; i < 3; i += 1) {
    const fx = palmW * 0.38 + i * R * 0.052
    const fy = -R * 0.11 - i * R * 0.018
    ctx.beginPath()
    ctx.arc(fx, fy, R * 0.036, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.stroke()
  }

  ctx.restore()
}

export function useFetchOrbVoiceLevel(active: boolean): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setLevel(0))
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
  lookDown = false,
  lookDownDepth = 1,
  glowColor = DEFAULT_GLOW,
  size = 'md',
  surface = 'sphere',
  autonomous = false,
  suspendAutonomous = false,
  className = '',
  ariaLive = true,
  orbAppearance = 'night',
}: JarvisNeuralOrbProps) {
  const [autoMood, setAutoMood] = useState<FetchOrbExpression>('curious')
  const autoMoodRef = useRef(autoMood)
  const autonomousEnabledRef = useRef(autonomous)
  const suspendAutonomousRef = useRef(suspendAutonomous)
  const reduceMotionRef = useRef(false)
  useEffect(() => {
    reduceMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  }, [])
  useEffect(() => {
    autoMoodRef.current = autoMood
    autonomousEnabledRef.current = autonomous
    suspendAutonomousRef.current = suspendAutonomous
  }, [autoMood, autonomous, suspendAutonomous])
  const waveVisualRef = useRef(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const liftRef = useRef<HTMLDivElement>(null)

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
  const lookDownRef = useRef(lookDown)
  const lookDownDepthRef = useRef(lookDownDepth)
  const glowRef = useRef(glowColor)
  const orbAppearanceRef = useRef(orbAppearance)

  useEffect(() => {
    lookAtCardRef.current = lookAtCard
    lookDownRef.current = lookDown
    lookDownDepthRef.current = lookDownDepth
    glowRef.current = glowColor
    orbAppearanceRef.current = orbAppearance
    expressionRef.current = expressionProp
    stateRef.current = state
    speakingRef.current = speaking
    activityRef.current = clamp01(activity)
    voiceRef.current = clamp01(voiceLevel ?? 0)
  }, [
    lookAtCard,
    lookDown,
    lookDownDepth,
    glowColor,
    orbAppearance,
    expressionProp,
    state,
    speaking,
    activity,
    voiceLevel,
  ])

  void awakened

  const effectiveExpression: FetchOrbExpression =
    expressionProp ?? expressionFromLegacyState(state, speaking)

  const autonomousIdleState =
    state === 'idle' || state === 'aware' || state === undefined
  const autonomousBaseExpression =
    effectiveExpression === 'awake' || effectiveExpression === 'idle'

  const mergedExpression: FetchOrbExpression =
    autonomous &&
    !suspendAutonomous &&
    !speaking &&
    autonomousIdleState &&
    autonomousBaseExpression
      ? autoMood
      : effectiveExpression

  const legacyClass = legacySphereClassFromExpression(mergedExpression)

  const autonomousTimerRef = useRef(0)
  useEffect(() => {
    if (!autonomous) return
    const pool: FetchOrbExpression[] = [
      'playful',
      'playful',
      'playful',
      'content',
      'content',
      'content',
      'content',
      'curious',
      'curious',
      'happy',
      'happy',
      'awake',
      'awake',
      'awake',
      'proud',
      'excited',
      'thinking',
      'waving',
    ]
    let cancelled = false
    const step = () => {
      if (cancelled) return
      setAutoMood(pool[Math.floor(Math.random() * pool.length)]!)
      autonomousTimerRef.current = window.setTimeout(
        step,
        2200 + Math.random() * 4800,
      )
    }
    autonomousTimerRef.current = window.setTimeout(
      step,
      350 + Math.random() * 950,
    )
    return () => {
      cancelled = true
      window.clearTimeout(autonomousTimerRef.current)
    }
  }, [autonomous])

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
      } else if (mapAttention === 'route' || mapAttention === 'navigation') {
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
    if (mergedExpression !== lastExprRef.current) {
      lastExprRef.current = mergedExpression
      if (mergedExpression === 'surprised') {
        blinkRef.current = 1
      }
    }
  }, [mergedExpression])

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

    const homeMagicalDock = size === 'homeDock' || size === 'homeDockCompact'

    const render = (now: number) => {
      const speak = speakingRef.current
      const act = activityRef.current
      const vMic = voiceRef.current
      const t = now * 0.001

      const userExpr =
        expressionRef.current ?? expressionFromLegacyState(stateRef.current, speak)
      const st = stateRef.current
      const autoOn =
        autonomousEnabledRef.current &&
        !suspendAutonomousRef.current &&
        !speak &&
        (st === 'idle' || st === 'aware' || st === undefined) &&
        (userExpr === 'awake' || userExpr === 'idle')
      const expr: FetchOrbExpression = autoOn ? autoMoodRef.current : userExpr

      const dockHighLoad =
        expr === 'sleepy' ||
        expr === 'thinking' ||
        expr === 'searching' ||
        expr === 'surprised' ||
        expr === 'intense' ||
        expr === 'concerned'
      const dockAmbientLife =
        homeMagicalDock &&
        !reduceMotionRef.current &&
        !speak &&
        !dockHighLoad &&
        expr !== 'speaking' &&
        expr !== 'listening'
      const dockCalmBreath =
        dockAmbientLife &&
        (expr === 'awake' ||
          expr === 'idle' ||
          expr === 'curious' ||
          expr === 'content' ||
          expr === 'proud')

      const targetT = resolveOrbExpressionTargets(expr)
      let lerpU = 0.11
      if (reduceMotionRef.current) lerpU = 0.16
      else if (expr === 'surprised' || expr === 'excited') lerpU = 0.2
      else if (expr === 'sleepy' || expr === 'content') lerpU = 0.075
      smoothRef.current = stepOrbFaceTargets(smoothRef.current, targetT, lerpU)
      const vis = smoothRef.current

      if (confirmPulseRef.current > 0.002) {
        confirmPulseRef.current *= 0.92
      }
      if (mapImpulseRef.current > 0.002) {
        mapImpulseRef.current *= 0.965
      }

      const breathAmpEff = vis.breathAmp * (dockCalmBreath ? 1.2 : 1)
      const breath =
        1 +
        Math.sin(t * IDLE_BREATH) * breathAmpEff +
        (dockCalmBreath
          ? Math.sin(t * IDLE_BREATH * 2.02 + 1.05) * breathAmpEff * 0.17
          : 0) +
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
      if (autoOn && !reduceMotionRef.current) {
        liftPx += Math.sin(t * 2.12) * 5.2 + Math.sin(t * 0.88) * 2.9
      } else if (dockAmbientLife) {
        liftPx += Math.sin(t * 1.85) * 3.1 + Math.sin(t * 0.76) * 1.6
      }

      shimmerPhaseRef.current +=
        0.014 *
        vis.shimmerSpeed *
        (0.5 + vis.shimmer) *
        (dockCalmBreath ? 1.3 : 1)
      if (vis.mouthKind === 'speak_line') {
        const tgt = clamp01(getSpeechAmplitude())
        const cur = lipOpenVisualRef.current
        lipOpenVisualRef.current = lerp(cur, tgt, tgt > cur ? 0.42 : 0.11)
      } else {
        lipOpenVisualRef.current = lerp(lipOpenVisualRef.current, 0, 0.14)
      }
      const speakMove = expr === 'speaking' || speak
      const lipDrive = lipOpenVisualRef.current
      mouthPhaseRef.current += speakMove
        ? vis.mouthKind === 'speak_line'
          ? (0.078 + act * 0.065) * (0.12 + (1 - lipDrive) * 0.88)
          : 0.24 + act * 0.2
        : 0.048

      const cx = width / 2
      const cy = height / 2
      /* Fill the rounded host so rim glow reads as one with the sphere (was 0.96 — felt like a gap). */
      const R = (Math.min(width, height) / 2) * 0.995 * breath
      const gc = glowRef.current
      const dayOrb = orbAppearanceRef.current === 'day' && surface === 'sphere'

      ctx.clearRect(0, 0, width, height)

      if (surface === 'sphere') {
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, Math.PI * 2)
        ctx.clip()

        if (dayOrb) {
          /* Day flatlay — matte tan disk (no white center glow) */
          const core = ctx.createRadialGradient(
            cx - R * 0.06,
            cy - R * 0.12,
            R * 0.04,
            cx,
            cy,
            R * 1.0,
          )
          core.addColorStop(0, 'rgba(244,214,182,1)')
          core.addColorStop(0.38, 'rgba(232,196,160,1)')
          core.addColorStop(0.68, 'rgba(214,172,132,1)')
          core.addColorStop(0.9, 'rgba(196,152,116,1)')
          core.addColorStop(1, 'rgba(188,142,108,1)')
          ctx.fillStyle = core
          ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4)

          const edgeFade = ctx.createRadialGradient(cx, cy, R * 0.78, cx, cy, R)
          edgeFade.addColorStop(0, 'rgba(0,0,0,0)')
          edgeFade.addColorStop(0.55, 'rgba(92,58,42,0.05)')
          edgeFade.addColorStop(1, 'rgba(72,44,32,0.08)')
          ctx.fillStyle = edgeFade
          ctx.beginPath()
          ctx.arc(cx, cy, R, 0, Math.PI * 2)
          ctx.fill()

          const warmCore =
            (0.018 + act * 0.02) * vis.innerWarm * (0.75 + vis.redAccent * 0.06)
          const innerWarm = ctx.createRadialGradient(cx + R * 0.08, cy + R * 0.1, 0, cx, cy, R * 0.62)
          innerWarm.addColorStop(0, `rgba(168, 112, 78, ${warmCore * 1.1})`)
          innerWarm.addColorStop(1, 'rgba(210, 168, 128, 0)')
          ctx.fillStyle = innerWarm
          ctx.globalCompositeOperation = 'multiply'
          ctx.beginPath()
          ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalCompositeOperation = 'source-over'
        } else {
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

          const warmCore =
            (0.038 + act * 0.042) * vis.innerWarm * (0.85 + vis.redAccent * 0.08)
          const innerWarm = ctx.createRadialGradient(cx + R * 0.08, cy + R * 0.12, 0, cx, cy, R * 0.7)
          innerWarm.addColorStop(0, `rgba(36, 48, 64, ${warmCore * 1.35})`)
          innerWarm.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = innerWarm
          ctx.globalCompositeOperation = 'multiply'
          ctx.beginPath()
          ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalCompositeOperation = 'source-over'
        }

        if (homeMagicalDock) {
          const pulse = 0.88 + Math.sin(t * 1.2) * 0.12
          ctx.save()
          const blueFill = ctx.createRadialGradient(
            cx,
            cy + R * 0.05,
            R * 0.06,
            cx,
            cy,
            R * 0.91,
          )
          const b0 = (dayOrb ? 0.09 : 0.34) * pulse
          const b1 = (dayOrb ? 0.055 : 0.22) * pulse
          const b2 = (dayOrb ? 0.028 : 0.12) * pulse
          if (dayOrb) {
            blueFill.addColorStop(0, `rgba(228, 188, 152, ${b0})`)
            blueFill.addColorStop(0.4, `rgba(200, 158, 118, ${b1})`)
            blueFill.addColorStop(0.74, `rgba(176, 132, 98, ${b2})`)
          } else {
            blueFill.addColorStop(0, `rgba(56, 189, 248, ${b0})`)
            blueFill.addColorStop(0.38, `rgba(129, 140, 246, ${b1})`)
            blueFill.addColorStop(0.72, `rgba(59, 130, 246, ${b2})`)
          }
          blueFill.addColorStop(1, dayOrb ? 'rgba(210,168,128,0)' : 'rgba(0,0,0,0)')
          ctx.fillStyle = blueFill
          ctx.globalCompositeOperation = dayOrb ? 'multiply' : 'source-over'
          ctx.beginPath()
          ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2)
          ctx.fill()

          const edgeBlue = ctx.createRadialGradient(cx, cy, R * 0.62, cx, cy, R * 0.995)
          edgeBlue.addColorStop(
            0,
            dayOrb ? 'rgba(210, 170, 130, 0)' : 'rgba(56, 189, 248, 0)',
          )
          edgeBlue.addColorStop(
            0.72,
            dayOrb ? 'rgba(150, 98, 68, 0.06)' : 'rgba(56, 189, 248, 0.12)',
          )
          edgeBlue.addColorStop(
            1,
            dayOrb ? 'rgba(120, 78, 52, 0.1)' : 'rgba(56, 189, 248, 0.22)',
          )
          ctx.fillStyle = edgeBlue
          ctx.globalCompositeOperation = 'source-over'
          ctx.beginPath()
          ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2)
          ctx.fill()

          ctx.globalCompositeOperation = 'source-over'
          ctx.strokeStyle = dayOrb ? 'rgba(160, 108, 78, 0.38)' : 'rgba(125, 211, 252, 0.32)'
          ctx.lineWidth = Math.max(1, R * 0.018)
          ctx.beginPath()
          ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2)
          ctx.stroke()

          /* Rim catch-light — upper-left border only (no broad top shine). */
          const lx = cx - R * 0.76
          const ly = cy - R * 0.7
          const rimGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 0.28)
          if (dayOrb) {
            rimGlow.addColorStop(0, `rgba(200, 160, 124, ${0.08 * pulse})`)
            rimGlow.addColorStop(0.45, `rgba(188, 142, 108, ${0.04 * pulse})`)
            rimGlow.addColorStop(1, 'rgba(188,142,108,0)')
          } else {
            rimGlow.addColorStop(0, `rgba(96, 165, 220, ${0.12 * pulse})`)
            rimGlow.addColorStop(0.5, `rgba(59, 99, 140, ${0.05 * pulse})`)
            rimGlow.addColorStop(1, 'rgba(0,0,0,0)')
          }
          ctx.fillStyle = rimGlow
          ctx.globalCompositeOperation = 'source-over'
          ctx.beginPath()
          ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2)
          ctx.fill()

          ctx.globalCompositeOperation = 'source-over'
          const dustAlphaMul = 1 - act * 0.38
          const dustN = 11
          for (let i = 0; i < dustN; i++) {
            const th = i * 2.513 + t * 0.088 * (0.72 + (i % 4) * 0.09)
            const rr = R * (0.22 + (i % 6) * 0.08)
            const px =
              cx + Math.cos(th) * rr * 0.78 + Math.sin(t * 0.17 + i * 0.4) * R * 0.026
            const py =
              cy + Math.sin(th * 1.09) * rr * 0.58 + Math.cos(t * 0.21 + i * 0.55) * R * 0.02
            const d2 = (px - cx) ** 2 + (py - cy) ** 2
            if (d2 > (R * 0.88) ** 2) continue
            const pr = 0.42 + (i % 3) * 0.2
            const alpha =
              (0.042 + Math.sin(t * 0.76 + i * 1.13) * 0.022) * dustAlphaMul
            ctx.fillStyle = dayOrb
              ? `rgba(196, 158, 122, ${alpha})`
              : `rgba(199, 210, 254, ${alpha})`
            ctx.beginPath()
            ctx.arc(px, py, pr, 0, Math.PI * 2)
            ctx.fill()
          }

          const sparkN = 11
          for (let j = 0; j < sparkN; j++) {
            const ang = j * 1.127 + t * 0.14 + j * 0.31
            const rad = R * (0.78 + (j % 4) * 0.035 + Math.sin(t * 0.4 + j) * 0.02)
            const sx = cx + Math.cos(ang) * rad
            const sy = cy + Math.sin(ang * 0.97) * rad * 0.92
            const d2s = (sx - cx) ** 2 + (sy - cy) ** 2
            if (d2s < (R * 0.52) ** 2 || d2s > (R * 0.94) ** 2) continue
            const sz = R * (0.055 + (j % 3) * 0.018)
            const sa =
              (0.32 + Math.sin(t * 1.05 + j * 1.4) * 0.18) * dustAlphaMul * (dayOrb ? 0.85 : 1)
            drawOrbSparkle(ctx, sx, sy, sz, sa, dayOrb)
          }

          ctx.globalCompositeOperation = 'source-over'
          ctx.restore()
        }

        ctx.restore()
      }

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
      const autoSwayX =
        autoOn && !reduceMotionRef.current
          ? Math.sin(t * 1.08) * R * 0.045
          : dockAmbientLife
            ? Math.sin(t * 0.95) * R * 0.022 + Math.sin(t * 0.41) * R * 0.011
            : 0
      const faceCx = cx + swayX + autoSwayX
      const ldMul = lookDownRef.current ? Math.max(0.5, lookDownDepthRef.current) : 0
      const lookUpY = lookAtCardRef.current
        ? -R * 0.026
        : lookDownRef.current
          ? R * 0.024 * ldMul
          : 0
      const gazeCardY = lookAtCardRef.current
        ? -R * 0.052
        : lookDownRef.current
          ? R * 0.072 * ldMul
          : 0

      const listenBoost = expr === 'listening' ? 1 + vMic * 0.08 + act * 0.03 : 1
      const spread = R * BASE_SPREAD * vis.eyeSpreadMul

      let emotionEyeYOffset = 0
      let emotionAsymDelta = 0
      if (!reduceMotionRef.current) {
        if (expr === 'playful' || expr === 'excited') {
          emotionEyeYOffset = Math.sin(t * 3.1) * R * 0.014
          emotionAsymDelta = Math.sin(t * 2.35) * 0.05
        } else if (expr === 'listening') {
          emotionEyeYOffset = Math.sin(t * 2.25) * R * 0.009
          emotionAsymDelta = Math.sin(t * 1.85) * 0.028
        } else if (expr === 'thinking' || expr === 'searching') {
          emotionEyeYOffset = Math.sin(t * 0.95) * R * 0.011
        }
      }

      const eyeY =
        cy + R * vis.eyeYMul + my + lookUpY + microDriftY + emotionEyeYOffset

      const asymEff = Math.max(-0.24, Math.min(0.24, vis.asymmetry + emotionAsymDelta))
      const halfWL = R * BASE_HW * vis.eyeScaleW * (1 - asymEff) * listenBoost
      const halfWR = R * BASE_HW * vis.eyeScaleW * (1 + asymEff) * listenBoost
      const halfH = R * BASE_HH * vis.eyeScaleH * listenBoost

      const tilt = vis.tiltY * R
      const mapAtten =
        mapImpulseRef.current > 0.12
          ? Math.max(0.28, 1 - mapImpulseRef.current * 0.5)
          : 1
      const dockPupilDx = dockAmbientLife
        ? (Math.sin(t * 0.31) * 0.92 + Math.cos(t * 0.19) * 0.68) *
          R *
          0.0068 *
          mapAtten
        : 0
      const dockPupilDy = dockAmbientLife
        ? (Math.cos(t * 0.27) * 0.88 + Math.sin(t * 0.23) * 0.62) *
          R *
          0.0059 *
          mapAtten
        : 0
      const gazeX = (vis.pupilShiftX * R * 0.04 + scan) * 0.85 + dockPupilDx
      const gazeY = vis.pupilShiftY * R * 0.035 + gazeCardY + dockPupilDy

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
        dayOrb,
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
        dayOrb,
      )

      drawPupilDot(
        ctx,
        faceCx - spread + mx * 0.45,
        eyeY,
        R,
        gazeX,
        gazeY,
        vis.pupilAlpha,
        dayOrb,
      )
      drawPupilDot(
        ctx,
        faceCx + spread + mx * 0.45,
        eyeY,
        R,
        gazeX,
        gazeY,
        vis.pupilAlpha,
        dayOrb,
      )

      const mouthEnergy =
        vis.mouthKind === 'speak_line'
          ? clamp01(vis.mouthEnergy * (0.58 + act * 0.42))
          : expr === 'speaking' || speak
            ? clamp01(vis.mouthEnergy * (0.72 + act * 0.28))
            : vis.mouthEnergy
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
        dayOrb,
      )

      const waveTgt = expr === 'waving' ? 1 : 0
      waveVisualRef.current = lerp(waveVisualRef.current, waveTgt, 0.07)
      drawFetchWaveHand(ctx, cx, cy, R, t * 7.85, gc, waveVisualRef.current, dayOrb)

      /* Confirmation pulse — soft glow bloom instead of hard ring */
      if (confirmPulseRef.current > 0.01) {
        const p = easeOutCubic(confirmPulseRef.current)
        ctx.save()
               ctx.globalCompositeOperation = 'source-over'
        const pr = R + (1 - p) * R * 0.38
        const pg = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, pr)
        if (dayOrb) {
          pg.addColorStop(0, `rgba(188, 132, 96, ${p * 0.12})`)
          pg.addColorStop(0.5, `rgba(168, 112, 78, ${p * 0.07})`)
          pg.addColorStop(1, 'rgba(188,142,108,0)')
        } else {
          pg.addColorStop(0, `rgba(45, 72, 98, ${p * 0.1})`)
          pg.addColorStop(0.55, `rgba(28, 44, 62, ${p * 0.045})`)
          pg.addColorStop(1, 'rgba(0,0,0,0)')
        }
        ctx.fillStyle = pg
        ctx.beginPath()
        ctx.arc(cx, cy, pr, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      if (liftRef.current) {
        liftRef.current.style.transform = `translate3d(0, ${liftPx.toFixed(2)}px, 0)`
      }
      raf = window.requestAnimationFrame(render)
    }

    raf = window.requestAnimationFrame(render)
    return () => {
      ro.disconnect()
      window.cancelAnimationFrame(raf)
    }
  }, [size, surface, orbAppearance])

  const dim = SIZE_CLASS[size]

  return (
    <div
      className={[
        'relative flex flex-col items-center',
        autonomous &&
        !suspendAutonomous &&
        (surface === 'faceOnly' ||
          size === 'homeDock' ||
          size === 'homeDockCompact' ||
          size === 'fab')
          ? 'fetch-jarvis-autonomous-host'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...(ariaLive ? { 'aria-live': 'polite' as const } : {})}
    >
      <div
        ref={liftRef}
        className={[
          'fetch-assistant-face-orb relative',
          surface === 'sphere'
            ? `fetch-jarvis-neural-sphere rounded-full fetch-jarvis-neural-sphere--${legacyClass}`
            : `fetch-jarvis-face-only fetch-jarvis-neural-sphere--${legacyClass}`,
          dim,
        ].join(' ')}
        data-fetch-orb-expression={mergedExpression}
        data-orb-size={size}
        data-orb-surface={surface}
        data-orb-appearance={orbAppearance}
      >
        <div
          ref={hostRef}
          className={[
            'relative z-[1] h-full w-full',
            surface === 'sphere' ? 'overflow-hidden rounded-full' : 'overflow-visible',
          ].join(' ')}
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
