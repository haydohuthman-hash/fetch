import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

const SLIDE_FILL_MIN = 0.8
const SLIDE_FILL_RANGE = 0.2

/** Copy on white fill (dark emerald for contrast). */
const SLIDER_LABEL = '#064e3b'

/** White pill + matching border (reversed from dark fill). */
const SLIDER_FILL = '#ffffff'

const DENSITY = {
  default: { shellPad: 3, trackH: 48, borderW: 2, labelPx: 17, chevronSvgH: 24 },
  compact: { shellPad: 2, trackH: 38, borderW: 2, labelPx: 15, chevronSvgH: 21 },
} as const

export type FetchCommercePillSliderProps = {
  /** Live battle: default. Drops reels: compact (thinner). */
  density?: keyof typeof DENSITY
  mode: 'buy' | 'bid' | 'fetch'
  /** Shown for buy/bid (e.g. "$40"). */
  priceLabel?: string
  /** Fetch mode: primary line (e.g. listing title), truncated with ellipsis. */
  fetchLine?: string
  onConfirm: () => void
}

/** `AUD` immediately before the amount when not already present. */
function withAudPrefix(priceFragment: string): string {
  const s = priceFragment.trim()
  if (!s) return s
  if (/^AUD\s/i.test(s)) return s
  return `AUD ${s}`
}

function buildDisplayLine(mode: FetchCommercePillSliderProps['mode'], priceLabel?: string, fetchLine?: string) {
  const pl = priceLabel?.trim()
  if (mode === 'fetch') {
    const t = fetchLine?.trim()
    if (t) return `Fetch · ${t}`
    if (pl) return `Fetch ${withAudPrefix(pl)}`
    return 'Fetch'
  }
  if (mode === 'bid') return pl ? `Bid ${withAudPrefix(pl)}` : 'Bid'
  return pl ? `Buy ${withAudPrefix(pl)}` : 'Buy'
}

/** Triple chevron: dark emerald strokes on white fill (left two softer). */
function SlideChevronRail({ heightPx }: { heightPx: number }) {
  const w = Math.round(heightPx * 1.92)
  const c1 = 'rgba(6, 78, 59, 0.38)'
  const c2 = 'rgba(6, 78, 59, 0.58)'
  const c3 = 'rgba(6, 78, 59, 0.88)'
  return (
    <svg
      width={w}
      height={heightPx}
      viewBox="0 0 42 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden
    >
      <path
        d="M2.1 7.4L6.2 10 2.1 12.6"
        stroke={c1}
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 6.1L16.4 10 10.2 13.9"
        stroke={c2}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.8 4.7L31.2 10 20.8 15.3"
        stroke={c3}
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function FetchCommercePillSlider({
  density = 'default',
  mode,
  priceLabel,
  fetchLine,
  onConfirm,
}: FetchCommercePillSliderProps) {
  const d = DENSITY[density]
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackW, setTrackW] = useState(0)
  const [p, setP] = useState(0)
  const [sliding, setSliding] = useState(false)
  const [completing, setCompleting] = useState(false)
  const pRef = useRef(0)
  const dragRef = useRef<{ pointerId: number; startClientX: number; startP: number } | null>(null)
  const doneTimerRef = useRef<number>(0)

  const measure = useCallback(() => {
    const tr = trackRef.current
    if (!tr) return
    setTrackW(tr.getBoundingClientRect().width)
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  useEffect(() => {
    pRef.current = p
  }, [p])

  useEffect(() => () => window.clearTimeout(doneTimerRef.current), [])

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (completing) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setSliding(true)
      dragRef.current = { pointerId: e.pointerId, startClientX: e.clientX, startP: pRef.current }
    },
    [completing],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const dr = dragRef.current
      if (!dr || e.pointerId !== dr.pointerId || trackW <= 0 || completing) return
      const span = trackW * SLIDE_FILL_RANGE
      if (span <= 0) return
      const next = Math.max(0, Math.min(1, dr.startP + (e.clientX - dr.startClientX) / span))
      pRef.current = next
      setP(next)
    },
    [trackW, completing],
  )

  const finish = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const dr = dragRef.current
      if (!dr || e.pointerId !== dr.pointerId) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      dragRef.current = null
      setSliding(false)
      if (pRef.current >= 0.97) {
        setCompleting(true)
        pRef.current = 1
        setP(1)
        doneTimerRef.current = window.setTimeout(() => {
          onConfirm()
          setCompleting(false)
          pRef.current = 0
          setP(0)
        }, 220)
      } else {
        pRef.current = 0
        setP(0)
      }
    },
    [onConfirm],
  )

  const displayLine = buildDisplayLine(mode, priceLabel, fetchLine)
  const ariaLabel = displayLine
  const fillFrac = SLIDE_FILL_MIN + SLIDE_FILL_RANGE * p
  const fillPct = fillFrac * 100
  const trans = sliding || completing ? 'none' : 'width 0.22s cubic-bezier(0.25, 0.85, 0.25, 1)'

  return (
    <div
      className="fetch-commerce-pill-shell w-full rounded-full"
      style={{
        padding: d.shellPad,
        borderRadius: 9999,
        border: `${d.borderW}px solid ${SLIDER_FILL}`,
        background: 'transparent',
      }}
    >
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        className={`fetch-commerce-pill-track relative w-full touch-none overflow-hidden ${completing ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{
          height: d.trackH,
          borderRadius: 9999,
          background: 'transparent',
        }}
      >
        <div
          className="fetch-commerce-pill-fill"
          style={{
            width: `${fillPct}%`,
            height: '100%',
            borderRadius: 9999,
            background: SLIDER_FILL,
            transition: trans,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            boxSizing: 'border-box',
            minWidth: 0,
          }}
        >
          <span
            className="fetch-commerce-pill-label flex h-full w-full min-w-0 max-w-full items-center justify-between px-2.5 font-bold"
            style={{ fontSize: d.labelPx, lineHeight: 1.15, color: SLIDER_LABEL }}
          >
            <span className="min-w-0 flex-1 truncate text-left leading-[1.15]">{displayLine}</span>
            <span className="chevrons inline-flex shrink-0 items-center justify-center self-stretch pl-1.5">
              <SlideChevronRail heightPx={d.chevronSvgH} />
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
