import { useEffect, useRef, useState } from 'react'
import { FetchSplashEyes } from '../components/FetchSplashEyes'

type SplashScreenProps = {
  onComplete: () => void
}

/**
 * Cold open: eyes blink twice, widen awake, then wordmark — handoff to home + bootstrap.
 */
export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'eyes' | 'waking' | 'logo'>('eyes')
  const doneRef = useRef(false)
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reducedMotion) {
      const t = window.setTimeout(() => {
        if (doneRef.current) return
        doneRef.current = true
        onComplete()
      }, 240)
      return () => window.clearTimeout(t)
    }

    const wakeAt = 1500
    const logoAt = wakeAt + 600
    const a = window.setTimeout(() => setPhase('waking'), wakeAt)
    const b = window.setTimeout(() => setPhase('logo'), logoAt)
    const c = window.setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      onComplete()
    }, 3000)

    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
      window.clearTimeout(c)
    }
  }, [onComplete, reducedMotion])

  return (
    <div
      className="fetch-splash-root fetch-app-shell-bg flex min-h-dvh min-h-[100dvh] w-full flex-col items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading Fetch"
    >
      <div className="relative flex flex-col items-center gap-10">
        <FetchSplashEyes
          mode={phase === 'eyes' ? 'blinking' : 'awake'}
        />

        <div
          className={[
            'fetch-splash-logo text-center text-[clamp(1.85rem,7vw,2.35rem)] font-extrabold tracking-[-0.045em]',
            phase === 'logo' ? 'fetch-splash-logo--visible' : '',
          ].join(' ')}
          aria-hidden
        >
          <span className="fetch-splash-logo__primary">Fetch</span>
          <span className="fetch-splash-logo__secondary"> AI</span>
        </div>
      </div>
    </div>
  )
}
