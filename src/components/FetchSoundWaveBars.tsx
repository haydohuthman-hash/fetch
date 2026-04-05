/**
 * Voice-activity motif — seven tapered capsules (colour from `.fetch-sound-wave-bars__bar`).
 */
const BAR_HEIGHTS = [0.32, 0.48, 0.68, 0.95, 0.68, 0.48, 0.32] as const
const BAR_WIDTHS = [2, 2, 3, 3, 3, 2, 2] as const

export function FetchSoundWaveBars({
  active,
  className = '',
}: {
  active: boolean
  className?: string
}) {
  const maxH = 17
  return (
    <div
      className={[
        'fetch-sound-wave-bars inline-flex h-[20px] items-end justify-center gap-[2px]',
        active ? 'fetch-sound-wave-bars--active' : 'fetch-sound-wave-bars--idle',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="fetch-sound-wave-bars__bar rounded-full"
          style={{
            width: `${BAR_WIDTHS[i]}px`,
            height: `${Math.round(maxH * h)}px`,
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  )
}
