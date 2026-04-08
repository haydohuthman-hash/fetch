import type { FetchProfileBadge, FetchPublicProfileVm } from '../../lib/fetchProfile/types'

const BADGE_COPY: Record<FetchProfileBadge, string> = {
  verified: 'Verified',
  top_seller: 'Top seller',
  top_partner: 'Top partner',
}

function formatSocial(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function FetchProfileHero({
  profile,
  layout = 'inline',
  dense,
  onLiveClick,
}: {
  profile: FetchPublicProfileVm
  /** `centered` — avatar in the middle (account + full profile sheet). */
  layout?: 'inline' | 'centered'
  dense?: boolean
  onLiveClick?: () => void
}) {
  const avatarBox = (
    <div
      className={[
        'relative flex shrink-0 items-center justify-center overflow-hidden bg-zinc-100 ring-1 ring-zinc-200 shadow',
        layout === 'centered'
          ? 'h-[6.5rem] w-[6.5rem] rounded-full text-5xl sm:h-[7.25rem] sm:w-[7.25rem] sm:text-[3.25rem]'
          : dense
            ? 'h-[4.5rem] w-[4.5rem] rounded-2xl text-3xl'
            : 'h-[5.5rem] w-[5.5rem] rounded-2xl text-4xl sm:h-24 sm:w-24 sm:text-5xl',
      ].join(' ')}
    >
      {profile.avatar.startsWith('http') ? (
        <img src={profile.avatar} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden>{profile.avatar}</span>
      )}
      {profile.isLive ? (
        <button
          type="button"
          onClick={onLiveClick}
          className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-md ring-2 ring-black/30"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
          Live
        </button>
      ) : null}
    </div>
  )

  const statsRow = (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-1 text-[13px] sm:gap-x-10">
      <div className="text-center">
        <p className="font-bold tabular-nums text-zinc-900">{formatSocial(profile.followersCount)}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Followers</p>
      </div>
      <div className="text-center">
        <p className="font-bold tabular-nums text-zinc-900">{formatSocial(profile.followingCount)}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Following</p>
      </div>
    </div>
  )

  const trustRow = (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] sm:justify-start">
      <span className="font-semibold text-amber-600">⭐ {profile.rating.toFixed(1)}</span>
      <span className="text-zinc-400">·</span>
      <span className="text-zinc-600">
        {profile.kind === 'partner' ? `${profile.completedJobs} jobs` : `${profile.completedJobs} fulfilled`}
      </span>
      <span className="text-zinc-400">·</span>
      <span className="text-zinc-600">{profile.salesCount} sales</span>
      {profile.responseTimeLabel ? (
        <>
          <span className="text-zinc-400">·</span>
          <span className="text-emerald-700">{profile.responseTimeLabel}</span>
        </>
      ) : null}
    </div>
  )

  const badgesRow =
    profile.badges.length > 0 ? (
      <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
        {profile.badges.map((b) => (
          <span
            key={b}
            className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 ring-1 ring-zinc-200"
          >
            {BADGE_COPY[b]}
          </span>
        ))}
      </div>
    ) : null

  if (layout === 'centered') {
    return (
      <div className="flex flex-col items-center text-center">
        {avatarBox}
        <h2 className="mt-4 max-w-[18rem] truncate text-[20px] font-bold tracking-tight text-zinc-900 sm:text-[22px]">
          {profile.displayName}
        </h2>
        <p className="mt-0.5 text-[13px] font-semibold text-zinc-500">{profile.handle}</p>
        <p className="mt-1 text-[12px] text-zinc-600">{profile.locationLabel}</p>
        <div className="mt-4 w-full max-w-xs">{statsRow}</div>
        <div className="mt-4 flex w-full max-w-md flex-col items-center gap-2">
          {trustRow}
          {badgesRow}
        </div>
      </div>
    )
  }

  return (
    <div className={dense ? 'flex gap-4' : 'flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5'}>
      {avatarBox}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-[20px] font-bold tracking-tight text-zinc-900 sm:text-[22px]">
            {profile.displayName}
          </h2>
          <span className="text-[13px] font-semibold text-zinc-500">{profile.handle}</span>
        </div>
        <p className="mt-1 text-[13px] text-zinc-600">{profile.locationLabel}</p>
        <div className="mt-3">{statsRow}</div>
        <div className="mt-2">{trustRow}</div>
        {badgesRow ? <div className="mt-2">{badgesRow}</div> : null}
      </div>
    </div>
  )
}

