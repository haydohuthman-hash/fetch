import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createLocalDropProfile,
  getDropProfilesStore,
  getMyDropProfile,
  updateMyDropProfile,
} from '../../lib/drops/profileStore'
import { loadSession, updateUserProfile } from '../../lib/fetchUserSession'
import { getSupabaseBrowserClient } from '../../lib/supabase/client'
import { updateMySupabaseProfile, validateUsername } from '../../lib/supabase/profiles'
import { formatProfileDropViews } from '../../lib/drops/formatProfileDropViews'
import { dropIsPhotoCarousel, dropIsVideo, type DropReel } from '../../lib/drops/types'
import { isFollowingAuthor, toggleFollowAuthor } from '../../lib/fetchProfile/followGraphStore'
import { isAuthorSaved, toggleSavedAuthor } from '../../lib/fetchProfile/savedAuthorsStore'
import { resolvePublicProfile } from '../../lib/fetchProfile/resolvePublicProfile'
import type { FetchProfileTabId, FetchPublicProfileVm } from '../../lib/fetchProfile/types'
import { fetchPublishedListings, listingImageAbsoluteUrl, type PeerListing } from '../../lib/listingsApi'
import {
  FetchProfileHero,
  FetchProfilePrimaryActions,
  FetchProfileSelfSurfaceActions,
} from './FetchProfileChrome'

export type HomeShellTabRequest = 'services' | 'buySell' | 'chat' | 'marketplace' | 'reels'

export type FetchProfileSheetProps = {
  open: boolean
  onClose: () => void
  authorId: string
  sellerDisplay: string
  pool: DropReel[]
  isSelf: boolean
  profileRevision: number
  onProfileSaved: () => void
  onRequestTab: (tab: HomeShellTabRequest) => void
  onOpenReel: (reelId: string) => void
  /** Buy & sell: open listing detail (parent switches to Buy & sell tab + handoff). */
  onOpenPeerListing?: (listingId: string) => void
  /** Extra scroll bottom inset when a fixed bar sits under the sheet (standalone profile screen). */
  padBottomForFooter?: boolean
  /**
   * `overlay` — full-screen modal (e.g. profile from Drops feed).
   * `page` — column inside parent flex shell; use with home-style bottom nav below (account tab).
   */
  surface?: 'overlay' | 'page'
}

type ProfileTile = {
  id: string
  thumb: string
  isVideo: boolean
  label: string
  /** Drops tab: compact estimated views from server view ms / seed. */
  viewsLabel?: string | null
  /** Items tab: listing price */
  priceLabel?: string | null
}

function reelThumb(r: DropReel): string {
  if (dropIsPhotoCarousel(r)) return r.imageUrls?.[0] ?? ''
  return r.poster ?? ''
}

function formatAudFromCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function tilesForTab(
  tab: FetchProfileTabId,
  authorReels: DropReel[],
  profile: FetchPublicProfileVm,
  peerListings: PeerListing[],
): ProfileTile[] {
  if (tab === 'drops') {
    return authorReels.map((r) => ({
      id: r.id,
      thumb: reelThumb(r),
      isVideo: dropIsVideo(r),
      label: r.title.slice(0, 40),
      viewsLabel: formatProfileDropViews(r),
    }))
  }
  if (tab === 'items') {
    return peerListings.map((l) => {
      const first = l.images?.[0]?.url
      return {
        id: l.id,
        thumb: first ? listingImageAbsoluteUrl(first) : '',
        isVideo: false,
        label: l.title?.slice(0, 48) || 'Listing',
        priceLabel: formatAudFromCents(l.priceCents ?? 0),
      }
    })
  }
  if (tab === 'services') {
    if (profile.kind === 'partner') {
      const thumbs = [
        'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=60',
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&q=60',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=60',
        'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=400&q=60',
      ]
      return [
        { id: 'svc-1', isVideo: false, label: 'Moving & heavy items' },
        { id: 'svc-2', isVideo: false, label: 'Same-day delivery' },
        { id: 'svc-3', isVideo: false, label: 'Junk removal' },
        { id: 'svc-4', isVideo: false, label: 'Assembly & installs' },
      ].map((s, i) => ({ ...s, thumb: thumbs[i] ?? thumbs[0]! }))
    }
    return []
  }
  return []
}

function defaultTabFor(profile: FetchPublicProfileVm): FetchProfileTabId {
  if (profile.kind === 'store') return 'items'
  if (profile.kind === 'partner') return 'services'
  return 'drops'
}

