import { DROPS_ESTIMATED_MAU } from './constants'
import type { DropBoostTier, DropCategoryId, DropRegionCode } from './types'

const CATEGORY_WEIGHT: Record<DropCategoryId, number> = {
  supplies: 1.12,
  local_pickup: 1.05,
  b2b: 0.92,
  promo: 1.18,
  community: 1.0,
  services: 1.06,
}

const REGION_WEIGHT: Record<DropRegionCode, number> = {
  SEQ: 1.14,
  NSW: 1.08,
  VIC: 1.06,
  AU_WIDE: 1.0,
}

const BOOST_VIEW_BONUS: Record<DropBoostTier, number> = {
  0: 1,
  1: 1.35,
  2: 1.85,
  3: 2.55,
}

function hashToJitter(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 97) / 97 - 0.5
}

/**
 * Estimated impression range for the next 7 days (demo formula).
 * Replace with model: active_users × category fit × boost × quality score.
 */
export function estimateDropViewRange(input: {
  reelId: string
  categories: DropCategoryId[]
  region: DropRegionCode
  boostTier: DropBoostTier
  isOfficialOrSponsored?: boolean
}): { low: number; high: number; label: string } {
  const catW = Math.max(
    ...input.categories.map((c) => CATEGORY_WEIGHT[c] ?? 1),
    1,
  )
  const regW = REGION_WEIGHT[input.region] ?? 1
  const boostW = BOOST_VIEW_BONUS[input.boostTier] ?? 1
  const sponsorW = input.isOfficialOrSponsored ? 1.25 : 1
  const base = DROPS_ESTIMATED_MAU * 0.018 * catW * regW * boostW * sponsorW
  const jitter = 1 + hashToJitter(input.reelId) * 0.22
  const mid = base * jitter
  if (DROPS_ESTIMATED_MAU <= 0 || !Number.isFinite(mid) || mid < 1) {
    return { low: 0, high: 0, label: '—' }
  }
  const low = Math.max(120, Math.round(mid * 0.62))
  const high = Math.max(low + 50, Math.round(mid * 1.38))
  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n)
  return { low, high, label: `${fmt(low)}–${fmt(high)}` }
}

export function estimatedMauLabel(): string {
  if (DROPS_ESTIMATED_MAU >= 1_000_000) return `${(DROPS_ESTIMATED_MAU / 1_000_000).toFixed(1)}M`
  if (DROPS_ESTIMATED_MAU >= 1000) return `${Math.round(DROPS_ESTIMATED_MAU / 100) / 10}k`
  return String(DROPS_ESTIMATED_MAU)
}
