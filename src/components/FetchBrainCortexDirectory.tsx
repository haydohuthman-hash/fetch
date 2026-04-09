import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import type { BrainAccountSnapshot } from '../lib/fetchBrainAccountSnapshot'
import { formatBrainMileageDisplay } from '../lib/fetchBrainAccountSnapshot'
import type { HomeActivityEntry } from '../lib/homeActivityFeed'

type HubId = 'hub:core' | 'hub:flow' | 'hub:signals' | 'hub:places' | 'hub:dialogue'

/** 1 tiny dots · 2 titled orbit · 3 child cluster · 4 recall */
type CortexStage = 'galaxy' | 'orbit' | 'cluster' | 'recall'

const HUBS: { id: HubId; label: string; angle: number }[] = [
  { id: 'hub:core', label: 'Core', angle: -Math.PI / 2 },
  { id: 'hub:flow', label: 'Flow', angle: -Math.PI / 2 + (2 * Math.PI * 1) / 5 },
  { id: 'hub:signals', label: 'Signals', angle: -Math.PI / 2 + (2 * Math.PI * 2) / 5 },
  { id: 'hub:places', label: 'Atlas', angle: -Math.PI / 2 + (2 * Math.PI * 3) / 5 },
  { id: 'hub:dialogue', label: 'Dialogue', angle: -Math.PI / 2 + (2 * Math.PI * 4) / 5 },
]

type CortexChild = { id: string; label: string; sub?: string }

function hubFromFocusId(focusId: string | null): HubId | null {
  if (!focusId) return null
  if (focusId.startsWith('section:overview')) return 'hub:core'
  if (focusId.startsWith('section:spending')) return 'hub:flow'
  if (focusId.startsWith('section:places')) return 'hub:places'
  if (focusId.startsWith('activity:')) return 'hub:flow'
  if (focusId.startsWith('alert:')) return 'hub:signals'
  if (focusId.startsWith('address:')) return 'hub:places'
  if (focusId.startsWith('chat_turn:')) return 'hub:dialogue'
  return null
}

function buildSummary(snapshot: BrainAccountSnapshot, id: string): { title: string; body: string } {
  if (id.startsWith('activity:')) {
    const rid = id.slice('activity:'.length)
    const a = snapshot.activities.find((x) => x.id === rid)
    if (!a) return { title: 'Memory', body: 'Record not found in local feed.' }
    const price =
      typeof a.priceMax === 'number' ? `Up to $${a.priceMax} AUD` : 'No price on this line'
    const pay = a.paymentStatus ? `Status: ${a.paymentStatus}` : ''
    return {
      title: a.title,
      body: [a.subtitle, price, pay, new Date(a.at).toLocaleString()].filter(Boolean).join('\n'),
    }
  }
  if (id.startsWith('alert:')) {
    const rid = id.slice('alert:'.length)
    const al = snapshot.alerts.find((x) => x.id === rid)
    if (!al) return { title: 'Alert', body: 'Alert not found.' }
    return {
      title: al.title,
      body: `${al.body}\n${new Date(al.at).toLocaleString()}`,
    }
  }
  if (id.startsWith('address:')) {
    const rid = id.slice('address:'.length)
    const ad = snapshot.addresses.find((x) => x.id === rid)
    if (!ad) return { title: 'Place', body: 'Address not found.' }
    return {
      title: ad.label,
      body: [ad.address, ad.notes || null].filter(Boolean).join('\n'),
    }
  }
  if (id.startsWith('chat_turn:')) {
    const rid = id.slice('chat_turn:'.length)
    const c = snapshot.brainChatLines.find((x) => x.id === rid)
    if (!c) return { title: 'Dialogue', body: 'Turn not found.' }
    return {
      title: c.role === 'user' ? 'You' : 'Fetch',
      body: c.text,
    }
  }
  if (id === 'mem:mileage') {
    const mile = formatBrainMileageDisplay(snapshot)
    return {
      title: 'Range',
      body:
        mile.meters > 0
          ? `About ${(mile.meters / 1000).toFixed(1)} km from ${mile.source} data.`
          : 'No mileage logged yet — complete a routed quote or job to populate.',
    }
  }
  if (id === 'section:overview') {
    const mile = formatBrainMileageDisplay(snapshot)
    return {
      title: 'Core pulse',
      body: [
        `Spend $${snapshot.totalSpendAud.toFixed(2)} AUD`,
        `Jobs logged: ${snapshot.activityCount}`,
        `Mileage: ${mile.meters > 0 ? `${(mile.meters / 1000).toFixed(1)} km (${mile.source})` : 'none yet'}`,
        `Unread alerts: ${snapshot.unreadAlertCount}`,
        `Saved places: ${snapshot.savedAddressCount}`,
      ].join('\n'),
    }
  }
  if (id === 'section:spending') {
    return {
      title: 'Flow lobe',
      body: [
        `Payment lines: ${snapshot.paymentActivityCount}`,
        `Quotes logged: ${snapshot.quoteActivityCount}`,
        `Sum of succeeded charges (local): $${snapshot.totalSpendAud.toFixed(2)} AUD`,
      ].join('\n'),
    }
  }
  if (id === 'section:places') {
    return {
      title: 'Atlas lobe',
      body:
        snapshot.addresses.map((a) => `${a.label} — ${a.address}`).join('\n') ||
        'No saved places on this device.',
    }
  }
  return { title: 'Memory', body: 'Select a node to read what Fetch remembers.' }
}

