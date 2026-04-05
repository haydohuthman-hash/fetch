import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

/** closed = peek text only · compact = content-hugs (cards + composer) · half = 50% · full = 90% (scrollable) */
export type HomeBookingSheetSnap = 'closed' | 'compact' | 'half' | 'full'

/** Booking step — drives sheet glass tint (presentation only). */
export type HomeBookingSheetSurface =
  | 'idle'
  | 'intent'
  | 'maps'
  | 'addresses'
  | 'route'
  | 'details'
  | 'working'
  | 'quote'
  | 'confirm'
  | 'live'

export type HomeShellTab = 'services' | 'maps'

const SNAP_ORDER: HomeBookingSheetSnap[] = ['closed', 'compact', 'half', 'full']

function nextSnap(current: HomeBookingSheetSnap, direction: 1 | -1): HomeBookingSheetSnap {
  const i = SNAP_ORDER.indexOf(current)
  const j = Math.min(SNAP_ORDER.length - 1, Math.max(0, i + direction))
  return SNAP_ORDER[j] ?? current
}

function canInitiateSheetDrag(
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
  if (el.closest('button[aria-label="Account"]')) return false
  if (el.closest('button') && !el.closest('.fetch-home-booking-sheet__handle')) return false
  if (snap === 'full' && scrollEl?.contains(el)) return false
  return true
}

export type FetchHomeBookingSheetProps = {
  snap: HomeBookingSheetSnap
  onSnapChange: (next: HomeBookingSheetSnap) => void
  cardVisible: boolean
  orbAwakened: boolean
  isSpeechPlaying: boolean
  voiceHoldCaption?: string | null
  /** Peek bar: return to services home (replaces former mic shortcut). */
  onPeekHomeClick: () => void
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
  /** Sheet chrome: collapse to show the map (left control in peek + expanded header). */
  onMapsIconClick?: () => void
  /** Persistent Services | Maps tabs on the home shell. */
  homeShellTab?: HomeShellTab | null
  onHomeShellTabChange?: (tab: HomeShellTab) => void
  showHomeShellTabs?: boolean
  /** Maps explore: portal target for address field when sheet is closed (max map visibility). */
  mapsPeekInsetRef?: (el: HTMLDivElement | null) => void
  /** True when Maps tab + not in chat nav — use compact peek with search inset only. */
  mapsCompactPeek?: boolean
  children: ReactNode
}

function AccountIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
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

function NavPeekIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 3.5 20 21 12 17 4 21 12 3.5z" />
    </svg>
  )
}

function MapFoldedIcon({ className }: { className?: string }) {
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
      <path d="M9 20 3 17V6l6 3 6-3 6 3v11l-6 3-6-3-6 3z" />
      <path d="M9 6v11" />
      <path d="M15 9v11" />
    </svg>
  )
}

/** House — shown on Maps tab; tap returns to Services. */
function HomeShellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

/**
 * Single control: on Services shows nav (go to Maps); on Maps shows home (back to Services).
 */
function ShellModeSwitchButton({
  tab,
  onChange,
  className,
  density = 'default',
}: {
  tab: HomeShellTab
  onChange: (next: HomeShellTab) => void
  className?: string
  density?: 'default' | 'dense'
}) {
  const baseBtn =
    (density === 'dense' ? 'h-10 w-10' : 'h-11 w-11') +
    ' fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-[transform,colors,box-shadow] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35'
  const goMaps = tab === 'services'
  return (
    <button
      type="button"
      className={[baseBtn, className ?? ''].join(' ')}
      aria-label={goMaps ? 'Open maps and explore' : 'Back to services'}
      title={goMaps ? 'Maps' : 'Home'}
      onClick={(e) => {
        e.stopPropagation()
        onChange(goMaps ? 'maps' : 'services')
      }}
    >
      {goMaps ? (
        <NavPeekIcon className="h-5 w-5" />
      ) : (
        <HomeShellIcon className="h-5 w-5" />
      )}
    </button>
  )
}

/**
 * Persistent solid bottom sheet for the home booking flow — presentation only.
 * Reports panel geometry so HomeView can place the orb centered on the sheet’s top edge.
 */
