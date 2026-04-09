/**
 * Icons for home shell nav (bottom bar + peek chrome) and sheet menus.
 * Bottom bar: `active={false}` → lighter fill + stroke where helpful; `active` → fuller fills.
 */

type IconProps = {
  className?: string
  /** Tighter hit areas (nav map chrome): slightly smaller artwork via viewBox crop. */
  tight?: boolean
  /** When false, stroke-only (inactive tab). Default true for headers and map chrome. */
  active?: boolean
}

/** Outline weight tuned for ~20–26px render (reads crisp on mobile). */
const navStroke = 1.75
/** Sheet rows: lighter + rounder (minimal). */
const menuStroke = 1.5

/** Two rounded pill eyes — Fetch orb language. */
export function FetchEyesHomeIcon({ className, tight, active = true }: IconProps) {
  const vb = tight ? '1 5 22 15' : '0 0 24 24'
  if (!active) {
    return (
      <svg className={className} viewBox={vb} fill="none" aria-hidden>
        <rect
          x="2.625"
          y="8.125"
          width="7.75"
          height="7.75"
          rx="3.875"
          fill="currentColor"
          fillOpacity="0.1"
          stroke="currentColor"
          strokeWidth={navStroke}
          strokeLinejoin="round"
        />
        <rect
          x="13.625"
          y="8.125"
          width="7.75"
          height="7.75"
          rx="3.875"
          fill="currentColor"
          fillOpacity="0.1"
          stroke="currentColor"
          strokeWidth={navStroke}
          strokeLinejoin="round"
        />
        <circle cx="6.5" cy="12" r="1.2" fill="currentColor" fillOpacity="0.58" />
        <circle cx="17.5" cy="12" r="1.2" fill="currentColor" fillOpacity="0.58" />
      </svg>
    )
  }
  return (
    <svg
      className={className}
      viewBox={tight ? '1 5 22 15' : '0 0 24 24'}
      fill="none"
      aria-hidden
    >
      <rect x="2" y="7.5" width="9" height="9" rx="4.5" fill="currentColor" />
      <rect x="13" y="7.5" width="9" height="9" rx="4.5" fill="currentColor" />
      <circle cx="6.5" cy="12" r="1.5" fill="currentColor" fillOpacity="0.52" />
      <circle cx="17.5" cy="12" r="1.5" fill="currentColor" fillOpacity="0.52" />
    </svg>
  )
}

/**
 * Same face as {@link FetchEyesHomeIcon}, with looping slow blinks and drifting pupils in
 * `index.css` (`.fetch-marketplace-eyes-intro__*`).
 */
export function FetchEyesMarketplaceIntroIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g className="fetch-marketplace-eyes-intro__blink">
        <rect x="2" y="7.5" width="9" height="9" rx="4.5" fill="currentColor" />
        <rect x="13" y="7.5" width="9" height="9" rx="4.5" fill="currentColor" />
        <g className="fetch-marketplace-eyes-intro__pupils">
          <circle cx="6.5" cy="12" r="1.5" fill="currentColor" fillOpacity="0.52" />
          <circle cx="17.5" cy="12" r="1.5" fill="currentColor" fillOpacity="0.52" />
        </g>
      </g>
    </svg>
  )
}

/** Map pin — teardrop + inner dot. */
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
        d="M12 21.35s-5.85-5.2-5.85-10.65A5.85 5.85 0 1117.85 10.7c0 5.45-5.85 10.65-5.85 10.65z"
      />
      <circle cx="12" cy="10.35" r="2.2" fill="currentColor" fillOpacity="0.48" />
    </svg>
  )
}

/** Upward navigation arrow — maps / directions. */
export function NavShellArrowIcon({ className, tight }: IconProps) {
  return (
    <svg
      className={className}
      viewBox={tight ? '3.5 2.5 17 19' : '0 0 24 24'}
      fill="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 3.75L20.5 18h-6.25v6.25h-4.5V18H3.5L12 3.75z"
      />
    </svg>
  )
}

