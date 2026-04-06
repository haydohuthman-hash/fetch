import { useEffect, useRef, type AnimationEvent } from 'react'

export type FetchSplashEyesMode = 'blinking' | 'awake' | 'thinking' | 'settle' | 'open'

type FetchSplashEyesProps = {
  mode: FetchSplashEyesMode
  className?: string
  /** Called once when `settle` mode finishes its blink (other modes ignore this). */
  onSettleComplete?: () => void
}

export function FetchSplashEyes({ mode, className = '', onSettleComplete }: FetchSplashEyesProps) {
  const settleDoneRef = useRef(false)

  useEffect(() => {
    settleDoneRef.current = false
  }, [mode])

  useEffect(() => {
    if (mode !== 'settle' || !onSettleComplete) return
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onSettleComplete()
    }
  }, [mode, onSettleComplete])

  const onAnimEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (mode !== 'settle' || !onSettleComplete) return
    const t = e.target as HTMLElement
    if (!t.classList.contains('fetch-splash-eye__ball')) return
    if (settleDoneRef.current) return
    settleDoneRef.current = true
    onSettleComplete()
  }

  return (
    <div
      className={[
        'fetch-splash-eyes relative flex items-center justify-center gap-[clamp(1.75rem,8vw,2.75rem)]',
        mode === 'blinking' ? 'fetch-splash-eyes--blinking' : '',
        mode === 'awake' ? 'fetch-splash-eyes--awake' : '',
        mode === 'thinking' ? 'fetch-splash-eyes--thinking' : '',
        mode === 'settle' ? 'fetch-splash-eyes--settle' : '',
        className,
      ].join(' ')}
      onAnimationEnd={onAnimEnd}
      aria-hidden
    >
      <div className="fetch-splash-eye">
        <span className="fetch-splash-eye__glow" />
        <span className="fetch-splash-eye__ball" />
      </div>
      <div className="fetch-splash-eye">
        <span className="fetch-splash-eye__glow" />
        <span className="fetch-splash-eye__ball" />
      </div>
    </div>
  )
}
