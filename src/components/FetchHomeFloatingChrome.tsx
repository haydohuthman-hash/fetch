import type { ReactNode } from 'react'
import { useFetchVoice } from '../voice/FetchVoiceContext'
import { VoiceMuteControl } from './FetchHomeStepOne/VoiceMuteControl'

export type AppTab = 'home' | 'activity' | 'notifications' | 'account'

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a5 5 0 00-5 5v3.5L5 18h14l-2-6.5V8a5 5 0 00-5-5zM10 18a2 2 0 004 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 20v-1a5 5 0 015-5h4a5 5 0 015 5v1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

const bubbleBtn =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/95 text-fetch-charcoal shadow-[0_4px_18px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.06] backdrop-blur-sm transition-[transform,box-shadow] duration-200 hover:bg-white hover:shadow-[0_6px_22px_rgba(0,0,0,0.12)] active:scale-95'

type FetchHomeTopBubbleBarProps = {
  tab: AppTab
  onTab: (t: AppTab) => void
  unreadCount: number
}

export function FetchHomeTopBubbleBar({ tab, onTab, unreadCount }: FetchHomeTopBubbleBarProps) {
  const items: { id: AppTab; label: string; icon: ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <HomeIcon /> },
    { id: 'activity', label: 'Activity', icon: <ActivityIcon /> },
    { id: 'notifications', label: 'Alerts', icon: <BellIcon /> },
    { id: 'account', label: 'Account', icon: <UserIcon /> },
  ]

  return (
    <div className="pointer-events-none absolute left-4 right-4 top-[max(0.5rem,env(safe-area-inset-top))] z-[52] flex items-center gap-2">
      <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-2">
        <VoiceMuteControl />
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => onTab(item.id)}
            className={[
              bubbleBtn,
              tab === item.id
                ? 'ring-2 ring-fetch-red/35 shadow-[0_6px_20px_rgba(225,25,45,0.18)]'
                : '',
            ].join(' ')}
          >
            <span className="relative flex items-center justify-center">
              {item.icon}
              {item.id === 'notifications' && unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex min-w-[15px] items-center justify-center rounded-full bg-fetch-red px-0.5 text-[8px] font-bold leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Full-width bottom wash while Fetch voice (TTS) is playing — wave motion via CSS. */
export function FetchSpeechBottomGlow({
  variant = 'standard',
}: {
  /** `void` — dimmer, shorter band for fullscreen assistant (black-void look). */
  variant?: 'standard' | 'void'
}) {
  const { isSpeechPlaying, muted } = useFetchVoice()
  const active = isSpeechPlaying && !muted
  if (!active) return null

  const isVoid = variant === 'void'

  return (
    <div
      className={[
        'pointer-events-none fixed inset-x-0 bottom-0 z-[30] overflow-hidden',
        isVoid
          ? 'h-[min(26vh,200px)] opacity-[0.18]'
          : 'h-[min(52vh,460px)]',
      ].join(' ')}
      aria-hidden
    >
      <div className="fetch-fetch-speech-glow-wave-a absolute inset-0" />
      <div className="fetch-fetch-speech-glow-wave-b absolute inset-0" />
      <div
        className={[
          'fetch-fetch-speech-glow-wave-c absolute inset-0',
          isVoid ? 'opacity-40' : 'opacity-80',
        ].join(' ')}
      />
    </div>
  )
}
