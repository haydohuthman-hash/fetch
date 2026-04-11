import { memo } from 'react'
import { getSellerBadgeLabel, getSellerBattleStats } from '../../lib/battles/battleWinnerStore'

type Props = {
  sellerId: string
  compact?: boolean
}

/**
 * Renders a battle badge next to seller name / listing card if the seller
 * has a recent win, active streak, or legend status. Designed to drop into
 * any existing card/profile surface.
 */
function BattleBadgeInner({ sellerId, compact }: Props) {
  const label = getSellerBadgeLabel(sellerId)
  if (!label) return null

  const stats = getSellerBattleStats(sellerId)
  const streak = stats?.currentStreak ?? 0

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e8dcc8]/15 px-2 py-0.5 text-[10px] font-bold text-[#e8dcc8]">
        ✦ {label}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#e8dcc8]/20 to-[#e8dcc8]/10 px-3 py-1 text-[11px] font-bold text-[#e8dcc8] shadow-[0_0_8px_rgba(232,220,200,0.15)]">
      ✦ {label}
      {streak >= 3 && (
        <span className="text-[9px] font-semibold text-[#e8dcc8]/60">🔥 {streak}</span>
      )}
    </span>
  )
}

export const BattleBadge = memo(BattleBadgeInner)
