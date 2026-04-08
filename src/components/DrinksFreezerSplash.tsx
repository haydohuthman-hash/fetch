import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

/** Full splash length — keep in sync with CSS animation totals (~2.8s). */
export const DRINKS_FREEZER_SPLASH_MS = 2800
const SPLASH_MS_REDUCED = 420

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

/** Call synchronously from the Drinks promo click so AudioContext stays in the user-gesture chain. */
export function playDrinksFreezerStormSound(opts: { durationMs: number; reducedMotion?: boolean }): void {
  if (opts.reducedMotion || opts.durationMs < 200) return
  const durationMs = Math.min(5500, Math.max(600, opts.durationMs))
  const endSec = durationMs / 1000

  type WinAudio = Window & { webkitAudioContext?: typeof AudioContext }
  const Ctx = window.AudioContext ?? (window as WinAudio).webkitAudioContext
  if (!Ctx) return

  try {
    const ctx = new Ctx()
    void ctx.resume()

    const n = Math.floor(1.8 * ctx.sampleRate)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1

    const windSrc = ctx.createBufferSource()
    windSrc.buffer = buf
    windSrc.loop = true

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.15
    const t0 = ctx.currentTime
    bp.frequency.setValueAtTime(160, t0)
    bp.frequency.exponentialRampToValueAtTime(820, t0 + endSec * 0.35)
    bp.frequency.exponentialRampToValueAtTime(240, t0 + endSec)

    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1400

    const hissSrc = ctx.createBufferSource()
    hissSrc.buffer = buf
    hissSrc.loop = true
    const hissGain = ctx.createGain()
    hissGain.gain.value = 0.06

    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0008, t0)
    master.gain.exponentialRampToValueAtTime(0.42, t0 + 0.14)
    master.gain.exponentialRampToValueAtTime(0.0008, t0 + endSec)

    windSrc.connect(bp).connect(master)
    hissSrc.connect(hp).connect(hissGain).connect(master)
    master.connect(ctx.destination)

    windSrc.start(t0)
    hissSrc.start(t0)
    windSrc.stop(t0 + endSec + 0.08)
    hissSrc.stop(t0 + endSec + 0.08)

    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, durationMs + 400)
  } catch {
    /* ignore */
  }
}

export type DrinksFreezerSplashProps = {
  open: boolean
  onFinished: () => void
}

export function DrinksFreezerSplash({ open, onFinished }: DrinksFreezerSplashProps) {
  const reducedMotion = usePrefersReducedMotion()
  const duration = reducedMotion ? SPLASH_MS_REDUCED : DRINKS_FREEZER_SPLASH_MS

  const flakes = useMemo(
    () =>
      Array.from({ length: 62 }, (_, i) => ({
        id: i,
        leftPct: ((i * 47) % 100) + (i % 3) * 0.4,
        sizePx: 2 + (i % 6),
        delayMs: (i * 53) % 2200,
        durMs: 1600 + (i % 11) * 95,
        drift: -15 + (i % 9) * 4,
      })),
    [],
  )

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onFinished, duration)
    return () => window.clearTimeout(t)
  }, [open, duration, onFinished])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className={[
        'fetch-drinks-freezer-splash pointer-events-none fixed inset-0 z-[220]',
        reducedMotion ? 'fetch-drinks-freezer-splash--reduced' : '',
      ].join(' ')}
      role="presentation"
      aria-hidden
    >
      <div className="fetch-drinks-freezer-splash__bg" />
      <div className="fetch-drinks-freezer-splash__frost" />
      <div className="fetch-drinks-freezer-splash__flash" />
      <div className="fetch-drinks-freezer-splash__vignette" />
      <div className="fetch-drinks-freezer-splash__streak fetch-drinks-freezer-splash__streak--a" />
      <div className="fetch-drinks-freezer-splash__streak fetch-drinks-freezer-splash__streak--b" />
      <div className="fetch-drinks-freezer-splash__streak fetch-drinks-freezer-splash__streak--c" />
      <div className="fetch-drinks-freezer-splash__flakes" aria-hidden>
        {flakes.map((f) => (
          <span
            key={f.id}
            className="fetch-drinks-freezer-splash__flake"
            style={
              {
                left: `${f.leftPct}%`,
                width: f.sizePx,
                height: f.sizePx,
                animationDelay: `${f.delayMs}ms`,
                animationDuration: `${f.durMs}ms`,
                '--snow-drift': `${f.drift}vw`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <p className="fetch-drinks-freezer-splash__label">Entering the chiller…</p>
    </div>,
    document.body,
  )
}
