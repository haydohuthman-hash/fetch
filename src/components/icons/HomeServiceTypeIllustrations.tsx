import { useId } from 'react'
import type { BookingJobType } from '../../lib/assistant/types'
import homeMovingTruck from '../../assets/icons/home-moving-truck.png'
import junkRemovalScene from '../../assets/icons/junk-removal.png'
import deliveryPickupScene from '../../assets/icons/delivery-pickup.png'

export type HomeServiceIllustrationProps = {
  jobType: BookingJobType
  className?: string
}

function useSvgIds() {
  const raw = useId().replace(/:/g, '')
  return (name: string) => `hsi-${raw}-${name}`
}

/** Service marks: vector illustrations where specified; PNGs for moving, junk, delivery. */
export function HomeServiceTypeIllustration({
  jobType,
  className,
}: HomeServiceIllustrationProps) {
  const id = useSvgIds()

  const common = {
    viewBox: '0 0 24 24' as const,
    xmlns: 'http://www.w3.org/2000/svg' as const,
    className,
    'aria-hidden': true as const,
  }

  /** Minimal lift — service tiles are flat; icons stay readable without heavy drop shadow. */
  const shadowFilter = (
    <filter
      id={id('shadow')}
      x="-20%"
      y="-20%"
      width="140%"
      height="140%"
      colorInterpolationFilters="sRGB"
    >
      <feDropShadow
        dx="0"
        dy="0.35"
        stdDeviation="0.2"
        floodColor="#0f172a"
        floodOpacity="0.07"
      />
    </filter>
  )

  switch (jobType) {
    case 'homeMoving':
      return (
        <img
          src={homeMovingTruck}
          alt=""
          width={54}
          height={54}
          draggable={false}
          className={[
            'shrink-0 bg-transparent object-contain object-center select-none',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        />
      )

    case 'junkRemoval':
      return (
        <img
          src={junkRemovalScene}
          alt=""
          width={54}
          height={54}
          draggable={false}
          className={[
            'shrink-0 bg-transparent object-contain object-center select-none',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        />
      )

    case 'deliveryPickup':
      return (
        <img
          src={deliveryPickupScene}
          alt=""
          width={54}
          height={54}
          draggable={false}
          className={[
            'shrink-0 bg-transparent object-contain object-center select-none',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        />
      )

    case 'helper':
      return (
        <svg {...common}>
          <defs>
            {shadowFilter}
            <radialGradient id={id('hp-skin')} cx="38%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#ffedd5" />
              <stop offset="70%" stopColor="#fdba74" />
              <stop offset="100%" stopColor="#ea580c" stopOpacity="0.35" />
            </radialGradient>
            <linearGradient id={id('hp-vest')} x1="12%" y1="0%" x2="88%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </linearGradient>
            <linearGradient id={id('hp-hat')} x1="30%" y1="0%" x2="70%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
            <linearGradient id={id('hp-wrench')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="40%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
          </defs>
          <g filter={`url(#${id('shadow')})`}>
            <path
              d="M8.1 20.9v-6.95c0-1.05.85-1.9 1.9-1.9h3.95c1.05 0 1.9.85 1.9 1.9v6.95"
              fill={`url(#${id('hp-vest')})`}
            />
            <path d="M9.85 12.05h4.35v1.9H9.85V12.05Z" fill="#172554" opacity="0.45" />
            <path d="M10.3 20.9v-4.55h3.35v4.55" fill="#1e40af" opacity="0.55" />
            <path
              d="M8.1 14.85c-.85 0-1.55.7-1.55 1.55v2.95"
              stroke="#fdba74"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M15.9 14.85c.85 0 1.55.7 1.55 1.55v1.15"
              stroke="#fdba74"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="12" cy="9.35" r="3.08" fill={`url(#${id('hp-skin')})`} stroke="#c2410c" strokeWidth="0.2" opacity="0.4" />
            <ellipse cx="10.55" cy="8.35" rx="0.95" ry="0.55" fill="#ffffff" opacity="0.22" />
            <circle cx="10.62" cy="9.42" r="0.4" fill="#1e293b" />
            <circle cx="13.38" cy="9.42" r="0.4" fill="#1e293b" />
            <circle cx="10.78" cy="9.28" r="0.12" fill="#f8fafc" opacity="0.65" />
            <circle cx="13.52" cy="9.28" r="0.12" fill="#f8fafc" opacity="0.65" />
            <path
              d="M10.82 10.68c.55.48 1.28.48 1.85 0"
              stroke="#9a3412"
              strokeWidth="0.38"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M7.82 8.38c0-1.65 1.35-3 3-3h2.32c1.65 0 3 1.35 3 3v0.62H7.82V8.38Z"
              fill={`url(#${id('hp-hat')})`}
              stroke="#a16207"
              strokeWidth="0.28"
            />
            <path d="M7.32 8.98h9.35" stroke="#ca8a04" strokeWidth="0.82" strokeLinecap="round" />
            <ellipse cx="12" cy="6.32" rx="2.88" ry="1.18" fill="#fde047" stroke="#d97706" strokeWidth="0.22" />
            <g transform="translate(15.15 12.45) rotate(32)">
              <rect x="-0.35" y="-0.42" width="4.95" height="0.88" rx="0.2" fill={`url(#${id('hp-wrench')})`} stroke="#64748b" strokeWidth="0.18" />
              <path
                d="M4.6-0.42h1.38c.46 0 .84.38.84.84v1.72c0 .46-.38.84-.84.84H4.6V-.42Z"
                fill="#64748b"
                stroke="#334155"
                strokeWidth="0.18"
              />
              <circle cx="5.52" cy="0.98" r="0.38" fill="#1e293b" />
              <ellipse cx="5.35" cy="0.82" rx="0.15" ry="0.08" fill="#f8fafc" opacity="0.35" />
            </g>
          </g>
        </svg>
      )

    case 'cleaning':
      return (
        <svg {...common}>
          <defs>
            {shadowFilter}
            <linearGradient id={id('cl-bottle')} x1="20%" y1="0%" x2="82%" y2="100%">
              <stop offset="0%" stopColor="#99f6e4" />
              <stop offset="45%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#0f766e" />
            </linearGradient>
            <linearGradient id={id('cl-liquid')} x1="50%" y1="100%" x2="50%" y2="0%">
              <stop offset="0%" stopColor="#0d9488" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#5eead4" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id={id('cl-nozzle')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
            <linearGradient id={id('cl-sponge')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="55%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
          </defs>
          <g filter={`url(#${id('shadow')})`}>
            <path
              d="M15.85 5.35h2.1c.38 0 .7.32.7.7v1.05c0 .38-.32.7-.7.7h-2.1V5.35Z"
              fill={`url(#${id('cl-nozzle')})`}
              stroke="#475569"
              strokeWidth="0.22"
            />
            <path
              d="M14.95 7.8h3.9c.32 0 .58.26.58.58v0.52h-5.06V8.38c0-.32.26-.58.58-.58Z"
              fill="#94a3b8"
              stroke="#64748b"
              strokeWidth="0.2"
            />
            <path
              d="M8.95 9.85h7.1c.55 0 1 .45 1 1v7.35c0 1.1-.9 2-2 2h-5.1c-1.1 0-2-.9-2-2v-7.35c0-.55.45-1 1-1Z"
              fill={`url(#${id('cl-bottle')})`}
              stroke="#0f766e"
              strokeWidth="0.35"
              strokeLinejoin="round"
            />
            <path
              d="M9.55 12.05h5.9c.28 0 .5.22.5.5v4.85c0 .66-.54 1.2-1.2 1.2h-4.5c-.66 0-1.2-.54-1.2-1.2v-4.85c0-.28.22-.5.5-.5Z"
              fill={`url(#${id('cl-liquid')})`}
            />
            <path
              d="M7.35 11.2c0-.42.34-.76.76-.76h.42v1.52h-.42c-.42 0-.76-.34-.76-.76Z"
              fill="#cbd5e1"
              stroke="#64748b"
              strokeWidth="0.18"
            />
            <path d="M10.35 8.45h4.3" stroke="#ffffff" strokeWidth="0.35" strokeLinecap="round" opacity="0.35" />
            <circle cx="17.35" cy="6.25" r="0.85" fill="#ccfbf1" stroke="#14b8a6" strokeWidth="0.18" />
            <circle cx="18.65" cy="7.85" r="0.55" fill="#ecfeff" stroke="#2dd4bf" strokeWidth="0.15" opacity="0.95" />
            <circle cx="17.05" cy="8.35" r="0.38" fill="#f0fdfa" stroke="#5eead4" strokeWidth="0.12" />
            <path
              d="M4.15 15.95l1.35-3.85c.12-.35.45-.58.82-.58h0c.5 0 .88.45.82.95l-.55 3.48h-2.44Z"
              fill={`url(#${id('cl-sponge')})`}
              stroke="#a16207"
              strokeWidth="0.28"
              strokeLinejoin="round"
            />
            <path d="M4.55 14.85h1.85M4.85 13.55h1.45" stroke="#854d0e" strokeWidth="0.18" opacity="0.45" />
            <path
              d="M5.05 16.45h.85v2.15c0 .32-.26.58-.58.58h0c-.32 0-.58-.26-.58-.58v-1.55c0-.32.26-.58.58-.58Z"
              fill="#ca8a04"
              stroke="#a16207"
              strokeWidth="0.15"
            />
          </g>
        </svg>
      )

    case 'heavyItem':
      return (
        <svg {...common}>
          <defs>
            {shadowFilter}
            <linearGradient id={id('hv-bar')} x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="45%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
            <linearGradient id={id('hv-plate-out')} x1="22%" y1="18%" x2="78%" y2="82%">
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="55%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>
            <linearGradient id={id('hv-plate-in')} x1="35%" y1="25%" x2="65%" y2="75%">
              <stop offset="0%" stopColor="#52525b" />
              <stop offset="100%" stopColor="#18181b" />
            </linearGradient>
            <linearGradient id={id('hv-wood-f')} x1="15%" y1="0%" x2="85%" y2="100%">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="50%" stopColor="#92400e" />
              <stop offset="100%" stopColor="#451a03" />
            </linearGradient>
            <linearGradient id={id('hv-wood-grain')} x1="0" y1="0.5" x2="1" y2="0.5">
              <stop offset="0%" stopColor="#78350f" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#78350f" stopOpacity="0" />
              <stop offset="100%" stopColor="#451a03" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <g filter={`url(#${id('shadow')})`}>
            <path
              d="M4.25 19.38V12.82l3.68-2.18 3.68 2.18v6.56H4.25Z"
              fill={`url(#${id('hv-wood-f')})`}
              stroke="#3f2a1d"
              strokeWidth="0.32"
              strokeLinejoin="round"
            />
            <path d="M4.25 14.88 7.93 12.68l3.68 2.2M7.93 12.68v6.7" stroke="#451a03" strokeWidth="0.28" opacity="0.5" />
            <path d="M7.93 19.38V16.05l3.68-2.08" stroke="#451a03" strokeWidth="0.28" opacity="0.5" />
            <rect x="5.55" y="14.95" width="4.75" height="3.65" fill={`url(#${id('hv-wood-grain')})`} opacity="0.35" />
            <path d="M5.58 16.52h4.7M5.58 17.92h4.7" stroke="#78350f" strokeWidth="0.22" opacity="0.55" />
            <rect x="1.65" y="7.82" width="20.7" height="1.38" rx="0.38" fill={`url(#${id('hv-bar')})`} stroke="#475569" strokeWidth="0.28" />
            <path
              d="M2.35 8.05h18.3"
              stroke="#ffffff"
              strokeWidth="0.22"
              strokeLinecap="round"
              strokeDasharray="0.35 0.55"
              opacity="0.25"
            />
            <rect x="1.28" y="5.58" width="1.38" height="5.92" rx="0.26" fill="#27272a" stroke="#0f172a" strokeWidth="0.22" />
            <circle cx="3.82" cy="8.52" r="2.48" fill={`url(#${id('hv-plate-out')})`} stroke="#020617" strokeWidth="0.32" />
            <circle cx="3.82" cy="8.52" r="1.48" fill={`url(#${id('hv-plate-in')})`} stroke="#3f3f46" strokeWidth="0.22" />
            <circle cx="3.82" cy="8.52" r="0.58" fill="#52525b" stroke="#71717a" strokeWidth="0.12" />
            <rect x="21.34" y="5.58" width="1.38" height="5.92" rx="0.26" fill="#27272a" stroke="#0f172a" strokeWidth="0.22" />
            <circle cx="20.18" cy="8.52" r="2.48" fill={`url(#${id('hv-plate-out')})`} stroke="#020617" strokeWidth="0.32" />
            <circle cx="20.18" cy="8.52" r="1.48" fill={`url(#${id('hv-plate-in')})`} stroke="#3f3f46" strokeWidth="0.22" />
            <circle cx="20.18" cy="8.52" r="0.58" fill="#52525b" stroke="#71717a" strokeWidth="0.12" />
          </g>
        </svg>
      )

    default:
      return null
  }
}
