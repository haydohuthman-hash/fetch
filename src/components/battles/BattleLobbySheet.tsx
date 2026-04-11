import { memo, useCallback, useState } from 'react'
import { BATTLE_DURATIONS } from '../../lib/battles/battleConfig'
import type { BattleMode } from '../../lib/battles/types'

type Props = {
  open: boolean
  onClose: () => void
  onStartBattle: (mode: BattleMode, durationMs: number) => void
}

const MODES: { id: BattleMode; label: string; desc: string }[] = [
  { id: 'mixed', label: 'Mixed', desc: 'Sales + bids + boosts all count' },
  { id: 'sales', label: 'Sales', desc: 'Most sales wins' },
  { id: 'bidding', label: 'Bidding', desc: 'Bid activity drives score' },
  { id: 'boost', label: 'Boost', desc: 'Viewer boosts decide it all' },
]

const DURATIONS: { id: string; label: string; ms: number }[] = [
  { id: 'short', label: '3 min', ms: BATTLE_DURATIONS.short! },
  { id: 'standard', label: '5 min', ms: BATTLE_DURATIONS.standard! },
  { id: 'long', label: '10 min', ms: BATTLE_DURATIONS.long! },
]

function BattleLobbySheetInner({ open, onClose, onStartBattle }: Props) {
  const [mode, setMode] = useState<BattleMode>('mixed')
  const [duration, setDuration] = useState('standard')

  const handleCreate = useCallback(() => {
    const dur = DURATIONS.find((d) => d.id === duration)
    onStartBattle(mode, dur?.ms ?? 300000)
  }, [mode, duration, onStartBattle])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-end bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-[430px] animate-in slide-in-from-bottom-8 duration-300 rounded-t-3xl border-t border-[#e8dcc8]/10 bg-[#072419] pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
      >
        {/* drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />

        <div className="px-5">
          <h2 className="mb-1 text-[18px] font-black uppercase tracking-tight text-white">
            Start a Live Battle
          </h2>
          <p className="mb-5 text-[13px] text-white/50">
            Challenge another seller — viewers buy, bid, and boost to decide the winner.
          </p>

          {/* mode select */}
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#e8dcc8]/60">
            Battle Mode
          </label>
          <div className="mb-5 grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={[
                  'rounded-xl border px-3 py-2.5 text-left transition-all',
                  mode === m.id
                    ? 'border-[#e8dcc8]/30 bg-[#e8dcc8]/10 shadow-[0_0_12px_rgba(232,220,200,0.1)]'
                    : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.06]',
                ].join(' ')}
              >
                <p className={`text-[13px] font-bold ${mode === m.id ? 'text-[#e8dcc8]' : 'text-white/70'}`}>
                  {m.label}
                </p>
                <p className="text-[10px] text-white/40">{m.desc}</p>
              </button>
            ))}
          </div>

          {/* duration */}
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#e8dcc8]/60">
            Duration
          </label>
          <div className="mb-6 flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDuration(d.id)}
                className={[
                  'flex-1 rounded-xl border py-2.5 text-center text-[13px] font-bold transition-all',
                  duration === d.id
                    ? 'border-[#e8dcc8]/30 bg-[#e8dcc8]/10 text-[#e8dcc8]'
                    : 'border-white/5 bg-white/[0.03] text-white/50 hover:text-white/70',
                ].join(' ')}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* actions */}
          <button
            type="button"
            onClick={handleCreate}
            className="mb-3 w-full rounded-full bg-[#e8dcc8] py-3.5 text-[14px] font-black uppercase tracking-[0.06em] text-[#031c14] shadow-[0_2px_14px_rgba(232,220,200,0.25)] transition-transform active:scale-[0.98]"
          >
            Create Battle
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border-2 border-[#e8dcc8]/20 bg-transparent py-3 text-[13px] font-bold uppercase tracking-wide text-[#e8dcc8]/70 transition-transform active:scale-[0.98]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export const BattleLobbySheet = memo(BattleLobbySheetInner)
