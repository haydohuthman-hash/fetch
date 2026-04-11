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
  MarketplaceNavIconFilled,
} from './icons/HomeShellNavIcons'

/** closed = peek · compact / half / full = fixed snap heights (CSS); body scrolls inside */
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

export type HomeShellTab = 'services' | 'reels' | 'marketplace' | 'chat'

const SNAP_ORDER: HomeBookingSheetSnap[] = ['closed', 'compact', 'half', 'full']

function nextSnap(current: HomeBookingSheetSnap, direction: 1 | -1): HomeBookingSheetSnap {
  const i = SNAP_ORDER.indexOf(current)
  const idx = i >= 0 ? i : SNAP_ORDER.indexOf('compact')
  const j = Math.min(SNAP_ORDER.length - 1, Math.max(0, idx + direction))
  return SNAP_ORDER[j] ?? current
}

/** Maps (nav) tab: default open height; explore can half ↔ full; closed only when routing. */
const NAV_MAPS_OPEN_SNAP: HomeBookingSheetSnap = 'half'

function nextSnapNavMaps(
  snap: HomeBookingSheetSnap,
  direction: 1 | -1,
  exploreKeepsOpen: boolean,
): HomeBookingSheetSnap {
  if (exploreKeepsOpen) {
    if (snap === 'closed') return NAV_MAPS_OPEN_SNAP
    if (direction === 1) return 'full'
    return 'half'
  }
  if (direction === 1) return NAV_MAPS_OPEN_SNAP
  return 'closed'
}

