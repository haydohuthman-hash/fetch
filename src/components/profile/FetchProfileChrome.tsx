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
  compact,
  onLiveClick,
}: {
  profile: FetchPublicProfileVm
  /** `centered` — avatar in the middle (account + full profile sheet). */
  layout?: 'inline' | 'centered'
  dense?: boolean
  /** Tighter header (e.g. account tab / Instagram-style profile). */
  compact?: boolean
  onLiveClick?: () => void
}) {
  const avatarBox = (
    <div
      className={[
        'relative flex shrink-0 items-center justify-center overflow-hidden bg-zinc-100',
        layout === 'centered' && compact
          ? 'h-[4.5rem] w-[4.5rem] rounded-full text-3xl ring-1 ring-zinc-200'
          : layout === 'centered'
            ? 'h-[6.5rem] w-[6.5rem] rounded-full text-5xl ring-1 ring-zinc-200 sm:h-[7.25rem] sm:w-[7.25rem] sm:text-[3.25rem]'
            : dense
              ? 'h-[4.5rem] w-[4.5rem] rounded-2xl text-3xl ring-1 ring-zinc-200'
              : 'h-[5.5rem] w-[5.5rem] rounded-2xl text-4xl ring-1 ring-zinc-200 sm:h-24 sm:w-24 sm:text-5xl',
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
    <div
      className={[
        'flex flex-wrap items-center justify-center gap-y-1 text-[13px]',
        compact ? 'gap-x-6' : 'gap-x-8 sm:gap-x-10',
      ].join(' ')}
    >
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
        <h2
          className={[
            'max-w-[16rem] truncate font-bold tracking-tight text-zinc-900',
            compact ? 'mt-2 text-[17px]' : 'mt-4 text-[20px] sm:text-[22px]',
          ].join(' ')}
        >
          {profile.displayName}
        </h2>
        <p className={['font-semibold text-zinc-500', compact ? 'mt-0 text-[12px]' : 'mt-0.5 text-[13px]'].join(' ')}>
          {profile.handle}
        </p>
        <p className={['text-zinc-600', compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-[12px]'].join(' ')}>
          {profile.locationLabel}
        </p>
        <div className={compact ? 'mt-2 w-full max-w-xs' : 'mt-4 w-full max-w-xs'}>{statsRow}</div>
        <div
          className={[
            'flex w-full max-w-md flex-col items-center gap-1',
            compact ? 'mt-2 text-[11px]' : 'mt-4 gap-2',
          ].join(' ')}
        >
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
  const link = 'text-[13px] font-semibold text-zinc-900 py-1'
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 border-t border-zinc-200 pt-3">
      <button type="button" onClick={onBuySell} className={link}>
        Buy &amp; sell
      </button>
      <button type="button" onClick={onMarketplace} className={link}>
        Supplies
      </button>
      <button type="button" onClick={onChat} className={link}>
        Messages
      </button>
      <button type="button" onClick={onDrops} className={link}>
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
  const btn = 'min-w-[4.5rem] flex-1 py-2 text-[13px] font-semibold text-zinc-900'
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-zinc-200 pt-3">
      <button type="button" onClick={onBookBuy} className={btn}>
        {bookBuyLabel}
      </button>
      <button type="button" onClick={onMessage} className={btn}>
        Message
      </button>
      {showFollow && onFollow ? (
        <button type="button" onClick={onFollow} className={btn}>
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      ) : (
        <button type="button" onClick={onSave} className={btn}>
          {saved ? 'Saved' : 'Save'}
        </button>
      )}
    </div>
  )
}
