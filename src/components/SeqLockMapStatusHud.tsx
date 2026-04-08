/**
 * Thin status line over the home map during SEQ region-lock demo (real Google map).
 */
export type SeqLockMapStatusHudProps = {
  line: string
  variant: 'light' | 'dark'
  className?: string
}

export function SeqLockMapStatusHud({
  line,
  variant,
  className = '',
}: SeqLockMapStatusHudProps) {
  const isLight = variant === 'light'
  return (
    <div
      className={[
        'pointer-events-none absolute inset-x-0 bottom-3 z-[16] flex justify-center px-3',
        className,
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      <p
        className={[
          'max-w-[min(100%,20rem)] truncate rounded-full border px-3.5 py-1.5 text-center text-[11px] font-semibold shadow-md backdrop-blur-md',
          isLight
            ? 'border-zinc-200/90 bg-white/92 text-zinc-800 shadow-zinc-900/10'
            : 'border-white/20 bg-black/50 text-white/95',
        ].join(' ')}
      >
        {line}
      </p>
    </div>
  )
}
