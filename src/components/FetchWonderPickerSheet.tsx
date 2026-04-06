export type FetchWonderPickerSheetProps = {
  open: boolean
  onClose: () => void
  onPickAdventure: () => void
  onPickRestaurant: () => void
}

export function FetchWonderPickerSheet({
  open,
  onClose,
  onPickAdventure,
  onPickRestaurant,
}: FetchWonderPickerSheetProps) {
  if (!open) return null
  return (
    <div
      className="fetch-wonder-picker fixed inset-0 z-[59] flex items-end justify-center bg-black/45 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
      role="dialog"
      aria-modal
      aria-labelledby="fetch-wonder-title"
    >
      <button
        type="button"
        className="fetch-wonder-picker__backdrop absolute inset-0 cursor-default"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div className="fetch-wonder-picker__card relative z-[1] flex w-full max-w-lg flex-col overflow-hidden rounded-3xl shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="fetch-wonder-picker__close absolute right-3 top-3 z-[2] flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none text-slate-600 transition-colors hover:bg-slate-100/90"
          aria-label="Close"
        >
          ×
        </button>
        <div className="fetch-wonder-picker__body space-y-4 p-5 pt-12">
          <div className="space-y-1.5 pr-8">
            <h2 id="fetch-wonder-title" className="text-[18px] font-bold leading-tight text-slate-900">
              Plan something amazing
            </h2>
            <p className="text-[13px] font-medium leading-snug text-slate-600 [text-wrap:pretty]">
              Pick a lane — Fetch will curate a real nearby spot and tell you why it’s worth it.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onPickAdventure}
              className="fetch-wonder-picker__choice flex flex-col items-start gap-1 rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-white to-sky-50/80 px-4 py-3.5 text-left transition-[transform,box-shadow] active:scale-[0.99]"
            >
              <span className="text-[15px] font-bold text-slate-900">Mystery adventure</span>
              <span className="text-[12px] font-medium leading-snug text-slate-600 [text-wrap:pretty]">
                Parks, views, and spontaneous outdoor moments — no spoilers.
              </span>
            </button>
            <button
              type="button"
              onClick={onPickRestaurant}
              className="fetch-wonder-picker__choice flex flex-col items-start gap-1 rounded-2xl border border-amber-200/85 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/70 px-4 py-3.5 text-left transition-[transform,box-shadow] active:scale-[0.99]"
            >
              <span className="text-[15px] font-bold text-slate-900">Restaurant</span>
              <span className="text-[12px] font-medium leading-snug text-slate-600 [text-wrap:pretty]">
                A bite nearby worth the detour — tuned for tonight’s vibe, not a generic list.
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
