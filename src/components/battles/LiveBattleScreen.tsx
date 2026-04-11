import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useBattle } from '../../lib/battles/useBattle'
import { setBattle } from '../../lib/battles/battleStore'
import { createDemoBattle, createDemoActivity } from '../../lib/battles/battleDemoData'
import { BOOST_TIERS } from '../../lib/battles/battleConfig'
import { scoreRatio } from '../../lib/battles/battleScoring'
import { recordBattleOutcome } from '../../lib/battles/battleWinnerStore'
import type {
  BattleActivityItem,
  BattleBoostTier,
  BattleFeaturedProduct,
  BattleSeller,
  BattleSide,
} from '../../lib/battles/types'
import { BattleWinnerOverlay } from './BattleWinnerOverlay'
import { FetchCommercePillSlider } from '../commerce/FetchCommercePillSlider'

type Props = {
  open: boolean
  onClose: () => void
  onCommerceAction?: (side: BattleSide, action: 'buy' | 'bid', product: BattleFeaturedProduct) => void
}

type ChatBubble = { id: string; text: string; bright: boolean; icon: string; spawnMs: number }
const CHAT_TTL = 6000
const CHAT_MAX = 8

type ActivityToast = { id: string; label: string; side: BattleSide; tier: number; spawnMs: number }
const TOAST_TTL = 2800
const TOAST_MAX = 6

/** Cheapest tier for one-tap “quick pick” next to Buy / Bid. */
const QUICK_PICK_BOOST = BOOST_TIERS[0]!

type GiftId = 'rose' | 'hearts' | 'applause' | 'fireworks' | 'rocket' | 'crown' | 'meteor' | 'diamond' | 'trophy'
type GiftDef = { id: GiftId; emoji: string; label: string; tier: BattleBoostTier; cost: number }

const GIFT_ITEMS: GiftDef[] = [
  { id: 'rose',      emoji: '🌹', label: 'Rose',      tier: 1, cost: 10 },
  { id: 'hearts',    emoji: '💛', label: 'Hearts',    tier: 1, cost: 10 },
  { id: 'applause',  emoji: '👏', label: 'Applause',  tier: 2, cost: 50 },
  { id: 'fireworks', emoji: '🎆', label: 'Fireworks', tier: 2, cost: 50 },
  { id: 'rocket',    emoji: '🚀', label: 'Rocket',    tier: 3, cost: 100 },
  { id: 'crown',     emoji: '👑', label: 'Crown',     tier: 3, cost: 200 },
  { id: 'meteor',    emoji: '☄️', label: 'Meteor',    tier: 4, cost: 500 },
  { id: 'diamond',   emoji: '💎', label: 'Diamond',   tier: 5, cost: 1000 },
  { id: 'trophy',    emoji: '🏆', label: 'Trophy',    tier: 6, cost: 2000 },
]

type ActiveGiftAnim = { key: number; giftId: GiftId }

