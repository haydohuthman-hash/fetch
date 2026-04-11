import { memo } from 'react'
import type { Battle } from '../../lib/battles/types'

type Props = {
  battle: Battle
  onJoin: (battleId: string) => void
}

function BattleCardInner({ battle, onJoin }: Props) {
  const isLive = battle.status === 'live'
  const isPending = battle.status === 'pending'

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#0a3022] to-[#072419] shadow-lg">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]" />
              Live
            </span>
          )}
          {isPending && (
            <span className="rounded-full bg-[#e8dcc8]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#e8dcc8]/60">
              Waiting
            </span>
          )}
          <span className="text-[11px] font-semibold capitalize text-white/50">{battle.mode} battle</span>
        </div>
        {isLive && (
          <span className="text-[11px] font-semibold tabular-nums text-white/40">
            👁 {battle.viewerCount}
          </span>
        )}
      </div>

      {/* sellers */}
      <div className="flex items-center gap-3 px-4 pb-3">
        <div className="flex flex-1 items-center gap-2">
          <span className="text-[28px]">{battle.sellerA.avatar || '🛒'}</span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-white">{battle.sellerA.displayName}</p>
            {isLive && (
              <p className="text-[18px] font-black tabular-nums text-emerald-400">{battle.scores.a}</p>
            )}
          </div>
        </div>

        <span className="shrink-0 text-[12px] font-bold text-white/20">VS</span>

        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="min-w-0 text-right">
            <p className="truncate text-[13px] font-bold text-white">{battle.sellerB.displayName}</p>
            {isLive && (
              <p className="text-[18px] font-black tabular-nums text-[#e8dcc8]">{battle.scores.b}</p>
            )}
          </div>
          <span className="text-[28px]">{battle.sellerB.avatar || '🛒'}</span>
        </div>
      </div>

      {/* action */}
      <div className="border-t border-white/[0.04] px-4 py-3">
        <button
          type="button"
          onClick={() => onJoin(battle.id)}
          className="w-full rounded-full bg-[#e8dcc8] py-2.5 text-[12px] font-bold uppercase tracking-wide text-[#031c14] shadow-[0_1px_8px_rgba(232,220,200,0.2)] transition-transform active:scale-[0.97]"
        >
          {isLive ? 'Watch Battle' : 'Join Battle'}
        </button>
      </div>
    </div>
  )
}

export const BattleCard = memo(BattleCardInner)