function matchesQuery(q: string, ...parts: (string | undefined)[]) {
  if (!q) return true
  const blob = parts.filter(Boolean).join(' ').toLowerCase()
  return blob.includes(q)
}

export type FetchBrainCortexDirectoryProps = {
  snapshot: BrainAccountSnapshot
  theme: 'light' | 'dark'
  glowRgb: { r: number; g: number; b: number }
  focusedMemoryId: string | null
  onFocusedMemoryIdChange?: (id: string | null) => void
  /** Drives particle field spread under the cortex (0 = galaxy, 1 = deepest zoom). */
  onCortexSpreadChange?: (spread01: number) => void
}

export function FetchBrainCortexDirectory({
  snapshot,
  theme,
  glowRgb,
  focusedMemoryId,
  onFocusedMemoryIdChange,
  onCortexSpreadChange,
}: FetchBrainCortexDirectoryProps) {
  const isLight = theme === 'light'
  const searchId = useId()
  const fieldRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 320, h: 480 })

  const [stage, setStage] = useState<CortexStage>('galaxy')
  const [activeHub, setActiveHub] = useState<HubId | null>(null)
  const [inspectId, setInspectId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [flowFilter, setFlowFilter] = useState<'all' | 'payments' | 'quotes'>('all')

  const q = search.trim().toLowerCase()

  useEffect(() => {
    const spread =
      stage === 'galaxy' ? 0 : stage === 'orbit' ? 0.34 : stage === 'cluster' ? 0.72 : 1
    onCortexSpreadChange?.(spread)
  }, [stage, onCortexSpreadChange])

  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setDims({ w: Math.max(120, r.width), h: Math.max(120, r.height) })
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    setDims({ w: Math.max(120, r.width), h: Math.max(120, r.height) })
    return () => ro.disconnect()
  }, [])

  const cx = dims.w * 0.5
  const cy = dims.h * 0.38
  const R = Math.min(dims.w, dims.h) * 0.34
  const RChild = Math.min(dims.w, dims.h) * 0.3

  const hubXY = useCallback(
    (angle: number) => ({
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle) * 0.9,
    }),
    [cx, cy, R],
  )

  const flowActivities = useMemo(() => {
    let rows: HomeActivityEntry[] = snapshot.activities
    if (flowFilter === 'payments') {
      rows = rows.filter(
        (a) =>
          Boolean(a.paymentStatus) ||
          a.title.toLowerCase().includes('payment'),
      )
    } else if (flowFilter === 'quotes') {
      rows = rows.filter((a) => a.title.toLowerCase().includes('quote'))
    }
    return rows
      .filter((a) => matchesQuery(q, a.title, a.subtitle))
      .slice(0, 28)
      .map(
        (a): CortexChild => ({
          id: `activity:${a.id}`,
          label: a.title,
          sub: a.subtitle,
        }),
      )
  }, [snapshot.activities, flowFilter, q])

  const signalChildren = useMemo(() => {
    return snapshot.alerts
      .filter((al) => matchesQuery(q, al.title, al.body))
      .slice(0, 22)
      .map(
        (al): CortexChild => ({
          id: `alert:${al.id}`,
          label: al.title,
          sub: al.body.slice(0, 80) + (al.body.length > 80 ? '…' : ''),
        }),
      )
  }, [snapshot.alerts, q])

  const placeChildren = useMemo(() => {
    return snapshot.addresses
      .filter((ad) => matchesQuery(q, ad.label, ad.address, ad.notes))
      .map(
        (ad): CortexChild => ({
          id: `address:${ad.id}`,
          label: ad.label,
          sub: ad.address,
        }),
      )
  }, [snapshot.addresses, q])

  const dialogueChildren = useMemo(() => {
    return [...snapshot.brainChatLines]
      .sort((a, b) => b.sortAt - a.sortAt)
      .filter((c) => matchesQuery(q, c.text))
      .slice(0, 22)
      .map(
        (c): CortexChild => ({
          id: `chat_turn:${c.id}`,
          label: c.role === 'user' ? 'You' : 'Fetch',
          sub: c.text.length > 72 ? `${c.text.slice(0, 72)}…` : c.text,
        }),
      )
  }, [snapshot.brainChatLines, q])

  const coreChildren = useMemo((): CortexChild[] => {
    const mile = formatBrainMileageDisplay(snapshot)
    return [
      {
        id: 'section:overview',
        label: 'Pulse',
        sub: `${snapshot.activityCount} traces · ${snapshot.unreadAlertCount} unread`,
      },
      {
        id: 'section:spending',
        label: 'Ledger',
        sub: `$${snapshot.totalSpendAud.toFixed(2)} AUD recorded`,
      },
      {
        id: 'section:places',
        label: 'Grid',
        sub: `${snapshot.savedAddressCount} pinned places`,
      },
      {
        id: 'mem:mileage',
        label: 'Range',
        sub:
          mile.meters > 0
            ? `${(mile.meters / 1000).toFixed(1)} km · ${mile.source}`
            : 'No mileage logged yet',
      },
    ].filter((c) => matchesQuery(q, c.label, c.sub))
  }, [snapshot, q])

  const childrenFor = useCallback(
    (hub: HubId): CortexChild[] => {
      switch (hub) {
        case 'hub:core':
          return coreChildren
        case 'hub:flow':
          return flowActivities
        case 'hub:signals':
          return signalChildren
        case 'hub:places':
          return placeChildren
        case 'hub:dialogue':
          return dialogueChildren
        default:
          return []
      }
    },
    [coreChildren, dialogueChildren, flowActivities, placeChildren, signalChildren],
  )

  const satChildren = activeHub ? childrenFor(activeHub) : []
  const satAngles = satChildren.map(
    (_, i) => -Math.PI / 2 + (2 * Math.PI * i) / Math.max(satChildren.length, 1),
  )

  useEffect(() => {
    if (!focusedMemoryId) return
    queueMicrotask(() => {
      const hub = hubFromFocusId(focusedMemoryId)
      if (hub) {
        setActiveHub(hub)
        setStage('cluster')
      }
      setInspectId(focusedMemoryId)
      if (
        focusedMemoryId.startsWith('activity:') ||
        focusedMemoryId.startsWith('alert:') ||
        focusedMemoryId.startsWith('address:') ||
        focusedMemoryId.startsWith('chat_turn:') ||
        focusedMemoryId === 'mem:mileage'
      ) {
        setStage('recall')
      } else if (focusedMemoryId.startsWith('section:')) {
        setStage('recall')
      }
    })
  }, [focusedMemoryId])

  const goBack = () => {
    if (stage === 'recall') {
      setInspectId(null)
      onFocusedMemoryIdChange?.(null)
      setStage('cluster')
      return
    }
    if (stage === 'cluster') {
      setActiveHub(null)
      setInspectId(null)
      onFocusedMemoryIdChange?.(null)
      setStage('orbit')
      return
    }
    if (stage === 'orbit') {
      setStage('galaxy')
    }
  }

  const onNucleusClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (stage === 'galaxy') setStage('orbit')
    else if (stage === 'orbit') setStage('galaxy')
  }

  const onPickHub = (id: HubId) => {
    setActiveHub(id)
    setInspectId(null)
    onFocusedMemoryIdChange?.(null)
    setStage('cluster')
  }

  const onPickChild = (id: string) => {
    setInspectId(id)
    onFocusedMemoryIdChange?.(id)
    setStage('recall')
  }

  const summary = inspectId ? buildSummary(snapshot, inspectId) : null

  const worldScale =
    stage === 'galaxy' ? 0.72 : stage === 'orbit' ? 1 : stage === 'cluster' ? 1.12 : 1.08

  const glowVar = `${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}` as const
  /** 44px minimum touch target wrapper; inner dot stays visually small. */
  const hitTarget = 'flex min-h-[44px] min-w-[44px] items-center justify-center'
  const hubDotGalaxyVisual = 'h-2.5 w-2.5 rounded-full'
  const hubDotOrbitVisual = 'h-9 w-9 rounded-full'
  const childDotVisual = 'h-4 w-4 rounded-full'

  const lineColor = isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.14)'
  const lineGlow = `rgba(${glowVar},0.35)`

  const stageLabel =
    stage === 'galaxy'
      ? 'Far field'
      : stage === 'orbit'
        ? 'Labeled orbit'
        : stage === 'cluster'
          ? 'Lobe open'
          : 'Recall'

  return (
    <div
      className="fetch-brain-cortex-alive pointer-events-none absolute inset-0 flex h-full min-h-0 w-full flex-col"
      style={{ '--brain-glow': glowVar } as CSSProperties}
    >
      <div className="pointer-events-auto z-20 flex w-full shrink-0 flex-col gap-2 px-3 pb-2 pt-[max(3.85rem,calc(env(safe-area-inset-top)+3rem))]">
        <div className="relative mx-auto w-[min(100%,20rem)]">
          <label className="sr-only" htmlFor={searchId}>
            Search cortex
          </label>
          <svg
            className={[
              'pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2',
              isLight ? 'text-slate-500/80' : 'text-white/45',
            ].join(' ')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter signals…"
            className={[
              'fetch-brain-cortex-search fetch-brain-cortex-search--field w-full rounded-full border-0 py-2.5 pl-10 pr-4 text-[12px] font-medium outline-none',
              isLight
                ? 'bg-white/25 text-slate-900 shadow-[inset_0_0_0_1px_rgba(var(--brain-glow),0.2)] placeholder:text-slate-500'
                : 'bg-black/30 text-white shadow-[inset_0_0_0_1px_rgba(var(--brain-glow),0.25)] placeholder:text-white/40',
            ].join(' ')}
          />
        </div>
        <div className="grid grid-cols-3 items-center gap-1 px-0.5">
          <div className="flex justify-start">
            {stage !== 'galaxy' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  goBack()
                }}
                className={[
                  'rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em]',
                  isLight ? 'bg-black/5 text-slate-600 hover:bg-black/10' : 'bg-white/10 text-white/75 hover:bg-white/15',
                ].join(' ')}
              >
                ← Back
              </button>
            ) : null}
          </div>
          <p
            className={[
              'text-center text-[10px] font-bold uppercase tracking-[0.22em] opacity-55',
              isLight ? 'text-slate-700' : 'text-white/65',
            ].join(' ')}
          >
            {stageLabel}
          </p>
          <span className="min-w-0" aria-hidden />
        </div>
      </div>

      <div
        ref={fieldRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        role="presentation"
      >
        {stage === 'galaxy' ? (
          <p
            className={[
              'pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[5] w-[90%] max-w-sm -translate-x-1/2 text-center text-[11px] font-medium uppercase tracking-[0.18em] opacity-50',
              isLight ? 'text-slate-700' : 'text-white/58',
            ].join(' ')}
          >
            Tap the nucleus to zoom in · then open a lobe
          </p>
        ) : null}
        {stage === 'cluster' || stage === 'recall' ? (
          activeHub === 'hub:flow' ? (
            <div className="pointer-events-auto absolute right-3 top-2 z-20 flex gap-1">
              {(['all', 'payments', 'quotes'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFlowFilter(f)}
                  className={[
                    'rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider',
                    flowFilter === f
                      ? 'bg-[rgba(var(--brain-glow),0.5)] text-white'
                      : isLight
                        ? 'bg-black/5 text-slate-500'
                        : 'bg-white/10 text-white/55',
                  ].join(' ')}
                >
                  {f}
                </button>
              ))}
            </div>
          ) : null
        ) : null}

        <div
          className="fetch-brain-cortex-world absolute inset-0 transition-[transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            transform: `scale(${worldScale})`,
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            width={dims.w}
            height={dims.h}
            aria-hidden
          >
            {stage === 'galaxy' || stage === 'orbit'
              ? HUBS.map((h) => {
                  const p = hubXY(h.angle)
                  const dim = matchesQuery(q, h.label)
                  return (
                    <line
                      key={`ln-${h.id}`}
                      x1={cx}
                      y1={cy}
                      x2={p.x}
                      y2={p.y}
                      stroke={dim ? lineColor : isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.06)'}
                      strokeWidth={stage === 'orbit' ? 1.1 : 0.65}
                    />
                  )
                })
              : null}
            {stage === 'cluster' || stage === 'recall'
              ? satChildren.map((c, i) => {
                  const ang = satAngles[i]!
                  const sx = cx + RChild * Math.cos(ang)
                  const sy = cy + RChild * Math.sin(ang) * 0.9
                  const hi = inspectId === c.id
                  return (
                    <line
                      key={`cl-${c.id}`}
                      x1={cx}
                      y1={cy}
                      x2={sx}
                      y2={sy}
                      stroke={hi ? lineGlow : lineColor}
                      strokeWidth={hi ? 1.4 : 0.75}
                      opacity={stage === 'recall' && !hi ? 0.35 : 0.85}
                    />
                  )
                })
              : null}
          </svg>

          {stage === 'galaxy' || stage === 'orbit' ? (
            <>
              <button
                type="button"
                onClick={onNucleusClick}
                className={[
                  'fetch-brain-cortex-nucleus-hit pointer-events-auto absolute rounded-full transition-transform duration-500 hover:scale-105',
                  hitTarget,
                ].join(' ')}
                style={{
                  left: cx,
                  top: cy,
                  transform: 'translate(-50%, -50%)',
                }}
                aria-label={stage === 'galaxy' ? 'Zoom in to orbit' : 'Zoom out to far field'}
              >
                <span
                  className={[
                    'fetch-brain-cortex-nucleus block rounded-full ring-2 ring-[rgba(var(--brain-glow),0.55)] transition-transform duration-500',
                    stage === 'galaxy' ? 'h-4 w-4' : 'h-5 w-5',
                  ].join(' ')}
                  style={{
                    background: `radial-gradient(circle, rgba(${glowVar},0.95) 0%, rgba(${glowVar},0.35) 55%, transparent 72%)`,
                    boxShadow: `0 0 24px rgba(${glowVar},0.55), 0 0 48px rgba(${glowVar},0.22)`,
                  }}
                />
              </button>
              {stage === 'orbit' ? (
                <p
                  className={[
                    'pointer-events-none absolute max-w-[9rem] -translate-x-1/2 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.18em]',
                    isLight ? 'text-slate-700/85' : 'text-white/68',
                  ].join(' ')}
                  style={{ left: cx, top: cy + 28 }}
                >
                  Tap nucleus
                </p>
              ) : null}

              {HUBS.map((h, idx) => {
                const p = hubXY(h.angle)
                const hit = matchesQuery(q, h.label)
                const big = stage === 'orbit'
                return (
                  <div
                    key={h.id}
                    className="absolute flex flex-col items-center gap-1"
                    style={{ left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPickHub(h.id)
                      }}
                      className={[
                        'pointer-events-auto rounded-full transition-transform duration-300 hover:scale-105 active:scale-95',
                        hitTarget,
                        hit ? 'opacity-100' : 'opacity-30',
                      ].join(' ')}
                      aria-label={`Open ${h.label} lobe`}
                    >
                      <span
                        className={[
                          'fetch-brain-cortex-mote block',
                          big ? hubDotOrbitVisual : hubDotGalaxyVisual,
                        ].join(' ')}
                        style={{
                          background: big
                            ? isLight
                              ? `radial-gradient(circle, rgba(${glowVar},0.35) 0%, rgba(255,255,255,0.85) 70%)`
                              : `radial-gradient(circle, rgba(${glowVar},0.5) 0%, rgba(20,22,32,0.92) 72%)`
                            : `radial-gradient(circle, rgba(${glowVar},0.85) 0%, rgba(${glowVar},0.2) 100%)`,
                          boxShadow: big
                            ? `0 0 20px rgba(${glowVar},0.35), inset 0 0 12px rgba(${glowVar},0.15)`
                            : `0 0 10px rgba(${glowVar},0.45)`,
                          animationDelay: `${idx * 0.12}s`,
                        }}
                      />
                    </button>
                    <span
                      className={[
                        'max-w-[4.75rem] text-center text-[8px] font-bold uppercase leading-tight tracking-[0.14em]',
                        big ? 'mt-1' : '',
                        isLight ? 'text-slate-800/88' : 'text-white/78',
                        hit ? 'opacity-100' : 'opacity-35',
                      ].join(' ')}
                    >
                      {h.label}
                    </span>
                  </div>
                )
              })}
            </>
          ) : (
            <>
              <div
                className="fetch-brain-cortex-mote pointer-events-none absolute rounded-full"
                style={{
                  left: cx,
                  top: cy,
                  transform: 'translate(-50%, -50%)',
                  width: 56,
                  height: 56,
                  background: `radial-gradient(circle, rgba(${glowVar},0.4) 0%, rgba(${glowVar},0.08) 65%, transparent 72%)`,
                  boxShadow: `0 0 40px rgba(${glowVar},0.35)`,
                }}
              />
              <p
                className={[
                  'pointer-events-none absolute max-w-[10rem] -translate-x-1/2 text-center text-[10px] font-bold uppercase tracking-[0.2em]',
                  isLight ? 'text-slate-800' : 'text-white/88',
                ].join(' ')}
                style={{ left: cx, top: cy - 36 }}
              >
                {HUBS.find((x) => x.id === activeHub)?.label}
              </p>

              {satChildren.length === 0 ? (
                <p
                  className={[
                    'absolute left-1/2 top-1/2 max-w-xs -translate-x-1/2 -translate-y-1/2 text-center text-[12px]',
                    isLight ? 'text-slate-500' : 'text-white/45',
                  ].join(' ')}
                >
                  No signals match. Adjust search or filters.
                </p>
              ) : (
                satChildren.map((c, i) => {
                  const ang = satAngles[i]!
                  const sx = cx + RChild * Math.cos(ang)
                  const sy = cy + RChild * Math.sin(ang) * 0.9
                  const hi = inspectId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-brain-memory-id={c.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPickChild(c.id)
                      }}
                      className={[
                        'pointer-events-auto absolute flex rounded-full transition-transform duration-300 hover:scale-105 active:scale-95',
                        hitTarget,
                        stage === 'recall' && !hi ? 'opacity-40' : 'opacity-100',
                        hi ? 'ring-2 ring-[rgba(var(--brain-glow),0.78)] ring-offset-2 ring-offset-transparent' : '',
                      ].join(' ')}
                      style={{
                        left: sx,
                        top: sy,
                        transform: `translate(-50%, -50%) ${hi ? 'scale(1.1)' : 'scale(1)'}`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                      aria-label={`Recall ${c.label}`}
                    >
                      <span
                        className={['fetch-brain-cortex-mote block', childDotVisual].join(' ')}
                        style={{
                          background: hi
                            ? `radial-gradient(circle, rgba(${glowVar},0.9) 0%, rgba(${glowVar},0.25) 100%)`
                            : isLight
                              ? 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(15,23,42,0.12) 100%)'
                              : 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(30,32,44,0.95) 100%)',
                          boxShadow: hi ? `0 0 18px rgba(${glowVar},0.55)` : `0 0 8px rgba(${glowVar},0.2)`,
                        }}
                      />
                    </button>
                  )
                })
              )}
            </>
          )}
        </div>
      </div>

      {stage === 'recall' && summary ? (
        <div
          className="fetch-brain-cortex-readout pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[32vh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6"
          style={{
            background: isLight
              ? 'linear-gradient(to top, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.45) 45%, transparent 100%)'
              : 'linear-gradient(to top, rgba(4,6,12,0.88) 0%, rgba(4,6,12,0.4) 50%, transparent 100%)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="mx-auto max-w-md">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-balance">
                {summary.title}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setInspectId(null)
                  onFocusedMemoryIdChange?.(null)
                  setStage('cluster')
                }}
                className={[
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  isLight ? 'text-slate-500 hover:bg-black/5' : 'text-white/55 hover:bg-white/10',
                ].join(' ')}
              >
                ✕
              </button>
            </div>
            <p className="mt-2 whitespace-pre-line text-[12px] leading-relaxed opacity-88 [text-wrap:pretty]">
              {summary.body}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