/** Peer buy ↔ sell — horizontal swap arrows (reads clearly at small sizes). */
export function BuySellNavIconFilled({ className, active = true }: IconProps) {
  if (!active) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M16.25 7.25H8.5M10.75 5l-2.25 2.25L10.75 9.5M7.75 16.75h7.75M13.25 19l2.25-2.25L13.25 14.5"
          stroke="currentColor"
          strokeWidth={navStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="currentColor"
        d="M6.65 7.5L9.35 5.25V6.45H16.9v2.1H9.35V9.75L6.65 7.5z"
      />
      <path
        fill="currentColor"
        fillOpacity="0.68"
        d="M17.35 16.5L14.65 14.85V15.55H7.1v1.9h7.55v0.7L17.35 16.5z"
      />
    </svg>
  )
}

/** Shop / supplies — storefront (awning + facade + door). */
export function MarketplaceNavIconFilled({ className, active = true }: IconProps) {
  if (!active) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4.75 8.85L5.85 6.35h12.3l1.1 2.5H4.75z"
          stroke="currentColor"
          strokeWidth={navStroke}
          strokeLinejoin="round"
        />
        <path
          d="M4.25 8.85h15.5v1.35H4.25V8.85z"
          stroke="currentColor"
          strokeWidth={navStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.5 10.2h13v9.65a1.6 1.6 0 01-1.6 1.6H7.1a1.6 1.6 0 01-1.6-1.6V10.2z"
          stroke="currentColor"
          strokeWidth={navStroke}
          strokeLinejoin="round"
        />
        <path
          d="M9.5 14.1h5v5.35H9.5V14.1z"
          stroke="currentColor"
          strokeWidth={1.55}
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="currentColor"
        d="M5.25 10.2h13.5v9.55a1.65 1.65 0 01-1.65 1.65H6.9a1.65 1.65 0 01-1.65-1.65V10.2z"
      />
      <path fill="currentColor" fillOpacity="0.55" d="M4.75 8.85L5.9 6.2h12.2l1.15 2.65H4.75z" />
      <path fill="currentColor" fillOpacity="0.34" d="M4 8.85h16v1.35H4V8.85z" />
      <path fill="currentColor" fillOpacity="0.5" d="M9.35 13.95h5.3v5.5H9.35v-5.5z" />
    </svg>
  )
}

/** Drops tab — play when inactive; filled tile + plus when active (bottom nav upload affordance). */
export function ReelsNavIconFilled({ className, active = true }: IconProps) {
  const play = 'M7.7 6.2c0-1.08 1.2-1.73 2.18-1.19l6.5 3.66c1.02.57 1.02 2.05 0 2.62l-6.5 3.66c-.98.55-2.18-.1-2.18-1.19V6.2z'
  if (!active) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d={play} fill="currentColor" fillOpacity={0.55} />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        className="fetch-reels-nav-icon__tile"
        x="3.25"
        y="3.25"
        width="17.5"
        height="17.5"
        rx="5.25"
        fill="currentColor"
      />
      <path
        className="fetch-reels-nav-icon__plus"
        fill="#fff"
        d="M11.15 7.85h1.7v3.3h3.35v1.65h-3.35v3.35h-1.7v-3.35H7.8v-1.65h3.35v-3.3z"
      />
    </svg>
  )
}

/** Messages — simple single bubble. */
export function ChatNavIconFilled({ className, active = true }: IconProps) {
  if (!active) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6.5 5.6h11a2.35 2.35 0 012.35 2.35v6.2a2.35 2.35 0 01-2.35 2.35H12l-3.95 3v-3H6.5a2.35 2.35 0 01-2.35-2.35v-6.2A2.35 2.35 0 016.5 5.6z"
          fill="currentColor"
          fillOpacity="0.1"
          stroke="currentColor"
          strokeWidth={navStroke}
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="currentColor"
        d="M6.5 5.6h11a2.35 2.35 0 012.35 2.35v6.2a2.35 2.35 0 01-2.35 2.35H12l-3.95 3v-3H6.5a2.35 2.35 0 01-2.35-2.35v-6.2A2.35 2.35 0 016.5 5.6z"
      />
    </svg>
  )
}

