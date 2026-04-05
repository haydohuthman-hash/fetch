/**
 * Five-bar assistant / mic motif — bar colour from CSS (`.fetch-sound-wave-bars__bar`).
 */
export function FetchSoundWaveBars({
  active,
  className = '',
}: {
  active: boolean
  className?: string
}) {
  const heights = [0.38, 0.62, 1, 0.62, 0.38] as const
  return (
    <div
      className={[
        'fetch-sound-wave-bars inline-flex h-[18px] items-end justify-center gap-[3px]',
        active ? 'fetch-sound-wave-bars--active' : 'fetch-sound-wave-bars--idle',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className="fetch-sound-wave-bars__bar w-[2.5px] rounded-full"
          style={{
            height: `${Math.round(16 * h)}px`,
            animationDelay: `${i * 0.07}s`,
          }}
        />
      ))}
    </div>
  )
}
