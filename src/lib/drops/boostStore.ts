import type { DropBoostTier } from './types'

const KEY = 'fetch.drops.boost.v1'

type BoostMap = Record<string, DropBoostTier>

function load(): BoostMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as BoostMap
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

function save(m: BoostMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

export function getBoostTierForReel(reelId: string): DropBoostTier {
  const m = load()
  const t = m[reelId]
  if (t === 1 || t === 2 || t === 3) return t
  return 0
}

export function setBoostTierForReel(reelId: string, tier: DropBoostTier) {
  const m = load()
  if (tier <= 0) delete m[reelId]
  else m[reelId] = tier
  save(m)
}

export const BOOST_TIER_COPY: { tier: DropBoostTier; label: string; priceAud: string; blurb: string }[] = [
  { tier: 1, label: 'Standard', priceAud: '$4.99', blurb: 'Higher feed priority · est. +35% views' },
  { tier: 2, label: 'Plus', priceAud: '$14.99', blurb: 'Strong boost · category + region targeting (soon)' },
  { tier: 3, label: 'Max', priceAud: '$39.99', blurb: 'Top placement window · matches official promo rules' },
]

/** TikTok-style gift tiles; each maps to a boost tier (same checkout / feed rules). */
export const DROP_GIFT_PANEL = [
  { id: 'rose', tier: 1 as const, title: 'Rose', hook: 'Classic thank-you' },
  { id: 'hearts', tier: 1 as const, title: 'Hearts', hook: 'Double the love' },
  { id: 'clap', tier: 2 as const, title: 'Applause', hook: 'Cheer them on' },
  { id: 'fireworks', tier: 2 as const, title: 'Fireworks', hook: 'Light up the feed' },
  { id: 'rocket', tier: 3 as const, title: 'Rocket', hook: 'Turbo visibility' },
  { id: 'crown', tier: 3 as const, title: 'Crown', hook: 'Top supporter' },
] as const

export type DropGiftPanelId = (typeof DROP_GIFT_PANEL)[number]['id']

export function boostCopyForTier(tier: DropBoostTier): (typeof BOOST_TIER_COPY)[number] | undefined {
  return BOOST_TIER_COPY.find((b) => b.tier === tier)
}
