import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

export type HomeBookingSheetSnap = 'closed' | 'half' | 'full'

/** Booking step — drives sheet glass tint (presentation only). */
export type HomeBookingSheetSurface =
  | 'idle'
  | 'intent'
  | 'addresses'
  | 'route'
  | 'details'
  | 'working'
  | 'quote'
  | 'confirm'
  | 'live'

const SNAP_ORDER: HomeBookingSheetSnap[] = ['closed', 'half', 'full']

function nextSnap(current: HomeBookingSheetSnap, direction: 1 | -1): HomeBookingSheetSnap {
  const i = SNAP_ORDER.indexOf(current)
  const j = Math.min(SNAP_ORDER.length - 1, Math.max(0, i + direction))
  return SNAP_ORDER[j] ?? current
}

export type FetchHomeBookingSheetProps = {
  snap: HomeBookingSheetSnap
  onSnapChange: (next: HomeBookingSheetSnap) => void
  peekLabel: string
  cardVisible: boolean
  orbAwakened: boolean
  isSpeechPlaying: boolean
  voiceHoldCaption?: string | null
  onMicClick: () => void
  /**
   * Distance from viewport bottom to place the home orb so it sits above the sheet (not on it).
   * Updated on resize, snap, drag, and panel size changes.
   */
  onHomeOrbBottomPxChange?: (bottomPx: number) => void
  /** True while the user is dragging the sheet handle — orb can disable `bottom` transition */
  onSheetGestureActiveChange?: (active: boolean) => void
  /** Account / profile — top-right of sheet */
  onAccountsClick?: () => void
  /** Booking UI phase — sheet colour shifts per step */
  surface?: HomeBookingSheetSurface
  /** Peek bar right control: mic (assistant) vs nav when chat navigation is live */
  peekAssistantMode?: 'mic' | 'nav'
  /**
   * When true, the sheet height follows content up to the same max caps, with inner scroll if needed.
   * When false, half & full snaps use fixed viewport-style heights (extra empty space below short content).
   */
  contentFitsHeight?: boolean
  children: ReactNode
}

function AccountIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.65" />
      <path
        d="M5 20v-1a5 5 0 015-5h4a5 5 0 015 5v1"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function NavPeekIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 3.5 20 21 12 17 4 21 12 3.5z" />
    </svg>
  )
}

/**
 * Persistent solid bottom sheet for the home booking flow — presentation only.
 * Reports panel geometry so HomeView can place the orb centered on the sheet’s top edge.
 */
