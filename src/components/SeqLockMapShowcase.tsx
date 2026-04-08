import { useEffect, useId, useMemo, useState } from 'react'

const PHASES = [
  { title: 'Matching a crew near you…', sub: 'Live in SEQ today' },
  { title: 'Driver found', sub: 'Crew is getting ready' },
  { title: 'On the way to pickup', sub: 'ETA under 60 min in pilot zones' },
  { title: 'En route — almost there', sub: 'You’ll see live tracking here' },
  { title: 'Delivered', sub: "That's the Fetch on-demand flow" },
] as const

type SeqLockMapShowcaseProps = {
  /** Match home map shell light/dark */
  variant: 'light' | 'dark'
  className?: string
}

/**
 * Immersive faux-map hero for region-locked home: animated route, pins, and status storyboard.
 */
export function SeqLockMapShowcase({ variant, className = '' }: SeqLockMapShowcaseProps) {
  const uid = useId().replace(/:/g, '')
  const gradId = `seq-route-grad-${uid}`
  const glowId = `seq-glow-${uid}`
  const [phase, setPhase] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const ro = () => setReduceMotion(!!mq?.matches)
    ro()
    mq?.addEventListener('change', ro)
    return () => mq?.removeEventListener('change', ro)
  }, [])

  useEffect(() => {
    if (reduceMotion) return
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % PHASES.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [reduceMotion])

  const pathD = useMemo(
    () =>
      'M 72 218 C 120 200, 140 120, 200 108 S 300 88, 328 72',
    [],
  )

  const isDark = variant === 'dark'

  return (
    <div
      className={[
        'pointer-events-none absolute inset-0 z-[18] flex flex-col overflow-hidden',
        isDark ? 'bg-[#0c1018]' : 'bg-gradient-to-b from-sky-100/95 via-slate-50 to-emerald-50/90',
        className,
      ].join(' ')}
      aria-hidden
    >
      {/* Soft map texture */}
      <div
        className={['absolute inset-[-8%]', isDark ? 'opacity-40' : 'opacity-70'].join(' ')}
        style={{
          backgroundImage: isDark
            ? `repeating-linear-gradient(90deg, transparent, transparent 38px, rgba(255,255,255,0.03) 38px, rgba(255,255,255,0.03) 39px),
               repeating-linear-gradient(0deg, transparent, transparent 34px, rgba(0,0,0,0.2) 34px, rgba(0,0,0,0.2) 35px)`
            : `repeating-linear-gradient(90deg, transparent, transparent 38px, rgba(255,255,255,0.65) 38px, rgba(255,255,255,0.65) 39px),
               repeating-linear-gradient(0deg, transparent, transparent 34px, rgba(14,116,144,0.04) 34px, rgba(14,116,144,0.04) 35px)`,
        }}
      />

      <svg
        className="absolute inset-0 h-full w-full min-h-[200px]"
        viewBox="0 0 400 280"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={isDark ? '#22d3ee' : '#0891b2'} stopOpacity="0.95" />
            <stop offset="100%" stopColor={isDark ? '#a78bfa' : '#7c3aed'} stopOpacity="0.95" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base route (dim) */}
        <path
          d={pathD}
          fill="none"
          stroke={isDark ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.45)'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Animated draw */}
        <path
          className={reduceMotion ? '' : 'fetch-seq-showcase-route-draw'}
          d={pathD}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          pathLength={1}
        />

        {/* Pickup pin A */}
        <g transform="translate(72,218)">
          <circle r="14" fill={isDark ? 'rgba(34,211,238,0.2)' : 'rgba(8,145,178,0.2)'} className="fetch-seq-showcase-pin-pulse" />
          <circle r="8" fill={isDark ? '#22d3ee' : '#0891b2'} stroke={isDark ? '#fff' : '#fff'} strokeWidth="2" />
          <text x="0" y="4" textAnchor="middle" fill="#fff" style={{ fontSize: '9px', fontWeight: 700 }}>
            A
          </text>
        </g>

        {/* Dropoff pin B */}
        <g transform="translate(328,72)">
          <circle r="14" fill={isDark ? 'rgba(167,139,250,0.2)' : 'rgba(124,58,237,0.2)'} className="fetch-seq-showcase-pin-pulse fetch-seq-showcase-pin-pulse--delay" />
          <circle r="8" fill={isDark ? '#a78bfa' : '#7c3aed'} stroke="#fff" strokeWidth="2" />
          <text x="0" y="4" textAnchor="middle" fill="#fff" style={{ fontSize: '9px', fontWeight: 700 }}>
            B
          </text>
        </g>

        {/* Vehicle along path — SMIL motion */}
        {!reduceMotion ? (
          <circle
            r="6"
            fill={isDark ? '#fbbf24' : '#f59e0b'}
            stroke="#fff"
            strokeWidth="2"
            filter={`url(#${glowId})`}
          >
            <animateMotion dur="10s" repeatCount="indefinite" path={pathD} rotate="auto" />
          </circle>
        ) : (
          <circle cx="200" cy="108" r="6" fill={isDark ? '#fbbf24' : '#f59e0b'} stroke="#fff" strokeWidth="2" />
        )}
      </svg>

      {/* Vignette + status card */}
      <div
        className={[
          'pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent',
          isDark ? 'to-[#0c1018]/90' : 'to-white/75',
        ].join(' ')}
      />
      <div className="pointer-events-none absolute bottom-[14%] left-0 right-0 flex justify-center px-4">
        <div
          className={[
            'max-w-[min(100%,20rem)] rounded-2xl border px-4 py-3 text-center shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-md transition-opacity duration-500',
            isDark
              ? 'border-white/10 bg-zinc-900/75 text-white'
              : 'border-white/80 bg-white/90 text-zinc-900',
          ].join(' ')}
          key={phase}
          style={
            reduceMotion
              ? undefined
              : { animation: 'fetch-seq-showcase-card-in 0.45s ease-out' }
          }
        >
          <p className="text-[15px] font-semibold leading-snug tracking-tight">{PHASES[phase]!.title}</p>
          <p className={['mt-1 text-[11px] font-medium leading-snug', isDark ? 'text-zinc-400' : 'text-zinc-500'].join(' ')}>
            {PHASES[phase]!.sub}
          </p>
        </div>
      </div>
    </div>
  )
}