function LiveBattleScreenInner({ open, onClose, onCommerceAction }: Props) {
  const { battle, activity, sendBoost, checkCanBoost, endBattle } = useBattle()
  const [commentDraft, setCommentDraft] = useState('')
  const [showWinner, setShowWinner] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [scorePulse, setScorePulse] = useState<BattleSide | null>(null)
  const [giftPanelOpen, setGiftPanelOpen] = useState(false)
  const [giftPicked, setGiftPicked] = useState<GiftDef | null>(null)
  const [giftAnims, setGiftAnims] = useState<ActiveGiftAnim[]>([])
  const giftAnimKey = useRef(0)
  const timerRef = useRef<number>(0)

  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>([])
  const [toasts, setToasts] = useState<ActivityToast[]>([])
  const seenActivityRef = useRef(new Set<string>())

  useEffect(() => {
    if (open && !battle) setBattle(createDemoBattle())
  }, [open, battle])

  useEffect(() => {
    if (!battle?.endsAt || battle.status !== 'live') return
    const tick = () => {
      const r = Math.max(0, (battle.endsAt ?? 0) - Date.now())
      setTimeLeft(r)
      if (r <= 0) {
        const res = endBattle()
        if (res && battle) {
          recordBattleOutcome(battle.id, res, battle.sellerA.id, battle.sellerB.id)
          setShowWinner(true)
        }
      }
    }
    tick()
    timerRef.current = window.setInterval(tick, 250)
    return () => window.clearInterval(timerRef.current)
  }, [battle?.endsAt, battle?.status, battle?.id, endBattle])

  useEffect(() => {
    const items = activity.length > 0 ? activity : createDemoActivity()
    const now = Date.now()
    for (const item of items) {
      if (seenActivityRef.current.has(item.id)) continue
      seenActivityRef.current.add(item.id)
      const bubble = activityToBubble(item, now)
      if (bubble) setChatBubbles((p) => [bubble, ...p].slice(0, CHAT_MAX))
      const toast = activityToToast(item, now)
      if (toast) setToasts((p) => [toast, ...p].slice(0, TOAST_MAX))
    }
  }, [activity])

  useEffect(() => {
    if (chatBubbles.length === 0) return
    const t = window.setInterval(() => setChatBubbles((p) => p.filter((b) => Date.now() - b.spawnMs < CHAT_TTL)), 500)
    return () => window.clearInterval(t)
  }, [chatBubbles.length])

  useEffect(() => {
    if (toasts.length === 0) return
    const t = window.setInterval(() => setToasts((p) => p.filter((b) => Date.now() - b.spawnMs < TOAST_TTL)), 400)
    return () => window.clearInterval(t)
  }, [toasts.length])

  const fmt = useCallback((ms: number) => {
    const s = Math.ceil(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }, [])

  const boost = useCallback(
    (side: BattleSide, tier: BattleBoostTier, animGiftId?: GiftId) => {
      if (!checkCanBoost().ok) return
      const evt = sendBoost(side, tier, 'You')
      if (!evt) return
      setScorePulse(side)
      setTimeout(() => setScorePulse(null), 500)
      if (animGiftId) {
        const k = ++giftAnimKey.current
        setGiftAnims((p) => [...p, { key: k, giftId: animGiftId }])
        setTimeout(() => setGiftAnims((p) => p.filter((a) => a.key !== k)), 2200)
      }
      setGiftPanelOpen(false)
      setGiftPicked(null)
    },
    [sendBoost, checkCanBoost],
  )

  const prodAction = useCallback(
    (side: BattleSide) => {
      if (!battle) return
      const s = side === 'a' ? battle.sellerA : battle.sellerB
      if (!s.featuredProduct) return
      onCommerceAction?.(side, s.featuredProduct.saleMode === 'auction' ? 'bid' : 'buy', s.featuredProduct)
    },
    [battle, onCommerceAction],
  )

  const quickPickBoost = useCallback(
    (side: BattleSide) => {
      boost(side, QUICK_PICK_BOOST.tier)
    },
    [boost],
  )

  const ratio = useMemo(() => (battle ? scoreRatio(battle.scores) : { a: 0.5, b: 0.5 }), [battle?.scores])
  const urgent = timeLeft < 30_000
  const leading: BattleSide | null = battle
    ? battle.scores.a > battle.scores.b ? 'a' : battle.scores.b > battle.scores.a ? 'b' : null
    : null

  if (!open || !battle) return null

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#1a1a1a] text-white">

      {/* ── ambient orbs ── */}
      <AmbientOrbs leading={leading} />

      {/* ── top HUD — nav + timer ── */}
      <div className="pointer-events-auto absolute inset-x-0 top-0 z-30 pt-[max(0.35rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between px-2.5 pb-1">
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-[15px]" aria-label="Back">←</button>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-red-600/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_0_8px_rgba(220,38,38,0.4)]">Live</span>
            <div className={`rounded-full px-2.5 py-[3px] font-mono text-[12px] font-bold tabular-nums ${urgent ? 'animate-pulse bg-red-600/90 text-white' : 'bg-white/[0.07] text-[#e8dcc8]'}`}>
              {fmt(timeLeft)}
            </div>
            <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/70">👁 {battle.viewerCount}</span>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-[14px]" aria-label="Exit">✕</button>
        </div>
      </div>

      {/* ── seller columns + score bar + buy/bid ── */}
      <div className="absolute inset-x-0 top-[max(7rem,calc(env(safe-area-inset-top)+6.5rem))] z-[3] flex flex-col items-center px-1">
        <div className="flex w-full justify-center">
          <SellerBox seller={battle.sellerA} side="a" leading={leading === 'a'} />
          <SellerBox seller={battle.sellerB} side="b" leading={leading === 'b'} />
        </div>
        {/* score bar spanning both sellers */}
        <div className="mt-1.5 w-full px-1.5">
          <div className="relative h-[22px] overflow-hidden rounded-full bg-white/[0.07]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 ease-out" style={{ width: `${Math.max(3, ratio.a * 100)}%` }} />
            <div className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-[#e8dcc8] to-[#c9ba9a] transition-all duration-700 ease-out" style={{ width: `${Math.max(3, ratio.b * 100)}%` }} />
            <div className="absolute top-0 h-full w-[2px] -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)] transition-all duration-700" style={{ left: `${ratio.a * 100}%` }} />
            <span className={`absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[11px] font-black tabular-nums drop-shadow-sm transition-transform duration-300 ${scorePulse === 'a' ? 'scale-110 text-[#1a1a1a]' : 'text-[#2a2a2a]'}`}>{battle.scores.a}</span>
            <span className={`absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] font-black tabular-nums drop-shadow-sm transition-transform duration-300 ${scorePulse === 'b' ? 'scale-110 text-[#1a1a1a]' : 'text-[#2a2a2a]'}`}>{battle.scores.b}</span>
          </div>
        </div>
        {/* buy/bid buttons under bar */}
        <div className="mt-1.5 flex w-full justify-center">
          <SellerButtons seller={battle.sellerA} onAction={() => prodAction('a')} onQuickBoost={() => quickPickBoost('a')} />
          <SellerButtons seller={battle.sellerB} onAction={() => prodAction('b')} onQuickBoost={() => quickPickBoost('b')} />
        </div>
      </div>

      {/* ── floating toasts ── */}
      <div className="pointer-events-none absolute inset-x-0 top-[35%] bottom-[40%] z-20 flex flex-col-reverse items-center justify-start gap-1 overflow-hidden px-8">
        {toasts.map((t) => {
          const age = Date.now() - t.spawnMs
          const opacity = Math.max(0, 1 - age / TOAST_TTL)
          const y = Math.min(80, (age / TOAST_TTL) * 80)
          return (
            <div
              key={t.id}
              className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold transition-none"
              style={{
                opacity,
                transform: `translateY(-${y}px)`,
                background: t.tier >= 2 ? 'rgba(232,220,200,0.12)' : 'rgba(255,255,255,0.06)',
                color: t.tier >= 2 ? '#e8dcc8' : 'rgba(255,255,255,0.7)',
              }}
            >
              {t.label}
            </div>
          )
        })}
      </div>

      {/* ── floating chat ── */}
      <div className="pointer-events-none absolute bottom-[5.5rem] left-0 z-20 flex w-[60%] max-w-[260px] flex-col-reverse gap-[3px] px-2.5">
        {chatBubbles.map((b) => {
          const age = Date.now() - b.spawnMs
          const opacity = age < CHAT_TTL * 0.6 ? 0.95 : Math.max(0, 1 - (age - CHAT_TTL * 0.6) / (CHAT_TTL * 0.4))
          return (
            <p
              key={b.id}
              className="rounded-lg px-2 py-[3px] text-[10px] leading-snug transition-none"
              style={{
                opacity,
                background: b.bright ? 'rgba(232,220,200,0.1)' : 'rgba(0,0,0,0.3)',
                color: b.bright ? 'rgba(232,220,200,0.92)' : 'rgba(255,255,255,0.5)',
              }}
            >
              {b.icon}{b.text}
            </p>
          )
        })}
      </div>

      {/* ── bottom strip: boost button + input ── */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Say something…"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[12px] text-white placeholder:text-white/25 outline-none focus:border-[#e8dcc8]/25"
          />
          <button
            type="button"
            onClick={() => { if (commentDraft.trim()) setCommentDraft('') }}
            disabled={!commentDraft.trim()}
            className="shrink-0 rounded-full bg-white/[0.07] px-3 py-2 text-[11px] font-bold text-white/60 disabled:opacity-25"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => setGiftPanelOpen((p) => !p)}
            className="battle-glow-pulse shrink-0 rounded-full bg-[#e8dcc8]/15 px-3.5 py-2 text-[12px] font-bold text-[#e8dcc8] shadow-[0_0_10px_rgba(232,220,200,0.15)]"
          >
            🎁 Boost
          </button>
        </div>
      </div>

      {/* ── gift / boost panel ── */}
      {giftPanelOpen && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-[max(3.5rem,calc(env(safe-area-inset-bottom)+3rem))] z-40 px-2">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a1f16]/95 p-3 shadow-2xl backdrop-blur-lg">
            {giftPicked == null ? (
              <>
                <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[#e8dcc8]/50">Send a Boost Gift</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {GIFT_ITEMS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGiftPicked(g)}
                      className="flex flex-col items-center gap-0.5 rounded-xl bg-white/[0.04] py-2 transition-transform active:scale-95"
                    >
                      <span className="text-[22px]">{g.emoji}</span>
                      <span className="text-[9px] font-bold text-white/80">{g.label}</span>
                      <span className="text-[8px] font-semibold text-[#e8dcc8]/50">{g.cost >= 100 ? `$${(g.cost / 100).toFixed(0)}` : `${g.cost}c`}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[#e8dcc8]/50">Who gets the {giftPicked.emoji} {giftPicked.label}?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => boost('a', giftPicked.tier, giftPicked.id)}
                    className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-emerald-800/40 py-3 transition-transform active:scale-95"
                  >
                    <span className="text-[20px]">{battle.sellerA.avatar}</span>
                    <span className="text-[11px] font-bold text-white/90">{battle.sellerA.displayName}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => boost('b', giftPicked.tier, giftPicked.id)}
                    className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-[#e8dcc8]/[0.08] py-3 transition-transform active:scale-95"
                  >
                    <span className="text-[20px]">{battle.sellerB.avatar}</span>
                    <span className="text-[11px] font-bold text-white/90">{battle.sellerB.displayName}</span>
                  </button>
                </div>
                <button type="button" onClick={() => setGiftPicked(null)} className="mt-2 w-full text-center text-[10px] font-semibold text-white/40">← Back</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── gift animations overlay ── */}
      {giftAnims.map((a) => (
        <GiftAnimation key={a.key} giftId={a.giftId} />
      ))}

      {/* winner overlay */}
      {showWinner && battle.result && (
        <BattleWinnerOverlay
          result={battle.result}
          sellerA={battle.sellerA}
          sellerB={battle.sellerB}
          onClose={() => { setShowWinner(false); onClose() }}
          onRematch={() => setShowWinner(false)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */

function activityToBubble(item: BattleActivityItem, now: number): ChatBubble | null {
  let text = ''; let bright = false; let icon = ''
  switch (item.kind) {
    case 'comment': text = `${item.viewerName}: ${item.text}`; break
    case 'follow': text = `${item.viewerName} followed ${item.sellerName}`; icon = '♡ '; break
    case 'joined': text = `${item.viewerName} joined`; break
    case 'boost': text = `${item.viewerName} boosted ${item.side === 'a' ? '←' : '→'} +${item.points}`; icon = '✦ '; bright = item.tier >= 2; break
    case 'bid': text = `${item.viewerName} bid $${item.amountAud}`; icon = '🔨 '; bright = true; break
    case 'sale': text = `${item.viewerName} bought ${item.productTitle}`; icon = '💰 '; bright = true; break
    default: return null
  }
  return { id: item.id, text, bright, icon, spawnMs: now }
}

function activityToToast(item: BattleActivityItem, now: number): ActivityToast | null {
  switch (item.kind) {
    case 'boost': return { id: `t_${item.id}`, label: `✦ ${item.viewerName} +${item.points}`, side: item.side, tier: item.tier, spawnMs: now }
    case 'bid': return { id: `t_${item.id}`, label: `🔨 ${item.viewerName} bid $${item.amountAud}`, side: item.side, tier: 2, spawnMs: now }
    case 'sale': return { id: `t_${item.id}`, label: `💰 ${item.viewerName} bought ${item.productTitle}`, side: item.side, tier: 2, spawnMs: now }
    default: return null
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SellerBox — product info + tall rectangle (no buy buttons)
   ═══════════════════════════════════════════════════════════════════ */

function SellerBox({ seller, side, leading }: {
  seller: BattleSeller; side: BattleSide; leading: boolean
}) {
  const isA = side === 'a'
  const prod = seller.featuredProduct
  return (
    <div className="flex w-[calc(50%-2px)] max-w-[300px] flex-col items-center">
      {prod ? (
        <div className="mb-1 flex w-full items-center gap-1.5 px-1 py-1">
          <img src={prod.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded border border-white/[0.06] object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[9px] font-semibold leading-tight text-white/70">{prod.title}</p>
          </div>
        </div>
      ) : <div className="h-10" />}

      <div
        className={[
          'relative aspect-[5/9] w-full overflow-hidden transition-all duration-700',
          leading ? 'brightness-110 saturate-[1.1]' : 'brightness-[0.82]',
        ].join(' ')}
      >
        <div className={`absolute inset-0 ${isA ? 'bg-gradient-to-br from-[#0d3b28] via-[#072a1b] to-[#041a10]' : 'bg-gradient-to-bl from-[#1a2e14] via-[#0e2310] to-[#071a0b]'}`} />
        <div
          className="absolute inset-0 animate-[battleBgDrift_12s_ease-in-out_infinite_alternate] opacity-[0.09]"
          style={{
            backgroundImage: isA
              ? 'radial-gradient(ellipse at 35% 55%, rgba(52,211,153,0.6), transparent 70%)'
              : 'radial-gradient(ellipse at 65% 45%, rgba(232,220,200,0.5), transparent 70%)',
          }}
        />
        <div className={`absolute inset-0 opacity-[0.04] ${isA ? 'animate-[battleMeterShimmer_9s_linear_infinite]' : 'animate-[battleMeterShimmer_11s_linear_infinite_reverse]'} bg-[length:200%_200%] bg-gradient-to-br from-transparent via-white to-transparent`} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`select-none text-[56px] transition-transform duration-700 animate-[battleAvatarBreathe_4s_ease-in-out_infinite] ${leading ? 'scale-110' : 'scale-95 opacity-60'}`}>
            {seller.avatar}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-5">
          <span className="text-[12px]">{seller.avatar}</span>
          <span className="min-w-0 truncate text-[10px] font-bold text-white/90">{seller.displayName}</span>
          {seller.rating ? <span className="text-[8px] font-semibold text-[#e8dcc8]/50">★{seller.rating.toFixed(1)}</span> : null}
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
        </div>
        {leading && <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(232,220,200,0.06)]" />}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SellerButtons — thin boost on top; slide buy/bid below
   ═══════════════════════════════════════════════════════════════════ */

function SellerButtons({ seller, onAction, onQuickBoost }: {
  seller: BattleSeller; onAction: () => void; onQuickBoost: () => void
}) {
  const prod = seller.featuredProduct
  return (
    <div className="flex w-[calc(50%-2px)] max-w-[300px] flex-col gap-1 px-0.5">
      <button
        type="button"
        onClick={onQuickBoost}
        aria-label="Quick boost"
        className="battle-glow-pulse flex h-7 w-full items-center justify-center gap-1 rounded-full border border-[#e8dcc8]/30 bg-[#e8dcc8]/[0.12] text-[#e8dcc8] shadow-[0_0_10px_rgba(232,220,200,0.14)] transition-transform active:scale-[0.98]"
      >
        <span className="text-[15px] leading-none">🔥</span>
        <span className="text-[10px] font-black uppercase tracking-wide">Boost</span>
      </button>
      {prod ? (
        <FetchCommercePillSlider
          mode={prod.saleMode === 'auction' ? 'bid' : 'buy'}
          priceLabel={`$${(prod.priceCents / 100).toFixed(prod.priceCents % 100 === 0 ? 0 : 2)}`}
          onConfirm={onAction}
        />
      ) : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */

const ORB_POOL = [
  { cx: '20%', cy: '45%', r: 90, hue: 'rgba(52,211,153,0.06)', dur: '14s', delay: '0s' },
  { cx: '75%', cy: '38%', r: 70, hue: 'rgba(232,220,200,0.05)', dur: '18s', delay: '3s' },
  { cx: '50%', cy: '55%', r: 110, hue: 'rgba(52,211,153,0.04)', dur: '20s', delay: '6s' },
  { cx: '35%', cy: '62%', r: 60, hue: 'rgba(232,220,200,0.04)', dur: '16s', delay: '1s' },
  { cx: '65%', cy: '30%', r: 80, hue: 'rgba(255,255,255,0.02)', dur: '22s', delay: '4s' },
]

function AmbientOrbs({ leading }: { leading: BattleSide | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {ORB_POOL.map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-[battleOrbFloat_var(--dur)_ease-in-out_infinite_alternate] blur-[40px]"
          style={{ '--dur': orb.dur, left: orb.cx, top: orb.cy, width: orb.r, height: orb.r, background: orb.hue, animationDelay: orb.delay, opacity: leading ? 1 : 0.7 } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   GiftAnimation — unique full-screen animation per gift type
   ═══════════════════════════════════════════════════════════════════ */

const GIFT_ANIM_PARTICLES: Record<GiftId, { emoji: string; count: number; cls: string }> = {
  rose:      { emoji: '🌹', count: 12, cls: 'gift-anim-rose' },
  hearts:    { emoji: '💛', count: 16, cls: 'gift-anim-hearts' },
  applause:  { emoji: '👏', count: 10, cls: 'gift-anim-applause' },
  fireworks: { emoji: '✨', count: 20, cls: 'gift-anim-fireworks' },
  rocket:    { emoji: '🚀', count: 3,  cls: 'gift-anim-rocket' },
  crown:     { emoji: '👑', count: 8,  cls: 'gift-anim-crown' },
  meteor:    { emoji: '☄️', count: 6,  cls: 'gift-anim-meteor' },
  diamond:   { emoji: '💎', count: 14, cls: 'gift-anim-diamond' },
  trophy:    { emoji: '🏆', count: 5,  cls: 'gift-anim-trophy' },
}

function GiftAnimation({ giftId }: { giftId: GiftId }) {
  const cfg = GIFT_ANIM_PARTICLES[giftId]
  const particles = useMemo(() => {
    return Array.from({ length: cfg.count }, (_, i) => ({
      id: i,
      left: `${5 + Math.random() * 90}%`,
      delay: `${Math.random() * 0.6}s`,
      size: 18 + Math.random() * 16,
    }))
  }, [cfg.count])

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className={cfg.cls}
          style={{
            position: 'absolute',
            left: p.left,
            bottom: '-10%',
            fontSize: p.size,
            animationDelay: p.delay,
          }}
        >
          {cfg.emoji}
        </span>
      ))}
    </div>
  )
}

export const LiveBattleScreen = memo(LiveBattleScreenInner)
