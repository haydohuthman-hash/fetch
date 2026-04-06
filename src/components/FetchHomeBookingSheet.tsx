import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  AccountNavIconFilled,
  FetchEyesHomeIcon,
  MapsNavIconFilled,
} from './icons/HomeShellNavIcons'

/** closed = peek · compact = content-hug · half / full = fixed snap heights (CSS) */
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

export type HomeShellTab = 'services' | 'maps' | 'activity'

const SNAP_ORDER: HomeBookingSheetSnap[] = ['closed', 'compact', 'half', 'full']

function nextSnap(current: HomeBookingSheetSnap, direction: 1 | -1): HomeBookingSheetSnap {
  const i = SNAP_ORDER.indexOf(current)
  const idx = i >= 0 ? i : SNAP_ORDER.indexOf('compact')
  const j = Math.min(SNAP_ORDER.length - 1, Math.max(0, idx + direction))
  return SNAP_ORDER[j] ?? current
}

function canInitiateSheetDrag(
  target: EventTarget | null,
  snap: HomeBookingSheetSnap,
  scrollEl: HTMLElement | null,
  expanded: boolean,
  intentClosedPeek: boolean,
): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.closest('.fetch-home-booking-sheet__handle')) return true
  if (!expanded) {
    if (intentClosedPeek && snap === 'closed') {
      if (el.closest('textarea, input, select, a, [data-sheet-no-drag]')) return false
      if (el.closest('.fetch-home-booking-sheet__peek button')) return false
      if (el.closest('.fetch-home-booking-sheet__shell-footer button')) return false
      if (el.closest('.fetch-home-booking-sheet__body button')) return false
      if (el.closest('.fetch-home-booking-sheet')) return true
      return false
    }
    return false
  }
  if (el.closest('textarea, input, select, a, [data-sheet-no-drag]')) return false
  if (el.closest('[role="option"]')) return false
  if (el.closest('.fetch-home-booking-sheet__peek button')) return false
  if (el.closest('.fetch-home-booking-sheet__shell-footer button')) return false
  if (el.closest('button[aria-label="Account"]')) return false
  if (el.closest('button') && !el.closest('.fetch-home-booking-sheet__handle')) return false
  if ((snap === 'full' || snap === 'half') && scrollEl?.contains(el)) return false
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
  /**
   * Maps tab while a nav/route strip is active (not map explore). Enables tighter peek chrome,
   * Fetch wordmark, frosted top, and 25% / 50% / 80% snap heights.
   */
  navMapChrome?: boolean
  /** Intent home: bottom nav replaces top header (Home / Nav / Account). */
  hideExpandedHeaderChrome?: boolean
  /** Home shell: flush horizontal/bottom edges; rounded top only. */
  edgeToEdgeShell?: boolean
  /** Fixed bottom bar (Home / Nav / Account) — shown for every snap when set. */
  shellFooterNav?: ReactNode
  /** e.g. mic — absolutely positioned under the handle, top-left of the sheet body. */
  topLeftAccessory?: ReactNode
  /** e.g. magic / surprise — mirrors topLeftAccessory on the right (intent home). */
  topRightAccessory?: ReactNode
  /**
   * Wizard-style booking: when closed, hide the peek row (nav / home / account) so only the
   * handle shows — avoids duplicate chrome with in-flow back actions.
   */
  suppressPeekBar?: boolean
  /**
   * Intent home: when the sheet is closed, keep a thin slice of body content (promo cards)
   * visible above the shell footer; drag anywhere on the sheet (except buttons) to expand.
   */
  intentClosedPeek?: boolean
  children: ReactNode
}

/**
 * Single control: on Services or Activity shows Maps; on Maps shows Home (Services).
 */
