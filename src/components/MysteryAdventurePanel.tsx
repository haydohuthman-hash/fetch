export type MysteryExperienceKind = 'adventure' | 'restaurant'

export type MysteryAdventurePanelProps = {
  open: boolean
  loading: boolean
  /** Drives loading / error / secondary CTA copy (default adventure — maps toolbar). */
  experienceKind?: MysteryExperienceKind
  title: string
  formattedAddress?: string
  placeSummary: string
  fetchStory: string
  photoUrls: string[]
  error: string | null
  onClose: () => void
  onNavigate: () => void
  onAnother: () => void
}

export function MysteryAdventurePanel({
  open,
  loading,
  experienceKind = 'adventure',
  title,
  formattedAddress,
  placeSummary,
  fetchStory,
  photoUrls,
  error,
  onClose,
  onNavigate,
  onAnother,
}: MysteryAdventurePanelProps) {
  const isRestaurant = experienceKind === 'restaurant'
  const loadingTitle = isRestaurant ? 'Finding your table…' : 'Finding your mystery spot…'
  const loadingSubtitle = isRestaurant
    ? 'Hang tight — Fetch is picking somewhere worth the trip.'
    : 'Hang tight — Fetch is picking somewhere nearby.'
  const errorHeading = isRestaurant ? 'Couldn’t load that pick' : 'Couldn’t load mystery'
  const anotherLabel = isRestaurant ? 'Another pick' : 'Another mystery'

  if (!open) return null
  return (
    <div
      className="fetch-mystery-panel fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
      role="dialog"
      aria-modal
      aria-labelledby="fetch-mystery-title"
    >
      <div className="fetch-mystery-panel__card relative flex max-h-[min(88dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="fetch-mystery-panel__close absolute right-3 top-3 z-[2] flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
        {loading ? (
          <div className="fetch-mystery-panel__body space-y-3 p-5 pt-12">
            <p className="text-[15px] font-semibold">{loadingTitle}</p>
            <p className="text-[13px] opacity-80">{loadingSubtitle}</p>
          </div>
        ) : error ? (
          <div className="fetch-mystery-panel__body space-y-3 p-5 pt-12">
            <p id="fetch-mystery-title" className="text-[15px] font-semibold">
              {errorHeading}
            </p>
            <p className="text-[13px] opacity-85">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="fetch-mystery-panel__cta-primary mt-2 rounded-2xl py-3 text-[14px] font-semibold"
            >
              OK
            </button>
          </div>
        ) : (
          <>
            {photoUrls.length > 0 ? (
              <div className="fetch-mystery-panel__carousel flex snap-x snap-mandatory gap-0 overflow-x-auto">
                {photoUrls.map((url) => (
                  <div
                    key={url}
                    className="relative h-48 w-full min-w-full shrink-0 snap-start sm:h-56"
                  >
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="fetch-mystery-panel__placeholder flex h-40 items-end bg-gradient-to-br from-violet-500/35 via-sky-500/25 to-slate-900/40 p-4 sm:h-44">
                <p id="fetch-mystery-title" className="text-[18px] font-bold text-white drop-shadow">
                  {title}
                </p>
              </div>
            )}
            <div className="fetch-mystery-panel__body min-h-0 flex-1 space-y-3 overflow-y-auto p-5 pt-4">
              {photoUrls.length > 0 ? (
                <h2 id="fetch-mystery-title" className="pr-10 text-[18px] font-bold leading-tight">
                  {title}
                </h2>
              ) : null}
              {formattedAddress ? (
                <p className="text-[12px] leading-snug opacity-75">{formattedAddress}</p>
              ) : null}
              {placeSummary ? (
                <p className="text-[13px] leading-relaxed opacity-88">{placeSummary}</p>
              ) : null}
              {fetchStory ? (
                <div className="fetch-mystery-fetch-says space-y-2 border-t border-slate-200/90 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-55">
                    Fetch says
                  </p>
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{fetchStory}</p>
                </div>
              ) : null}
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={onNavigate}
                  className="fetch-mystery-panel__cta-primary flex-1 rounded-2xl py-3.5 text-[14px] font-semibold"
                >
                  Start directions
                </button>
                <button
                  type="button"
                  onClick={onAnother}
                  className="fetch-mystery-panel__cta-secondary flex-1 rounded-2xl py-3.5 text-[14px] font-semibold"
                >
                  {anotherLabel}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
