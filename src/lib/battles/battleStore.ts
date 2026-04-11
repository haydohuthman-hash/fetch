/**
 * Client-side battle state manager.
 * Holds current battle, processes realtime events, exposes React-friendly hooks.
 */

import { BOOST_COOLDOWN_MS, BOOST_MAX_PER_VIEWER, boostConfigForTier } from './battleConfig'
import { addScore, determineBattleResult, pointsForBid, pointsForBoost, pointsForSale } from './battleScoring'
import type {
  Battle,
  BattleActivityItem,
  BattleBoostEvent,
  BattleBoostTier,
  BattleRealtimeEvent,
  BattleResult,
  BattleSide,
} from './types'

type BattleStoreListener = () => void

let currentBattle: Battle | null = null
let activityFeed: BattleActivityItem[] = []
let listeners: BattleStoreListener[] = []
let viewerBoostCount = 0
let lastBoostMs = 0

const MAX_ACTIVITY = 200

function notify() {
  for (const fn of listeners) fn()
}

export function subscribeBattleStore(fn: BattleStoreListener): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

export function getBattle(): Battle | null {
  return currentBattle
}

export function getActivityFeed(): readonly BattleActivityItem[] {
  return activityFeed
}

export function getViewerBoostCount(): number {
  return viewerBoostCount
}

export function setBattle(battle: Battle | null) {
  currentBattle = battle
  activityFeed = []
  viewerBoostCount = 0
  lastBoostMs = 0
  notify()
}

function pushActivity(item: BattleActivityItem) {
  activityFeed = [item, ...activityFeed].slice(0, MAX_ACTIVITY)
}

export function canBoost(): { ok: boolean; reason?: string } {
  if (!currentBattle || currentBattle.status !== 'live') return { ok: false, reason: 'battle_not_live' }
  if (viewerBoostCount >= BOOST_MAX_PER_VIEWER) return { ok: false, reason: 'max_boosts_reached' }
  if (Date.now() - lastBoostMs < BOOST_COOLDOWN_MS) return { ok: false, reason: 'cooldown' }
  return { ok: true }
}

export function applyLocalBoost(side: BattleSide, tier: BattleBoostTier, viewerName: string): BattleBoostEvent | null {
  if (!currentBattle || currentBattle.status !== 'live') return null
  const check = canBoost()
  if (!check.ok) return null

  const cfg = boostConfigForTier(tier)
  const points = pointsForBoost(currentBattle.mode, tier)
  const now = Date.now()

  const evt: BattleBoostEvent = {
    id: `boost_${now}_${Math.random().toString(36).slice(2, 8)}`,
    viewerId: '',
    viewerName,
    side,
    tier,
    creditsCost: cfg.creditsCost,
    pointsAdded: points,
    createdAt: now,
  }

  currentBattle = {
    ...currentBattle,
    scores: addScore(currentBattle.scores, side, points),
  }
  viewerBoostCount += 1
  lastBoostMs = now

  pushActivity({
    kind: 'boost',
    id: evt.id,
    viewerName,
    side,
    tier,
    points,
    ts: now,
  })

  notify()
  return evt
}

export function processRealtimeEvent(event: BattleRealtimeEvent) {
  if (!currentBattle) return

  switch (event.type) {
    case 'score_updated':
      if (event.battleId !== currentBattle.id) return
      currentBattle = { ...currentBattle, scores: event.scores }
      pushActivity({
        kind: 'boost',
        id: `score_${Date.now()}`,
        viewerName: '',
        side: event.delta.side,
        tier: 1,
        points: event.delta.points,
        ts: Date.now(),
      })
      break

    case 'boost_sent':
      if (event.battleId !== currentBattle.id) return
      currentBattle = {
        ...currentBattle,
        scores: addScore(currentBattle.scores, event.boost.side, event.boost.pointsAdded),
      }
      pushActivity({
        kind: 'boost',
        id: event.boost.id,
        viewerName: event.boost.viewerName,
        side: event.boost.side,
        tier: event.boost.tier,
        points: event.boost.pointsAdded,
        ts: event.boost.createdAt,
      })
      break

    case 'bid_placed':
      if (event.battleId !== currentBattle.id) return
      currentBattle = {
        ...currentBattle,
        scores: addScore(currentBattle.scores, event.side, pointsForBid(currentBattle.mode)),
      }
      pushActivity({
        kind: 'bid',
        id: `bid_${Date.now()}`,
        viewerName: event.viewerName,
        side: event.side,
        amountAud: event.amountAud,
        ts: Date.now(),
      })
      break

    case 'sale_completed':
      if (event.battleId !== currentBattle.id) return
      currentBattle = {
        ...currentBattle,
        scores: addScore(currentBattle.scores, event.side, pointsForSale(currentBattle.mode)),
      }
      pushActivity({
        kind: 'sale',
        id: `sale_${Date.now()}`,
        viewerName: event.viewerName,
        side: event.side,
        productTitle: event.productTitle,
        ts: Date.now(),
      })
      break

    case 'comment_added':
      if (event.battleId !== currentBattle.id) return
      pushActivity({
        kind: 'comment',
        id: event.comment.id,
        viewerName: event.comment.viewerName,
        text: event.comment.text,
        ts: event.comment.createdAt,
      })
      break

    case 'viewer_joined':
      if (event.battleId !== currentBattle.id) return
      currentBattle = { ...currentBattle, viewerCount: event.viewerCount }
      pushActivity({
        kind: 'joined',
        id: `join_${Date.now()}`,
        viewerName: event.viewerName,
        ts: Date.now(),
      })
      break

    case 'product_changed':
      if (event.battleId !== currentBattle.id) return
      {
        const key = event.side === 'a' ? 'sellerA' : 'sellerB'
        currentBattle = {
          ...currentBattle,
          [key]: { ...currentBattle[key], featuredProduct: event.product },
        }
      }
      break

    case 'battle_ended':
      if (event.battleId !== currentBattle.id) return
      currentBattle = { ...currentBattle, status: 'ended', result: event.result }
      break

    case 'winner_declared':
      break

    case 'battle_started':
      currentBattle = event.battle
      activityFeed = []
      viewerBoostCount = 0
      break
  }

  notify()
}

export function endBattleLocally(): BattleResult | null {
  if (!currentBattle) return null
  const tallies = computeTalliesFromFeed()
  const result = determineBattleResult(
    currentBattle.scores,
    tallies,
    currentBattle.sellerA.id,
    currentBattle.sellerB.id,
  )
  currentBattle = { ...currentBattle, status: 'ended', result }
  notify()
  return result
}

function computeTalliesFromFeed() {
  const tallies = {
    boosts: { a: 0, b: 0 },
    bids: { a: 0, b: 0 },
    sales: { a: 0, b: 0 },
  }
  for (const item of activityFeed) {
    if (item.kind === 'boost') tallies.boosts[item.side] += 1
    if (item.kind === 'bid') tallies.bids[item.side] += 1
    if (item.kind === 'sale') tallies.sales[item.side] += 1
  }
  return tallies
}