export function FetchProfileSheet({
  open,
  onClose,
  authorId,
  sellerDisplay,
  pool,
  isSelf,
  profileRevision,
  onProfileSaved,
  onRequestTab,
  onOpenReel,
  onOpenPeerListing,
  padBottomForFooter = false,
  surface = 'overlay',
}: FetchProfileSheetProps) {
  const [tab, setTab] = useState<FetchProfileTabId>('drops')
  const [profilePeerListings, setProfilePeerListings] = useState<PeerListing[]>([])
  const [profileListingsLoading, setProfileListingsLoading] = useState(false)
  const [profileListingsErr, setProfileListingsErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(() => isAuthorSaved(authorId))
  const [editOpen, setEditOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState('🎯')
  const [formErr, setFormErr] = useState<string | null>(null)
  const [authMsg, setAuthMsg] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [iFollow, setIFollow] = useState(false)

  const viewerAuthorId = useMemo(() => getMyDropProfile()?.id ?? '', [profileRevision, open])

  const prof = useMemo(() => {
    const p = getDropProfilesStore().byId[authorId]
    return p ?? null
  }, [authorId, profileRevision])

  const profile = useMemo(
    () => resolvePublicProfile(authorId, sellerDisplay, { dropProfile: prof }),
    [authorId, sellerDisplay, prof, profileRevision],
  )

  const authorReels = useMemo(
    () => pool.filter((r) => r.authorId === authorId).sort((a, b) => b.likes - a.likes),
    [pool, authorId],
  )

  useEffect(() => {
    if (!open || !authorId || authorId === '__self__') {
      setProfilePeerListings([])
      setProfileListingsErr(null)
      setProfileListingsLoading(false)
      return
    }
    let cancelled = false
    setProfileListingsLoading(true)
    setProfileListingsErr(null)
    void fetchPublishedListings({ profileAuthorId: authorId, limit: 48 })
      .then((r) => {
        if (!cancelled) setProfilePeerListings(r.listings)
      })
      .catch((e) => {
        if (!cancelled) setProfileListingsErr(e instanceof Error ? e.message : 'Could not load listings')
      })
      .finally(() => {
        if (!cancelled) setProfileListingsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, authorId])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      setSaved(isAuthorSaved(authorId))
      setTab(defaultTabFor(profile))
      const me = getMyDropProfile()
      if (me && me.id === authorId) {
        setDraftName(me.displayName)
        setDraftAvatar(me.avatar)
        setNewEmail(loadSession()?.email ?? '')
        setNewPassword('')
      } else {
        setDraftName('')
        setDraftAvatar('🎯')
      }
      setFormErr(null)
      setEditOpen(false)
      setIFollow(
        Boolean(viewerAuthorId && authorId && isFollowingAuthor(viewerAuthorId, authorId)),
      )
    })
  }, [open, authorId, profile, viewerAuthorId])

  const gridTiles = useMemo(
    () => tilesForTab(tab, authorReels, profile, profilePeerListings),
    [tab, authorReels, profile, profilePeerListings],
  )

  const bookLabel = profile.kind === 'store' ? 'Buy' : profile.kind === 'partner' ? 'Book' : 'Book / Buy'

  const onBookBuy = useCallback(() => {
    if (profile.kind === 'store') onRequestTab('marketplace')
    else onRequestTab('services')
    onClose()
  }, [onClose, onRequestTab, profile.kind])

  const onMessage = useCallback(() => {
    onRequestTab('chat')
    onClose()
  }, [onClose, onRequestTab])

  const onSave = useCallback(() => {
    setSaved(toggleSavedAuthor(authorId))
  }, [authorId])

  const onLive = useCallback(() => {
    if (profile.livePlaybackUrl) {
      window.open(profile.livePlaybackUrl, '_blank', 'noopener,noreferrer')
    }
  }, [profile.livePlaybackUrl])

  const saveDropIdentity = useCallback(() => {
    setFormErr(null)
    const usernameErr = validateUsername(draftName.trim())
    if (usernameErr) {
      setFormErr(usernameErr)
      return
    }
    void (async () => {
      try {
        await updateMySupabaseProfile({
          username: draftName.trim(),
          avatar_url: draftAvatar.startsWith('http') ? draftAvatar.trim() : null,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save username.'
        setFormErr(msg.toLowerCase().includes('duplicate') ? 'That username is already taken.' : msg)
        return
      }
      const me = getMyDropProfile()
      const r = me ? updateMyDropProfile(draftName, draftAvatar) : createLocalDropProfile(draftName, draftAvatar)
      if ('error' in r) {
        setFormErr(r.error)
        return
      }
      onProfileSaved()
      setEditOpen(false)
      if (loadSession()) {
        const up = updateUserProfile({ displayName: draftName.trim() })
        if (!up.ok) setFormErr(up.error)
      }
    })()
  }, [draftAvatar, draftName, onProfileSaved])

  const updateAuthCredentials = useCallback(async () => {
    setAuthMsg(null)
    const sb = getSupabaseBrowserClient()
    if (!sb) {
      setAuthMsg('Supabase is not configured.')
      return
    }
    if (!newEmail.trim() && !newPassword.trim()) {
      setAuthMsg('Enter a new email or password.')
      return
    }
    if (newPassword.trim() && newPassword.trim().length < 8) {
      setAuthMsg('Password must be at least 8 characters.')
      return
    }
    const { error } = await sb.auth.updateUser({
      ...(newEmail.trim() ? { email: newEmail.trim() } : {}),
      ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
    })
    if (error) {
      setAuthMsg(error.message || 'Could not update account settings.')
      return
    }
    setAuthMsg('Account updated.')
  }, [newEmail, newPassword])

  if (!open) return null

  const tabBtn = (id: FetchProfileTabId, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={[
        'min-w-0 flex-1 py-3 text-[13px] font-semibold transition-colors',
        tab === id ? 'border-b-2 border-zinc-900 text-zinc-900' : 'border-b-2 border-transparent text-zinc-500',
      ].join(' ')}
    >
      {label}
    </button>
  )

  const rootClass =
    surface === 'page'
      ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-white'
      : 'fixed inset-0 z-[92] flex flex-col bg-white'

  return (
    <div className={rootClass} role="dialog" aria-modal="true">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1.5 text-[15px] font-semibold text-zinc-900"
        >
          ← Back
        </button>
        {isSelf ? (
          <button
            type="button"
            onClick={() => setEditOpen((v) => !v)}
            className="px-2 py-1.5 text-[14px] font-semibold text-sky-600"
          >
            {editOpen ? 'Done' : 'Edit'}
          </button>
        ) : null}
      </div>

      <div
        className={[
          'min-h-0 flex-1 overflow-y-auto overscroll-contain px-3',
          surface === 'page' ? 'pb-2' : '',
          padBottomForFooter
            ? 'pb-[max(5.5rem,env(safe-area-inset-bottom))]'
            : surface === 'overlay'
              ? 'pb-[max(1rem,env(safe-area-inset-bottom))]'
              : '',
        ].join(' ')}
      >
        <div className="mx-auto w-full max-w-lg pt-2">
          <FetchProfileHero
            profile={profile}
            layout="centered"
            compact={surface === 'page'}
            onLiveClick={profile.isLive ? onLive : undefined}
          />
          {isSelf ? (
            <FetchProfileSelfSurfaceActions
              onBuySell={() => {
                onRequestTab('buySell')
                onClose()
              }}
              onMarketplace={() => {
                onRequestTab('marketplace')
                onClose()
              }}
              onChat={() => {
                onRequestTab('chat')
                onClose()
              }}
              onDrops={() => {
                onRequestTab('reels')
                onClose()
              }}
            />
          ) : (
            <FetchProfilePrimaryActions
              onBookBuy={onBookBuy}
              onMessage={onMessage}
              onSave={onSave}
              saved={saved}
              bookBuyLabel={bookLabel}
              showFollow={Boolean(viewerAuthorId && viewerAuthorId !== authorId)}
              isFollowing={iFollow}
              onFollow={() => {
                if (!viewerAuthorId) return
                setIFollow(toggleFollowAuthor(viewerAuthorId, authorId))
                onProfileSaved()
              }}
            />
          )}
          {!isSelf && viewerAuthorId && viewerAuthorId !== authorId ? (
            <button
              type="button"
              onClick={onSave}
              className="mt-2 w-full py-2 text-[13px] font-semibold text-zinc-900"
            >
              {saved ? 'Remove bookmark' : 'Bookmark profile'}
            </button>
          ) : null}

          {isSelf && editOpen ? (
            <div className="mt-4 border-t border-zinc-200 pt-4">
              <p className="text-[12px] font-semibold text-zinc-500">Public @handle &amp; photo</p>
              {formErr ? <p className="mt-2 text-[13px] text-amber-700">{formErr}</p> : null}
              <label className="mt-3 block text-[11px] font-semibold text-zinc-600">
                Display name
                <input
                  className="mt-1 w-full border-0 border-b border-zinc-200 bg-transparent px-0 py-2 text-[16px] text-zinc-900 outline-none focus:border-zinc-400"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="YourShop"
                  autoComplete="off"
                />
              </label>
              <label className="mt-3 block text-[11px] font-semibold text-zinc-600">
                Avatar (emoji or image URL)
                <input
                  className="mt-1 w-full border-0 border-b border-zinc-200 bg-transparent px-0 py-2 text-[16px] text-zinc-900 outline-none focus:border-zinc-400"
                  value={draftAvatar}
                  onChange={(e) => setDraftAvatar(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={saveDropIdentity}
                className="mt-4 w-full py-2.5 text-[14px] font-semibold text-sky-600"
              >
                Save profile
              </button>
              <div className="mt-4 border-t border-zinc-200 pt-3">
                <p className="text-[12px] font-semibold text-zinc-600">Account security</p>
                <input
                  className="mt-2 w-full border-0 border-b border-zinc-200 bg-transparent px-0 py-2 text-[15px] text-zinc-900 outline-none focus:border-zinc-400"
                  placeholder="New email (optional)"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <input
                  className="mt-2 w-full border-0 border-b border-zinc-200 bg-transparent px-0 py-2 text-[15px] text-zinc-900 outline-none focus:border-zinc-400"
                  placeholder="New password (optional)"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void updateAuthCredentials()}
                  className="mt-3 w-full py-2.5 text-[14px] font-semibold text-zinc-900"
                >
                  Update email/password
                </button>
                {authMsg ? <p className="mt-1 text-[12px] text-zinc-600">{authMsg}</p> : null}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                One profile for Drops, Buy &amp; sell, and chat. Your account email stays private.
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex border-b border-zinc-200">
            {tabBtn('drops', 'Posts')}
            {tabBtn('items', 'Items')}
            {tabBtn('services', 'Services')}
            {tabBtn('reviews', 'Reviews')}
          </div>

          <div className="mt-0">
            {tab === 'items' && profileListingsErr ? (
              <p className="px-1 py-3 text-[12px] text-amber-800">{profileListingsErr}</p>
            ) : null}
            {tab === 'reviews' ? (
              <p className="py-12 text-center text-[14px] text-zinc-500">No reviews yet.</p>
            ) : tab === 'items' && profileListingsLoading && gridTiles.length === 0 ? (
              <p className="py-12 text-center text-[14px] text-zinc-500">Loading listings…</p>
            ) : gridTiles.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[14px] font-semibold text-zinc-800">No posts yet</p>
                <p className="mt-1 max-w-xs px-4 text-[13px] leading-snug text-zinc-500 mx-auto">
                  {tab === 'items'
                    ? 'Published Buy &amp; sell items tied to this @handle show here.'
                    : tab === 'services'
                      ? 'Services appear when this partner lists them on Fetch.'
                      : 'No Drops from this creator in your feed.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-px bg-zinc-200">
                {gridTiles.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (tab === 'drops' && authorReels.some((r) => r.id === t.id)) {
                        onOpenReel(t.id)
                        onClose()
                      } else if (tab === 'drops') {
                        onOpenReel(t.id)
                        onClose()
                      } else if (tab === 'items') {
                        if (onOpenPeerListing) onOpenPeerListing(t.id)
                        else onRequestTab('buySell')
                        onClose()
                      } else {
                        onBookBuy()
                      }
                    }}
                    className="group relative aspect-square overflow-hidden bg-zinc-100 transition-opacity active:opacity-90"
                  >
                    {t.thumb ? (
                      <img
                        src={t.thumb}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-[11px] font-semibold text-zinc-500">
                        {t.label}
                      </div>
                    )}
                    {tab === 'drops' && t.viewsLabel ? (
                      <span
                        className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white ring-1 ring-white/20 backdrop-blur-[2px]"
                        aria-label={`${t.viewsLabel} views`}
                      >
                        👁 {t.viewsLabel}
                      </span>
                    ) : null}
                    {tab === 'items' && t.priceLabel ? (
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white ring-1 ring-white/15">
                        {t.priceLabel}
                      </span>
                    ) : null}
                    {t.isVideo ? (
                      <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] text-zinc-800 ring-1 ring-zinc-200">
                        ▶
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
