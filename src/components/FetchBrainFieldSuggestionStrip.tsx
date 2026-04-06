import type { CSSProperties } from 'react'

export type BrainFieldQuickSuggestion = {
  id: string
  title: string
  subtitle?: string
  message: string
}

export type FetchBrainFieldSuggestionStripProps = {
  theme: 'light' | 'dark'
  glowRgb: { r: number; g: number; b: number }
  suggestions: readonly BrainFieldQuickSuggestion[]
  onPick: (message: string) => void
}

export function FetchBrainFieldSuggestionStrip({
  theme,
  glowRgb,
  suggestions,
  onPick,
}: FetchBrainFieldSuggestionStripProps) {
  const isLight = theme === 'light'
  if (suggestions.length === 0) return null

  return (
    <div
      className="fetch-brain-field-suggestions pointer-events-auto w-full px-2 pb-1 pt-0.5"
      style={{ '--brain-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}` } as CSSProperties}
    >
      <p
        className={[
          'mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.18em]',
          isLight ? 'text-neutral-500' : 'text-white/45',
        ].join(' ')}
      >
        Suggestions
      </p>
      <div
        className="fetch-brain-field-suggestions__track flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
      >
        {suggestions.map((s, index) => {
          const isPrimary = index === 0
          return (
            <button
              key={s.id}
              type="button"
              role="listitem"
              onClick={() => onPick(s.message)}
              className={[
                'flex min-w-[6.75rem] max-w-[9.5rem] shrink-0 snap-start snap-always flex-col rounded-2xl border px-2.5 py-2 text-left ring-2 motion-safe:transition-transform motion-safe:active:scale-[0.97]',
                isPrimary
                  ? 'ring-[rgba(var(--brain-glow),0.55)]'
                  : isLight
                    ? 'ring-transparent'
                    : 'ring-transparent',
                isLight
                  ? 'border-black/[0.08] bg-white/[0.5] shadow-sm'
                  : 'border-white/[0.1] bg-white/[0.07] shadow-[0_4px_16px_rgba(0,0,0,0.2)]',
              ].join(' ')}
            >
              <span
                className={[
                  'text-[12px] font-semibold leading-tight tracking-[-0.02em]',
                  isLight ? 'text-neutral-900' : 'text-white/[0.94]',
                ].join(' ')}
              >
                {s.title}
              </span>
              {s.subtitle ? (
                <span
                  className={[
                    'mt-0.5 line-clamp-2 text-[10px] font-medium leading-snug',
                    isLight ? 'text-neutral-500' : 'text-white/48',
                  ].join(' ')}
                >
                  {s.subtitle}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
