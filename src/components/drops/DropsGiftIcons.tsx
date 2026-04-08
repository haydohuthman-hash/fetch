import type { DropGiftPanelId } from '../../lib/drops/boostStore'

/** Filled present for the Drops rail (reads like TikTok / live gifting). */
export function GiftRailIconFilled({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#e11d48"
        d="M4.5 10.5h15v9.75A1.75 1.75 0 0 1 17.75 22H6.25A1.75 1.75 0 0 1 4.5 20.25V10.5z"
      />
      <path fill="#fbbf24" d="M4.5 10.5V8.75A1.75 1.75 0 0 1 6.25 7h3.1c.95 0 1.8.48 2.3 1.25L12 10.5l.35-2.25c.5-.77 1.35-1.25 2.3-1.25h3.1A1.75 1.75 0 0 1 19.5 8.75V10.5H4.5z" />
      <path fill="#fde68a" d="M11 10.5h2V22h-2z" />
      <path fill="#fb7185" d="M12 4.25c-.85 0-1.55.7-1.55 1.55 0 .55.3 1.05.75 1.35-.45.25-.75.7-.75 1.2h3.1c0-.5-.3-.95-.75-1.2.45-.3.75-.8.75-1.35 0-.85-.7-1.55-1.55-1.55z" />
      <ellipse cx="9.35" cy="5.35" rx="1.35" ry="1.1" fill="#f472b6" transform="rotate(-28 9.35 5.35)" />
      <ellipse cx="14.65" cy="5.35" rx="1.35" ry="1.1" fill="#f472b6" transform="rotate(28 14.65 5.35)" />
    </svg>
  )
}

const panelSize = { width: 52, height: 52 }

function RoseArt() {
  return (
    <svg {...panelSize} viewBox="0 0 52 52" aria-hidden>
      <path fill="#15803d" d="M24 28v14h4V28l-2-4-2 4z" />
      <circle cx="26" cy="18" r="10" fill="#fb7185" />
      <circle cx="20" cy="16" r="5.5" fill="#f43f5e" />
      <circle cx="32" cy="16" r="5.5" fill="#f43f5e" />
      <circle cx="26" cy="12" r="5" fill="#fda4af" />
    </svg>
  )
}

function HeartsArt() {
  return (
    <svg {...panelSize} viewBox="0 0 52 52" aria-hidden>
      <path
        fill="#f472b6"
        transform="translate(4 8) scale(0.78)"
        d="M16 22c0-3.5 2.8-5.5 5.5-5.5 1.4 0 2.7.55 3.5 1.45.8-.9 2.1-1.45 3.5-1.45 2.7 0 5.5 2 5.5 5.5 0 6.2-9 12-9 12S16 28.2 16 22z"
      />
      <path
        fill="#ec4899"
        transform="translate(18 4) scale(0.92)"
        d="M16 22c0-3.5 2.8-5.5 5.5-5.5 1.4 0 2.7.55 3.5 1.45.8-.9 2.1-1.45 3.5-1.45 2.7 0 5.5 2 5.5 5.5 0 6.2-9 12-9 12S16 28.2 16 22z"
      />
    </svg>
  )
}

function ClapArt() {
  return (
    <svg {...panelSize} viewBox="0 0 52 52" aria-hidden>
      <path fill="#facc15" d="M8 30l6-14 4 2-5 14-5-2z" opacity="0.95" />
      <path fill="#eab308" d="M14 32l8-16 4 2-7 16-5-2z" />
      <path fill="#fde047" d="M22 34l9-17 3.5 2.2L26 36l-4-2z" />
      <rect x="10" y="38" width="32" height="4" rx="1.2" fill="#ca8a04" />
    </svg>
  )
}

function FireworksArt() {
  return (
    <svg {...panelSize} viewBox="0 0 52 52" fill="none" aria-hidden>
      <circle cx="26" cy="26" r="3" fill="#fef08a" />
      <path stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" d="M26 10v8M26 34v8M10 26h8M34 26h8" />
      <path stroke="#a855f7" strokeWidth="2" strokeLinecap="round" d="M14 14l6 6M32 32l6 6M38 14l-6 6M14 38l6-6" />
      <circle cx="26" cy="12" r="2" fill="#38bdf8" />
      <circle cx="40" cy="26" r="2" fill="#f472b6" />
      <circle cx="26" cy="40" r="2" fill="#4ade80" />
      <circle cx="12" cy="26" r="2" fill="#facc15" />
    </svg>
  )
}

function RocketArt() {
  return (
    <svg {...panelSize} viewBox="0 0 52 52" aria-hidden>
      <path fill="#ef4444" d="M26 6L14 32h10l2-8 2 8h10L26 6z" />
      <path fill="#fecaca" d="M26 14l-4 14h8L26 14z" />
      <circle cx="26" cy="22" r="3.5" fill="#38bdf8" />
      <path fill="#fb923c" d="M18 34l-6 12 8-8 2-4h-4zM34 34l6 12-8-8-2-4h4z" />
    </svg>
  )
}

function CrownArt() {
  return (
    <svg {...panelSize} viewBox="0 0 52 52" aria-hidden>
      <path
        fill="#eab308"
        d="M8 38V22l6 5 6-10 6 10 6-5v16H8zm4-4h28v4H12v-4z"
      />
      <circle cx="14" cy="20" r="2.5" fill="#fef08a" />
      <circle cx="26" cy="14" r="2.5" fill="#fef08a" />
      <circle cx="38" cy="20" r="2.5" fill="#fef08a" />
      <path fill="#facc15" d="M12 34h28v2H12v-2z" />
    </svg>
  )
}

export function DropGiftPanelArt({ id, className }: { id: DropGiftPanelId; className?: string }) {
  const inner =
    id === 'rose' ? <RoseArt />
    : id === 'hearts' ? <HeartsArt />
    : id === 'clap' ? <ClapArt />
    : id === 'fireworks' ? <FireworksArt />
    : id === 'rocket' ? <RocketArt />
    : <CrownArt />
  return (
    <span className={['inline-flex items-center justify-center', className].filter(Boolean).join(' ')}>
      {inner}
    </span>
  )
}
