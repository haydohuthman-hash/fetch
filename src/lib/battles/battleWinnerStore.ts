/**
 * Persists battle outcomes to localStorage so winner badges,
 * feed boost flags, and streak data can influence other surfaces.
 */

import { STREAK_BADGES } from './battleConfig'
import type { BattleResult, BattleSellerStats } from './types'

const WINNERS_KEY = 'fetch.battles.winners.v1'
const STATS_KEY = 'fetch.battles.stats.v1'

type WinnerRecord = {
  battleId: string
  sellerId: string
  side: string
  badgeLabel: string
  feedBoostExpiresAt: number
  creditsBonus: number
  ts: number
}

function loadWinners(): WinnerRecord[] {
  try {
    const raw = localStorage.getItem(WINNERS_KEY)
    return raw ? (JSON.parse(raw) as WinnerRecord[]) : []
  } catch {
    return []
  }
}

function saveWinners(records: WinnerRecord[]) {
  try {
    localStorage.setItem(WINNERS_KEY, JSON.stringify(records.slice(0, 200)))
  } catch {}
}

function loadStats(): Record<string, BattleSellerStats> {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, BattleSellerStats>) : {}
  } catch {
    return {}
  }
}

function saveStats(stats: Record<string, BattleSellerStats>) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {}
}

export function recordBattleOutcome(
  battleId: string,
  result: BattleResult,
  sellerAId: string,
  sellerBId: string,
) {
  const now = Date.now()
  if (result.winnerId && result.winnerSide && result.rewards) {
    const record: WinnerRecord = {
      battleId,
      sellerId: result.winnerId,
      side: result.winnerSide,
      badgeLabel: result.rewards.badgeLabel,
      feedBoostExpiresAt: now + result.rewards.feedBoostDurationMs,
      creditsBonus: result.rewards.creditsBonus,
      ts: now,
    }
    const winners = loadWinners()
    if (!winners.some((w) => w.battleId === battleId)) {
      saveWinners([record, ...winners])
    }
  }

  const stats = loadStats()
  for (const sid of [sellerAId, sellerBId]) {
    const s = stats[sid] ?? {
      sellerId: sid,
      totalBattles: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      currentStreak: 0,
      bestStreak: 0,
      totalBoostsReceived: 0,
      totalSalesInBattles: 0,
    }
    s.totalBattles += 1
    const side = sid === sellerAId ? 'a' : 'b'
    s.totalBoostsReceived += result.totalBoosts[side as 'a' | 'b']
    s.totalSalesInBattles += result.totalSales[side as 'a' | 'b']

    if (result.isTie) {
      s.ties += 1
      s.currentStreak = 0
    } else if (result.winnerId === sid) {
      s.wins += 1
      s.currentStreak += 1
      s.bestStreak = Math.max(s.bestStreak, s.currentStreak)
    } else {
      s.losses += 1
      s.currentStreak = 0
    }
    stats[sid] = s
  }
  saveStats(stats)
}

export function getSellerBattleStats(sellerId: string): BattleSellerStats | null {
  const stats = loadStats()
  return stats[sellerId] ?? null
}

export function sellerHasActiveFeedBoost(sellerId: string): boolean {
  const now = Date.now()
  return loadWinners().some((w) => w.sellerId === sellerId && w.feedBoostExpiresAt > now)
}

export function getSellerBadgeLabel(sellerId: string): string | null {
  const stats = getSellerBattleStats(sellerId)
  if (!stats) return null
  if (stats.currentStreak <= 0 && stats.wins <= 0) return null

  for (let i = STREAK_BADGES.length - 1; i >= 0; i--) {
    if (stats.currentStreak >= STREAK_BADGES[i]!.min) return STREAK_BADGES[i]!.label
  }

  const winners = loadWinners()
  const recentWin = winners.find((w) => w.sellerId === sellerId)
  if (recentWin && Date.now() - recentWin.ts < 7 * 24 * 60 * 60 * 1000) {
    return recentWin.badgeLabel
  }

  return null
}
