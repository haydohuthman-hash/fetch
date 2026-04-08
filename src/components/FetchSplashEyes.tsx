import { useEffect, useRef, type AnimationEvent } from 'react'

export type FetchSplashEyesMode =
  | 'blinking'
  | 'awake'
  | 'thinking'
  | 'settle'
  | 'open'
  /** Cold-open splash: open eyes at rest (after blink), optional iris + glance via props below. */
  | 'splashRest'

type FetchSplashEyesProps = {
  mode: FetchSplashEyesMode
  className?: string
  /** Called once when `settle` mode finishes its blink (other modes ignore this). */
  onSettleComplete?: () => void
  /** Splash only: layered pupil that can glance left/right. */
  showSplashIris?: boolean
  /** Splash only: run one glance animation on the pupil (class stays for fill-mode end state). */
  splashGlanceActive?: boolean
}

export function FetchSplashEyes({
  mode,
  className = '',
  onSettleComplete,
  showSplashIris = false,
  splashGlanceActive = false,
}: FetchSplashEyesProps) {
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

  const irisDotClass = [
    'fetch-splash-eye__iris-dot',
    splashGlanceActive ? 'fetch-splash-eye__iris-dot--animate' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={[
        'fetch-splash-eyes relative flex items-center justify-center gap-[clamp(1.75rem,8vw,2.75rem)]',
        mode === 'blinking' ? 'fetch-splash-eyes--blinking' : '',
        mode === 'awake' ? 'fetch-splash-eyes--awake' : '',
        mode === 'thinking' ? 'fetch-splash-eyes--thinking' : '',
        mode === 'settle' ? 'fetch-splash-eyes--settle' : '',
        mode === 'splashRest' ? 'fetch-splash-eyes--splash-rest' : '',
        className,
      ].join(' ')}
      onAnimationEnd={onAnimEnd}
      aria-hidden
    >
      <div className="fetch-splash-eye">
        <span className="fetch-splash-eye__glow" />
        <span className="fetch-splash-eye__ball" />
        {showSplashIris ? (
          <span className="fetch-splash-eye__iris" aria-hidden>
            <span className={irisDotClass} />
          </span>
        ) : null}
      </div>
      <div className="fetch-splash-eye">
        <span className="fetch-splash-eye__glow" />
        <span className="fetch-splash-eye__ball" />
        {showSplashIris ? (
          <span className="fetch-splash-eye__iris" aria-hidden>
            <span className={irisDotClass} />
          </span>
        ) : null}
      </div>
    </div>
  )
}
