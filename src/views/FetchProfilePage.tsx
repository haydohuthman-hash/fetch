import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { loadSession } from '../lib/fetchUserSession'
import { getMySupabaseProfile } from '../lib/supabase/profiles'
import {
  ensureDropProfileForSession,
  getMyDropProfile,
  type DropCreatorProfile,
} from '../lib/drops/profileStore'
import {
  fetchMyListings,
  fetchSellerEarnings,
  listingImageAbsoluteUrl,
  type PeerListing,
} from '../lib/listingsApi'
import { useFetchAccent } from '../theme/FetchAccentContext'

function audFromCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0
  return (safe / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

export type FetchProfilePageProps = {
  onOpenApp: () => void
  onOpenDrops: () => void
  onEditProfile: () => void
  onListItem: () => void
  onEditListing: (listingId: string) => void
  onCashOut: () => void
  onAddCredits: () => void
}

export default function FetchProfilePage({
  onOpenApp,
  onOpenDrops,
  onEditProfile,
  onListItem,
  onEditListing,
  onCashOut,
  onAddCredits,
}: FetchProfilePageProps) {
  const { accentHex, accentRgb } = useFetchAccent()
  const accentRgbStr = `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`
  const location = useLocation()
  const [mainTab, setMainTab] = useState<'drops' | 'listings'>('listings')
  const [dropProfile, setDropProfile] = useState<DropCreatorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [listings, setListings] = useState<PeerListing[]>([])
  const [earnedNetCents, setEarnedNetCents] = useState(0)
  const [todayNetCents, setTodayNetCents] = useState(0)
  const [creditsCents, setCreditsCents] = useState(0)
  const [listingSheet, setListingSheet] = useState<PeerListing | null>(null)
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
    setLoadError(null)
    try {
      ensureDropProfileForSession()
      const drop = getMyDropProfile()
      const dayStart = new Date()
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date()
      dayEnd.setHours(23, 59, 59, 999)
      const fromMs = dayStart.getTime()
      const toMs = dayEnd.getTime()

      const [p, mine, earnAll, earnToday] = await Promise.all([
        getMySupabaseProfile().catch((e) => {
          console.error('[FetchProfilePage] getMySupabaseProfile failed', e)
          return null
        }),
        fetchMyListings().catch((e) => {
          console.error('[FetchProfilePage] fetchMyListings failed', e)
          setLoadError('Could not load your listings. Pull to refresh or try again.')
          return [] as PeerListing[]
        }),
        fetchSellerEarnings().catch((e) => {
          console.warn('[FetchProfilePage] fetchSellerEarnings (all) failed', e)
          return null
        }),
        fetchSellerEarnings({ from: fromMs, to: toMs }).catch((e) => {
          console.warn('[FetchProfilePage] fetchSellerEarnings (today) failed', e)
          return null
        }),
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
      setDropProfile(getMyDropProfile())
      setEarnedNetCents(earnAll?.summary?.netCents ?? 0)
      setTodayNetCents(earnToday?.summary?.netCents ?? 0)
    } catch (e) {
      console.error('[FetchProfilePage] reload failed', e)
      setLoadError('Something went wrong loading your profile.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload, location.key])

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

  const pageBg = useMemo(
    () => ({
      background: `linear-gradient(to bottom, color-mix(in srgb, ${accentHex} 26%, #030806), #09090b 42%, #000000)`,
    }),
    [accentHex],
  )

  return (
    <div className="min-h-dvh pb-28 text-white" style={pageBg}>
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 backdrop-blur-md"
        style={{
          borderBottom: `1px solid rgba(${accentRgbStr}, 0.14)`,
          background: `color-mix(in srgb, ${accentHex} 22%, rgba(0,0,0,0.82))`,
        }}
      >
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
        <span className="text-[13px] font-semibold tracking-wide text-white/90">Your profile</span>
        <button
          type="button"
          onClick={onEditProfile}
          className="text-[13px] font-semibold"
          style={{ color: `rgba(${accentRgbStr}, 0.95)` }}
        >
          Edit
        </button>
      </header>

      <div className="px-4 pt-6">
        <div
          className="relative overflow-hidden rounded-3xl border bg-gradient-to-br p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
          style={{
            borderColor: `rgba(${accentRgbStr}, 0.22)`,
            background: `linear-gradient(to bottom right, color-mix(in srgb, ${accentHex} 42%, transparent), rgba(9,9,11,0.92), rgba(0,0,0,0.78))`,
          }}
        >
          <div
            className="absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
            style={{ background: `rgba(${accentRgbStr}, 0.12)` }}
            aria-hidden
          />
          <div className="relative flex flex-col items-center text-center">
            <div
              className="h-[5.5rem] w-[5.5rem] overflow-hidden rounded-full"
              style={{
                boxShadow: `0 0 0 2px rgba(${accentRgbStr}, 0.45), 0 0 0 6px rgba(6, 10, 12, 0.85)`,
                ...(avatarUrl
                  ? {
                      backgroundImage: `url(${avatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : {}),
              }}
            >
              {!avatarUrl ? (
                <div
                  className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/95"
                  style={{ background: `color-mix(in srgb, ${accentHex} 35%, #0c0c0e)` }}
                >
                  {initials}
                </div>
              ) : null}
            </div>
            <h1 className="mt-4 text-[1.35rem] font-semibold tracking-tight text-white">{displayName}</h1>
            {username ? (
              <p className="mt-1 text-[13px] font-medium" style={{ color: `rgba(${accentRgbStr}, 0.62)` }}>
                @{username}
              </p>
            ) : null}
            {locationLabel ? (
              <p className="mt-0.5 text-[12px]" style={{ color: `rgba(${accentRgbStr}, 0.48)` }}>
                {locationLabel}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[12px]">
              <span
                className="rounded-full border bg-black/25 px-3 py-1 font-semibold"
                style={{
                  borderColor: `rgba(${accentRgbStr}, 0.28)`,
                  color: `rgba(${accentRgbStr}, 0.88)`,
                }}
              >
                {ratingLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-white/75">
                {followers} followers · {following} following
              </span>
            </div>
            {bio ? (
              <p className="mt-4 max-w-md text-[13px] leading-relaxed text-white/78">{bio}</p>
            ) : (
              <p className="mt-4 text-[12px]" style={{ color: `rgba(${accentRgbStr}, 0.38)` }}>
                Add a short bio from Edit profile
              </p>
            )}
          </div>
        </div>

        <section
          className="mt-6 rounded-3xl border p-5 shadow-lg"
          style={{
            borderColor: `rgba(${accentRgbStr}, 0.22)`,
            background: `linear-gradient(to bottom right, color-mix(in srgb, ${accentHex} 28%, #0a0a0c), #0c0c0f)`,
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: `rgba(${accentRgbStr}, 0.55)` }}>
            Earnings
          </p>
          <p className="mt-1 text-5xl font-bold leading-none tracking-tight text-white sm:text-6xl">
            {audFromCents(earnedNetCents)}
          </p>
          <p className="mt-3 text-[13px]" style={{ color: `rgba(${accentRgbStr}, 0.52)` }}>
            Total earned (after fees)
            <span style={{ color: `rgba(${accentRgbStr}, 0.35)` }}> · </span>
            Today{' '}
            <span className="font-semibold text-white/90">{audFromCents(todayNetCents)}</span>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCashOut}
              className="rounded-2xl bg-white py-3.5 text-[14px] font-bold text-zinc-950 shadow-md active:scale-[0.98]"
            >
              Cash out
            </button>
            <button
              type="button"
              onClick={onAddCredits}
              className="rounded-2xl border py-3.5 text-[14px] font-bold text-white active:scale-[0.98]"
              style={{
                borderColor: `rgba(${accentRgbStr}, 0.4)`,
                background: `rgba(${accentRgbStr}, 0.12)`,
              }}
            >
              Add credits
            </button>
          </div>
          <p className="mt-3 text-center text-[12px]" style={{ color: `rgba(${accentRgbStr}, 0.45)` }}>
            Credits balance:{' '}
            <span className="font-semibold text-white/85">{audFromCents(creditsCents)}</span>
          </p>
        </section>

        <div
          className="mt-6 flex rounded-2xl border p-1"
          style={{
            borderColor: `rgba(${accentRgbStr}, 0.2)`,
            background: 'rgba(0,0,0,0.35)',
          }}
          role="tablist"
          aria-label="Profile sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'drops'}
            onClick={() => setMainTab('drops')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold transition-colors"
            style={
              mainTab === 'drops'
                ? {
                    background: `rgba(${accentRgbStr}, 0.22)`,
                    color: 'white',
                  }
                : { color: `rgba(${accentRgbStr}, 0.55)` }
            }
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="5" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.75" />
              <path
                d="M10 9.5v5l4-2.5-4-2.5z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeLinejoin="round"
              />
            </svg>
            Drops
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'listings'}
            onClick={() => setMainTab('listings')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold transition-colors"
            style={
              mainTab === 'listings'
                ? {
                    background: `rgba(${accentRgbStr}, 0.22)`,
                    color: 'white',
                  }
                : { color: `rgba(${accentRgbStr}, 0.55)` }
            }
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
            </svg>
            Listings
          </button>
        </div>

        {mainTab === 'drops' ? (
          <div
            className="mt-4 rounded-3xl border p-6"
            style={{
              borderColor: `rgba(${accentRgbStr}, 0.22)`,
              background: `linear-gradient(to bottom, rgba(${accentRgbStr}, 0.08), rgba(0,0,0,0.4))`,
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Creator handle</p>
            <p className="mt-2 text-2xl font-bold text-white">@{dropProfile?.displayName ?? '—'}</p>
            <p className="mt-2 text-[13px] text-white/55">How viewers see you on Reels and Drops.</p>
            <button
              type="button"
              onClick={onOpenDrops}
              className="mt-6 w-full rounded-2xl py-3.5 text-[15px] font-bold text-zinc-950 shadow-lg active:scale-[0.99]"
              style={{ background: accentHex }}
            >
              Open Drops
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onListItem}
              className="mt-4 w-full rounded-2xl border py-4 text-[15px] font-bold shadow-inner active:scale-[0.99]"
              style={{
                borderColor: `rgba(${accentRgbStr}, 0.35)`,
                background: `rgba(${accentRgbStr}, 0.1)`,
                color: 'white',
              }}
            >
              List an item
            </button>

            <div className="mt-6 flex items-end justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-white">Your listings</h2>
              <span className="text-[12px]" style={{ color: `rgba(${accentRgbStr}, 0.45)` }}>
                {listings.length} total
              </span>
            </div>

            {loadError ? (
              <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-950/30 px-3 py-2 text-center text-[12px] text-amber-100/90">
                {loadError}
              </p>
            ) : null}

            {loading ? (
              <p className="mt-6 text-center text-[13px]" style={{ color: `rgba(${accentRgbStr}, 0.5)` }}>
                Loading…
              </p>
            ) : listings.length === 0 ? (
              <div
                className="mt-4 rounded-3xl border border-dashed px-5 py-10 text-center"
                style={{
                  borderColor: `rgba(${accentRgbStr}, 0.28)`,
                  background: `rgba(${accentRgbStr}, 0.05)`,
                }}
              >
                <p className="text-[14px] font-medium text-white/90">No listings yet</p>
                <p className="mt-2 text-[12px] text-white/45">Showcase products to buyers across Fetch marketplace.</p>
                <button
                  type="button"
                  onClick={onListItem}
                  className="mt-5 rounded-2xl px-6 py-3 text-[13px] font-bold text-zinc-950"
                  style={{ background: accentHex }}
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
                        onClick={() => setListingSheet(l)}
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
                          <p className="mt-1 text-[13px] font-bold" style={{ color: `rgba(${accentRgbStr}, 0.95)` }}>
                            {price}
                          </p>
                          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-white/40">
                            {l.status || 'draft'}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {listingSheet ? (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-label="Close listing"
            onClick={() => setListingSheet(null)}
          />
          <div
            className="relative z-[1] max-h-[min(85dvh,32rem)] overflow-y-auto rounded-t-3xl border border-b-0 bg-gradient-to-b from-zinc-900 to-zinc-950 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-12px_48px_rgba(0,0,0,0.5)]"
            style={{ borderColor: `rgba(${accentRgbStr}, 0.28)` }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" aria-hidden />
            {(() => {
              const img = listingSheet.images?.[0]?.url
              const thumb = img ? listingImageAbsoluteUrl(img) : ''
              return thumb ? (
                <div
                  className="mb-4 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-zinc-800"
                  style={{
                    backgroundImage: `url(${thumb})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
              ) : (
                <div className="mb-4 flex aspect-[16/10] w-full items-center justify-center rounded-2xl bg-zinc-800 text-[12px] text-white/40">
                  No photo
                </div>
              )
            })()}
            <h3 className="text-lg font-semibold leading-snug text-white">{listingSheet.title}</h3>
            <p className="mt-1 text-xl font-bold" style={{ color: `rgba(${accentRgbStr}, 0.92)` }}>
              {audFromCents(listingSheet.priceCents)}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              {listingSheet.status || 'draft'}
              {listingSheet.locationLabel ? ` · ${listingSheet.locationLabel}` : ''}
            </p>
            {listingSheet.description ? (
              <p className="mt-3 line-clamp-4 text-[13px] leading-relaxed text-white/72">
                {listingSheet.description}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = listingSheet.id
                  setListingSheet(null)
                  onEditListing(id)
                }}
                className="w-full rounded-2xl py-3.5 text-[14px] font-bold text-zinc-950"
                style={{ background: accentHex }}
              >
                Edit listing
              </button>
              <button
                type="button"
                onClick={() => setListingSheet(null)}
                className="w-full rounded-2xl border border-white/12 py-3 text-[14px] font-semibold text-white/85"
              >
                Close
              </button>
            </div>
          </div>
        </div>
          ) : null}
    </div>
  )
}
