import { useCallback, useEffect, useRef, useState, type AnimationEvent } from 'react'
import { FetchSplashEyes } from '../components/FetchSplashEyes'

type SplashScreenProps = {
  onComplete: () => void
}

type SplashPhase = 'blink' | 'glance' | 'hop'

/**
 * Cold open: eyes blink, pupils glance left/right, then hop off-screen — no wordmark.
 */
export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<SplashPhase>('blink')
  const doneRef = useRef(false)
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onComplete()
  }, [onComplete])

  useEffect(() => {
    if (reducedMotion) {
      const t = window.setTimeout(finish, 220)
      return () => window.clearTimeout(t)
    }

    const blinkMs = 1680
    const hopStartMs = 3120
    const safetyMs = 4500

    const a = window.setTimeout(() => setPhase('glance'), blinkMs)
    const b = window.setTimeout(() => setPhase('hop'), hopStartMs)
    const c = window.setTimeout(finish, safetyMs)

    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
      window.clearTimeout(c)
    }
  }, [finish, reducedMotion])

  const onHopAnimationEnd = useCallback(
    (e: AnimationEvent<HTMLDivElement>) => {
      if (reducedMotion) return
      if (e.animationName !== 'fetch-splash-hop-out') return
      finish()
    },
    [finish, reducedMotion],
  )

  return (
    <div
      className="fetch-splash-root fetch-app-shell-bg flex min-h-dvh min-h-[100dvh] w-full flex-col items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <div
        className={['fetch-splash-stage', phase === 'hop' ? 'fetch-splash-stage--hop-out' : '']
          .filter(Boolean)
          .join(' ')}
        onAnimationEnd={onHopAnimationEnd}
      >
        <FetchSplashEyes
          mode={phase === 'blink' ? 'blinking' : 'splashRest'}
          showSplashIris={phase === 'glance' || phase === 'hop'}
          splashGlanceActive={phase === 'glance' || phase === 'hop'}
        />
      </div>
    </div>
  )
}