function canInitiateSheetDrag(
  target: EventTarget | null,
  snap: HomeBookingSheetSnap,
  scrollEl: HTMLElement | null,
  expanded: boolean,
  intentClosedPeek: boolean,
  mapsCompactPeek: boolean,
): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.closest('.fetch-home-booking-sheet__handle')) return true
  if (!expanded) {
    const dockDrag =
      (intentClosedPeek && snap === 'closed') ||
      (mapsCompactPeek && snap === 'closed')
    if (dockDrag) {
      if (el.closest('textarea, input, select, a, [data-sheet-no-drag]')) return false
      if (el.closest('.fetch-home-booking-sheet__peek button')) return false
      if (el.closest('.fetch-home-booking-sheet__shell-footer button')) return false
      if (el.closest('.fetch-home-booking-sheet__shell-footer-backdrop button')) return false
      if (el.closest('.fetch-home-booking-sheet__shell-footer-promo-peek button')) return false
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
  if (el.closest('button[aria-label="Profile"]')) return false
  if (el.closest('button') && !el.closest('.fetch-home-booking-sheet__handle')) return false
  /* Only full/half use a vertical scroll container; intent compact is flex-fit with overflow hidden */
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
  /** Sheet chrome: open full-screen Fetch buy & sell (left control in peek + expanded header). */
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
   * Maps explore (no live chat route): do not snap to `closed` — stay half/full until directions start.
   */
  navMapsExploreKeepsOpen?: boolean
  /**
   * Maps tab while a nav/route strip is active (not map explore). Enables tighter peek chrome,
   * Fetch wordmark, and 25% / 50% / 80% snap heights.
   */
  navMapChrome?: boolean
  /** Intent home: bottom nav replaces top header (Home / Nav / Account). */
  hideExpandedHeaderChrome?: boolean
  /** Home shell: flush horizontal/bottom edges; rounded top only. */
  edgeToEdgeShell?: boolean
  /** Fixed bottom bar (Home / Nav / Account) — shown for every snap when set. */
  shellFooterNav?: ReactNode
  /**
   * Renders behind the bottom nav (same footer stack), e.g. promo carousel — nav sits on top with an opaque
   * background so only a thin slice of the backdrop shows above the bar.
   */
  shellFooterBackdrop?: ReactNode
  /** e.g. mic — absolutely positioned under the handle, top-left of the sheet body. */
  topLeftAccessory?: ReactNode
  /** Optional right-slot control (intent home); mirrors topLeftAccessory. */
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
  /**
   * Directions request in flight (pickup → drop-off): shrink sheet so the map / route preview
   * stays prominent; paired with CSS `[data-route-building]`.
   */
  routeBuildingForMapPeek?: boolean
  /**
   * After the user picks a service: tighten handle padding so the map stays the
   * visual focus for the rest of the booking flow (addresses → quote → pay).
   */
  mapFirstBookingLayout?: boolean
  /** Hide drag handle bar (Uber-style bare sheet edge). */
  bareBookingSheetTop?: boolean
  /** No voice halo / particles / speaking tint on the sheet panel. */
  suppressSheetVoiceAura?: boolean
  /**
   * Keep the sheet pinned to the layout viewport bottom (ignore Visual Viewport keyboard inset).
   * Use while typing addresses so the sheet does not “ride” the software keyboard.
   */
  disableVisualViewportKeyboardInset?: boolean
  children: ReactNode
}

/**
 * Single control: Home ↔ Fetch marketplace.
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
  const goShop = tab === 'services' || tab === 'reels'
  return (
    <button
      type="button"
      className={[baseBtn, className ?? ''].join(' ')}
      aria-label={goShop ? 'Open Fetch shop' : 'Back to home'}
      title={goShop ? 'Shop' : 'Home'}
      onClick={(e) => {
        e.stopPropagation()
        onChange(goShop ? 'marketplace' : 'services')
      }}
    >
      {goShop ? (
        <MarketplaceNavIconFilled className={navChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'} />
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
  navMapsExploreKeepsOpen = false,
  navMapChrome = false,
  hideExpandedHeaderChrome = false,
  edgeToEdgeShell = false,
  shellFooterNav,
  shellFooterBackdrop,
  topLeftAccessory,
  topRightAccessory,
  suppressPeekBar = false,
  intentClosedPeek = false,
  routeBuildingForMapPeek = false,
  mapFirstBookingLayout = false,
  bareBookingSheetTop = false,
  suppressSheetVoiceAura = false,
  disableVisualViewportKeyboardInset = false,
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
      /** Intent home: nudge dock slightly up with sheet + header rhythm. */
      const intentDockLiftPx = surface === 'intent' ? 12 : 0
      const next = Math.max(0, visibleBottom - top - orbHalfPx + mapsPeekLiftPx + intentDockLiftPx)
      const prev = lastOrbBottomSent.current
      if (prev != null && Math.abs(prev - next) < 0.75) return
      lastOrbBottomSent.current = next
      cb(next)
    })
  }, [onHomeOrbBottomPxChange, mapsCompactPeek, surface])

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
  }, [reportHomeOrbBottom, snap, cardVisible, mapsCompactPeek])

  useLayoutEffect(() => {
    if (!navMapChrome) return
    if (snap === 'compact') {
      onSnapChange(NAV_MAPS_OPEN_SNAP)
    }
  }, [navMapChrome, snap, onSnapChange])

  useLayoutEffect(() => {
    if (!navMapChrome || !navMapsExploreKeepsOpen) return
    if (snap === 'closed') {
      onSnapChange(NAV_MAPS_OPEN_SNAP)
    }
  }, [navMapChrome, navMapsExploreKeepsOpen, snap, onSnapChange])

  const clearDrag = useCallback(() => {
    dragRef.current = null
    setDragging(false)
    onSheetGestureActiveChange?.(false)
  }, [onSheetGestureActiveChange])

  const expanded = snap !== 'closed'
  const intentTopAccessories = Boolean(topLeftAccessory || topRightAccessory)

  const shellToggleActive =
    showHomeShellTabs &&
    homeShellTab != null &&
    onHomeShellTabChange != null
  const persistentShellFooter = Boolean(shellFooterNav) && shellToggleActive

  /**
   * Eyes + wordmark on the services sheet when full header chrome is shown.
   * Intent / focus modes hide this so the dock orb is not stacked over a duplicate logo (map header carries brand).
   */
  const showServicesHeaderBrand =
    expanded &&
    shellToggleActive &&
    homeShellTab === 'services' &&
    !hideExpandedHeaderChrome

  /**
   * Expanded header controls sit `position:absolute` over the panel; pad scroll content so
   * primary actions stay below that band (especially on short floating-card snaps).
   */
  const expandedTopChrome: 'brand' | 'maps' | undefined =
    expanded && !hideExpandedHeaderChrome
      ? showServicesHeaderBrand
        ? 'brand'
        : onMapsIconClick
          ? 'maps'
          : undefined
      : undefined

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

  const compactFillBody = surface === 'intent' && snap === 'compact'

  const onPanelPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!cardVisible) return
      const panel = panelRef.current
      if (!panel) return

      const canStart = canInitiateSheetDrag(
        e.target,
        snap,
        scrollRef.current,
        expanded,
        intentClosedPeek,
        mapsCompactPeek,
      )
      if (canStart) {
        try {
          panel.setPointerCapture(e.pointerId)
        } catch {
          return
        }
        const t = typeof performance !== 'undefined' ? performance.now() : Date.now()
        dragRef.current = { startY: e.clientY, startSnap: snap, lastY: e.clientY, lastT: t }
        setDragging(true)
        onSheetGestureActiveChange?.(true)
      }
    },
    [
      cardVisible,
      snap,
      expanded,
      intentClosedPeek,
      mapsCompactPeek,
      onSheetGestureActiveChange,
    ],
  )

  const onPanelPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    d.lastY = e.clientY
    d.lastT = typeof performance !== 'undefined' ? performance.now() : Date.now()
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

      if (navMapChrome) {
        if (tap) {
          if (start === 'closed') {
            onSnapChange(NAV_MAPS_OPEN_SNAP)
          } else if (navMapsExploreKeepsOpen) {
            onSnapChange(start === 'half' ? 'full' : 'half')
          } else {
            onSnapChange('closed')
          }
        } else if (Math.abs(vy) > 0.45) {
          if (vy > 0) onSnapChange(nextSnapNavMaps(start, -1, navMapsExploreKeepsOpen))
          else onSnapChange(nextSnapNavMaps(start, 1, navMapsExploreKeepsOpen))
        } else if (dy > threshold) {
          onSnapChange(nextSnapNavMaps(start, -1, navMapsExploreKeepsOpen))
        } else if (dy < -threshold) {
          onSnapChange(nextSnapNavMaps(start, 1, navMapsExploreKeepsOpen))
        }
      } else if (tap) {
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
    [clearDrag, navMapChrome, navMapsExploreKeepsOpen, onSnapChange],
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

  /** Home shell: horizontal inset only around the sheet card; bottom nav is full-bleed below. */
  const outerShellClass = [
    edgeToEdgeShell
      ? shellFooterNav
        ? 'fetch-home-booking-sheet-outer fetch-home-booking-sheet-outer--edge flex min-h-0 flex-col px-0 pb-[max(0.65rem,env(safe-area-inset-bottom,0px))]'
        : 'fetch-home-booking-sheet-outer fetch-home-booking-sheet-outer--edge px-3 pb-[max(0.65rem,env(safe-area-inset-bottom,0px))] sm:px-3.5'
      : shellFooterNav
        ? 'fetch-home-booking-sheet-outer fetch-home-booking-sheet-outer--fullbleed flex min-h-0 flex-col px-0 pb-0'
        : 'fetch-home-booking-sheet-outer fetch-home-booking-sheet-outer--fullbleed px-0 pb-0',
  ].join(' ')

  const dockPanelInsetClass = [
    'flex min-h-0 flex-1 flex-col',
    /* Bottom shell nav is position:absolute; pin sheet to bottom of this column so it sits just above the dock */
    shellFooterNav ? 'justify-end' : '',
    edgeToEdgeShell && shellFooterNav
      ? 'fetch-home-sheet-dock-panel--with-shell-nav px-3 sm:px-3.5'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  /** Width comes from `.fetch-home-phone-frame` (centered column); never span the desktop viewport. */
  const innerWidthClass = 'w-full'

  /** Top + slightly softer bottom radius (CSS edge/maps variants override when more specific). */
  const panelShapeClass =
    'rounded-t-[var(--fetch-home-sheet-radius)] rounded-b-[var(--fetch-home-sheet-bottom-radius)]'

  const bookingSheetPanel = (
        <div
          ref={panelRef}
          data-snap={snap}
          data-surface={surface}
          data-nav-map-chrome={navMapChrome ? 'true' : undefined}
          data-maps-apple-chrome={surface === 'maps' && navMapChrome ? 'true' : undefined}
          data-maps-compact-peek={mapsCompactPeek ? 'true' : undefined}
          data-edge-shell={edgeToEdgeShell ? 'true' : undefined}
          data-sheet-floating-card={edgeToEdgeShell ? 'true' : undefined}
          data-intent-closed-peek={intentClosedPeek ? 'true' : undefined}
          data-intent-shell-promo={shellFooterBackdrop ? 'true' : undefined}
          data-intent-top-accessories={intentTopAccessories ? 'true' : undefined}
          data-shell-tab={homeShellTab ?? undefined}
          data-route-building={routeBuildingForMapPeek ? 'true' : undefined}
          data-map-first-booking={mapFirstBookingLayout ? 'true' : undefined}
          data-bare-booking-top={bareBookingSheetTop ? 'true' : undefined}
          data-suppress-voice-aura={suppressSheetVoiceAura ? 'true' : undefined}
          data-expanded-header-chrome={expandedTopChrome}
          onPointerDownCapture={onPanelPointerDownCapture}
          onPointerMove={onPanelPointerMove}
          onPointerUp={onPanelPointerUp}
          onPointerCancel={onPanelPointerCancel}
          className={[
            'fetch-home-booking-sheet pointer-events-auto relative z-[1] flex w-full flex-col overflow-hidden',
            panelShapeClass,
            cardVisible
              ? 'fetch-home-booking-sheet--visible'
              : 'fetch-home-booking-sheet--hidden',
            orbAwakened ? 'fetch-home-booking-sheet--awake' : 'fetch-home-booking-sheet--dormant',
            isSpeechPlaying && !suppressSheetVoiceAura
              ? 'fetch-home-booking-sheet--speaking'
              : '',
            voiceHoldCaption && !suppressSheetVoiceAura
              ? 'fetch-home-booking-sheet--voice-hold'
              : '',
            dragging ? 'fetch-home-booking-sheet--dragging' : '',
          ].join(' ')}
          role="region"
          aria-label="Booking"
          aria-hidden={!cardVisible}
        >
        {topLeftAccessory ? (
          <div className="fetch-home-booking-sheet__top-left-slot pointer-events-auto absolute left-6 z-[30] top-[1.14rem] sm:left-7 sm:top-[1.26rem]">
            {topLeftAccessory}
          </div>
        ) : null}
        {topRightAccessory ? (
          <div className="fetch-home-booking-sheet__top-right-slot pointer-events-auto absolute right-6 z-[30] top-[1.14rem] sm:right-7 sm:top-[1.26rem]">
            {topRightAccessory}
          </div>
        ) : null}
        {showServicesHeaderBrand ? (
          <div className="fetch-home-booking-sheet__header-brand-row absolute left-4 top-2.5 z-[1] flex min-w-0 items-center gap-2.5">
            <FetchEyesHomeIcon className="h-9 w-9 shrink-0 text-zinc-900" tight={navMapChrome} />
            <span className="fetch-home-map-brand-logo min-w-0 truncate text-[1.35rem] font-bold leading-none tracking-[-0.03em] text-zinc-900">
              Fetch
            </span>
            {shellFooterNav ? null : (
              <ShellModeSwitchButton
                tab={homeShellTab!}
                onChange={onHomeShellTabChange!}
                density={navMapChrome ? 'default' : 'dense'}
                navChrome={navMapChrome}
                className="shrink-0"
              />
            )}
          </div>
        ) : expanded && onMapsIconClick && !hideExpandedHeaderChrome ? (
          <div className="absolute left-4 top-2.5 z-[25] flex items-center gap-1.5">
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
              aria-label="Open Fetch shop"
            >
              <MarketplaceNavIconFilled
                className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
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
              'fetch-home-booking-sheet__account-btn fetch-home-sheet-chrome-btn absolute right-4 top-2.5 z-[25] flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
              navMapChrome ? 'h-9 w-9' : 'h-11 w-11',
            ].join(' ')}
            aria-label="Profile"
          >
            <AccountNavIconFilled
              className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
            />
          </button>
        ) : null}

        <div
          className={[
            'fetch-home-booking-sheet__handle-rail flex shrink-0 flex-col items-center pb-0.5',
            navMapChrome || intentTopAccessories
              ? surface === 'intent' && intentTopAccessories
                ? 'pt-[0.18rem]'
                : 'pt-[0.3rem]'
              : 'pt-[0.6rem]',
          ].join(' ')}
        >
          <button
            type="button"
            className={[
              'fetch-home-booking-sheet__handle flex w-full flex-col items-center gap-1 pb-1 pt-0 outline-none ring-offset-2 ring-offset-transparent focus-visible:ring-2 focus-visible:ring-neutral-400/50 touch-pan-y',
              edgeToEdgeShell
                ? 'rounded-t-[0.78rem]'
                : 'rounded-t-[var(--fetch-home-sheet-radius)]',
            ].join(' ')}
            aria-label={
              navMapChrome
                ? snap === 'closed'
                  ? 'Drag up to open maps sheet, or tap to open'
                  : 'Drag down to close maps sheet, or tap to close'
                : snap === 'full'
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
              mapsCompactPeek
                ? 'justify-between gap-2'
                : shellToggleActive
                  ? 'justify-between'
                  : 'justify-between gap-2.5',
            ].join(' ')}
          >
            {closedPeekMapsRow ? (
              <>
                <div
                  ref={(el) => {
                    mapsPeekInsetRef(el)
                  }}
                  className="fetch-home-maps-peek-inset min-h-10 min-w-0 flex-1 overflow-visible"
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
                    aria-label="Profile"
                  >
                    <AccountNavIconFilled
                      className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
                    />
                  </button>
                ) : null}
              </>
            ) : null}
            {closedPeekShellRow ? (
              homeShellTab === 'services' ||
              homeShellTab === 'reels' ||
              homeShellTab === 'marketplace' ||
              homeShellTab === 'chat' ? (
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
                      aria-label="Profile"
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
                      aria-label="Profile"
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
                      aria-label="Open Fetch shop"
                    >
                      <MarketplaceNavIconFilled
                        className={navMapChrome ? 'h-[21px] w-[21px]' : 'h-6 w-6'}
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
                    aria-label="Profile"
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
                aria-label="Profile"
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
              ? snap === 'compact' && !compactFillBody
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
              snap === 'compact' && !compactFillBody
                ? 'flex-none'
                : 'flex min-h-0 flex-1 flex-col',
              expanded && (snap === 'full' || snap === 'half')
                ? 'overflow-y-auto touch-pan-y'
                : 'overflow-y-hidden',
              !expanded && intentClosedPeek ? 'fetch-home-booking-sheet__scroll--intent-peek' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="fetch-home-sheet-inner">{children}</div>
          </div>
        </div>
        </div>
  )

  return (
    <div
      className={[
        'pointer-events-none fixed inset-x-0 z-[50]',
        shellFooterNav
          ? 'flex h-full max-h-full flex-col items-stretch justify-end'
          : 'flex justify-center',
        outerShellClass,
      ].join(' ')}
      style={{
        bottom: disableVisualViewportKeyboardInset
          ? 0
          : 'var(--fetch-vv-keyboard, 0px)',
      }}
    >
      <div
        className={[
          'relative w-full',
          innerWidthClass,
          shellFooterNav ? 'flex min-h-0 min-w-0 flex-1 flex-col' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Voice halo + sparkle particles removed */}
        {shellFooterNav ? (
          <div
            className="fetch-home-sheet-dock-cluster flex min-h-0 w-full flex-1 flex-col"
            data-shell-footer="true"
            data-snap={snap}
            data-surface={surface}
            data-nav-map-chrome={navMapChrome ? 'true' : undefined}
            data-maps-compact-peek={mapsCompactPeek ? 'true' : undefined}
            data-intent-closed-peek={intentClosedPeek ? 'true' : undefined}
            data-intent-shell-promo={shellFooterBackdrop ? 'true' : undefined}
          >
            <div className={dockPanelInsetClass}>{bookingSheetPanel}</div>
            <div className="fetch-home-booking-sheet__shell-footer-stack relative z-[8] flex w-full shrink-0 flex-col pointer-events-auto">
              {shellFooterBackdrop && expanded ? (
                <div className="fetch-home-booking-sheet__shell-footer-backdrop relative z-0 w-full min-w-0 shrink-0 overflow-hidden pointer-events-auto">
                  {shellFooterBackdrop}
                </div>
              ) : null}
              <div className="fetch-home-booking-sheet__shell-footer pointer-events-auto relative z-[10] w-full shrink-0">
                {shellFooterNav}
              </div>
              {shellFooterBackdrop && !expanded ? (
                <div className="fetch-home-booking-sheet__shell-footer-promo-peek relative z-[5] w-full min-w-0 shrink-0 overflow-hidden pointer-events-none">
                  {shellFooterBackdrop}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          bookingSheetPanel
        )}
      </div>
    </div>
  )
}