export function FetchHomeBookingSheet({
  snap,
  onSnapChange,
  peekLabel,
  cardVisible,
  orbAwakened,
  isSpeechPlaying,
  voiceHoldCaption,
  onMicClick,
  onHomeOrbBottomPxChange,
  onSheetGestureActiveChange,
  onAccountsClick,
  surface = 'idle',
  contentFitsHeight = false,
  peekAssistantMode = 'mic',
  children,
}: FetchHomeBookingSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startY: number
    startSnap: HomeBookingSheetSnap
    lastY: number
    lastT: number
  } | null>(null)
  const [dragDy, setDragDy] = useState(0)
  const [dragging, setDragging] = useState(false)

  const orbReportRaf = useRef(0)
  const lastOrbBottomSent = useRef<number | null>(null)

  const reportHomeOrbBottom = useCallback(() => {
    const el = panelRef.current
    const cb = onHomeOrbBottomPxChange
    if (!el || !cb) return
    if (orbReportRaf.current) {
      cancelAnimationFrame(orbReportRaf.current)
    }
    orbReportRaf.current = requestAnimationFrame(() => {
      orbReportRaf.current = 0
      const top = el.getBoundingClientRect().top
      const vv = typeof window !== 'undefined' ? window.visualViewport : null
      const visibleBottom =
        vv && typeof vv.height === 'number'
          ? vv.offsetTop + vv.height
          : typeof window !== 'undefined'
            ? window.innerHeight
            : 0
      /** Half of home dock orb (6.5rem) — orb center sits on the sheet’s top edge; horizontally centered via CSS. */
      const remPx =
        typeof window !== 'undefined'
          ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
          : 16
      const orbHalfPx = 0.5 * 6.5 * remPx
      const next = Math.max(0, visibleBottom - top - orbHalfPx)
      const prev = lastOrbBottomSent.current
      if (prev != null && Math.abs(prev - next) < 0.75) return
      lastOrbBottomSent.current = next
      cb(next)
    })
  }, [onHomeOrbBottomPxChange])

  useLayoutEffect(() => {
    if (!onHomeOrbBottomPxChange) return
    const el = panelRef.current
    if (!el) return
    const ro = new ResizeObserver(() => reportHomeOrbBottom())
    ro.observe(el)
    window.addEventListener('resize', reportHomeOrbBottom)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', reportHomeOrbBottom)
      if (orbReportRaf.current) {
        cancelAnimationFrame(orbReportRaf.current)
        orbReportRaf.current = 0
      }
    }
  }, [onHomeOrbBottomPxChange, reportHomeOrbBottom])

  useLayoutEffect(() => {
    reportHomeOrbBottom()
  }, [reportHomeOrbBottom, snap, dragDy, cardVisible, contentFitsHeight])

  const clearDrag = useCallback(() => {
    dragRef.current = null
    setDragDy(0)
    setDragging(false)
    onSheetGestureActiveChange?.(false)
  }, [onSheetGestureActiveChange])

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now()
      dragRef.current = { startY: e.clientY, startSnap: snap, lastY: e.clientY, lastT: t }
      setDragDy(0)
      setDragging(true)
      onSheetGestureActiveChange?.(true)
    },
    [snap, onSheetGestureActiveChange],
  )

  const onHandlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      if (!d) return
      const dy = e.clientY - d.startY
      d.lastY = e.clientY
      d.lastT = typeof performance !== 'undefined' ? performance.now() : Date.now()
      setDragDy(dy)
    },
    [],
  )

  const onHandlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
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
        if (d.startSnap === 'closed') onSnapChange('half')
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

  const onHandlePointerCancel = useCallback(() => {
    clearDrag()
  }, [clearDrag])

  const expanded = snap !== 'closed'
  const translateY = dragging ? dragDy : 0

  /** Lift fixed sheet above mobile software keyboard (Visual Viewport API). */
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
      reportHomeOrbBottom()
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      root.style.removeProperty('--fetch-vv-keyboard')
      reportHomeOrbBottom()
    }
  }, [reportHomeOrbBottom])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[50] flex justify-center px-3 pb-[max(calc(0.35rem+8px),env(safe-area-inset-bottom))]"
      style={{ bottom: 'var(--fetch-vv-keyboard, 0px)' }}
    >
      <div
        ref={panelRef}
        data-snap={snap}
        data-surface={surface}
        data-content-fit={contentFitsHeight ? 'true' : undefined}
        className={[
          'fetch-home-booking-sheet pointer-events-auto relative flex w-full max-w-lg flex-col overflow-hidden rounded-[32px]',
          cardVisible
            ? 'fetch-home-booking-sheet--visible'
            : 'fetch-home-booking-sheet--hidden',
          orbAwakened ? 'fetch-home-booking-sheet--awake' : 'fetch-home-booking-sheet--dormant',
          isSpeechPlaying ? 'fetch-home-booking-sheet--speaking' : '',
          voiceHoldCaption ? 'fetch-home-booking-sheet--voice-hold' : '',
          dragging ? 'fetch-home-booking-sheet--dragging' : '',
        ].join(' ')}
        style={
          translateY
            ? { transform: `translate3d(0, ${translateY}px, 0)` }
            : undefined
        }
        role="region"
        aria-label="Booking"
        aria-hidden={!cardVisible}
      >
        {onAccountsClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAccountsClick()
            }}
            className="absolute right-2.5 top-2 z-[3] flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-white/[0.88] transition-opacity hover:opacity-100 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/45"
            aria-label="Account"
          >
            <AccountIcon />
          </button>
        ) : null}

        <div className="flex shrink-0 flex-col items-center pt-2 pb-0.5">
          <button
            type="button"
            className="fetch-home-booking-sheet__handle flex w-full flex-col items-center gap-1 rounded-t-[32px] pb-0.5 pt-0 outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-violet-400/40 touch-pan-y"
            aria-label={
              snap === 'full'
                ? 'Drag down to shrink sheet, or tap to return to half height'
                : snap === 'half'
                  ? 'Drag to resize sheet, or tap to expand'
                  : 'Drag up to expand sheet, or tap to open'
            }
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerCancel}
          >
            <span
              className="block h-1 w-10 rounded-full bg-gradient-to-r from-white/25 via-white/48 to-white/25 shadow-[0_0_8px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.35)]"
              aria-hidden
            />
          </button>
        </div>

        {!expanded ? (
          <div className="fetch-home-booking-sheet__peek flex shrink-0 items-center justify-between gap-3 px-4 pb-2.5 pt-0">
            <button
              type="button"
              onClick={() => onSnapChange('half')}
              className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-2xl text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70 active:scale-[0.98]"
              aria-label={peekLabel}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onMicClick()
              }}
              className={[
                'fetch-home-sheet-peek-mic flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]',
                peekAssistantMode === 'nav'
                  ? 'bg-emerald-500/22 text-emerald-100'
                  : 'bg-violet-500/18 text-violet-100',
              ].join(' ')}
              aria-label={peekAssistantMode === 'nav' ? 'Navigation active' : 'Open assistant'}
            >
              {peekAssistantMode === 'nav' ? <NavPeekIcon /> : <MicIcon />}
            </button>
          </div>
        ) : null}

        <div
          className={[
            'fetch-home-booking-sheet__body fetch-home-booking-sheet__body--compact flex min-h-0 flex-col px-3.5',
            expanded
              ? contentFitsHeight
                ? 'min-h-0 flex-none opacity-100'
                : 'min-h-0 flex-1 opacity-100'
              : 'pointer-events-none max-h-0 min-h-0 flex-none overflow-hidden opacity-0',
          ].join(' ')}
          aria-hidden={!expanded}
        >
          <div
            className={[
              'fetch-home-booking-sheet__scroll min-h-0 overflow-x-hidden overscroll-contain pb-2.5',
              contentFitsHeight
                ? 'fetch-home-booking-sheet__scroll--fit flex-none overflow-y-visible'
                : 'flex-1',
              !contentFitsHeight && snap === 'full' ? 'overflow-y-auto' : '',
              !contentFitsHeight && snap !== 'full' ? 'overflow-y-hidden' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="fetch-home-sheet-inner">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
