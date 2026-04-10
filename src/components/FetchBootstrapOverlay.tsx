import { useEffect, useRef, useState, type CSSProperties } from 'react'

const MIN_SKELETON_MS = 880
const MAX_WAIT_MS = 5600
const EXIT_MS = 420

/** Matches home map: safe area + floating search strip only (no wordmark bar). */
const MAP_HEADER_H = 'calc(env(safe-area-inset-top, 0px) + 3.35rem)'

type FetchBootstrapOverlayProps = {
  open: boolean
  mapReady: boolean
  onExitComplete: () => void
}

/**
 * Mirrors the home shell (floating map search + viewport + booking sheet) with staggered
 * skeletons only — no dock orb; the live `HomeView` orb appears after bootstrap.
 */
export function FetchBootstrapOverlay({
  open,
  mapReady,
  onExitComplete,
}: FetchBootstrapOverlayProps) {
  const [exiting, setExiting] = useState(false)
  const openedAtRef = useRef(0)
  const exitCompleteRef = useRef(false)

  useEffect(() => {
    exitCompleteRef.current = false
    if (!open) {
      queueMicrotask(() => setExiting(false))
      return
    }
    openedAtRef.current = Date.now()
    queueMicrotask(() => setExiting(false))
  }, [open])

  useEffect(() => {
    if (!open || exiting) return

    const tryDismiss = () => {
      const elapsed = Date.now() - openedAtRef.current
      const satisfied = mapReady && elapsed >= MIN_SKELETON_MS
      const force = elapsed >= MAX_WAIT_MS
      if (satisfied || force) {
        setExiting(true)
      }
    }

    tryDismiss()
    const id = window.setInterval(tryDismiss, 140)
    return () => window.clearInterval(id)
  }, [open, exiting, mapReady])

  useEffect(() => {
    if (!open || !exiting) return
    const t = window.setTimeout(() => {
      if (exitCompleteRef.current) return
      exitCompleteRef.current = true
      onExitComplete()
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open, exiting, onExitComplete])

  if (!open && !exiting) return null

  const mapShellStyle = {
    ['--fetch-map-header-h']: MAP_HEADER_H,
  } as CSSProperties

  return (
    <div
      className={[
        'fetch-bootstrap-overlay pointer-events-none fixed inset-0 z-[200] flex flex-col',
        exiting ? 'fetch-bootstrap-overlay--out' : 'fetch-bootstrap-overlay--in',
      ].join(' ')}
      style={mapShellStyle}
      aria-hidden
    >
      <div className="fetch-bootstrap-home-mirror relative flex min-h-dvh min-h-[100dvh] w-full flex-col">
        <div className="fetch-bootstrap-map-shell flex min-h-0 flex-1 flex-col">
          <div className="fetch-bootstrap-skel-map-search-only pointer-events-none fixed left-0 right-0 top-0 z-[46] flex flex-col bg-transparent pt-[calc(env(safe-area-inset-top,0px)+0.45rem)]">
            <div className="fetch-bootstrap-skel-stagger mx-auto w-full max-w-[min(100%,36rem)] shrink-0 px-4">
              <div className="fetch-bootstrap-skel-map-header-search h-11 w-full rounded-full" />
            </div>
          </div>

          <div className="fetch-bootstrap-skel-map-viewport pointer-events-none relative mt-[var(--fetch-map-header-h)] min-h-0 flex-1 overflow-hidden rounded-t-none bg-white shadow-none ring-0">
            <div className="fetch-bootstrap-skel-map absolute inset-0 rounded-t-none" />
          </div>
        </div>

        <div
          className="pointer-events-none fixed inset-x-0 z-[50] flex justify-center px-3 pb-[max(calc(0.35rem+8px),env(safe-area-inset-bottom))]"
          style={{ bottom: 'var(--fetch-vv-keyboard, 0px)' }}
        >
          <div className="fetch-bootstrap-skel-booking-sheet w-full max-w-lg overflow-hidden rounded-[32px] shadow-[0_-12px_40px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.04]">
            <div className="fetch-bootstrap-skel-stagger flex flex-col items-center pt-2 pb-0.5">
              <div className="fetch-bootstrap-skel-handle rounded-full" />
            </div>
            <div className="fetch-bootstrap-skel-stagger flex flex-col gap-2.5 px-4 pb-3 pt-1">
              <div className="fetch-bootstrap-skel-composer flex min-h-[3rem] items-center gap-2 rounded-[1.35rem] px-3 py-2 ring-1 ring-black/[0.06]">
                <div className="fetch-bootstrap-skel-dot rounded-full" />
                <div className="fetch-bootstrap-skel-composer-line min-h-[2.75rem] flex-1 rounded-xl" />
                <div className="fetch-bootstrap-skel-mic rounded-full" />
              </div>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="fetch-bootstrap-skel-headline rounded-md" />
                <div className="fetch-bootstrap-skel-chev rounded-full" />
              </div>
              <div className="fetch-bootstrap-skel-carousel fetch-bootstrap-skel-stagger flex gap-2.5 overflow-hidden pt-0.5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="fetch-bootstrap-skel-service-card flex shrink-0 flex-col items-center gap-2 rounded-2xl px-2 py-2.5"
                  >
                    <div className="fetch-bootstrap-skel-service-icon rounded-xl" />
                    <div className="fetch-bootstrap-skel-service-label rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
