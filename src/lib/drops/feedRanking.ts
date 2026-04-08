import type { DropBoostTier, DropReel } from './types'
import { getBoostTierForReel } from './boostStore'
import { getWatchMsForReel } from './watchStore'

export type ReelEngagement = {
  reelId: string
  likes: number
}

function boostMultiplier(tier: DropBoostTier): number {
  if (tier === 1) return 1.38
  if (tier === 2) return 1.85
  if (tier === 3) return 2.45
  return 1
}

/**
 * Ranking score: watch time + likes + growth + boost + official weight.
 * Server feed uses similar weights in `listPublishedDropsFeed` when `rank=1`; client watch deltas POST to `/engage`.
 */
export function dropReelScore(
  reel: DropReel,
  likeCount: number,
  extraWatchMs: number,
): number {
  const tier = getBoostTierForReel(reel.id)
  const watch = reel.watchTimeMsSeed + extraWatchMs + getWatchMsForReel(reel.id)
  const likeW = Math.log10(Math.max(10, likeCount))
  const watchW = Math.log10(Math.max(100, watch))
  const growth = reel.growthVelocityScore
  const official = reel.isOfficial || reel.isSponsored ? 1.22 : 1
  return (watchW * 42 + likeW * 28 + growth * 18) * boostMultiplier(tier) * official
}

export function sortReelsByRanking(reels: DropReel[], likesById: Record<string, number>): DropReel[] {
  return [...reels].sort((a, b) => {
    const la = likesById[a.id] ?? a.likes
    const lb = likesById[b.id] ?? b.likes
    const sa = dropReelScore(a, la, 0)
    const sb = dropReelScore(b, lb, 0)
    return sb - sa
  })
}

/** Fisher–Yates shuffle (fresh random order on refresh). */
export function shuffleReels(reels: DropReel[]): DropReel[] {
  const a = [...reels]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
