import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { HomeBookingSheetSnap } from './FetchHomeBookingSheet'

const SNAP_ORDER: HomeBookingSheetSnap[] = ['closed', 'compact', 'half', 'full']

function nextSnap(current: HomeBookingSheetSnap, direction: 1 | -1): HomeBookingSheetSnap {
  const i = SNAP_ORDER.indexOf(current)
  const j = Math.min(SNAP_ORDER.length - 1, Math.max(0, i + direction))
  return SNAP_ORDER[j] ?? current
}

function canInitiateDriverSheetDrag(
  target: EventTarget | null,
  snap: HomeBookingSheetSnap,
  scrollEl: HTMLElement | null,
  expanded: boolean,
): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.closest('.fetch-home-booking-sheet__handle')) return true
  if (!expanded) return false
  if (el.closest('textarea, input, select, a, [data-sheet-no-drag]')) return false
  if (el.closest('[role="option"]')) return false
  if (el.closest('.fetch-home-booking-sheet__peek button')) return false
  if (el.closest('button') && !el.closest('.fetch-home-booking-sheet__handle')) return false
  if (snap === 'full' && scrollEl?.contains(el)) return false
  return true
}

function BackChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export type DriverJobsSheetProps = {
  snap: HomeBookingSheetSnap
  onSnapChange: (next: HomeBookingSheetSnap) => void
  /** Peek row: return to customer home. */
  onBack: () => void
  /** Short status, e.g. "3 incoming · 1 active". */
  peekLine: string
  children: ReactNode
  /** Demo driver id + apply — keep below main scroll in full snap. */
  footer?: ReactNode
}

/**
 * Bottom sheet for the driver dashboard — same snap/handle behavior as the home booking sheet.
 */
export function DriverJobsSheet({
  snap,
  onSnapChange,
  onBack,
  peekLine,
  children,
  footer,
}: DriverJobsSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startY: number
    startSnap: HomeBookingSheetSnap
    lastY: number
    lastT: number
  } | null>(null)
  const [dragDy, setDragDy] = useState(0)
  const [dragging, setDragging] = useState(false)

  const clearDrag = useCallback(() => {
    dragRef.current = null
    setDragDy(0)
    setDragging(false)
  }, [])

  const expanded = snap !== 'closed'

  const onPanelPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!canInitiateDriverSheetDrag(e.target, snap, scrollRef.current, expanded)) return
      const panel = panelRef.current
      if (!panel) return
      try {
        panel.setPointerCapture(e.pointerId)
      } catch {
        return
      }
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now()
      dragRef.current = { startY: e.clientY, startSnap: snap, lastY: e.clientY, lastT: t }
      setDragDy(0)
      setDragging(true)
    },
    [snap, expanded],
  )

  const onPanelPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const dy = e.clientY - d.startY
    d.lastY = e.clientY
    d.lastT = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setDragDy(dy)
  }, [])

  const finishSheetPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      try {
        panelRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (!d) {
        clearDrag()
        return
      }
      const dy = e.clientY - d.startY
      const threshold = 52
      const tap = Math.abs(dy) < 10
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const dt = Math.max(1, now - d.lastT)
      const vy = (e.clientY - d.lastY) / dt

      if (tap) {
        if (d.startSnap === 'closed') onSnapChange('compact')
        else if (d.startSnap === 'compact') onSnapChange('half')
        else if (d.startSnap === 'half') onSnapChange('full')
        else onSnapChange('half')
      } else if (Math.abs(vy) > 0.45) {
        if (vy > 0) onSnapChange(nextSnap(d.startSnap, -1))
        else onSnapChange(nextSnap(d.startSnap, 1))
      } else if (dy > threshold) {
        onSnapChange(nextSnap(d.startSnap, -1))
      } else if (dy < -threshold) {
        onSnapChange(nextSnap(d.startSnap, 1))
      }

      clearDrag()
    },
    [clearDrag, onSnapChange],
  )

  const translateY = dragging ? dragDy : 0

  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    if (!vv) {
      root.style.setProperty('--fetch-vv-keyboard', '0px')
      return
    }
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--fetch-vv-keyboard', `${inset}px`)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      root.style.removeProperty('--fetch-vv-keyboard')
    }
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[50] flex justify-center px-3 pb-[max(calc(0.35rem+8px),env(safe-area-inset-bottom))]"
      style={{ bottom: 'var(--fetch-vv-keyboard, 0px)' }}
    >
      <div
        ref={panelRef}
        data-snap={snap}
        data-surface="working"
        onPointerDownCapture={onPanelPointerDownCapture}
        onPointerMove={onPanelPointerMove}
        onPointerUp={finishSheetPointer}
        onPointerCancel={finishSheetPointer}
        className={[
          'fetch-home-booking-sheet driver-jobs-sheet pointer-events-auto relative flex w-full max-w-lg flex-col overflow-hidden rounded-[32px]',
          'fetch-home-booking-sheet--visible',
          'fetch-home-booking-sheet--dormant',
          dragging ? 'fetch-home-booking-sheet--dragging' : '',
        ].join(' ')}
        style={translateY ? { transform: `translate3d(0, ${translateY}px, 0)` } : undefined}
        role="region"
        aria-label="Driver jobs"
      >
        <div className="flex shrink-0 flex-col items-center pt-2 pb-0.5">
          <button
            type="button"
            className="fetch-home-booking-sheet__handle flex w-full flex-col items-center gap-1 rounded-t-[32px] pb-1 pt-0 outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-neutral-400/50 touch-pan-y"
            aria-label="Drag to resize job sheet"
          >
            <span className="fetch-home-booking-sheet__handle-bar" aria-hidden />
          </button>
        </div>

        {!expanded ? (
          <div className="fetch-home-booking-sheet__peek flex shrink-0 items-center gap-2 px-5 pb-2.5 pt-0 sm:gap-3 sm:px-7">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onBack()
              }}
              className="fetch-home-sheet-chrome-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35"
              aria-label="Back to home"
            >
              <BackChevronIcon className="h-5 w-5" />
            </button>
            <p className="min-h-10 min-w-0 flex-1 truncate text-center text-[13px] font-semibold text-white/80">
              {peekLine}
            </p>
            <div className="h-11 w-11 shrink-0" aria-hidden />
          </div>
        ) : null}

        <div
          className={[
            'fetch-home-booking-sheet__body fetch-home-booking-sheet__body--compact flex min-h-0 flex-col px-4',
            expanded
              ? snap === 'compact'
                ? 'min-h-0 flex-none opacity-100'
                : 'min-h-0 flex-1 opacity-100'
              : 'pointer-events-none max-h-0 min-h-0 flex-none overflow-hidden opacity-0',
          ].join(' ')}
          aria-hidden={!expanded}
        >
          <div
            ref={scrollRef}
            className={[
              'fetch-home-booking-sheet__scroll min-h-0 overflow-x-hidden overscroll-contain pb-2.5',
              snap === 'compact' ? 'flex-none' : 'min-h-0 flex-1',
              snap === 'full' ? 'overflow-y-auto touch-pan-y' : 'overflow-y-hidden',
            ].join(' ')}
          >
            <div className="fetch-home-sheet-inner">{children}</div>
          </div>
          {footer && snap === 'full' ? (
            <div className="shrink-0 border-t border-white/[0.08] pt-2 pb-1" data-sheet-no-drag>
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
