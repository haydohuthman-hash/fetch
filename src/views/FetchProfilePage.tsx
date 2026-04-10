import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadSession } from '../lib/fetchUserSession'
import { getMySupabaseProfile } from '../lib/supabase/profiles'
import { ensureDropProfileForSession, getMyDropProfile } from '../lib/drops/profileStore'
import {
  fetchMyListings,
  fetchSellerEarnings,
  listingImageAbsoluteUrl,
  type PeerListing,
} from '../lib/listingsApi'

function audFromCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0
  return (safe / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

export type FetchProfilePageProps = {
  onOpenApp: () => void
  onEditProfile: () => void
  onListItem: () => void
  onEditListing: (listingId: string) => void
  onCashOut: () => void
  onAddCredits: () => void
}

export default function FetchProfilePage({
  onOpenApp,
  onEditProfile,
  onListItem,
  onEditListing,
  onCashOut,
  onAddCredits,
}: FetchProfilePageProps) {
  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState<PeerListing[]>([])
  const [earnedNetCents, setEarnedNetCents] = useState(0)
  const [creditsCents, setCreditsCents] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [locationLabel, setLocationLabel] = useState('')
  const [rating, setRating] = useState(5)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      ensureDropProfileForSession()
      const drop = getMyDropProfile()
      const [p, mine, earn] = await Promise.all([
        getMySupabaseProfile(),
        fetchMyListings().catch(() => [] as PeerListing[]),
        fetchSellerEarnings().catch(() => null),
      ])
      if (p) {
        setDisplayName(
          (p.full_name || '').trim() ||
            loadSession()?.displayName ||
            drop?.displayName ||
            'Seller',
        )
        setUsername((p.username || '').trim())
        setAvatarUrl(p.avatar_url?.trim() || null)
        setBio((p.bio || '').trim())
        setLocationLabel((p.location_label || '').trim())
        setRating(typeof p.seller_rating === 'number' && p.seller_rating > 0 ? p.seller_rating : 5)
        setFollowers(typeof p.followers_count === 'number' ? p.followers_count : 0)
        setFollowing(typeof p.following_count === 'number' ? p.following_count : 0)
        setCreditsCents(typeof p.credits_balance_cents === 'number' ? p.credits_balance_cents : 0)
      }
      mine.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      setListings(mine)
      setEarnedNetCents(earn?.summary?.netCents ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const initials = useMemo(() => {
    const s = displayName || username || '?'
    return s
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }, [displayName, username])

  const ratingLabel = useMemo(() => {
    const r = Math.round(rating * 10) / 10
    return `${r.toFixed(1)} rating`
  }, [rating])

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-950 via-zinc-950 to-black pb-28 text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-emerald-500/15 bg-emerald-950/80 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onOpenApp}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:scale-[0.97]"
          aria-label="Home"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="text-[13px] font-semibold tracking-wide text-emerald-100/90">Your profile</span>
        <button
          type="button"
          onClick={onEditProfile}
          className="text-[13px] font-semibold text-emerald-300"
        >
          Edit
        </button>
      </header>

      <div className="px-4 pt-6">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-900/50 via-emerald-950/60 to-black/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-col items-center text-center">
            <div
              className="h-[5.5rem] w-[5.5rem] overflow-hidden rounded-full ring-2 ring-emerald-400/40 ring-offset-4 ring-offset-emerald-950/80"
              style={
                avatarUrl
                  ? {
                      backgroundImage: `url(${avatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
            >
              {!avatarUrl ? (
                <div className="flex h-full w-full items-center justify-center bg-emerald-800/50 text-2xl font-bold text-emerald-50">
                  {initials}
                </div>
              ) : null}
            </div>
            <h1 className="mt-4 text-[1.35rem] font-semibold tracking-tight text-white">{displayName}</h1>
            {username ? (
              <p className="mt-1 text-[13px] font-medium text-emerald-100/65">@{username}</p>
            ) : null}
            {locationLabel ? (
              <p className="mt-0.5 text-[12px] text-emerald-100/50">{locationLabel}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[12px] text-emerald-100/75">
              <span className="rounded-full border border-emerald-400/25 bg-black/25 px-3 py-1 font-semibold">
                {ratingLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                {followers} followers · {following} following
              </span>
            </div>
            {bio ? (
              <p className="mt-4 max-w-md text-[13px] leading-relaxed text-emerald-50/80">{bio}</p>
            ) : (
              <p className="mt-4 text-[12px] text-emerald-100/40">Add a short bio from Edit profile</p>
            )}
          </div>
        </div>

        <section className="mt-6 rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/40 to-zinc-950 p-5 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/55">Earnings</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{audFromCents(earnedNetCents)}</p>
          <p className="mt-1 text-[12px] text-emerald-100/50">Total earned (after fees) · Today —</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCashOut}
              className="rounded-2xl bg-white py-3.5 text-[14px] font-bold text-emerald-950 shadow-md active:scale-[0.98]"
            >
              Cash out
            </button>
            <button
              type="button"
              onClick={onAddCredits}
              className="rounded-2xl border border-emerald-400/35 bg-emerald-500/15 py-3.5 text-[14px] font-bold text-emerald-50 active:scale-[0.98]"
            >
              Add credits
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] text-emerald-100/45">
            Credits balance: <span className="font-semibold text-emerald-100/80">{audFromCents(creditsCents)}</span>
          </p>
        </section>

        <button
          type="button"
          onClick={onListItem}
          className="mt-4 w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 py-4 text-[15px] font-bold text-emerald-50 shadow-inner active:scale-[0.99]"
        >
          List an item
        </button>

        <div className="mt-8 flex items-end justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-white">Your listings</h2>
          <span className="text-[12px] text-emerald-100/45">{listings.length} total</span>
        </div>

        {loading ? (
          <p className="mt-6 text-center text-[13px] text-emerald-100/50">Loading…</p>
        ) : listings.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-emerald-500/25 bg-emerald-950/25 px-5 py-10 text-center">
            <p className="text-[14px] font-medium text-emerald-50/90">No listings yet</p>
            <p className="mt-2 text-[12px] text-emerald-100/45">Showcase products to buyers across Fetch marketplace.</p>
            <button
              type="button"
              onClick={onListItem}
              className="mt-5 rounded-2xl bg-emerald-500 px-6 py-3 text-[13px] font-bold text-emerald-950"
            >
              Create your first listing
            </button>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3">
            {listings.map((l) => {
              const img = l.images?.[0]?.url
              const thumb = img ? listingImageAbsoluteUrl(img) : ''
              const price = audFromCents(l.priceCents)
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => onEditListing(l.id)}
                    className="flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left shadow-md active:scale-[0.99]"
                  >
                    <div
                      className="aspect-square w-full bg-zinc-800"
                      style={
                        thumb
                          ? {
                              backgroundImage: `url(${thumb})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : undefined
                      }
                    />
                    <div className="p-2.5">
                      <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-white">{l.title}</p>
                      <p className="mt-1 text-[13px] font-bold text-emerald-300">{price}</p>
                      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-100/40">
                        {l.status || 'draft'}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
