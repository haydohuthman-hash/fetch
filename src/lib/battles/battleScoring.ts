/**
 * Central scoring engine for Live Battles.
 * All point calculations flow through here; server validates the same weights.
 */

import { SCORING_WEIGHTS, boostConfigForTier, TIE_RULE } from './battleConfig'
import type { BattleBoostTier, BattleMode, BattleResult, BattleScores, BattleSide, BattleWinnerReward } from './types'
import { WINNER_REWARDS } from './battleConfig'

export function pointsForSale(mode: BattleMode): number {
  return SCORING_WEIGHTS[mode].salePoints
}

export function pointsForBid(mode: BattleMode): number {
  return SCORING_WEIGHTS[mode].bidPoints
}

export function pointsForBoost(mode: BattleMode, tier: BattleBoostTier): number {
  const cfg = boostConfigForTier(tier)
  return Math.round(cfg.pointsValue * SCORING_WEIGHTS[mode].boostPointsPerCredit)
}

export function addScore(scores: BattleScores, side: BattleSide, points: number): BattleScores {
  return {
    ...scores,
    [side]: Math.max(0, scores[side] + points),
  }
}

export function scoreRatio(scores: BattleScores): { a: number; b: number } {
  const total = scores.a + scores.b
  if (total <= 0) return { a: 0.5, b: 0.5 }
  return { a: scores.a / total, b: scores.b / total }
}

export type BattleTallies = {
  boosts: { a: number; b: number }
  bids: { a: number; b: number }
  sales: { a: number; b: number }
}

export function determineBattleResult(
  scores: BattleScores,
  tallies: BattleTallies,
  sellerAId: string,
  sellerBId: string,
): BattleResult {
  let winnerId: string | null = null
  let winnerSide: BattleSide | null = null
  let isTie = false

  if (scores.a > scores.b) {
    winnerId = sellerAId
    winnerSide = 'a'
  } else if (scores.b > scores.a) {
    winnerId = sellerBId
    winnerSide = 'b'
  } else {
    if (TIE_RULE === 'sales_then_bids') {
      if (tallies.sales.a > tallies.sales.b) {
        winnerId = sellerAId
        winnerSide = 'a'
      } else if (tallies.sales.b > tallies.sales.a) {
        winnerId = sellerBId
        winnerSide = 'b'
      } else if (tallies.bids.a > tallies.bids.b) {
        winnerId = sellerAId
        winnerSide = 'a'
      } else if (tallies.bids.b > tallies.bids.a) {
        winnerId = sellerBId
        winnerSide = 'b'
      } else {
        isTie = true
      }
    } else {
      isTie = true
    }
  }

  const rewards: BattleWinnerReward | null = winnerId
    ? { ...WINNER_REWARDS }
    : null

  return {
    winnerId,
    winnerSide,
    isTie,
    finalScores: { ...scores },
    totalBoosts: { ...tallies.boosts },
    totalBids: { ...tallies.bids },
    totalSales: { ...tallies.sales },
    rewards,
  }
}
