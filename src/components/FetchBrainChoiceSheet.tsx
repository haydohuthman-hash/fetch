import { useCallback, useId, useState, type CSSProperties, type FormEvent } from 'react'

export type FetchBrainChoiceSheetModel = {
  prompt?: string
  choices: readonly [string, string, string, string]
  freeformHint?: string
}

export type FetchBrainChoiceSheetProps = {
  theme: 'light' | 'dark'
  glowRgb: { r: number; g: number; b: number }
  sheet: FetchBrainChoiceSheetModel
  onSubmit: (text: string) => void
  onDismiss: () => void
}

export function FetchBrainChoiceSheet({
  theme,
  glowRgb,
  sheet,
  onSubmit,
  onDismiss,
}: FetchBrainChoiceSheetProps) {
  const isLight = theme === 'light'
  const formId = useId()
  const [draft, setDraft] = useState('')
  const glassTint = isLight
    ? 'border-white/[0.22] bg-white/[0.5]'
    : 'border-white/[0.12] bg-[rgba(10,12,20,0.4)]'

  const send = useCallback(
    (text: string) => {
      const t = text.trim()
      if (!t) return
      onSubmit(t)
    },
    [onSubmit],
  )

  const onFormSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      send(draft)
      setDraft('')
    },
    [draft, send],
  )

  return (
    <div
      className={[
        'fetch-brain-choice-sheet fetch-brain-glass-sheet pointer-events-auto absolute inset-x-0 bottom-0 z-[20] flex max-h-[min(62vh,480px)] flex-col rounded-t-[22px]',
        glassTint,
      ].join(' ')}
      style={{ '--brain-glow': `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}` } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${formId}-title`}
    >
      <div
        className={[
          'flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3',
          isLight ? 'border-black/[0.06]' : 'border-white/[0.08]',
        ].join(' ')}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[rgba(var(--brain-glow),0.85)]">
            Quick reply
          </p>
          <h2
            id={`${formId}-title`}
            className={[
              'mt-0.5 text-[15px] font-semibold leading-snug tracking-[-0.02em]',
              isLight ? 'text-neutral-900' : 'text-white/[0.94]',
            ].join(' ')}
          >
            {sheet.prompt?.trim() || 'Choose one'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
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
        <div className="flex flex-col gap-2">
          {sheet.choices.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => send(label)}
              className={[
                'w-full rounded-xl border px-3.5 py-3 text-left text-[13px] font-semibold leading-snug transition-colors',
                isLight
                  ? 'border-black/[0.08] bg-black/[0.03] text-neutral-900 hover:bg-black/[0.06]'
                  : 'border-white/[0.1] bg-white/[0.06] text-white/90 hover:bg-white/[0.1]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className={[
            'my-4 h-px w-full',
            isLight ? 'bg-black/[0.08]' : 'bg-white/[0.1]',
          ].join(' ')}
          aria-hidden
        />

        <form onSubmit={onFormSubmit} className="flex flex-col gap-2" data-sheet-no-drag>
          <label htmlFor={`${formId}-free`} className="sr-only">
            Or type your answer
          </label>
          <input
            id={`${formId}-free`}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={sheet.freeformHint?.trim() || 'Or type your answer…'}
            className={[
              'w-full rounded-xl border px-3 py-2.5 text-[13px] font-medium outline-none ring-[rgba(var(--brain-glow),0.35)] focus-visible:ring-2',
              isLight
                ? 'border-black/[0.1] bg-white text-neutral-900 placeholder:text-neutral-400'
                : 'border-white/[0.12] bg-white/[0.06] text-white placeholder:text-white/40',
            ].join(' ')}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className={[
              'rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-opacity disabled:opacity-40',
              isLight
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-900 hover:bg-white/95',
            ].join(' ')}
          >
            Send answer
          </button>
        </form>
      </div>
    </div>
  )
}
