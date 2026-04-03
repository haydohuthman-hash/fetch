import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'

type Rgb = { r: number; g: number; b: number }

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function getReducedMotionSnapshot() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getReducedMotionServerSnapshot() {
  return false
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  )
}

export function FetchMindHowItWorksOverlay({
  accentRgb,
  onDismiss,
  autoDismissMs = 3400,
  layout = 'inline',
}: {
  accentRgb: Rgb
  onDismiss: () => void
  autoDismissMs?: number
  /** `inline` — under face in FetchAIView flex column. `modal` — centered card (e.g. Home map). */
  layout?: 'inline' | 'modal'
}) {
  const gradId = `fetch-mind-route-grad-${useId().replace(/:/g, '')}`
  const reducedMotion = usePrefersReducedMotion()
  const dismissBtnRef = useRef<HTMLButtonElement>(null)
  const onDismissStable = useCallback(() => {
    onDismiss()
  }, [onDismiss])

  useEffect(() => {
    dismissBtnRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismissStable()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismissStable])

  useEffect(() => {
    if (autoDismissMs <= 0) return
    const t = window.setTimeout(onDismissStable, autoDismissMs)
    return () => window.clearTimeout(t)
  }, [autoDismissMs, onDismissStable])

  const { r, g, b } = accentRgb
  const accent = `rgb(${r},${g},${b})`
  const accentSoft = `rgba(${r},${g},${b},0.35)`
  const accentGlow = `rgba(${r},${g},${b},0.22)`

  const rootClass =
    layout === 'modal'
      ? 'fetch-mind-tour fetch-mind-tour--modal relative flex w-full max-w-md shrink-0 flex-col px-1'
      : 'fetch-mind-tour relative mt-1 flex min-h-0 min-h-[12rem] w-full max-w-md flex-1 flex-col px-1'

  return (
    <div
      className={[rootClass, reducedMotion ? 'fetch-mind-tour--reduced' : ''].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fetch-mind-tour-title"
    >
      <div
        className={[
          'fetch-mind-tour__frame relative flex min-h-[11.5rem] flex-col overflow-hidden rounded-[1.35rem] border border-white/[0.07] bg-black/25 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-[10px]',
          layout === 'inline' ? 'flex-1' : '',
        ].join(' ')}
        style={
          {
            boxShadow: `0 0 48px ${accentGlow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
          } as CSSProperties
        }
      >
        <div className="fetch-mind-tour__grid pointer-events-none absolute inset-0 opacity-[0.14]" aria-hidden />
        <div className="relative flex flex-1 flex-col justify-center px-3 py-3">
          <p
            id="fetch-mind-tour-title"
            className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/45"
          >
            Inside the network
          </p>
          <div className="relative mx-auto w-full max-w-[280px]">
            <svg
              className="fetch-mind-tour__svg block w-full overflow-visible"
              viewBox="0 0 320 168"
              aria-hidden
            >
              <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={accent} stopOpacity="0.2" />
                  <stop offset="50%" stopColor={accent} stopOpacity="0.95" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0.25" />
                </linearGradient>
              </defs>
              <path
                id="fetch-mind-route-path"
                d="M 72 118 Q 160 44 248 118"
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth="3"
                strokeLinecap="round"
                className="fetch-mind-tour__route"
              />
              <g className="fetch-mind-tour__pin fetch-mind-tour__pin--a">
                <line x1="72" y1="118" x2="72" y2="100" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="72" cy="96" r="9" fill={accent} opacity="0.95" />
                <circle cx="72" cy="96" r="3.5" fill="#fff" opacity="0.9" />
              </g>
              <g className="fetch-mind-tour__pin fetch-mind-tour__pin--b">
                <line x1="248" y1="118" x2="248" y2="100" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="248" cy="96" r="9" fill={accent} opacity="0.95" />
                <circle cx="248" cy="96" r="3.5" fill="#fff" opacity="0.9" />
              </g>
              <circle r="5" fill={accent} className="fetch-mind-tour__runner">
                <animateMotion
                  dur={reducedMotion ? '0.01s' : '2.4s'}
                  repeatCount={reducedMotion ? '1' : 'indefinite'}
                  begin={reducedMotion ? '0s' : '0.95s'}
                  path="M 72 118 Q 160 44 248 118"
                  rotate="auto"
                />
              </circle>
              <g transform="translate(72, 128)" className="fetch-mind-tour__label fetch-mind-tour__label--a">
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.88)"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  Pickup
                </text>
              </g>
              <g transform="translate(248, 128)" className="fetch-mind-tour__label fetch-mind-tour__label--b">
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.88)"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  Delivery
                </text>
              </g>
            </svg>
          </div>
          <p className="mt-2 text-center text-[11px] font-medium leading-snug text-white/50">
            Pins lock addresses · route connects · a driver completes the run
          </p>
        </div>
      </div>
      <button
        ref={dismissBtnRef}
        type="button"
        onClick={onDismissStable}
        className="mt-3 w-full rounded-2xl border border-white/[0.12] bg-white/[0.07] py-2.5 text-[13px] font-semibold text-white/90 backdrop-blur-sm transition-transform active:scale-[0.98]"
        style={{ boxShadow: `0 0 20px ${accentSoft}` }}
      >
        Got it
      </button>
    </div>
  )
}
