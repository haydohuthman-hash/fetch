import { memo, useEffect, useState } from 'react'
import type { BattleResult, BattleSeller } from '../../lib/battles/types'

type Props = {
  result: BattleResult
  sellerA: BattleSeller
  sellerB: BattleSeller
  onClose: () => void
  onRematch: () => void
}

function BattleWinnerOverlayInner({ result, sellerA, sellerB, onClose, onRematch }: Props) {
  const [phase, setPhase] = useState<'reveal' | 'summary'>('reveal')

  useEffect(() => {
    const t = setTimeout(() => setPhase('summary'), 2800)
    return () => clearTimeout(t)
  }, [])

  const winner = result.winnerSide === 'a' ? sellerA : result.winnerSide === 'b' ? sellerB : null

  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/85 backdrop-blur-lg">
      {/* confetti placeholder – CSS particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="absolute animate-[battleConfetti_3s_ease-out_forwards]"
            style={{
              left: `${Math.random() * 100}%`,
              top: '-8%',
              animationDelay: `${Math.random() * 1.5}s`,
              width: `${6 + Math.random() * 6}px`,
              height: `${6 + Math.random() * 6}px`,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              background: ['#e8dcc8', '#064e3b', '#fff', '#b8a87a', '#34d399'][Math.floor(Math.random() * 5)],
              opacity: 0.7 + Math.random() * 0.3,
            }}
          />
        ))}
      </div>

      {phase === 'reveal' && (
        <div className="flex flex-col items-center gap-4 animate-in zoom-in-75 fade-in duration-700">
          {result.isTie ? (
            <>
              <span className="text-[48px]">🤝</span>
              <h2 className="text-[28px] font-black uppercase tracking-tight text-white">It&apos;s a Tie!</h2>
            </>
          ) : winner ? (
            <>
              <div className="relative">
                <span className="text-[72px] drop-shadow-[0_4px_20px_rgba(232,220,200,0.4)]">{winner.avatar}</span>
                <div className="absolute -right-2 -top-2 rounded-full bg-[#e8dcc8] px-2.5 py-1 text-[10px] font-black uppercase text-[#031c14] shadow-lg">
                  Winner
                </div>
              </div>
              <h2 className="text-[28px] font-black uppercase tracking-tight text-[#e8dcc8]">{winner.displayName}</h2>
              <p className="text-[14px] font-semibold text-white/60">wins the battle!</p>
            </>
          ) : null}
        </div>
      )}

      {phase === 'summary' && (
        <div className="mx-4 w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-500">
          {/* scores */}
          <div className="rounded-2xl border border-white/10 bg-[#072419]/90 p-5 shadow-xl backdrop-blur-lg">
            <h3 className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[#e8dcc8]/60">
              Final Scores
            </h3>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[32px]">{sellerA.avatar}</span>
                <p className="text-[12px] font-bold text-white/70">{sellerA.displayName}</p>
                <p className="text-[24px] font-black tabular-nums text-emerald-400">{result.finalScores.a}</p>
              </div>
              <span className="text-[16px] font-bold text-white/20">vs</span>
              <div className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[32px]">{sellerB.avatar}</span>
                <p className="text-[12px] font-bold text-white/70">{sellerB.displayName}</p>
                <p className="text-[24px] font-black tabular-nums text-[#e8dcc8]">{result.finalScores.b}</p>
              </div>
            </div>

            {/* stats grid */}
            <div className="mb-5 grid grid-cols-3 gap-3 text-center">
              <StatCell label="Boosts" a={result.totalBoosts.a} b={result.totalBoosts.b} />
              <StatCell label="Bids" a={result.totalBids.a} b={result.totalBids.b} />
              <StatCell label="Sales" a={result.totalSales.a} b={result.totalSales.b} />
            </div>

            {/* rewards */}
            {result.rewards && winner && (
              <div className="mb-5 rounded-xl border border-[#e8dcc8]/15 bg-[#e8dcc8]/5 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#e8dcc8]/60">Winner Rewards</p>
                <div className="space-y-1.5 text-[12px] text-white/80">
                  <p>✦ <span className="font-semibold text-[#e8dcc8]">{result.rewards.badgeLabel}</span> badge</p>
                  <p>✦ 24h feed boost for all listings</p>
                  {result.rewards.creditsBonus > 0 && (
                    <p>✦ +{result.rewards.creditsBonus} credits bonus</p>
                  )}
                  {result.rewards.nextBattlePriority && (
                    <p>✦ Priority matching for next battle</p>
                  )}
                </div>
              </div>
            )}

            {/* actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onRematch}
                className="flex-1 rounded-full border-2 border-[#e8dcc8]/30 bg-transparent py-3 text-[13px] font-bold uppercase tracking-wide text-[#e8dcc8] transition-transform active:scale-[0.98]"
              >
                Rematch
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-[#e8dcc8] py-3 text-[13px] font-bold uppercase tracking-wide text-[#031c14] shadow-[0_2px_12px_rgba(232,220,200,0.25)] transition-transform active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCell({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2.5">
      <p className="text-[10px] font-semibold uppercase text-white/40">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold tabular-nums text-white/80">
        {a} <span className="text-white/20">|</span> {b}
      </p>
    </div>
  )
}

export const BattleWinnerOverlay = memo(BattleWinnerOverlayInner)
