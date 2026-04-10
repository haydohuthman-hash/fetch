import { useCallback, useEffect, useRef } from 'react'
import { FetchSplashEyes } from '../components/FetchSplashEyes'

type SplashScreenProps = {
  onComplete: () => void
}

/**
 * Cold open: dark green field + two white eyes blinking (no logo, glance, or hop).
 */
export default function SplashScreen({ onComplete }: SplashScreenProps) {
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
      const t = window.setTimeout(finish, 280)
      return () => window.clearTimeout(t)
    }
    /** One `fetch-splash-blink` cycle (two blinks) is 1.5s; short beat before handoff. */
    const t = window.setTimeout(finish, 1680)
    return () => window.clearTimeout(t)
  }, [finish, reducedMotion])

  return (
    <div
      className="fetch-splash-root fetch-splash-root--minimal-eyes fetch-app-shell-bg flex min-h-dvh min-h-[100dvh] w-full flex-col items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="fetch-splash-stage fetch-splash-stage--minimal">
        <FetchSplashEyes mode="blinking" />
      </div>
    </div>
  )
}
