import { useFetchVoice } from '../../voice/FetchVoiceContext'

function VolumeOnGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M11 5L6 9H3v6h3l5 4V5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 8.5c1.33 1.33 2 2.95 2 4.85 0 1.9-.67 3.52-2 4.85"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M18 6c2 2 3 4.2 3 7s-1 5-3 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function VolumeOffGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M11 5L6 9H3v6h3l5 4V5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M22 9l-6 6M16 9l6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Minimal system mute — sound on by default; does not affect map or other audio.
 */
export function VoiceMuteControl() {
  const { muted, toggleMute } = useFetchVoice()

  return (
    <button
      type="button"
      onClick={toggleMute}
      aria-label={muted ? 'Turn voice confirmations on' : 'Turn voice confirmations off'}
      aria-pressed={muted}
      className={[
        'flex h-10 w-10 items-center justify-center rounded-full bg-white/92 text-fetch-charcoal shadow-[0_4px_18px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] backdrop-blur-sm transition-[transform,opacity] duration-200 hover:bg-white hover:shadow-[0_6px_22px_rgba(0,0,0,0.1)] active:scale-95',
        muted ? 'opacity-75' : 'opacity-100',
      ].join(' ')}
    >
      {muted ? (
        <VolumeOffGlyph className="text-fetch-muted" />
      ) : (
        <VolumeOnGlyph className="text-fetch-charcoal/90" />
      )}
    </button>
  )
}