function ShellModeSwitchButton({
  tab,
  onChange,
  className,
  density = 'default',
  navChrome = false,
}: {
  tab: HomeShellTab
  onChange: (next: HomeShellTab) => void
  className?: string
  density?: 'default' | 'dense'
  /** Tighter hit target + cropped icons (nav / route sheet only). */
  navChrome?: boolean
}) {
  const sizeClass = navChrome ? 'h-9 w-9' : density === 'dense' ? 'h-10 w-10' : 'h-11 w-11'
  const baseBtn =
    sizeClass +
    ' fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-[transform,colors,box-shadow] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35'
  const goMaps = tab === 'services' || tab === 'activity'
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
        <MapsNavIconFilled className={navChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'} tight={navChrome} />
      ) : (
        <FetchEyesHomeIcon className={navChrome ? 'h-[19px] w-[19px]' : 'h-6 w-6'} tight={navChrome} />
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
  navMapChrome = false,
  hideExpandedHeaderChrome = false,
  edgeToEdgeShell = false,
  shellFooterNav,
  topLeftAccessory,
  topRightAccessory,
  suppressPeekBar = false,
  intentClosedPeek = false,
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
  const persistentShellFooter = Boolean(shellFooterNav) && shellToggleActive

  const closedPeekMapsRow =
    mapsCompactPeek && shellToggleActive && mapsPeekInsetRef != null
  const closedPeekShellRow =
    shellToggleActive && !mapsCompactPeek && !persistentShellFooter
  /** Peek when there is no home shell tab strip (older booking-only chrome). */
  const closedPeekLegacyPeek = !shellToggleActive && !mapsCompactPeek
  const closedPeekAccountOnlyPeek =
    !shellToggleActive && mapsCompactPeek && Boolean(onAccountsClick)
  const showClosedPeek =
    !expanded &&
    !suppressPeekBar &&
    (closedPeekMapsRow ||
      closedPeekShellRow ||
      closedPeekLegacyPeek ||
      closedPeekAccountOnlyPeek)

  const onPanelPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!cardVisible) return
      if (!canInitiateSheetDrag(e.target, snap, scrollRef.current, expanded, intentClosedPeek))
        return
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
    [cardVisible, snap, expanded, intentClosedPeek, onSheetGestureActiveChange],
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
      const threshold = 44
      const tap = Math.abs(dy) < 10
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const dt = Math.max(1, now - d.lastT)
      const vy = (e.clientY - d.lastY) / dt
      const start = d.startSnap

      if (tap) {
        if (start === 'closed') onSnapChange('compact')
        else if (start === 'compact') onSnapChange('half')
        else if (start === 'half') onSnapChange('full')
        else onSnapChange('half')
      } else if (Math.abs(vy) > 0.45) {
        if (vy > 0) onSnapChange(nextSnap(start, -1))
        else onSnapChange(nextSnap(start, 1))
      } else if (dy > threshold) {
        onSnapChange(nextSnap(start, -1))
      } else if (dy < -threshold) {
        onSnapChange(nextSnap(start, 1))
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
      className={[
        'pointer-events-none fixed inset-x-0 z-[50] flex justify-center',
        edgeToEdgeShell
          ? 'fetch-home-booking-sheet-outer fetch-home-booking-sheet-outer--edge px-0 pb-0'
          : 'fetch-home-booking-sheet-outer fetch-home-booking-sheet-outer--padded px-3 pb-[max(calc(0.35rem+8px),env(safe-area-inset-bottom))]',
      ].join(' ')}
      style={{ bottom: 'var(--fetch-vv-keyboard, 0px)' }}
    >
      <div
        className={['relative w-full', edgeToEdgeShell ? 'max-w-none' : 'max-w-lg'].join(
          ' ',
        )}
      >
        <div
          aria-hidden
          className={[
            'fetch-home-booking-sheet__voice-halo pointer-events-none',
            isSpeechPlaying ? 'fetch-home-booking-sheet__voice-halo--on' : '',
          ].join(' ')}
        />
        <div
          aria-hidden
          className={[
            'fetch-home-booking-sheet__speech-particles pointer-events-none',
            isSpeechPlaying ? 'fetch-home-booking-sheet__speech-particles--on' : '',
          ].join(' ')}
        />
        <div
          ref={panelRef}
          data-snap={snap}
          data-surface={surface}
          data-nav-map-chrome={navMapChrome ? 'true' : undefined}
          data-maps-compact-peek={mapsCompactPeek ? 'true' : undefined}
          data-shell-footer={shellFooterNav ? 'true' : undefined}
          data-edge-shell={edgeToEdgeShell ? 'true' : undefined}
          data-intent-closed-peek={intentClosedPeek ? 'true' : undefined}
          onPointerDownCapture={onPanelPointerDownCapture}
          onPointerMove={onPanelPointerMove}
          onPointerUp={onPanelPointerUp}
          onPointerCancel={onPanelPointerCancel}
          className={[
            'fetch-home-booking-sheet pointer-events-auto relative z-[1] flex w-full flex-col overflow-hidden',
            edgeToEdgeShell
              ? 'rounded-b-none rounded-t-[32px]'
              : 'max-w-lg rounded-[32px]',
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
        <div className="fetch-home-booking-sheet__top-frost" aria-hidden />
        {topLeftAccessory ? (
          <div className="fetch-home-booking-sheet__top-left-slot pointer-events-auto absolute left-6 z-[4] top-[2.1rem] sm:left-7 sm:top-[2.25rem]">
            {topLeftAccessory}
          </div>
        ) : null}
        {topRightAccessory ? (
          <div className="fetch-home-booking-sheet__top-right-slot pointer-events-auto absolute right-6 z-[4] top-[2.1rem] sm:right-7 sm:top-[2.25rem]">
            {topRightAccessory}
          </div>
        ) : null}
        {expanded && shellToggleActive && !hideExpandedHeaderChrome ? (
          <div className="absolute left-4 top-2.5 z-[3] flex items-center gap-1.5">
            <ShellModeSwitchButton
              tab={homeShellTab!}
              onChange={onHomeShellTabChange!}
              density={navMapChrome ? 'default' : 'dense'}
              navChrome={navMapChrome}
            />
          </div>
        ) : expanded && onMapsIconClick && !hideExpandedHeaderChrome ? (
          <div className="absolute left-4 top-2.5 z-[3] flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onMapsIconClick()
              }}
              className={[
                'fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
                navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
              ].join(' ')}
              aria-label="Navigation mode"
            >
              <MapsNavIconFilled
                className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
                tight={navMapChrome}
              />
            </button>
          </div>
        ) : null}
        {onAccountsClick && expanded && !hideExpandedHeaderChrome ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAccountsClick()
            }}
            className={[
              'fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn absolute right-4 top-2.5 z-[3] flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
              navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
            ].join(' ')}
            aria-label="Account"
          >
            <AccountNavIconFilled
              className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
            />
          </button>
        ) : null}

        <div
          className={[
            'flex shrink-0 flex-col items-center pb-0.5',
            navMapChrome ? 'pt-1' : 'pt-2',
          ].join(' ')}
        >
          <button
            type="button"
            className="fetch-home-booking-sheet__handle flex w-full flex-col items-center gap-1 rounded-t-[32px] pb-1 pt-0 outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-neutral-400/50 touch-pan-y"
            aria-label={
              snap === 'full'
                ? 'Drag down to shrink sheet, or tap to step to half height'
                : snap === 'half'
                  ? 'Drag to resize sheet, or tap to expand to full height'
                  : snap === 'compact'
                    ? 'Drag to resize sheet, or tap to expand to full height'
                    : 'Drag up to expand sheet, or tap to open content'
            }
          >
            <span className="fetch-home-booking-sheet__handle-bar" aria-hidden />
          </button>
        </div>

        {showClosedPeek ? (
          <div
            className={[
              'fetch-home-booking-sheet__peek flex shrink-0 items-center px-3 pt-0 sm:px-4',
              mapsCompactPeek ? 'fetch-home-booking-sheet__peek--maps-compact gap-2.5' : 'gap-0',
              navMapChrome ? 'pb-1.5' : 'pb-2',
              mapsCompactPeek ? '' : shellToggleActive ? 'justify-between' : 'justify-between gap-2.5',
            ].join(' ')}
          >
            {closedPeekMapsRow ? (
              <>
                <ShellModeSwitchButton
                  tab={homeShellTab!}
                  onChange={onHomeShellTabChange!}
                  navChrome={navMapChrome}
                />
                <div
                  ref={(el) => {
                    mapsPeekInsetRef(el)
                  }}
                  className="fetch-home-maps-peek-inset min-h-11 min-w-0 flex-1 overflow-visible"
                />
                {onAccountsClick && !persistentShellFooter ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAccountsClick()
                    }}
                    className={[
                      'fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
                      navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
                    ].join(' ')}
                    aria-label="Account"
                  >
                    <AccountNavIconFilled
                      className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
                    />
                  </button>
                ) : null}
              </>
            ) : null}
            {closedPeekShellRow ? (
              homeShellTab === 'services' || homeShellTab === 'activity' ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPeekHomeClick()
                    }}
                    className={[
                      'fetch-home-sheet-peek-home fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]',
                      homeShellTab === 'services' ? 'ring-2 ring-cyan-400/25' : '',
                      navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label="Home"
                    aria-current={homeShellTab === 'services' ? 'page' : undefined}
                  >
                    <FetchEyesHomeIcon
                      className={navMapChrome ? 'h-[19px] w-[19px]' : 'h-[22px] w-[22px]'}
                      tight={navMapChrome}
                    />
                  </button>
                  <ShellModeSwitchButton
                    tab={homeShellTab}
                    onChange={onHomeShellTabChange!}
                    navChrome={navMapChrome}
                  />
                  {onAccountsClick ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAccountsClick()
                      }}
                      className={[
                        'fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
                        navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
                      ].join(' ')}
                      aria-label="Account"
                    >
                      <AccountNavIconFilled
                        className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
                      />
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <ShellModeSwitchButton
                    tab={homeShellTab}
                    onChange={onHomeShellTabChange!}
                    navChrome={navMapChrome}
                  />
                  <div className="min-h-10 min-w-0 flex-1" aria-hidden />
                  {onAccountsClick ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAccountsClick()
                      }}
                      className={[
                        'fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
                        navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
                      ].join(' ')}
                      aria-label="Account"
                    >
                      <AccountNavIconFilled
                        className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
                      />
                    </button>
                  ) : null}
                </>
              )
            ) : closedPeekLegacyPeek ? (
              <>
                <div className="flex min-w-0 shrink-0 items-center gap-1.5">
                  {onMapsIconClick ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMapsIconClick()
                      }}
                      className={[
                        'fetch-home-sheet-peek-map fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]',
                        navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
                      ].join(' ')}
                      aria-label="Navigation mode"
                    >
                      <MapsNavIconFilled
                        className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
                        tight={navMapChrome}
                      />
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPeekHomeClick()
                  }}
                  className={[
                    'fetch-home-sheet-peek-home fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]',
                    navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
                  ].join(' ')}
                  aria-label="Home"
                >
                  <FetchEyesHomeIcon
                    className={navMapChrome ? 'h-[19px] w-[19px]' : 'h-[22px] w-[22px]'}
                    tight={navMapChrome}
                  />
                </button>
                <div className="min-h-10 min-w-0 flex-1" aria-hidden />
                {onAccountsClick ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAccountsClick()
                    }}
                    className={[
                      'fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
                      navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
                    ].join(' ')}
                    aria-label="Account"
                  >
                    <AccountNavIconFilled
                      className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
                    />
                  </button>
                ) : null}
              </>
            ) : closedPeekAccountOnlyPeek ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onAccountsClick?.()
                }}
                className={[
                  'fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn ml-auto flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
                  navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
                ].join(' ')}
                aria-label="Account"
              >
                <AccountNavIconFilled
                  className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
                />
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={[
            'fetch-home-booking-sheet__body fetch-home-booking-sheet__body--compact flex min-h-0 flex-col px-3',
            expanded
              ? snap === 'compact'
                ? 'min-h-0 flex-none opacity-100'
                : 'min-h-0 flex-1 opacity-100'
              : intentClosedPeek
                ? 'fetch-home-booking-sheet__body--intent-closed-peek min-h-0 flex-none opacity-100'
                : 'pointer-events-none max-h-0 min-h-0 flex-none overflow-hidden opacity-0',
          ].join(' ')}
          aria-hidden={!expanded && !intentClosedPeek}
        >
          <div
            ref={scrollRef}
            className={[
              'fetch-home-booking-sheet__scroll min-h-0 overflow-x-hidden overscroll-contain pb-1',
              snap === 'compact' ? 'flex-none' : 'flex min-h-0 flex-1 flex-col',
              snap === 'full' || snap === 'half' ? 'overflow-y-auto touch-pan-y' : 'overflow-y-hidden',
              !expanded && intentClosedPeek ? 'fetch-home-booking-sheet__scroll--intent-peek' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="fetch-home-sheet-inner">{children}</div>
          </div>
        </div>
        {shellFooterNav ? (
          <div className="fetch-home-booking-sheet__shell-footer pointer-events-auto shrink-0">
            {shellFooterNav}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  )
}