/** Account — head + shoulders arc. */
export function AccountNavIconFilled({ className, active = true }: IconProps) {
  if (!active) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="9" r="3.4" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth={navStroke} />
        <path
          d="M5.25 20.25v-0.4c0-3.05 2.55-5.55 5.85-5.8h1.8c3.3 0.25 5.85 2.75 5.85 5.8v0.4"
          fill="currentColor"
          fillOpacity="0.1"
          stroke="currentColor"
          strokeWidth={navStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="9" r="3.85" fill="currentColor" />
      <path
        fill="currentColor"
        d="M5.15 20.35v-0.45c0-3.2 2.65-5.85 6.1-6.1h3.5c3.45 0.25 6.1 2.9 6.1 6.1v0.45c0 0.5-0.4 0.9-0.9 0.9H6.05a0.9 0.9 0 01-0.9-0.9z"
      />
    </svg>
  )
}

/**
 * Header / sheet menu — three soft pills (full rounding).
 */
export function ShellMenuIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5.5" width="16" height="3" rx="1.5" fill="currentColor" />
      <rect x="4" y="10.5" width="16" height="3" rx="1.5" fill="currentColor" />
      <rect x="4" y="15.5" width="16" height="3" rx="1.5" fill="currentColor" />
    </svg>
  )
}

/** Refresh / sync — two soft arcs (minimal loop). */
export function ShellMenuRefreshIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17.5 8.25A7 7 0 0 0 6 14.25M6.5 15.75A7 7 0 0 1 17.5 9.75"
        stroke="currentColor"
        strokeWidth={menuStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.25 6.5v3.25h-3"
        stroke="currentColor"
        strokeWidth={menuStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.75 17.5v-3.25h3"
        stroke="currentColor"
        strokeWidth={menuStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** New listing — squircle + simple plus. */
export function ShellMenuCreateIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4.75"
        y="4.75"
        width="14.5"
        height="14.5"
        rx="4.75"
        stroke="currentColor"
        strokeWidth={menuStroke}
      />
      <path
        d="M12 8.5v7M8.5 12h7"
        stroke="currentColor"
        strokeWidth={menuStroke}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Your listings — three rounded rows (no bullets). */
export function ShellMenuListingsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="6" width="14" height="3.25" rx="1.625" fill="currentColor" fillOpacity="0.92" />
      <rect x="5" y="10.875" width="14" height="3.25" rx="1.625" fill="currentColor" fillOpacity="0.55" />
      <rect x="5" y="15.75" width="10" height="3.25" rx="1.625" fill="currentColor" fillOpacity="0.35" />
    </svg>
  )
}

/** Payout — super-rounded card + one band. */
export function ShellMenuPayoutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="6.75"
        width="17"
        height="10.5"
        rx="3.5"
        stroke="currentColor"
        strokeWidth={menuStroke}
      />
      <rect x="3.5" y="9.75" width="17" height="2.25" rx="1.125" fill="currentColor" fillOpacity="0.22" />
      <circle cx="8.25" cy="15.35" r="1.35" fill="currentColor" fillOpacity="0.35" />
    </svg>
  )
}

/** Earnings — three soft vertical pills. */
export function ShellMenuEarningsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5.25" y="12" width="3.5" height="6.5" rx="1.75" fill="currentColor" fillOpacity="0.38" />
      <rect x="10.25" y="9" width="3.5" height="9.5" rx="1.75" fill="currentColor" fillOpacity="0.58" />
      <rect x="15.25" y="6.5" width="3.5" height="12" rx="1.75" fill="currentColor" fillOpacity="0.85" />
    </svg>
  )
}

/** Close — short X with round caps. */
export function ShellMenuCloseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.75 8.75l6.5 6.5M15.25 8.75l-6.5 6.5"
        stroke="currentColor"
        strokeWidth={menuStroke}
        strokeLinecap="round"
      />
    </svg>
  )
}