/** Logged-in viewer: one profile for Drops, buy & sell, and chat. */
export function FetchProfileSelfSurfaceActions({
  onBuySell,
  onMarketplace,
  onChat,
  onDrops,
}: {
  onBuySell: () => void
  onMarketplace: () => void
  onChat: () => void
  onDrops: () => void
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onBuySell}
        className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white py-3 text-[12px] font-bold leading-tight text-zinc-900 shadow-md ring-1 ring-black/5 transition-transform active:scale-[0.98] sm:text-[13px]"
      >
        <span className="text-lg leading-none" aria-hidden>
          🏷️
        </span>
        Buy &amp; sell
      </button>
      <button
        type="button"
        onClick={onMarketplace}
        className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-300 bg-white py-3 text-[12px] font-bold leading-tight text-zinc-700 transition-transform active:scale-[0.98] sm:text-[13px]"
      >
        <span className="text-lg leading-none" aria-hidden>
          🛒
        </span>
        Supplies
      </button>
      <button
        type="button"
        onClick={onChat}
        className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-300 bg-white py-3 text-[12px] font-bold leading-tight text-zinc-700 transition-transform active:scale-[0.98] sm:text-[13px]"
      >
        <span className="text-lg leading-none" aria-hidden>
          💬
        </span>
        Chat
      </button>
      <button
        type="button"
        onClick={onDrops}
        className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-300 bg-white py-3 text-[12px] font-bold leading-tight text-zinc-700 transition-transform active:scale-[0.98] sm:text-[13px]"
      >
        <span className="text-lg leading-none" aria-hidden>
          🎬
        </span>
        Drops
      </button>
    </div>
  )
}

export function FetchProfilePrimaryActions({
  onBookBuy,
  onMessage,
  onSave,
  saved,
  bookBuyLabel,
  onFollow,
  isFollowing,
  showFollow,
}: {
  onBookBuy: () => void
  onMessage: () => void
  onSave: () => void
  saved: boolean
  bookBuyLabel: string
  /** When set, third slot is Follow instead of Save-as-bookmark. */
  onFollow?: () => void
  isFollowing?: boolean
  showFollow?: boolean
}) {
  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      <button
        type="button"
        onClick={onBookBuy}
        className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white py-3 text-[13px] font-bold text-zinc-900 shadow-md ring-1 ring-black/5 transition-transform active:scale-[0.98]"
      >
        <span className="text-lg leading-none" aria-hidden>
          ⚡
        </span>
        {bookBuyLabel}
      </button>
      <button
        type="button"
        onClick={onMessage}
        className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-300 bg-white py-3 text-[13px] font-bold text-zinc-700 transition-transform active:scale-[0.98]"
      >
        <span className="text-lg leading-none" aria-hidden>
          💬
        </span>
        Message
      </button>
      {showFollow && onFollow ? (
        <button
          type="button"
          onClick={onFollow}
          className={[
            'flex flex-col items-center justify-center gap-1 rounded-2xl border py-3 text-[13px] font-bold transition-transform active:scale-[0.98]',
            isFollowing
              ? 'border-violet-300 bg-violet-100 text-violet-700'
              : 'border-zinc-300 bg-white text-zinc-700',
          ].join(' ')}
        >
          <span className="text-lg leading-none" aria-hidden>
            {isFollowing ? '✓' : '＋'}
          </span>
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onSave}
          className={[
            'flex flex-col items-center justify-center gap-1 rounded-2xl border py-3 text-[13px] font-bold transition-transform active:scale-[0.98]',
            saved
              ? 'border-rose-300 bg-rose-100 text-rose-700'
              : 'border-zinc-300 bg-white text-zinc-700',
          ].join(' ')}
        >
          <span className="text-lg leading-none" aria-hidden>
            {saved ? '❤️' : '🤍'}
          </span>
          Save
        </button>
      )}
    </div>
  )
}
