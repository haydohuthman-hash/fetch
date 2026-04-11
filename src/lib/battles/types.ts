/**
 * Live Battles domain types.
 * Two sellers compete in split-screen; viewers buy, bid, boost, and comment.
 */

export type BattleMode = 'sales' | 'bidding' | 'boost' | 'mixed'
export type BattleStatus = 'pending' | 'live' | 'ended' | 'cancelled'
export type BattleSide = 'a' | 'b'

export type BattleBoostTier = 1 | 2 | 3 | 4 | 5 | 6

export type BattleSeller = {
  id: string
  side: BattleSide
  displayName: string
  avatar: string
  rating?: number
  streamUrl?: string
  /** Currently featured product / listing for this seller. */
  featuredProduct: BattleFeaturedProduct | null
}

export type BattleFeaturedProduct = {
  id: string
  title: string
  imageUrl: string
  priceCents: number
  saleMode: 'fixed' | 'auction'
  bidCount?: number
  saleCount?: number
}

export type BattleScores = {
  a: number
  b: number
}

export type BattleBoostEvent = {
  id: string
  viewerId: string
  viewerName: string
  side: BattleSide
  tier: BattleBoostTier
  creditsCost: number
  pointsAdded: number
  createdAt: number
}

export type BattleCommentEvent = {
  id: string
  viewerId: string
  viewerName: string
  text: string
  createdAt: number
}

export type BattleActivityItem =
  | { kind: 'boost'; id: string; viewerName: string; side: BattleSide; tier: BattleBoostTier; points: number; ts: number }
  | { kind: 'bid'; id: string; viewerName: string; side: BattleSide; amountAud: number; ts: number }
  | { kind: 'sale'; id: string; viewerName: string; side: BattleSide; productTitle: string; ts: number }
  | { kind: 'comment'; id: string; viewerName: string; text: string; ts: number }
  | { kind: 'follow'; id: string; viewerName: string; sellerName: string; side: BattleSide; ts: number }
  | { kind: 'joined'; id: string; viewerName: string; ts: number }

export type BattleWinnerReward = {
  feedBoostDurationMs: number
  badgeLabel: string
  creditsBonus: number
  bonusLiveExtensionMs: number
  nextBattlePriority: boolean
}

export type BattleResult = {
  winnerId: string | null
  winnerSide: BattleSide | null
  isTie: boolean
  finalScores: BattleScores
  totalBoosts: { a: number; b: number }
  totalBids: { a: number; b: number }
  totalSales: { a: number; b: number }
  rewards: BattleWinnerReward | null
}

export type Battle = {
  id: string
  mode: BattleMode
  status: BattleStatus
  sellerA: BattleSeller
  sellerB: BattleSeller
  scores: BattleScores
  durationMs: number
  startedAt: number | null
  endsAt: number | null
  result: BattleResult | null
  viewerCount: number
  createdAt: number
}

export type BattleSellerStats = {
  sellerId: string
  totalBattles: number
  wins: number
  losses: number
  ties: number
  currentStreak: number
  bestStreak: number
  totalBoostsReceived: number
  totalSalesInBattles: number
}

/** Realtime event names sent over SSE / channel. */
export type BattleRealtimeEvent =
  | { type: 'battle_started'; battle: Battle }
  | { type: 'score_updated'; battleId: string; scores: BattleScores; delta: { side: BattleSide; points: number; reason: string } }
  | { type: 'boost_sent'; battleId: string; boost: BattleBoostEvent }
  | { type: 'bid_placed'; battleId: string; side: BattleSide; viewerName: string; amountAud: number }
  | { type: 'sale_completed'; battleId: string; side: BattleSide; viewerName: string; productTitle: string }
  | { type: 'comment_added'; battleId: string; comment: BattleCommentEvent }
  | { type: 'product_changed'; battleId: string; side: BattleSide; product: BattleFeaturedProduct }
  | { type: 'viewer_joined'; battleId: string; viewerName: string; viewerCount: number }
  | { type: 'battle_ended'; battleId: string; result: BattleResult }
  | { type: 'winner_declared'; battleId: string; winnerId: string; winnerSide: BattleSide; rewards: BattleWinnerReward }
