/**
 * CSS-only faux map: light = soft Uber-like blocks; dark = muted night tiles.
 */
export type FakeMapVariant = 'light' | 'dark'

export function FakeMapBackground({ variant = 'light' }: { variant?: FakeMapVariant }) {
  if (variant === 'dark') {
    return (
      <div
        className="absolute inset-0 overflow-hidden bg-[#12141a]"
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#141820] via-[#101218] to-[#0c0e14]" />
        <div
          className="absolute inset-[-12%] opacity-[0.55]"
          style={{
            backgroundImage: `
            linear-gradient(105deg, rgba(255,255,255,0.03) 12%, transparent 12.2%),
            linear-gradient(105deg, transparent 40%, rgba(0,0,0,0.12) 40.05%, transparent 40.2%),
            linear-gradient(18deg, rgba(255,255,255,0.02) 58%, transparent 58.1%)
          `,
            backgroundSize: '180px 140px, 220px 200px, 260px 300px',
            backgroundPosition: '0 0, 40px 20px, -30px 50px',
          }}
        />
        <div className="pointer-events-none absolute -right-[18%] top-[6%] h-[46%] w-[62%] rounded-[48%] bg-[rgba(30,45,62,0.35)] blur-[0.5px]" />
        <div className="pointer-events-none absolute left-[-22%] bottom-[12%] h-[34%] w-[55%] rounded-[44%] bg-[rgba(22,32,48,0.28)]" />
        <div
          className="absolute inset-0 opacity-[0.28]"
          style={{
            backgroundImage: `
            repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(255,255,255,0.04) 47px, rgba(255,255,255,0.04) 48px),
            repeating-linear-gradient(0deg, transparent, transparent 41px, rgba(0,0,0,0.15) 41px, rgba(0,0,0,0.15) 42px)
          `,
          }}
        />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-10%] top-[32%] h-[5px] w-[120%] origin-left rotate-[-8deg] bg-[rgba(36,40,52,0.85)] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
          <div className="absolute left-[18%] top-[-5%] h-[110%] w-[4px] origin-top rotate-[12deg] bg-[rgba(32,36,48,0.75)]" />
          <div className="absolute right-[8%] top-[10%] h-[78%] w-[3px] rotate-[6deg] bg-[rgba(28,32,44,0.55)]" />
          <div className="absolute bottom-[24%] left-[-5%] h-[3px] w-[95%] rotate-[3deg] bg-[rgba(40,44,56,0.65)]" />
        </div>
        <div className="pointer-events-none absolute left-[8%] top-[18%] h-[22%] w-[28%] rounded-[28%] bg-[rgba(28,42,34,0.25)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_50%_42%,transparent_0%,rgba(0,0,0,0.35)_100%)]" />
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#f4f6f8]"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#fafbfc] via-[#f2f5f8] to-[#e8eef4]" />
      <div
        className="absolute inset-[-12%] opacity-[0.88]"
        style={{
          backgroundImage: `
            linear-gradient(105deg, rgba(255,255,255,0.35) 12%, transparent 12.2%),
            linear-gradient(105deg, transparent 40%, rgba(56,130,120,0.05) 40.05%, transparent 40.2%),
            linear-gradient(18deg, rgba(255,255,255,0.12) 58%, transparent 58.1%)
          `,
          backgroundSize: '180px 140px, 220px 200px, 260px 300px',
          backgroundPosition: '0 0, 40px 20px, -30px 50px',
        }}
      />
      <div className="pointer-events-none absolute -right-[18%] top-[6%] h-[46%] w-[62%] rounded-[48%] bg-[rgba(120,190,220,0.42)] blur-[0.5px]" />
      <div className="pointer-events-none absolute left-[-22%] bottom-[12%] h-[34%] w-[55%] rounded-[44%] bg-[rgba(100,180,200,0.28)]" />
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: `
            repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(255,255,255,0.5) 47px, rgba(255,255,255,0.5) 48px),
            repeating-linear-gradient(0deg, transparent, transparent 41px, rgba(40,100,90,0.04) 41px, rgba(40,100,90,0.04) 42px)
          `,
        }}
      />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[32%] h-[5px] w-[120%] origin-left rotate-[-8deg] bg-[rgba(255,255,255,0.82)] shadow-[0_0_0_1px_rgba(40,120,140,0.08)]" />
        <div className="absolute left-[18%] top-[-5%] h-[110%] w-[4px] origin-top rotate-[12deg] bg-[rgba(255,255,255,0.72)] shadow-[0_0_0_1px_rgba(40,100,120,0.06)]" />
        <div className="absolute right-[8%] top-[10%] h-[78%] w-[3px] rotate-[6deg] bg-[rgba(255,255,255,0.58)]" />
        <div className="absolute bottom-[24%] left-[-5%] h-[3px] w-[95%] rotate-[3deg] bg-[rgba(248,252,255,0.88)]" />
        <div className="absolute left-[42%] top-[48%] h-[3px] w-[55%] rotate-[-22deg] bg-[rgba(255,255,255,0.55)] opacity-90" />
      </div>
      <div className="pointer-events-none absolute left-[8%] top-[18%] h-[22%] w-[28%] rounded-[28%] bg-[rgba(160,210,170,0.38)]" />
      <div className="pointer-events-none absolute right-[20%] bottom-[38%] h-[14%] w-[22%] rounded-[32%] bg-[rgba(140,200,185,0.32)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_50%_42%,transparent_0%,rgba(40,100,120,0.06)_100%)]" />
    </div>
  )
}
