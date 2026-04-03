/**
 * CSS-only faux map: neutral blocks, light grid, soft water, thin roads.
 * Kept separate so Step 2+ can swap in a real map without touching chrome.
 */
export function FakeMapBackground() {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#e6e5e2]"
      aria-hidden
    >
      {/* Base wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#eeede9] via-[#e7e6e3] to-[#deddd9]" />

      {/* Soft "blocks" / parcels */}
      <div
        className="absolute inset-[-12%] opacity-[0.85]"
        style={{
          backgroundImage: `
            linear-gradient(105deg, rgba(255,255,255,0.14) 12%, transparent 12.2%),
            linear-gradient(105deg, transparent 40%, rgba(0,0,0,0.04) 40.05%, transparent 40.2%),
            linear-gradient(18deg, rgba(255,255,255,0.08) 58%, transparent 58.1%)
          `,
          backgroundSize: '180px 140px, 220px 200px, 260px 300px',
          backgroundPosition: '0 0, 40px 20px, -30px 50px',
        }}
      />

      {/* Water mass */}
      <div className="pointer-events-none absolute -right-[18%] top-[6%] h-[46%] w-[62%] rounded-[48%] bg-[rgba(190,205,220,0.38)] blur-[0.5px]" />
      <div className="pointer-events-none absolute left-[-22%] bottom-[12%] h-[34%] w-[55%] rounded-[44%] bg-[rgba(188,200,216,0.28)]" />

      {/* Fine street grid */}
      <div
        className="absolute inset-0 opacity-[0.38]"
        style={{
          backgroundImage: `
            repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(255,255,255,0.42) 47px, rgba(255,255,255,0.42) 48px),
            repeating-linear-gradient(0deg, transparent, transparent 41px, rgba(0,0,0,0.04) 41px, rgba(0,0,0,0.04) 42px)
          `,
        }}
      />

      {/* Primary roads */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[32%] h-[5px] w-[120%] origin-left rotate-[-8deg] bg-[rgba(255,255,255,0.65)] shadow-[0_0_0_1px_rgba(0,0,0,0.04)]" />
        <div className="absolute left-[18%] top-[-5%] h-[110%] w-[4px] origin-top rotate-[12deg] bg-[rgba(255,255,255,0.58)] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]" />
        <div className="absolute right-[8%] top-[10%] h-[78%] w-[3px] rotate-[6deg] bg-[rgba(255,255,255,0.45)]" />
        <div className="absolute bottom-[24%] left-[-5%] h-[3px] w-[95%] rotate-[3deg] bg-[rgba(245,245,245,0.75)]" />
        <div className="absolute left-[42%] top-[48%] h-[3px] w-[55%] rotate-[-22deg] bg-[rgba(255,255,255,0.5)] opacity-90" />
      </div>

      {/* Parks / lots */}
      <div className="pointer-events-none absolute left-[8%] top-[18%] h-[22%] w-[28%] rounded-[28%] bg-[rgba(210,218,208,0.35)]" />
      <div className="pointer-events-none absolute right-[20%] bottom-[38%] h-[14%] w-[22%] rounded-[32%] bg-[rgba(205,205,200,0.4)]" />

      {/* Live vignette — draws eye to center, calmer edges */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_50%_42%,transparent_0%,rgba(0,0,0,0.045)_100%)]" />
    </div>
  )
}
