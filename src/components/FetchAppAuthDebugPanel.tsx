/**
 * Dev-only overlay for tracing post-auth shell state (no production UI).
 */
export function FetchAppAuthDebugPanel(props: {
  phase: string
  pathname: string
  authLoading: boolean
  sessionUserId: string | null
  profileLoaded: boolean
  fallbackActive: boolean
}) {
  if (import.meta.env.PROD) return null
  if (!import.meta.env.DEV) return null
  const { phase, pathname, authLoading, sessionUserId, profileLoaded, fallbackActive } = props
  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-[9999] max-w-[min(100vw-1rem,20rem)] rounded-lg border border-white/20 bg-black/85 px-2 py-1.5 font-mono text-[10px] leading-snug text-emerald-200/95 shadow-lg">
      <div className="font-bold text-white/90">[DEV] Auth shell</div>
      <div>phase: {phase}</div>
      <div className="truncate" title={pathname}>
        path: {pathname}
      </div>
      <div>authLoading: {String(authLoading)}</div>
      <div className="truncate" title={sessionUserId ?? ''}>
        uid: {sessionUserId ?? '—'}
      </div>
      <div>profile (session): {String(profileLoaded)}</div>
      <div>fallback: {String(fallbackActive)}</div>
    </div>
  )
}
