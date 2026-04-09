import { FetchSplashEyes } from './FetchSplashEyes'

type Props = {
  /** Short line, e.g. “Opening your home…” */
  title: string
  /** Optional supporting line (kept calm, not console-focused). */
  subtitle?: string
}

/**
 * Branded full-viewport Suspense fallback for the app shell — visible, accessible, never empty.
 */
export function FetchAppShellSuspenseFallback({ title, subtitle }: Props) {
  if (import.meta.env.DEV) {
    console.log('[AUTH] rendering fallback UI', title)
  }

  return (
    <div
      className="fetch-app-phase-fallback fetch-app-shell-bg flex min-h-dvh min-h-[100dvh] flex-col items-center justify-center gap-6 px-6 pb-20 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={title}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="scale-[0.92] opacity-[0.97]" aria-hidden="true">
          <FetchSplashEyes mode="open" />
        </div>
        <div className="max-w-sm">
          <p className="text-lg font-semibold tracking-tight text-white">Fetch</p>
          <p className="mt-2 text-[15px] font-medium leading-snug text-white/88">{title}</p>
          {subtitle ? (
            <p className="mt-2 text-[12px] leading-relaxed text-white/52">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400/75" />
        <span
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400/65"
          style={{ animationDelay: '140ms' }}
        />
        <span
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400/55"
          style={{ animationDelay: '280ms' }}
        />
      </div>
    </div>
  )
}