export function FetchHomeBookingSheet({
  snap,
  onSnapChange,
  cardVisible,
  orbAwakened,
  isSpeechPlaying,
  voiceHoldCaption,
  onPeekHomeClick,
  onHomeOrbBottomPxChange,
  onSheetGestureActiveChange,
  onAccountsClick,
  surface = 'idle',
  onMapsIconClick,
  homeShellTab = null,
  onHomeShellTabChange,
  showHomeShellTabs = false,
  mapsPeekInsetRef,
  mapsCompactPeek = false,
  children,
}: FetchHomeBookingSheetProps) {
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
      /** Half of home dock orb (6.5rem) — orb center on the sheet’s top edge (do not offset; keeps Fetch locked to the sheet). */
      const remPx =
        typeof window !== 'undefined'
          ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
          : 16
      const orbHalfPx = 0.5 * 6.5 * remPx
      /** Lift orb when maps closed-peek bar is tight so the dock clears the search row. */
      const mapsPeekLiftPx = mapsCompactPeek ? 20 : 0
      const next = Math.max(0, visibleBottom - top - orbHalfPx + mapsPeekLiftPx)
      const prev = lastOrbBottomSent.current
      if (prev != null && Math.abs(prev - next) < 0.75) return
      lastOrbBottomSent.current = next
      cb(next)
    })
  }, [onHomeOrbBottomPxChange, mapsCompactPeek])

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
  }, [reportHomeOrbBottom, snap, dragDy, cardVisible, mapsCompactPeek])

  const clearDrag = useCallback(() => {
    dragRef.current = null
    setDragDy(0)
    setDragging(false)
    onSheetGestureActiveChange?.(false)
  }, [onSheetGestureActiveChange])

  const expanded = snap !== 'closed'
  const shellToggleActive =
    showHomeShellTabs &&
    homeShellTab != null &&
    onHomeShellTabChange != null

  const onPanelPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!cardVisible) return
      if (!canInitiateSheetDrag(e.target, snap, scrollRef.current, expanded)) return
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
      onSheetGestureActiveChange?.(true)
    },
    [cardVisible, snap, expanded, onSheetGestureActiveChange],
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

  const onPanelPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      finishSheetPointer(e)
    },
    [finishSheetPointer],
  )

  const onPanelPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      finishSheetPointer(e)
    },
    [finishSheetPointer],
  )

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
        data-maps-compact-peek={mapsCompactPeek ? 'true' : undefined}
        onPointerDownCapture={onPanelPointerDownCapture}
        onPointerMove={onPanelPointerMove}
        onPointerUp={onPanelPointerUp}
        onPointerCancel={onPanelPointerCancel}
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
        {expanded && shellToggleActive ? (
          <div className="absolute left-4 top-2.5 z-[3]">
            <ShellModeSwitchButton
              tab={homeShellTab!}
              onChange={onHomeShellTabChange!}
              density="dense"
            />
          </div>
        ) : expanded && onMapsIconClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMapsIconClick()
            }}
            className="fetch-home-sheet-chrome-btn absolute left-4 top-2.5 z-[3] flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35"
            aria-label="Navigation mode"
          >
            <MapFoldedIcon />
          </button>
        ) : null}
        {onAccountsClick && expanded ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAccountsClick()
            }}
            className="fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn absolute right-4 top-2.5 z-[3] flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35"
            aria-label="Account"
          >
            <AccountIcon />
          </button>
        ) : null}

        <div className="flex shrink-0 flex-col items-center pt-2 pb-0.5">
          <button
            type="button"
            className="fetch-home-booking-sheet__handle flex w-full flex-col items-center gap-1 rounded-t-[32px] pb-1 pt-0 outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-neutral-400/50 touch-pan-y"
            aria-label={
              snap === 'full'
                ? 'Drag down to shrink sheet, or tap to step down one height'
                : snap === 'half'
                  ? 'Drag to resize sheet, or tap to expand to full height'
                  : snap === 'compact'
                    ? 'Drag to resize sheet, or tap to expand to half screen'
                    : 'Drag up to expand sheet, or tap to open content'
            }
          >
            <span className="fetch-home-booking-sheet__handle-bar" aria-hidden />
          </button>
        </div>

        {!expanded ? (
          <div
            className={[
              'fetch-home-booking-sheet__peek flex shrink-0 items-center gap-2.5 px-5 pb-2.5 pt-0 sm:gap-3 sm:px-7',
              mapsCompactPeek ? 'fetch-home-booking-sheet__peek--maps-compact' : 'justify-between',
            ].join(' ')}
          >
            {shellToggleActive ? (
              <ShellModeSwitchButton tab={homeShellTab!} onChange={onHomeShellTabChange!} />
            ) : onMapsIconClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onMapsIconClick()
                }}
                className="fetch-home-sheet-peek-map fetch-home-sheet-chrome-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
                aria-label="Navigation mode"
              >
                <MapFoldedIcon />
              </button>
            ) : null}
            {mapsCompactPeek && mapsPeekInsetRef ? (
              <div
                ref={(el) => {
                  mapsPeekInsetRef(el)
                }}
                className="fetch-home-maps-peek-inset min-h-11 min-w-0 flex-1 overflow-visible"
              />
            ) : null}
            {!mapsCompactPeek ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPeekHomeClick()
                }}
                className="fetch-home-sheet-peek-home fetch-home-sheet-chrome-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
                aria-label="Home"
              >
                <HomeShellIcon className="h-[18px] w-[18px]" />
              </button>
            ) : null}
            {!mapsCompactPeek ? (
              <div className="min-h-10 min-w-0 flex-1" aria-hidden />
            ) : null}
            {onAccountsClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onAccountsClick()
                }}
                className="fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35"
                aria-label="Account"
              >
                <AccountIcon />
              </button>
            ) : null}
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
        </div>
      </div>
    </div>
  )
}
