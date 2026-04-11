/**
 * Battle economics configuration. Tune scoring weights, boost costs,
 * reward durations, and timer defaults without touching game logic.
 */

import type { BattleBoostTier, BattleMode } from './types'

export const BATTLE_DURATION_MS = 5 * 60 * 1000

export const BATTLE_DURATIONS: Record<string, number> = {
  short: 3 * 60 * 1000,
  standard: 5 * 60 * 1000,
  long: 10 * 60 * 1000,
}

/** Points awarded per event type, keyed by battle mode. */
export type ScoringWeights = {
  salePoints: number
  bidPoints: number
  boostPointsPerCredit: number
}

export const SCORING_WEIGHTS: Record<BattleMode, ScoringWeights> = {
  sales: { salePoints: 100, bidPoints: 10, boostPointsPerCredit: 0.5 },
  bidding: { salePoints: 40, bidPoints: 100, boostPointsPerCredit: 0.5 },
  boost: { salePoints: 20, bidPoints: 20, boostPointsPerCredit: 2 },
  mixed: { salePoints: 80, bidPoints: 50, boostPointsPerCredit: 1 },
}

export type BoostTierConfig = {
  tier: BattleBoostTier
  label: string
  creditsCost: number
  pointsValue: number
  emoji: string
  glowIntensity: 'low' | 'medium' | 'high'
}

export const BOOST_TIERS: BoostTierConfig[] = [
  { tier: 1, label: 'Spark',     creditsCost: 10,   pointsValue: 5,    emoji: '✦',  glowIntensity: 'low' },
  { tier: 2, label: 'Blaze',     creditsCost: 50,   pointsValue: 30,   emoji: '🔥', glowIntensity: 'medium' },
  { tier: 3, label: 'Supernova', creditsCost: 200,  pointsValue: 150,  emoji: '💎', glowIntensity: 'high' },
  { tier: 4, label: 'Meteor',    creditsCost: 500,  pointsValue: 400,  emoji: '☄️', glowIntensity: 'high' },
  { tier: 5, label: 'Diamond',   creditsCost: 1000, pointsValue: 900,  emoji: '💎', glowIntensity: 'high' },
  { tier: 6, label: 'Trophy',    creditsCost: 2000, pointsValue: 2000, emoji: '🏆', glowIntensity: 'high' },
]

export function boostConfigForTier(tier: BattleBoostTier): BoostTierConfig {
  return BOOST_TIERS.find((b) => b.tier === tier) ?? BOOST_TIERS[0]!
}

/** Anti-spam: min ms between boosts from same viewer. */
export const BOOST_COOLDOWN_MS = 800

/** Max boosts per viewer per battle. */
export const BOOST_MAX_PER_VIEWER = 100

/** Winner reward defaults. */
export const WINNER_REWARDS = {
  feedBoostDurationMs: 24 * 60 * 60 * 1000,
  badgeLabel: 'Battle Winner',
  creditsBonus: 50,
  bonusLiveExtensionMs: 5 * 60 * 1000,
  nextBattlePriority: true,
}

/** Streak thresholds for profile badge labels. */
export const STREAK_BADGES: { min: number; label: string }[] = [
  { min: 3, label: 'On Fire' },
  { min: 5, label: 'Unstoppable' },
  { min: 10, label: 'Battle Legend' },
]

/** Tie-breaking: if scores equal, winner = seller with more sales, then bids, then null (true tie). */
export const TIE_RULE = 'sales_then_bids' as const
