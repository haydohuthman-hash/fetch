import type { CSSProperties } from 'react'
import type { BrainFieldPlaceCard } from '../lib/mapsExplorePlaces'
import { formatDistanceLabel } from '../lib/mapsExplorePlaces'

export type FetchBrainFieldPanelProps = {
  theme: 'light' | 'dark'
  glowRgb: { r: number; g: number; b: number }
  title: string
  introLine?: string | null
  items: readonly BrainFieldPlaceCard[]
  assistantLine?: string | null
  onClose: () => void
  onOpenMaps?: (card: BrainFieldPlaceCard) => void
  onPlaceLiked?: (card: BrainFieldPlaceCard) => void
  onPlaceDisliked?: (card: BrainFieldPlaceCard) => void
}

export function FetchBrainFieldPanel({
  theme,
  glowRgb,
  title,
  introLine,
  items,
  assistantLine,
  onClose,
  onOpenMaps,
  onPlaceLiked,
  onPlaceDisliked,
}: FetchBrainFieldPanelProps) {
  const isLight = theme === 'light'
  const glass = isLight
    ? 'border-black/[0.08] bg-white/[0.82] shadow-[0_-12px_48px_rgba(0,0,0,0.08)]'
    : 'border-white/[0.1] bg-[rgba(8,10,16,0.88)] shadow-[0_-16px_56px_rgba(0,0,0,0.5)]'

  return (
    <div
      className={[
        'fetch-brain-field-panel pointer-events-auto absolute inset-x-0 bottom-0 z-[8] flex max-h-[min(58vh,420px)] flex-col rounded-t-[22px] border backdrop-blur-xl',
        glass,
      ].join(' ')}
      style={{ '--brain-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}` } as CSSProperties}
      role="region"
      aria-label="Results in the neural field"
    >
      <div
        className={[
          'flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3',
          isLight ? 'border-black/[0.06]' : 'border-white/[0.08]',
        ].join(' ')}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[rgba(var(--brain-glow),0.85)]">
            Nearby
          </p>
          <h2
            className={[
              'truncate text-[15px] font-semibold tracking-[-0.02em]',
              isLight ? 'text-neutral-900' : 'text-white/[0.94]',
            ].join(' ')}
          >
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={[
            'shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
            isLight
              ? 'bg-black/[0.06] text-neutral-700 hover:bg-black/[0.1]'
              : 'bg-white/[0.1] text-white/85 hover:bg-white/[0.14]',
          ].join(' ')}
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {introLine ? (
          <div
            className={[
              'relative mb-3 rounded-2xl px-3.5 py-2.5',
              isLight ? 'bg-sky-50/90 text-neutral-800' : 'bg-white/[0.08] text-white/88',
            ].join(' ')}
          >
            <span
              className="absolute -bottom-1 left-6 h-3 w-3 rotate-45 rounded-sm bg-inherit"
              aria-hidden
            />
            <p className="relative text-[12px] font-medium leading-snug [text-wrap:pretty]">{introLine}</p>
          </div>
        ) : null}

        {assistantLine ? (
          <div
            className={[
              'relative mb-3 rounded-2xl border px-3.5 py-2.5',
              isLight
                ? 'border-[rgba(var(--brain-glow),0.25)] bg-white text-neutral-800'
                : 'border-[rgba(var(--brain-glow),0.35)] bg-[rgba(var(--brain-glow),0.12)] text-white/90',
            ].join(' ')}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">Fetch</p>
            <p className="mt-1 text-[12px] font-medium leading-relaxed [text-wrap:pretty]">{assistantLine}</p>
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className={['py-8 text-center text-[13px]', isLight ? 'text-neutral-500' : 'text-white/50'].join(' ')}>
            No venues found. Try again or check location access.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((card) => (
              <li
                key={card.id}
                className={[
                  'rounded-xl border px-3 py-2.5',
                  isLight ? 'border-black/[0.06] bg-black/[0.03]' : 'border-white/[0.08] bg-white/[0.05]',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        'text-[14px] font-semibold leading-tight',
                        isLight ? 'text-neutral-900' : 'text-white/[0.92]',
                      ].join(' ')}
                    >
                      {card.title}
                    </p>
                    <p
                      className={[
                        'mt-1 text-[11px] leading-snug',
                        isLight ? 'text-neutral-600' : 'text-white/60',
                      ].join(' ')}
                    >
                      {card.summary}
                    </p>
                    {card.distanceMeters != null ? (
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[rgba(var(--brain-glow),0.75)]">
                        {formatDistanceLabel(card.distanceMeters)} away
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {onOpenMaps ? (
                    <button
                      type="button"
                      className={[
                        'rounded-lg px-2.5 py-1 text-[11px] font-semibold',
                        isLight
                          ? 'bg-[rgba(var(--brain-glow),0.2)] text-neutral-900'
                          : 'bg-[rgba(var(--brain-glow),0.35)] text-white',
                      ].join(' ')}
                      onClick={() => onOpenMaps(card)}
                    >
                      Maps
                    </button>
                  ) : null}
                  {onPlaceLiked ? (
                    <button
                      type="button"
                      className={[
                        'rounded-lg px-2 py-1 text-[10px] font-semibold',
                        isLight ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-500/25 text-emerald-100',
                      ].join(' ')}
                      onClick={() => onPlaceLiked(card)}
                    >
                      Liked
                    </button>
                  ) : null}
                  {onPlaceDisliked ? (
                    <button
                      type="button"
                      className={[
                        'rounded-lg px-2 py-1 text-[10px] font-semibold',
                        isLight ? 'bg-neutral-200 text-neutral-700' : 'bg-white/10 text-white/70',
                      ].join(' ')}
                      onClick={() => onPlaceDisliked(card)}
                    >
                      Pass
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
