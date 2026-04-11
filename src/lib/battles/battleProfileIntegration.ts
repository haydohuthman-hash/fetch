/**
 * Helpers for integrating battle outcomes into existing marketplace surfaces
 * (seller profiles, listing cards, feed cards, live preview cards).
 */

import { getSellerBadgeLabel, getSellerBattleStats, sellerHasActiveFeedBoost } from './battleWinnerStore'
import type { BattleSellerStats } from './types'

export type BattleProfileBadge = {
  label: string
  streak: number
  hasFeedBoost: boolean
}

/**
 * Returns badge info for a seller if they have any battle achievements.
 * Drop into profile headers, listing cards, etc.
 */
export function getSellerBattleBadge(sellerId: string): BattleProfileBadge | null {
  const label = getSellerBadgeLabel(sellerId)
  if (!label) return null
  const stats = getSellerBattleStats(sellerId)
  return {
    label,
    streak: stats?.currentStreak ?? 0,
    hasFeedBoost: sellerHasActiveFeedBoost(sellerId),
  }
}

/**
 * Feed ranking multiplier for battle winners with active 24h boost.
 * Can be applied in feedRanking.ts alongside existing boost tiers.
 */
export function battleFeedBoostMultiplier(sellerId: string): number {
  return sellerHasActiveFeedBoost(sellerId) ? 1.35 : 1
}

/**
 * Format battle stats for display on a seller profile.
 */
export function formatBattleStatsForProfile(stats: BattleSellerStats | null): {
  totalBattles: number
  winRate: string
  currentStreak: number
  bestStreak: number
} | null {
  if (!stats || stats.totalBattles <= 0) return null
  const winRate = stats.totalBattles > 0
    ? `${Math.round((stats.wins / stats.totalBattles) * 100)}%`
    : '0%'
  return {
    totalBattles: stats.totalBattles,
    winRate,
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
  }
}
