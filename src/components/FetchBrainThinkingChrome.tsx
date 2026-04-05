import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

const STEP_LABELS = ['Analyzing', 'Planning', 'Matching', 'Ready'] as const

export type FetchBrainThinkingChromeProps = {
  active: boolean
  theme: 'light' | 'dark'
  glowRgb: { r: number; g: number; b: number }
  title?: string
  subtitle?: string
  feedback?: string
  /** Active step 0–3. If omitted while `active`, steps auto-advance on a timer. */
  stepIndex?: number
  autoAdvanceSteps?: boolean
}

export function FetchBrainThinkingChrome({
  active,
  theme,
  glowRgb,
  title = 'Fetch is thinking…',
  subtitle = 'Building the best plan for your move',
  feedback = "I'll find the best options, estimate your cost, and keep you moving.",
  stepIndex: stepIndexProp,
  autoAdvanceSteps = true,
}: FetchBrainThinkingChromeProps) {
  const isLight = theme === 'light'
  const [autoStep, setAutoStep] = useState(0)

  useEffect(() => {
    if (!active) {
      setAutoStep(0)
      return
    }
    if (stepIndexProp !== undefined || !autoAdvanceSteps) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    setAutoStep(0)
    const id = window.setInterval(() => {
      setAutoStep((s) => Math.min(3, s + 1))
    }, 2400)
    return () => window.clearInterval(id)
  }, [active, stepIndexProp, autoAdvanceSteps])

  const step = stepIndexProp !== undefined ? stepIndexProp : autoStep
  const shellStyle = {
    '--brain-thinking-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}`,
  } as CSSProperties

  if (!active) return null

  return (
    <div
      className="fetch-brain-thinking-chrome pointer-events-none absolute inset-0 z-[8] flex min-h-0 flex-col"
      style={shellStyle}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={[
          'pointer-events-none flex shrink-0 flex-col items-center px-6 pt-[max(3.5rem,env(safe-area-inset-top))] text-center',
        ].join(' ')}
      >
        <h2
          className={[
            'max-w-[18rem] text-[1.35rem] font-semibold leading-tight tracking-tight',
            isLight ? 'text-slate-900' : 'text-white',
          ].join(' ')}
        >
          {title}
        </h2>
        <p
          className={[
            'mt-2 max-w-[17rem] text-[13px] font-medium leading-snug',
            isLight ? 'text-slate-500' : 'text-white/55',
          ].join(' ')}
        >
          {subtitle}
        </p>
      </div>

      <div className="min-h-0 flex-1" aria-hidden />

      <div
        className={[
          'pointer-events-none flex shrink-0 flex-col items-center gap-5 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        ].join(' ')}
      >
        <p
          className={[
            'fetch-brain-thinking-feedback max-w-md rounded-2xl px-4 py-3 text-center text-[13px] font-medium leading-relaxed shadow-sm [text-wrap:pretty]',
            isLight
              ? 'bg-slate-900/[0.06] text-slate-800 shadow-slate-900/[0.04]'
              : 'bg-white/[0.08] text-white/90 shadow-black/20',
          ].join(' ')}
        >
          {feedback}
        </p>

        <div className="relative w-full max-w-[20rem] px-1">
          <div
            className={[
              'absolute left-[14%] right-[14%] top-[9px] h-[2px] rounded-full',
              isLight ? 'bg-slate-900/10' : 'bg-white/12',
            ].join(' ')}
            aria-hidden
          />
          <div className="relative flex justify-between">
            {STEP_LABELS.map((label, i) => {
              const past = i < step
              const current = i === step
              return (
                <div key={label} className="flex w-[22%] flex-col items-center gap-2">
                  <div
                    className={[
                      'relative flex shrink-0 items-center justify-center rounded-full transition-[transform,box-shadow,width,height] duration-300',
                      current
                        ? 'fetch-brain-thinking-dot--active h-[20px] w-[20px] scale-105'
                        : 'h-[11px] w-[11px]',
                      past && !current
                        ? isLight
                          ? 'bg-slate-700/88'
                          : 'bg-white/78'
                        : !current
                          ? isLight
                            ? 'bg-slate-300/45'
                            : 'bg-white/18'
                          : '',
                    ].join(' ')}
                  />
                  <span
                    className={[
                      'text-center text-[9px] font-bold uppercase tracking-[0.14em]',
                      current
                        ? isLight
                          ? 'text-slate-900'
                          : 'text-white'
                        : past
                          ? isLight
                            ? 'text-slate-600'
                            : 'text-white/62'
                          : isLight
                            ? 'text-slate-400/90'
                            : 'text-white/38',
                    ].join(' ')}
                  >
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
