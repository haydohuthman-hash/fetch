import { shuffleReels, sortReelsByRanking } from './feedRanking'
import type { DropReel } from './types'

export function reelIsLiveReplay(r: DropReel): boolean {
  return r.mediaKind === 'live_replay'
}

export function reelIsLocalPickup(r: DropReel): boolean {
  return r.categories?.includes('local_pickup') ?? false
}

/**
 * Buckets for the main "Drops" mix only (mutually exclusive).
 * Local pickup (including live replays tagged local) → local bucket.
 * Other live replays → live bucket.
 * Everything else → drop bucket.
 */
export function partitionForDropsMix(pool: DropReel[]): {
  drop: DropReel[]
  live: DropReel[]
  local: DropReel[]
} {
  const drop: DropReel[] = []
  const live: DropReel[] = []
  const local: DropReel[] = []
  for (const r of pool) {
    if (reelIsLocalPickup(r)) local.push(r)
    else if (reelIsLiveReplay(r)) live.push(r)
    else drop.push(r)
  }
  return { drop, live, local }
}

/**
 * Main Drops "for you" mix:
 * - First fold (first 10): guarantee ~10% local exposure when available.
 * - Remaining feed: 70% community/worldwide, 30% local.
 */
const FIRST_FOLD_PATTERN: Array<'w' | 'c'> = ['w', 'w', 'w', 'w', 'w', 'w', 'w', 'w', 'w', 'c']
const FOR_YOU_PATTERN: Array<'w' | 'c'> = ['w', 'w', 'w', 'w', 'w', 'w', 'w', 'c', 'c', 'c']

function pushByPattern(
  out: DropReel[],
  q: { w: DropReel[]; c: DropReel[] },
  total: number,
  pattern: Array<'w' | 'c'>,
) {
  let i = 0
  while (out.length < total && i < pattern.length) {
    const slot = pattern[i]!
    i += 1
    if (q[slot].length > 0) {
      out.push(q[slot].shift()!)
    } else {
      const next = q.w.shift() ?? q.c.shift()
      if (!next) break
      out.push(next)
    }
  }
}

export function mergeDropsMixQueues(drop: DropReel[], live: DropReel[], local: DropReel[]): DropReel[] {
  const world = [...drop, ...live]
  const q = { w: world, c: [...local] }
  const total = world.length + local.length
  const out: DropReel[] = []

  // First fold: make sure local still appears, but lightly (~10%).
  pushByPattern(out, q, total, FIRST_FOLD_PATTERN)

  // Remaining feed: 70% world/community, 30% local.
  let i = 0
  while (out.length < total) {
    const slot = FOR_YOU_PATTERN[i % FOR_YOU_PATTERN.length]!
    i += 1
    if (q[slot].length > 0) {
      out.push(q[slot].shift()!)
    } else {
      const next = q.w.shift() ?? q.c.shift()
      if (!next) break
      out.push(next)
    }
  }
  return out
}

export function buildDropsTabOrderedReels(
  pool: DropReel[],
  likesById: Record<string, number>,
  shuffleNonce: number,
): DropReel[] {
  const { drop, live, local } = partitionForDropsMix(pool)
  const prep = (arr: DropReel[]) => {
    const ranked = sortReelsByRanking(arr, likesById)
    return shuffleNonce > 0 ? shuffleReels(ranked) : ranked
  }
  return mergeDropsMixQueues(prep(drop), prep(live), prep(local))
}

export function filterLocalTabReels(pool: DropReel[]): DropReel[] {
  return pool.filter(reelIsLocalPickup)
}

/** Local tab blend: 50/50 local + world (still sorted by ranking first). */
export function buildLocalTabOrderedReels(
  pool: DropReel[],
  likesById: Record<string, number>,
  shuffleNonce: number,
): DropReel[] {
  const local = filterLocalTabReels(pool)
  const world = pool.filter((r) => !reelIsLocalPickup(r))
  const prep = (arr: DropReel[]) => {
    const ranked = sortReelsByRanking(arr, likesById)
    return shuffleNonce > 0 ? shuffleReels(ranked) : ranked
  }
  const q = { l: prep(local), w: prep(world) }
  const total = q.l.length + q.w.length
  const out: DropReel[] = []
  const pattern: Array<'l' | 'w'> = ['l', 'w']
  let i = 0
  while (out.length < total) {
    const slot = pattern[i % pattern.length]!
    i += 1
    if (q[slot].length > 0) {
      out.push(q[slot].shift()!)
    } else {
      const next = q.l.shift() ?? q.w.shift()
      if (!next) break
      out.push(next)
    }
  }
  return out
}

export function filterLiveTabReels(pool: DropReel[]): DropReel[] {
  return pool.filter(reelIsLiveReplay)
}

/** Live replay with a buy-now listing/product (not showcase) in auction mode → seller auction lane. */
export function reelIsAuctionSellerLive(r: DropReel): boolean {
  if (!reelIsLiveReplay(r)) return false
  if (r.commerceSaleMode !== 'auction' || !r.commerce) return false
  return r.commerce.kind === 'marketplace_product' || r.commerce.kind === 'buy_sell_listing'
}

export function partitionLiveTabReels(pool: DropReel[]): {
  community: DropReel[]
  auctionSeller: DropReel[]
} {
  const live = filterLiveTabReels(pool)
  const community: DropReel[] = []
  const auctionSeller: DropReel[] = []
  for (const r of live) {
    if (reelIsAuctionSellerLive(r)) auctionSeller.push(r)
    else community.push(r)
  }
  return { community, auctionSeller }
}

/** 7 community : 3 auction-seller slots (70% / 30%). */
const LIVE_TAB_MIX_PATTERN: Array<'c' | 'a'> = ['c', 'c', 'c', 'c', 'c', 'c', 'c', 'a', 'a', 'a']

export function mergeLiveTabQueues(community: DropReel[], auctionSeller: DropReel[]): DropReel[] {
  const q = { c: [...community], a: [...auctionSeller] }
  const total = community.length + auctionSeller.length
  const out: DropReel[] = []
  let i = 0
  while (out.length < total) {
    const slot = LIVE_TAB_MIX_PATTERN[i % LIVE_TAB_MIX_PATTERN.length]
    i += 1
    const key = slot === 'c' ? 'c' : 'a'
    if (q[key].length > 0) {
      out.push(q[key].shift()!)
    } else {
      const next = q.c.shift() ?? q.a.shift()
      if (!next) break
      out.push(next)
    }
  }
  return out
}

export function buildLiveTabOrderedReels(
  pool: DropReel[],
  likesById: Record<string, number>,
  shuffleNonce: number,
): DropReel[] {
  const { community, auctionSeller } = partitionLiveTabReels(pool)
  const prep = (arr: DropReel[]) => {
    const ranked = sortReelsByRanking(arr, likesById)
    return shuffleNonce > 0 ? shuffleReels(ranked) : ranked
  }
  return mergeLiveTabQueues(prep(community), prep(auctionSeller))
}
