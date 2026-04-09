import { useEffect, useRef } from 'react'
import {
  createBrainMemoryIngestBuffers,
  createBrainParticleField,
  drawBrainMemoryIngest,
  drawBrainParticles,
  ensureBrainParticleScratch,
  resetBrainMemoryIngest,
  stepBrainMemoryIngest,
  stepBrainParticles,
  type BrainMemoryIngestBuffers,
  type BrainParticleBuffers,
  type BrainParticleScratch,
  type FetchBrainMindState,
} from '../lib/fetchBrainParticles'
import type { BrainNode } from '../lib/fetchBrainGraph'
import { getSpeechAmplitude } from '../voice/fetchVoice'

type Props = {
  theme: 'light' | 'dark'
  mind: FetchBrainMindState
  glowRgb: { r: number; g: number; b: number }
  graphNodes?: BrainNode[]
  running: boolean
  /** Skip scatter→neural dissolve (reduced motion). */
  skipEntryDissolve?: boolean
  /** Memory cortex: barely moving field (light breath only). */
  cortexCalm?: boolean
  /** Cortex zoom depth (0–1): wider field + denser mesh as user drills in. */
  cortexSpread01?: number
  className?: string
}

export function FetchBrainParticleCanvas({
  theme,
  mind,
  glowRgb,
  graphNodes = [],
  running,
  skipEntryDissolve = false,
  cortexCalm = false,
  cortexSpread01 = 0,
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bufRef = useRef<BrainParticleBuffers | null>(null)
  const ingestBufRef = useRef<BrainMemoryIngestBuffers | null>(null)
  const scratchRef = useRef<BrainParticleScratch | null>(null)
  const graphNodesRef = useRef(graphNodes)
  const rafRef = useRef(0)
  const t0Ref = useRef(0)
  const lastRef = useRef(0)
  const entryStartRef = useRef(0)
  const runningRef = useRef(running)
  const wasListeningRef = useRef(false)
  const wasSpeakingRef = useRef(false)

  useEffect(() => {
    graphNodesRef.current = graphNodes
  }, [graphNodes])

  useEffect(() => {
    runningRef.current = running
  }, [running])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const dpr = Math.min(1.1, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w < 2 || h < 2) return
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      bufRef.current = createBrainParticleField(w, h, graphNodes)
      scratchRef.current = ensureBrainParticleScratch(w, h, scratchRef.current)
    }

    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas)
    resize()

    return () => ro.disconnect()
  }, [graphNodes])

  useEffect(() => {
    if (!running) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    t0Ref.current = performance.now()
    lastRef.current = t0Ref.current
    entryStartRef.current = performance.now()

    const tick = (now: number) => {
      if (!runningRef.current) return
      const dt = Math.min(0.05, (now - lastRef.current) / 1000)
      lastRef.current = now
      const t = (now - t0Ref.current) / 1000

      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const buf = bufRef.current
      let scratch = scratchRef.current
      if (!buf || w < 2 || h < 2) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      scratch = ensureBrainParticleScratch(w, h, scratch)
      scratchRef.current = scratch

      const dissolve01 = skipEntryDissolve
        ? 1
        : Math.min(1, (now - entryStartRef.current) / 1920)

      const speechAmp = mind === 'speaking' ? getSpeechAmplitude() : 0

      const reduceMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches

      const listeningNow = mind === 'listening' && !cortexCalm
      const speakingBurst = mind === 'speaking' && !cortexCalm
      let ingestStrength = 0
      if (!reduceMotion && listeningNow) {
        if (!ingestBufRef.current) ingestBufRef.current = createBrainMemoryIngestBuffers()
        if (!wasListeningRef.current) {
          resetBrainMemoryIngest(ingestBufRef.current, w, h)
        }
        wasListeningRef.current = true
        wasSpeakingRef.current = false
        ingestStrength = 0.88 + 0.12 * Math.sin(now / 260)
      } else if (!reduceMotion && speakingBurst) {
        if (!ingestBufRef.current) ingestBufRef.current = createBrainMemoryIngestBuffers()
        if (!wasSpeakingRef.current) {
          resetBrainMemoryIngest(ingestBufRef.current, w, h)
        }
        wasSpeakingRef.current = true
        wasListeningRef.current = false
        ingestStrength = 0.52 + 0.48 * speechAmp * (0.92 + 0.08 * Math.sin(now / 200))
      } else {
        wasListeningRef.current = false
        wasSpeakingRef.current = false
      }

      const tcx = w * 0.5
      const tcy = h * 0.4
      if (ingestStrength > 0.02 && ingestBufRef.current) {
        stepBrainMemoryIngest(ingestBufRef.current, w, h, tcx, tcy, ingestStrength, dt)
      }

      const spread = Math.max(0, Math.min(1, cortexSpread01))
      stepBrainParticles(buf, w, h, t, mind, dissolve01, speechAmp, dt, cortexCalm, spread, reduceMotion)
      drawBrainParticles(
        ctx,
        buf,
        w,
        h,
        t,
        theme,
        mind,
        dissolve01,
        speechAmp,
        glowRgb,
        scratch,
        cortexCalm,
        spread,
        36,
        reduceMotion,
        graphNodesRef.current,
      )

      if (ingestStrength > 0.02 && ingestBufRef.current) {
        drawBrainMemoryIngest(ctx, ingestBufRef.current, w, h, theme, ingestStrength, glowRgb)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [running, theme, mind, glowRgb, skipEntryDissolve, cortexCalm, cortexSpread01])

  return (
    <canvas
      ref={canvasRef}
      className={['fetch-brain-particle-canvas block h-full w-full', className].join(' ')}
      aria-hidden
    />
  )
}
