/**
 * Filled, rounded icons for home shell nav (bottom bar + peek chrome).
 * Home uses Fetch-style horizontal pill “eyes”; maps, marketplace, and account are solid shapes.
 */

type IconProps = {
  className?: string
  /** Tighter hit areas (nav map chrome): slightly smaller artwork via viewBox crop. */
  tight?: boolean
}

/** Two rounded pill eyes + soft highlights — matches Fetch orb face language. */
export function FetchEyesHomeIcon({ className, tight }: IconProps) {
  return (
    <svg
      className={className}
      viewBox={tight ? '1 5 22 15' : '0 0 24 24'}
      fill="none"
      aria-hidden
    >
      <rect x="2" y="7.5" width="9" height="9" rx="4.5" fill="currentColor" />
      <rect x="13" y="7.5" width="9" height="9" rx="4.5" fill="currentColor" />
      <circle cx="6.5" cy="12" r="1.45" fill="currentColor" fillOpacity="0.38" />
      <circle cx="17.5" cy="12" r="1.45" fill="currentColor" fillOpacity="0.38" />
    </svg>
  )
}

/** Rounded filled map pin — softer than the old sharp folded map. */
export function MapsNavIconFilled({ className, tight }: IconProps) {
  return (
    <svg
      className={className}
      viewBox={tight ? '3 2 18 21' : '0 0 24 24'}
      fill="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 21.25s-5.75-5.1-5.75-10.5A5.75 5.75 0 1117.75 10.75c0 5.4-5.75 10.5-5.75 10.5z"
      />
      <circle cx="12" cy="10.25" r="2.35" fill="currentColor" fillOpacity="0.32" />
    </svg>
  )
}

/** Storefront + awning — marketplace tab. */
export function MarketplaceNavIconFilled({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="currentColor"
        d="M5.25 10.25h13.5v9.5a1.75 1.75 0 01-1.75 1.75H7a1.75 1.75 0 01-1.75-1.75v-9.5z"
      />
      <path
        fill="currentColor"
        fillOpacity="0.35"
        d="M4.5 8.5L6 5.75h12l1.5 2.75H4.5z"
      />
      <path
        fill="currentColor"
        fillOpacity="0.22"
        d="M4 8.5h16v1.75H4V8.5z"
      />
      <rect x="9.25" y="13.5" width="5.5" height="4.25" rx="0.75" fill="currentColor" fillOpacity="0.28" />
    </svg>
  )
}

/** Filled person — round head + rounded “shoulder” body. */
export function AccountNavIconFilled({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.75" r="3.75" fill="currentColor" />
      <path
        fill="currentColor"
        d="M6.5 20.5v-.35c0-3.35 2.55-6.1 5.75-6.35h.5c3.2.25 5.75 3 5.75 6.35v.35c0 .55-.45 1-1 1h-10a1 1 0 01-1-1z"
      />
    </svg>
  )
}
