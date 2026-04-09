import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from 'react'
import {
  DROP_GIFT_PANEL,
  boostCopyForTier,
  setBoostTierForReel,
} from '../lib/drops/boostStore'
import { CURATED_DROP_REELS } from '../lib/drops/constants'
import {
  buildLocalTabOrderedReels,
  buildDropsTabOrderedReels,
  buildLiveTabOrderedReels,
} from '../lib/drops/reelsTopTabFeed'
import {
  ensureDropProfileForSession,
  formatDropHandle,
  getDropProfilesStore,
  getMyDropProfile,
  isFetchOfficialAuthor,
} from '../lib/drops/profileStore'
import type {
  DropBoostTier,
  DropCreatorProfile,
  DropsCommerceActionMeta,
  DropsCommerceTarget,
} from '../lib/drops/types'
import { addWatchMsForReel } from '../lib/drops/watchStore'
import { mergeFeedReels } from '../lib/drops/mergeFeedReels'
import { consumePendingDropsPostWizard } from '../lib/drops/fetchDropsCreatorOnboarding'
import {
  REELS_TOP_TAB_ORDER,
  markReelsTabOnboardingSeen,
  reelsTabOnboardingSeen,
} from '../lib/drops/reelsTabOnboardingStorage'
import { UploadDropMediaError, uploadDropMedia } from '../lib/drops/uploadDropMedia'
import { useDropsApiFeed } from '../lib/drops/useDropsApiFeed'
import { syncCustomerSessionCookie } from '../lib/fetchServerSession'
import {
  FETCH_OPEN_PUBLIC_PROFILE,
  takePendingOpenPublicProfile,
} from '../lib/fetchProfile/openPublicProfileEvent'
import { isFollowingAuthor, toggleFollowAuthor } from '../lib/fetchProfile/followGraphStore'
import { getFetchApiBaseUrl } from '../lib/fetchApiBase'
import { HARDWARE_PRODUCTS } from '../lib/hardwareCatalog'
import { fetchMyListings, type PeerListing } from '../lib/listingsApi'
import { SUPPLY_PRODUCTS } from '../lib/suppliesCatalog'
import { dropIsPhotoCarousel, dropIsVideo, type DropReel } from '../lib/drops/types'
import { DropPhotoCarousel } from './drops/DropPhotoCarousel'
import { DropGiftPanelArt, GiftRailIconFilled } from './drops/DropsGiftIcons'
import {
  DropsPostWizard,
  type DropsLocalPublishPayload,
  type DropsPublishActivityEvent,
} from './drops/DropsPostWizard'
import {
  FetchProfileSheet,
  type HomeShellTabRequest,
} from './profile/FetchProfileSheet'

export type { DropsCommerceActionMeta, DropsCommerceTarget } from '../lib/drops/types'

type ReelsTopTab = 'drops' | 'local' | 'live'

type TabSplashPhase = 'in' | 'wait' | 'out'

type TabSplashState = { tab: ReelsTopTab; dir: 1 | -1; phase: TabSplashPhase }

type ReelsPublishBanner =
  | { kind: 'progress'; step: 'upload' | 'publish'; hasVideo: boolean; mediaLabel: string }
  | { kind: 'error'; message: string }

const REELS_TAB_SPLASH_COPY: Record<ReelsTopTab, { title: string; line: string }> = {
  drops: {
    title: 'Drops',
    line: 'This tab is the main feed — local sellers and live replays are mixed in with everything else. Local and Live show only those.',
  },
  local: {
    title: 'Local',
    line: 'Only drops from sellers offering pickup or same-day near you. Tap Fetch it on a clip to buy.',
  },
  live: {
    title: 'Live',
    line: 'Live streams, auctions, and replays. Bid or buy during the show; to sell live, use Menu → Go live.',
  },
}

function tabSplashPanelClass(s: TabSplashState): string {
  if (s.phase === 'in') {
    return s.dir === 1 ? 'fetch-reels-tab-splash--in-from-right' : 'fetch-reels-tab-splash--in-from-left'
  }
  if (s.phase === 'out') {
    return s.dir === 1 ? 'fetch-reels-tab-splash--out-to-right' : 'fetch-reels-tab-splash--out-to-left'
  }
  return 'translate-x-0'
}

/** Sliding window: unload distant reels (no video src); keep prev + current + next + one ahead buffered. */
type ReelMediaTier = 'none' | 'prev' | 'current' | 'next' | 'ahead2'

function reelMediaTier(index: number, activeIndex: number): ReelMediaTier {
  if (activeIndex < 0) return 'none'
  const d = index - activeIndex
  if (d === 0) return 'current'
  if (d === -1) return 'prev'
  if (d === 1) return 'next'
  if (d === 2) return 'ahead2'
  return 'none'
}

export type HomeShellReelsPageProps = {
  bottomNav: ReactNode
  onMenuAccount?: () => void
  onCommerceAction?: (
    commerce: DropsCommerceTarget,
    action: 'fetch_it' | 'buy_now' | 'place_bid',
    meta?: DropsCommerceActionMeta,
  ) => void
  onRequestHomeShellTab?: (tab: HomeShellTabRequest) => void
  /** Profile sheet Items tab → open this listing on Buy & sell */
  onOpenPeerListingFromProfile?: (listingId: string) => void
  /** Home shell: user tapped Drops again while on Drops — open menu for upload / go live. */
  dropsNavRepeatTick?: number
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function parseAudNumber(label: string): number {
  const m = label.replace(/[$,\s]/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return 0
  const n = Number.parseFloat(m[1]!)
  return Number.isFinite(n) ? n : 0
}

function suggestedBidPresets(priceLabel: string): number[] {
  const raw = parseAudNumber(priceLabel)
  const base = Math.max(5, Math.ceil(raw > 0 ? raw : 15))
  const steps = [base, Math.ceil(base * 1.2), Math.ceil(base * 1.45), Math.ceil(base * 1.75)]
  return Array.from(new Set(steps)).sort((a, b) => a - b).slice(0, 4)
}

const DROP_SERVER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isPersistedDropId(id: string): boolean {
  return DROP_SERVER_ID_RE.test(id)
}

function authorAvatar(authorId: string, profileAvatarFallback?: string): string {
  if (profileAvatarFallback) return profileAvatarFallback
  if (isFetchOfficialAuthor(authorId)) return '✓'
  const emojis = ['🏪', '🛍️', '📦', '⭐', '🔥', '💼', '🌿', '🎯']
  let h = 0
  for (let i = 0; i < authorId.length; i++) h = (h * 31 + authorId.charCodeAt(i)) >>> 0
  return emojis[h % emojis.length]!
}

function ReelActionButton({
  label,
  active,
  activeTone = 'rose',
  onClick,
  children,
}: {
  label: string
  active?: boolean
  activeTone?: 'rose' | 'emerald'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'flex flex-col items-center gap-1 rounded-xl px-0.5 py-1 transition-transform active:scale-[0.92]',
        active ? (activeTone === 'emerald' ? 'text-emerald-400' : 'text-rose-400') : 'text-white',
      ].join(' ')}
    >
      <span className="flex h-[3.5rem] w-[3.5rem] items-center justify-center [&_svg]:drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]">
        {children}
      </span>
    </button>
  )
}

function HomeShellReelsPageInner({
  bottomNav,
  onMenuAccount,
  onCommerceAction,
  onRequestHomeShellTab,
  onOpenPeerListingFromProfile,
  dropsNavRepeatTick = 0,
}: HomeShellReelsPageProps) {
  const { reels: apiFeedReels, database: dropsDb, refresh: refreshApiDropsFeed } = useDropsApiFeed()
  const [userReels, setUserReels] = useState<DropReel[]>([])
  const [topTab, setTopTab] = useState<ReelsTopTab>('drops')
  /** >0 = shuffle within buckets (Drops mix) or within tab list (Local / Live). */
  const [feedShuffleNonce, setFeedShuffleNonce] = useState(0)
  const [profileTick, setProfileTick] = useState(0)
  const [, setFollowTick] = useState(0)
  const [watchTick, setWatchTick] = useState(0)
  const [activeId, setActiveId] = useState<string>('')
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(CURATED_DROP_REELS.map((r) => [r.id, r.likes])),
  )
  const [commentsOpenId, setCommentsOpenId] = useState<string | null>(null)
  const [commentsByReel, setCommentsByReel] = useState<Record<string, string[]>>({})
  const [commentDraft, setCommentDraft] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  /** Remount wizard each open so step 1 shows immediately (no stale step flash). */
  const [wizardMountKey, setWizardMountKey] = useState(0)
  const [publishBanner, setPublishBanner] = useState<ReelsPublishBanner | null>(null)
  const [reelsMenuOpen, setReelsMenuOpen] = useState(false)
  const [liveSheetOpen, setLiveSheetOpen] = useState(false)
  const [boostOpenForId, setBoostOpenForId] = useState<string | null>(null)
  const [dropsBidSheet, setDropsBidSheet] = useState<{
    commerce: DropsCommerceTarget
    priceLabel: string
    title: string
  } | null>(null)
  const [dropsBidDraft, setDropsBidDraft] = useState('')
  const [profileSheet, setProfileSheet] = useState<{
    authorId: string
    sellerDisplay: string
    isSelf: boolean
  } | null>(null)
  const [postErr, setPostErr] = useState<string | null>(null)
  const [liveTitle, setLiveTitle] = useState('')
  const [liveBusy, setLiveBusy] = useState(false)
  const [liveInfo, setLiveInfo] = useState<{
    dropId?: string
    rtmpUrl?: string | null
    streamKey?: string | null
    playbackUrl?: string | null
    error?: string
    detail?: string
  } | null>(null)
  const [liveMyListings, setLiveMyListings] = useState<PeerListing[]>([])
  const [livePickProducts, setLivePickProducts] = useState<Record<string, boolean>>({})
  const [livePickListings, setLivePickListings] = useState<Record<string, boolean>>({})
  const [feedAnimKey, setFeedAnimKey] = useState(0)
  const [feedEnterDir, setFeedEnterDir] = useState<1 | -1>(1)
  const [tabSplash, setTabSplash] = useState<TabSplashState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const slideEls = useRef<Map<string, HTMLDivElement>>(new Map())
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const watchLastRef = useRef<number>(0)
  const sessionWatchFlushRef = useRef<Record<string, number>>({})

  const myProfile = useMemo(() => getMyDropProfile() ?? null, [profileTick])
  const viewerAuthorId = myProfile?.id ?? ''

  const liveShowcaseCount = useMemo(() => {
    let n = 0
    for (const on of Object.values(livePickProducts)) if (on) n += 1
    for (const on of Object.values(livePickListings)) if (on) n += 1
    return n
  }, [livePickProducts, livePickListings])

  useEffect(() => {
    if (!liveSheetOpen) return
    void (async () => {
      try {
        await syncCustomerSessionCookie()
        const rows = await fetchMyListings()
        setLiveMyListings(rows.filter((l) => l.status === 'published'))
      } catch {
        setLiveMyListings([])
      }
    })()
  }, [liveSheetOpen])

  const profileByAuthor = useMemo(() => {
    const s = getDropProfilesStore()
    const m = new Map<string, DropCreatorProfile>()
    for (const p of Object.values(s.byId)) m.set(p.id, p)
    return m
  }, [profileTick])

  const pool = useMemo(
    () => mergeFeedReels(userReels, apiFeedReels, CURATED_DROP_REELS),
    [userReels, apiFeedReels],
  )

  const giftSheetReel = useMemo(
    () => (boostOpenForId ? pool.find((r) => r.id === boostOpenForId) ?? null : null),
    [boostOpenForId, pool],
  )

  useEffect(() => {
    if (!dropsBidSheet) return
    const p = suggestedBidPresets(dropsBidSheet.priceLabel)
    setDropsBidDraft(String(p[0] ?? 20))
  }, [dropsBidSheet])

  const submitDropsBid = useCallback(() => {
    if (!dropsBidSheet || !onCommerceAction) return
    const n = Number.parseFloat(dropsBidDraft.replace(/,/g, '').trim())
    if (!Number.isFinite(n) || n < 1) return
    onCommerceAction(dropsBidSheet.commerce, 'place_bid', {
      bidAmountAud: Math.round(n * 100) / 100,
    })
    setDropsBidSheet(null)
  }, [dropsBidDraft, dropsBidSheet, onCommerceAction])

  const orderedReels = useMemo(() => {
    if (topTab === 'local') {
      return buildLocalTabOrderedReels(pool, likeCounts, feedShuffleNonce)
    }
    if (topTab === 'live') {
      return buildLiveTabOrderedReels(pool, likeCounts, feedShuffleNonce)
    }
    return buildDropsTabOrderedReels(pool, likeCounts, feedShuffleNonce)
  }, [pool, likeCounts, topTab, feedShuffleNonce, watchTick])

  const activeIndexRaw = useMemo(
    () => orderedReels.findIndex((r) => r.id === activeId),
    [orderedReels, activeId],
  )
  const windowActiveIndex = activeIndexRaw >= 0 ? activeIndexRaw : orderedReels.length > 0 ? 0 : -1

  const reelIdsKey = useMemo(() => orderedReels.map((r) => r.id).join('\0'), [orderedReels])

  useEffect(() => {
    ensureDropProfileForSession()
  }, [])

  useEffect(() => {
    if (!activeId && orderedReels[0]) setActiveId(orderedReels[0].id)
  }, [activeId, orderedReels])

  useEffect(() => {
    setLikeCounts((prev) => {
      const next = { ...prev }
      for (const r of pool) {
        if (next[r.id] == null) next[r.id] = r.likes
      }
      return next
    })
  }, [pool])

  const prevTopTabRef = useRef<ReelsTopTab>(topTab)
  useLayoutEffect(() => {
    if (prevTopTabRef.current === topTab) return
    const prev = prevTopTabRef.current
    prevTopTabRef.current = topTab
    const di = REELS_TOP_TAB_ORDER.indexOf(topTab) - REELS_TOP_TAB_ORDER.indexOf(prev)
    setFeedEnterDir(di > 0 ? 1 : -1)
    setFeedAnimKey((k) => k + 1)
    const first = orderedReels[0]?.id
    if (first) {
      setActiveId(first)
      scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [topTab, orderedReels])

  useEffect(() => {
    setTabSplash((s) => (s && s.tab !== topTab ? null : s))
  }, [topTab])

  const onTabSplashAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    setTabSplash((s) => {
      if (!s) return null
      if (s.phase === 'in') return { ...s, phase: 'wait' }
      if (s.phase === 'out') {
        markReelsTabOnboardingSeen(s.tab)
        return null
      }
      return s
    })
  }, [])

  const dismissTabSplash = useCallback(() => {
    setTabSplash((s) => {
      if (!s || s.phase === 'out') return s
      return { ...s, phase: 'out' }
    })
  }, [])

  const selectReelsTopTab = useCallback(
    (next: ReelsTopTab) => {
      if (next === topTab) return
      const dir = (REELS_TOP_TAB_ORDER.indexOf(next) > REELS_TOP_TAB_ORDER.indexOf(topTab) ? 1 : -1) as 1 | -1
      setTopTab(next)
      if (!reelsTabOnboardingSeen(next)) {
        setTabSplash({ tab: next, dir, phase: 'in' })
      } else {
        setTabSplash(null)
      }
    },
    [topTab],
  )

  useLayoutEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = best?.target.getAttribute('data-reel-id')
        if (id) setActiveId(id)
      },
      { root, rootMargin: '0px', threshold: [0.35, 0.55, 0.75] },
    )
    slideEls.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [orderedReels.length, reelIdsKey])

  /** Active reel plays from t=0; buffered neighbors (prev/next/ahead2) stay paused at t=0. Distant slides have no video ref. */
  useEffect(() => {
    videoRefs.current.forEach((video, id) => {
      const reel = orderedReels.find((r) => r.id === id)
      if (!reel || !dropIsVideo(reel)) return
      try {
        if (id === activeId) {
          video.currentTime = 0
          void video.play().catch(() => {})
        } else {
          video.pause()
          video.currentTime = 0
        }
      } catch {
        /* seek not ready */
      }
    })
  }, [activeId, orderedReels])

  /** Watch-time telemetry for ranking (persists to localStorage). */
  useEffect(() => {
    if (!activeId) return
    watchLastRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const t = window.setInterval(() => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const dt = Math.min(4000, Math.max(0, now - watchLastRef.current))
      watchLastRef.current = now
      if (dt > 0) {
        const d = Math.min(900, dt)
        addWatchMsForReel(activeId, d)
        sessionWatchFlushRef.current[activeId] = (sessionWatchFlushRef.current[activeId] ?? 0) + d
      }
    }, 900)
    const slow = window.setInterval(() => setWatchTick((x) => x + 1), 4000)
    return () => {
      window.clearInterval(t)
      window.clearInterval(slow)
    }
  }, [activeId])

  useEffect(() => {
    if (!dropsDb) return
    const t = window.setInterval(() => {
      const id = activeId
      if (!id || !isPersistedDropId(id)) return
      const pending = sessionWatchFlushRef.current[id] ?? 0
      if (pending < 1) return
      sessionWatchFlushRef.current[id] = 0
      void fetch(`${getFetchApiBaseUrl()}/api/drops/${encodeURIComponent(id)}/engage`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'view_ms',
          amount: Math.round(pending),
          clientId: 'web-feed',
        }),
      }).catch(() => {})
    }, 5000)
    return () => window.clearInterval(t)
  }, [dropsDb, activeId])

  const onShuffleFeed = useCallback(() => {
    setFeedShuffleNonce((n) => n + 1)
  }, [])

  const onRankedFeed = useCallback(() => {
    setFeedShuffleNonce(0)
  }, [])

  const toggleLike = useCallback((id: string) => {
    setLiked((p) => {
      const next = !p[id]
      setLikeCounts((c) => ({
        ...c,
        [id]: Math.max(0, (c[id] ?? 0) + (next ? 1 : -1)),
      }))
      return { ...p, [id]: next }
    })
  }, [])

  const shareReel = useCallback((r: DropReel) => {
    const text = `${r.title} — ${r.priceLabel} on Fetch Drops`
    const url = typeof window !== 'undefined' ? window.location.origin : ''
    if (navigator.share) {
      void navigator.share({ title: r.title, text, url }).catch(() => {})
      return
    }
    void navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {})
  }, [])

  const submitComment = useCallback(() => {
    if (!commentsOpenId) return
    const line = commentDraft.trim()
    if (!line) return
    setCommentsByReel((p) => ({
      ...p,
      [commentsOpenId]: [...(p[commentsOpenId] ?? []), line],
    }))
    setCommentDraft('')
  }, [commentDraft, commentsOpenId])

  const openMyProfileSheet = useCallback(() => {
    const me = getMyDropProfile()
    setProfileSheet({
      authorId: me?.id ?? '__self__',
      sellerDisplay: me ? formatDropHandle(me.displayName) : '@you',
      isSelf: true,
    })
  }, [])

  const openAuthorSheet = useCallback((authorId: string, sellerDisplay: string) => {
    const me = getMyDropProfile()
    setProfileSheet({
      authorId,
      sellerDisplay,
      isSelf: Boolean(me && me.id === authorId),
    })
  }, [])

  useEffect(() => {
    const onOpenPublicProfile = (ev: Event) => {
      takePendingOpenPublicProfile()
      const ce = ev as CustomEvent<{ authorId?: string; sellerDisplay?: string }>
      const authorId = ce.detail?.authorId?.trim()
      if (!authorId) return
      const sellerDisplay = ce.detail?.sellerDisplay?.trim() || '@seller'
      openAuthorSheet(authorId, sellerDisplay)
    }
    window.addEventListener(FETCH_OPEN_PUBLIC_PROFILE, onOpenPublicProfile)
    return () => window.removeEventListener(FETCH_OPEN_PUBLIC_PROFILE, onOpenPublicProfile)
  }, [openAuthorSheet])

  useEffect(() => {
    const p = takePendingOpenPublicProfile()
    if (p?.authorId?.trim()) {
      openAuthorSheet(p.authorId.trim(), p.sellerDisplay?.trim() || '@seller')
    }
  }, [openAuthorSheet])

  const requestHomeTab = useCallback(
    (tab: HomeShellTabRequest) => {
      onRequestHomeShellTab?.(tab)
    },
    [onRequestHomeShellTab],
  )

  const onProfileSavedFromSheet = useCallback(() => {
    setProfileTick((x) => x + 1)
    setProfileSheet((prev) => {
      const me = getMyDropProfile()
      if (prev?.isSelf && me) {
        return {
          ...prev,
          authorId: me.id,
          sellerDisplay: formatDropHandle(me.displayName),
        }
      }
      return prev
    })
  }, [])

  const onOpenReelFromSheet = useCallback((reelId: string) => {
    setActiveId(reelId)
    setTopTab('drops')
    setFeedShuffleNonce(0)
    queueMicrotask(() => {
      const root = scrollRef.current
      const el = root?.querySelector(`[data-reel-id="${reelId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  /** Returning from standalone profile (App account phase) with a reel handoff. */
  useEffect(() => {
    try {
      const id = sessionStorage.getItem('fetch.pendingDropsReelId')?.trim()
      if (!id) return
      sessionStorage.removeItem('fetch.pendingDropsReelId')
      setActiveId(id)
      setTopTab('drops')
      setFeedShuffleNonce(0)
      const t = window.setTimeout(() => {
        const root = scrollRef.current
        const el = root?.querySelector(`[data-reel-id="${id}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 120)
      return () => window.clearTimeout(t)
    } catch {
      /* ignore */
    }
  }, [])

  const handleWizardLocalPublish = useCallback(async (p: DropsLocalPublishPayload) => {
    const me = getMyDropProfile()
    if (!me) {
      setPostErr('Set up your Fetch profile first — Menu → Your profile.')
      openMyProfileSheet()
      throw new Error('profile_required')
    }
    let uploaded
    try {
      uploaded = await uploadDropMedia({
        video: p.videoFile ?? undefined,
        images: p.imageFiles.length ? p.imageFiles : undefined,
      })
    } catch (e) {
      if (e instanceof UploadDropMediaError) {
        throw new Error(e.message)
      }
      throw e
    }
    const carousel = p.imageFiles.length > 0
    if (carousel && (!uploaded.imageUrls?.length || uploaded.videoUrl)) {
      throw new Error('Upload did not return image URLs.')
    }
    if (!carousel && !uploaded.videoUrl) {
      throw new Error('Upload did not return a video URL.')
    }
    const id = `local-${Date.now()}`
    const price = p.priceLabel.trim() || 'Ask'
    const reel: DropReel = {
      id,
      ...(carousel
        ? { imageUrls: uploaded.imageUrls!, mediaKind: 'images' as const }
        : { videoUrl: uploaded.videoUrl!, mediaKind: 'video' as const }),
      title: p.title,
      seller: formatDropHandle(me.displayName),
      authorId: me.id,
      priceLabel: price.startsWith('$') ? price : `$${price}`,
      blurb: p.blurb,
      likes: 0,
      growthVelocityScore: 1.55,
      watchTimeMsSeed: 0,
      categories: [p.category],
      region: p.region,
      ...(p.commerce
        ? { commerce: p.commerce, commerceSaleMode: p.commerceSaleMode ?? 'buy_now' }
        : {}),
    }
    if (p.boostTier > 0) setBoostTierForReel(id, p.boostTier)
    setUserReels((prev) => [reel, ...prev])
    setLikeCounts((c) => ({ ...c, [id]: 0 }))
    setTopTab('drops')
    setFeedShuffleNonce(0)
    setActiveId(id)
    refreshApiDropsFeed()
    queueMicrotask(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }, [refreshApiDropsFeed])

  const openReelsMenu = useCallback(() => {
    setPostErr(null)
    setReelsMenuOpen(true)
  }, [])

  const openPostWizard = useCallback(() => {
    const me = getMyDropProfile()
    if (!me) {
      setPostErr('Set up your Fetch profile first — Menu → Your profile.')
      openMyProfileSheet()
      return
    }
    setReelsMenuOpen(false)
    setWizardMountKey((k) => k + 1)
    setWizardOpen(true)
  }, [openMyProfileSheet])

  /** Bottom nav Drops tap while already on Drops: open post wizard on step 1 (pick media). */
  useEffect(() => {
    if (dropsNavRepeatTick <= 0) return
    openPostWizard()
  }, [dropsNavRepeatTick, openPostWizard])

  /** After creator setup: open post wizard on first reels mount when flagged. */
  useEffect(() => {
    ensureDropProfileForSession()
    if (!consumePendingDropsPostWizard()) return
    queueMicrotask(() => {
      if (getMyDropProfile()) openPostWizard()
    })
  }, [openPostWizard])

  const onPublishActivity = useCallback((e: DropsPublishActivityEvent) => {
    if (e.type === 'idle') {
      setPublishBanner(null)
      return
    }
    if (e.type === 'error') {
      setPublishBanner({ kind: 'error', message: e.message })
      return
    }
    setPublishBanner({
      kind: 'progress',
      step: e.step,
      hasVideo: e.hasVideo,
      mediaLabel: e.mediaLabel,
    })
  }, [])

  const applyBoost = useCallback((reelId: string, tier: DropBoostTier) => {
    if (tier <= 0) return
    setBoostTierForReel(reelId, tier)
    setBoostOpenForId(null)
    setFeedShuffleNonce(0)
    setWatchTick((x) => x + 1)
  }, [])

  const activeReel = orderedReels.find((r) => r.id === activeId)

  return (
    <div className="fetch-home-reels-page pointer-events-auto absolute inset-0 z-[60] flex min-h-0 min-w-0 flex-col bg-black">
      <header className="pointer-events-auto absolute left-0 right-0 top-0 z-20 flex items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4">
        <div
          className="flex min-w-0 flex-1 items-center justify-evenly gap-2 sm:justify-center sm:gap-10"
          role="tablist"
          aria-label="Drops feed"
        >
          {(
            [
              { id: 'drops' as const, label: 'Drops' },
              { id: 'local' as const, label: 'Local' },
              { id: 'live' as const, label: 'Live' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={topTab === id}
              onClick={() => selectReelsTopTab(id)}
              className={[
                'shrink-0 border-0 bg-transparent py-1.5 text-[13px] font-semibold tracking-tight transition-colors sm:text-[14px]',
                topTab === id ? 'text-white' : 'text-white/45 hover:text-white/75',
              ].join(' ')}
            >
              <span className="inline-flex items-center gap-1.5">
                {label}
                {id === 'live' ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                    aria-hidden
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openReelsMenu}
          className="shrink-0 rounded-xl px-2.5 py-2 text-[13px] font-semibold text-white/85 ring-1 ring-white/20 transition-colors active:bg-white/10"
        >
          Menu
        </button>
      </header>

      {publishBanner ? (
        <div
          className="pointer-events-auto absolute left-2 right-2 z-[24] rounded-2xl border border-white/15 bg-zinc-950/95 px-4 py-3 shadow-lg shadow-black/45 backdrop-blur-md sm:left-4 sm:right-4"
          style={{
            top: 'max(3.75rem, calc(env(safe-area-inset-top, 0px) + 2.85rem))',
          }}
          role="status"
          aria-live="polite"
        >
          {publishBanner.kind === 'progress' ? (
            <div>
              <p className="text-[13px] font-bold text-white">
                {publishBanner.step === 'upload'
                  ? publishBanner.hasVideo
                    ? 'Uploading your video'
                    : 'Uploading your photos'
                  : 'Publishing your drop'}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-white/55" title={publishBanner.mediaLabel}>
                {publishBanner.mediaLabel}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-[45%] max-w-[14rem] animate-pulse rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400" />
              </div>
              <p className="mt-2 text-[10px] leading-snug text-white/45">
                Keep browsing — upload and publish continue in the background.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-amber-200">
                {publishBanner.message}
              </p>
              <button
                type="button"
                className="shrink-0 rounded-lg bg-white/12 px-2.5 py-1.5 text-[11px] font-bold text-white ring-1 ring-white/15 active:bg-white/20"
                onClick={() => setPublishBanner(null)}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          key={`${topTab}-${feedAnimKey}`}
          className={[
            'flex min-h-0 flex-1 flex-col',
            feedAnimKey > 0
              ? feedEnterDir === 1
                ? 'fetch-reels-feed-tab-enter--from-right'
                : 'fetch-reels-feed-tab-enter--from-left'
              : '',
          ].join(' ')}
        >
          <div
            ref={scrollRef}
            className="fetch-home-reels-scroll min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y"
          >
        {orderedReels.length === 0 ? (
          <div className="flex min-h-[100dvh] snap-start flex-col items-center justify-center bg-black px-8 pb-32 pt-24 text-center">
            <p className="text-[17px] font-bold text-white">
              {topTab === 'local'
                ? 'No local drops yet'
                : topTab === 'live'
                  ? 'No live replays yet'
                  : 'Nothing in this feed yet'}
            </p>
            <button
              type="button"
              onClick={openReelsMenu}
              className="mt-6 rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-zinc-900 shadow-lg active:opacity-90"
            >
              Open menu
            </button>
          </div>
        ) : null}
        {orderedReels.map((r, slideIndex) => {
          const isActive = r.id === activeId
          const mediaTier =
            windowActiveIndex >= 0 ? reelMediaTier(slideIndex, windowActiveIndex) : 'none'
          const count = likeCounts[r.id] ?? r.likes
          const commentList = commentsByReel[r.id] ?? []
          const prof = profileByAuthor.get(r.authorId)
          const avatarChar = authorAvatar(r.authorId, prof?.avatar)
          return (
            <div
              key={r.id}
              ref={(el) => {
                if (el) slideEls.current.set(r.id, el)
                else slideEls.current.delete(r.id)
              }}
              data-reel-id={r.id}
              className="relative flex min-h-[100dvh] snap-start snap-always flex-col bg-black"
            >
              {dropIsPhotoCarousel(r) ? (
                <DropPhotoCarousel
                  reelId={r.id}
                  urls={r.imageUrls!}
                  interactive={mediaTier !== 'none'}
                  active={isActive}
                  className={
                    mediaTier === 'none'
                      ? 'pointer-events-none absolute inset-0 h-full w-full object-cover'
                      : ''
                  }
                />
              ) : mediaTier === 'none' ? (
                r.poster ? (
                  <img
                    src={r.poster}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    decoding="async"
                    loading="lazy"
                  />
                ) : (
                  <div className="pointer-events-none absolute inset-0 bg-zinc-950" aria-hidden />
                )
              ) : (
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(r.id, el)
                    else videoRefs.current.delete(r.id)
                  }}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  src={r.videoUrl}
                  poster={r.poster}
                  muted
                  playsInline
                  loop
                  preload={mediaTier === 'prev' ? 'metadata' : 'auto'}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/80" />

              <div className="pointer-events-none relative z-[1] flex min-h-[100dvh] flex-1 flex-col justify-end pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pl-4 pr-[5.25rem] pt-[4.75rem]">
                <div className="pointer-events-auto flex min-w-0 max-w-full items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openAuthorSheet(r.authorId, r.seller)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 pr-1 text-left transition-colors active:bg-white/10"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg ring-1 ring-white/30"
                      aria-hidden
                    >
                      {isFetchOfficialAuthor(r.authorId) ? '✓' : avatarChar}
                    </span>
                    <p className="min-w-0 truncate text-[13px] font-bold text-white/95">{r.seller}</p>
                  </button>
                  {viewerAuthorId && viewerAuthorId !== r.authorId ? (
                    <button
                      type="button"
                      onClick={() => {
                        toggleFollowAuthor(viewerAuthorId, r.authorId)
                        setFollowTick((x) => x + 1)
                      }}
                      className={[
                        'shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors',
                        isFollowingAuthor(viewerAuthorId, r.authorId)
                          ? 'bg-white/15 text-white/85'
                          : 'bg-white text-zinc-900',
                      ].join(' ')}
                    >
                      {isFollowingAuthor(viewerAuthorId, r.authorId) ? 'Following' : 'Follow'}
                    </button>
                  ) : null}
                </div>
                <p className="pointer-events-none mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-white">
                  {r.title}
                </p>
                <div className="pointer-events-auto mt-3 w-full space-y-2 pr-1">
                  {r.commerce && onCommerceAction ? (
                    r.commerce.kind === 'live_showcase' && r.commerce.items.length > 0 ? (
                      <div className="w-full space-y-2">
                        {r.commerce.items.map((item, idx) => {
                          const key =
                            item.kind === 'marketplace_product'
                              ? `p-${item.productId}-${idx}`
                              : `l-${item.listingId}-${idx}`
                          const target: DropsCommerceTarget =
                            item.kind === 'marketplace_product'
                              ? { kind: 'marketplace_product', productId: item.productId }
                              : { kind: 'buy_sell_listing', listingId: item.listingId }
                          const label =
                            item.label ||
                            (item.kind === 'marketplace_product' ? item.productId : item.listingId)
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => onCommerceAction(target, 'fetch_it')}
                              className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl bg-white/95 px-4 py-3.5 text-left active:bg-white/90"
                            >
                              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-zinc-900">
                                {label}
                              </span>
                              <span className="shrink-0 text-[13px] font-semibold text-zinc-600">
                                Fetch it
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : r.commerce.kind === 'live_showcase' ? null : r.commerceSaleMode === 'auction' ? (
                      <>
                        <p className="text-[12px] font-medium text-white/80">{r.priceLabel}</p>
                        <button
                          type="button"
                          onClick={() =>
                            setDropsBidSheet({
                              commerce: r.commerce!,
                              priceLabel: r.priceLabel,
                              title: r.title,
                            })
                          }
                          className="flex w-full items-center justify-center rounded-xl bg-white/95 py-3.5 text-[15px] font-semibold text-zinc-900 active:bg-white/90"
                        >
                          Bid
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCommerceAction(r.commerce!, 'fetch_it')}
                        className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl bg-white/95 px-4 py-3.5 text-left active:bg-white/90"
                      >
                        <span className="min-w-0 truncate text-[16px] font-bold tabular-nums text-zinc-900">
                          {r.priceLabel}
                        </span>
                        <span className="shrink-0 text-[14px] font-semibold text-zinc-700">
                          Fetch it
                        </span>
                      </button>
                    )
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-white/95 px-3 py-1.5 text-[13px] font-bold text-zinc-900 shadow-lg ring-1 ring-black/5">
                      {r.priceLabel}
                    </span>
                  )}
                </div>
              </div>

              <div className="pointer-events-auto absolute bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] right-3 z-[2] flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => openAuthorSheet(r.authorId, r.seller)}
                  className="mb-1 flex flex-col items-center rounded-full active:opacity-90"
                  aria-label={`${r.seller} profile`}
                >
                  <span className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border-[2.5px] border-white bg-zinc-900/55 text-[1.35rem] shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-sm">
                    {isFetchOfficialAuthor(r.authorId) ? '✓' : avatarChar}
                  </span>
                </button>
                <ReelActionButton
                  label={liked[r.id] ? 'Unlike' : 'Like'}
                  active={liked[r.id]}
                  onClick={() => toggleLike(r.id)}
                >
                  <svg className="h-9 w-9" viewBox="0 0 24 24" fill={liked[r.id] ? 'currentColor' : 'none'} aria-hidden>
                    <path
                      d="M12 21s-6.2-4.35-8.6-8.15C2.55 10.25 3.5 7 6.2 5.4 8.9 3.8 12 5.5 12 5.5s3.1-1.7 5.8-.1C20.5 7 21.45 10.25 20.6 12.85 18.2 16.65 12 21 12 21z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </ReelActionButton>
                <span className="-mt-1 text-center text-[11px] font-bold text-white drop-shadow-md">
                  {formatCount(count)}
                </span>

                <ReelActionButton label="Comments" onClick={() => setCommentsOpenId(r.id)}>
                  <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M6.5 18.5l-2.2 2.2c-.4.4-1.1.12-1-.48l.65-3.2A7.45 7.45 0 014.25 12 7.25 7.25 0 0118 8.7a7.25 7.25 0 01-1.65 7.55A7.45 7.45 0 0112 18.5H6.5z"
                      opacity="0.92"
                    />
                  </svg>
                </ReelActionButton>
                <span className="-mt-1 text-center text-[11px] font-bold text-white/90 drop-shadow-md">
                  {commentList.length || '·'}
                </span>

                <ReelActionButton label="Share" onClick={() => shareReel(r)}>
                  <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      stroke="currentColor"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3v10.5M8.25 6.75L12 3l3.75 3.75M5.25 14.25v4.5a1.5 1.5 0 001.5 1.5h10.5a1.5 1.5 0 001.5-1.5v-4.5"
                    />
                  </svg>
                </ReelActionButton>

                <ReelActionButton
                  label={saved[r.id] ? 'Remove save' : 'Save'}
                  active={saved[r.id]}
                  onClick={() => setSaved((p) => ({ ...p, [r.id]: !p[r.id] }))}
                >
                  <svg className="h-9 w-9" viewBox="0 0 24 24" fill={saved[r.id] ? 'currentColor' : 'none'} aria-hidden>
                    <path
                      d="M6 4.5h12v15l-6-3.5-6 3.5v-15z"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinejoin="round"
                    />
                  </svg>
                </ReelActionButton>

                <ReelActionButton label="Send gift" onClick={() => setBoostOpenForId(r.id)}>
                  <GiftRailIconFilled className="h-10 w-10 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]" />
                </ReelActionButton>
              </div>
            </div>
          )
        })}
          </div>
        </div>

        {tabSplash ? (
          <div className="pointer-events-none absolute inset-0 z-[15] flex flex-col justify-end px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[min(40%,12rem)]">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="fetch-reels-tab-splash-title"
              onAnimationEnd={onTabSplashAnimationEnd}
              className={[
                'pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-white/20 bg-zinc-950/95 p-5 text-left shadow-[0_20px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-md',
                tabSplashPanelClass(tabSplash),
              ].join(' ')}
            >
              <p
                id="fetch-reels-tab-splash-title"
                className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300/95"
              >
                {REELS_TAB_SPLASH_COPY[tabSplash.tab].title}
              </p>
              <p
                id="fetch-reels-tab-splash-body"
                className="mt-4 text-[16px] font-semibold leading-snug tracking-tight text-white"
              >
                {REELS_TAB_SPLASH_COPY[tabSplash.tab].line}
              </p>
              <button
                type="button"
                onClick={dismissTabSplash}
                className="mt-8 w-full rounded-xl bg-white py-3.5 text-[15px] font-bold text-zinc-900 shadow-lg active:opacity-90"
                aria-describedby="fetch-reels-tab-splash-body"
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {bottomNav ? (
        <div
          className="fetch-home-reels-shell-footer shrink-0 border-t border-white/12 bg-zinc-950/90 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl"
          data-fetch-drops-upload-flow={reelsMenuOpen || liveSheetOpen ? 'true' : undefined}
        >
          {bottomNav}
        </div>
      ) : null}

      {commentsOpenId ? (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close comments"
            onClick={() => setCommentsOpenId(null)}
          />
          <div
            className="relative z-[1] flex max-h-[min(70dvh,28rem)] flex-col rounded-t-2xl border border-white/10 bg-zinc-900 p-4 text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Comments"
          >
            <p className="text-[15px] font-bold">Comments</p>
            <p className="mt-0.5 text-[12px] text-white/60">
              {activeReel && activeReel.id === commentsOpenId ? activeReel.title : 'This drop'}
            </p>
            <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto text-[13px]">
              {(commentsByReel[commentsOpenId] ?? []).length === 0 ? (
                <li className="text-white/45">No comments yet — start the thread.</li>
              ) : (
                (commentsByReel[commentsOpenId] ?? []).map((line, i) => (
                  <li key={i} className="rounded-lg bg-white/8 px-3 py-2">
                    {line}
                  </li>
                ))
              )}
            </ul>
            <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
              <input
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[14px] text-white placeholder:text-white/40"
                placeholder="Add a comment…"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
              />
              <button
                type="button"
                onClick={submitComment}
                className="shrink-0 rounded-xl bg-white px-3 py-2 text-[13px] font-bold text-zinc-900"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {boostOpenForId ? (
        <div className="fixed inset-0 z-[85] flex flex-col justify-end" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close gift"
            onClick={() => setBoostOpenForId(null)}
          />
          <div
            className="relative z-[1] max-h-[min(88dvh,36rem)] overflow-y-auto rounded-t-2xl bg-zinc-950 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-zinc-100"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fetch-drops-boost-title"
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-zinc-700" aria-hidden />

            <h2
              id="fetch-drops-boost-title"
              className="text-center text-[17px] font-semibold tracking-[-0.02em] text-zinc-100"
            >
              Send a gift
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-center text-[13px] leading-relaxed text-zinc-500">
              Helps{' '}
              <span className="font-medium text-zinc-300">
                {giftSheetReel?.seller?.replace(/^@+/, '') ?? 'this creator'}
              </span>{' '}
              surface in the feed. Demo only — no charge; stronger gifts rank higher like promos.
            </p>
            {giftSheetReel?.title ? (
              <p className="mt-2 text-center text-[12px] text-zinc-600 line-clamp-2">
                {giftSheetReel.title}
              </p>
            ) : null}

            <div className="mt-6 grid grid-cols-3 gap-3">
              {DROP_GIFT_PANEL.map((gift) => {
                const tierCopy = boostCopyForTier(gift.tier)
                if (!tierCopy) return null
                return (
                  <button
                    key={gift.id}
                    type="button"
                    className="flex flex-col items-center gap-2 rounded-xl bg-zinc-900/80 px-2 py-3 text-center transition-colors active:bg-zinc-800"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Send ${gift.title}? Demo: ${tierCopy.priceAud} (${tierCopy.label} boost). No charge — apply now?`,
                        )
                      )
                        return
                      applyBoost(boostOpenForId, gift.tier)
                    }}
                  >
                    <span className="flex h-[4rem] w-full items-center justify-center rounded-lg bg-zinc-800/50">
                      <DropGiftPanelArt id={gift.id} className="scale-[0.92] opacity-[0.92]" />
                    </span>
                    <span className="text-[12px] font-medium leading-tight text-zinc-200">{gift.title}</span>
                    <span className="text-[10px] leading-tight text-zinc-500">{gift.hook}</span>
                    <span className="text-[11px] font-medium text-zinc-400">{tierCopy.priceAud}</span>
                  </button>
                )
              })}
            </div>

            <p className="mt-5 text-center text-[10px] leading-snug text-zinc-600">
              Live: Stripe, inventory, and timed boosts. @handles verified before spend.
            </p>
          </div>
        </div>
      ) : null}

      {dropsBidSheet && onCommerceAction ? (
        <div className="fixed inset-0 z-[86] flex flex-col justify-end" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close bid"
            onClick={() => setDropsBidSheet(null)}
          />
          <div
            className="relative z-[1] max-h-[min(85dvh,28rem)] overflow-y-auto rounded-t-2xl bg-zinc-950 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-zinc-100"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fetch-drops-bid-title"
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-zinc-700" aria-hidden />
            <h2 id="fetch-drops-bid-title" className="text-center text-[17px] font-semibold text-zinc-100">
              Place a bid
            </h2>
            <p className="mt-2 text-center text-[12px] leading-snug text-zinc-500 line-clamp-2">
              {dropsBidSheet.title}
            </p>
            <p className="mt-1 text-center text-[13px] font-medium text-zinc-400">{dropsBidSheet.priceLabel}</p>

            <p className="mt-5 text-[11px] font-medium text-zinc-500">Amount (AUD)</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {suggestedBidPresets(dropsBidSheet.priceLabel).map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDropsBidDraft(String(amt))}
                  className={`rounded-xl py-2.5 text-[14px] font-semibold transition-colors ${
                    dropsBidDraft === String(amt)
                      ? 'bg-white text-zinc-900'
                      : 'bg-zinc-900 text-zinc-200 active:bg-zinc-800'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-[11px] font-medium text-zinc-500">
              Custom
              <input
                type="number"
                inputMode="decimal"
                min={1}
                step="0.01"
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-[16px] text-zinc-100 outline-none focus:border-zinc-600"
                value={dropsBidDraft}
                onChange={(e) => setDropsBidDraft(e.target.value)}
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-zinc-800 py-3 text-[14px] font-semibold text-zinc-200 active:bg-zinc-700"
                onClick={() => setDropsBidSheet(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-white py-3 text-[14px] font-semibold text-zinc-900 active:bg-zinc-100"
                onClick={submitDropsBid}
              >
                Submit bid
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileSheet ? (
        <FetchProfileSheet
          open
          onClose={() => setProfileSheet(null)}
          authorId={profileSheet.authorId}
          sellerDisplay={profileSheet.sellerDisplay}
          pool={pool}
          isSelf={profileSheet.isSelf}
          profileRevision={profileTick}
          onProfileSaved={onProfileSavedFromSheet}
          onRequestTab={requestHomeTab}
          onOpenReel={onOpenReelFromSheet}
          onOpenPeerListing={onOpenPeerListingFromProfile}
        />
      ) : null}

      {reelsMenuOpen ? (
        <div className="fixed inset-0 z-[88] flex flex-col justify-end" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setReelsMenuOpen(false)}
          />
          <div
            className="relative z-[1] max-h-[min(88dvh,32rem)] space-y-1 overflow-y-auto rounded-t-2xl border border-white/10 bg-zinc-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Drops menu"
          >
            <p className="text-[15px] font-bold">Menu</p>
            {postErr ? <p className="text-[12px] text-amber-300">{postErr}</p> : null}
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Create</p>
            <button
              type="button"
              className="w-full rounded-xl bg-white py-3.5 text-left text-[15px] font-bold text-zinc-900 px-4"
              onClick={openPostWizard}
            >
              Post video / photos
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-violet-400/60 bg-violet-500/20 py-3.5 text-left text-[15px] font-bold text-violet-100 px-4"
              onClick={() => {
                setReelsMenuOpen(false)
                setLiveInfo(null)
                setLiveTitle('')
                setLivePickProducts({})
                setLivePickListings({})
                setLiveSheetOpen(true)
              }}
            >
              Go live
            </button>
            <p className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Profile</p>
            <button
              type="button"
              className="w-full rounded-xl border border-white/15 bg-white/8 py-3 text-left text-[15px] font-semibold text-white px-4"
              onClick={() => {
                setReelsMenuOpen(false)
                openMyProfileSheet()
              }}
            >
              Your profile
            </button>
            {onMenuAccount ? (
              <button
                type="button"
                className="w-full rounded-xl border border-white/15 bg-white/8 py-3 text-left text-[15px] font-semibold text-white px-4"
                onClick={() => {
                  setReelsMenuOpen(false)
                  onMenuAccount()
                }}
              >
                Profile (full screen)
              </button>
            ) : null}
            <p className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Feed order</p>
            <button
              type="button"
              className="w-full rounded-xl border border-white/15 bg-white/8 py-3 text-left text-[15px] font-semibold text-white px-4"
              onClick={() => {
                onShuffleFeed()
                setReelsMenuOpen(false)
              }}
            >
              Shuffle feed
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-white/15 bg-white/8 py-3 text-left text-[15px] font-semibold text-white px-4"
              onClick={() => {
                onRankedFeed()
                setReelsMenuOpen(false)
              }}
            >
              Ranked order
            </button>
            <button
              type="button"
              className="mt-2 w-full py-2 text-[13px] font-semibold text-white/55"
              onClick={() => setReelsMenuOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {liveSheetOpen ? (
        <div className="fixed inset-0 z-[89] flex flex-col justify-end" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={() => setLiveSheetOpen(false)}
          />
          <div className="relative z-[1] flex max-h-[min(92dvh,40rem)] flex-col rounded-t-2xl border border-white/10 bg-zinc-900 text-white shadow-2xl">
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-2">
            <h2 className="text-[17px] font-bold">Go live</h2>
            <p className="mt-2 text-[13px] leading-snug text-white/65">
              Creates a <span className="font-mono text-[11px]">draft</span> drop and a Mux live stream when API keys
              are set. Webhook <span className="font-mono text-[11px]">/api/webhooks/mux</span> attaches{' '}
              <span className="font-mono text-[11px]">live_replay</span> VOD; set{' '}
              <span className="font-mono text-[11px]">MUX_AUTO_PUBLISH_REPLAY=1</span> to auto-publish.
            </p>
            <p className="mt-2 text-[12px] font-medium text-violet-200/90">
              Choose what you are showcasing: Fetch store products and your published marketplace listings (required
              before you start).
            </p>
            <label className="mt-3 block text-[11px] font-semibold uppercase text-white/50">
              Stream title
              <input
                className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[15px]"
                value={liveTitle}
                onChange={(e) => setLiveTitle(e.target.value)}
                placeholder="Saturday restock"
              />
            </label>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/45">Store products</p>
            <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-2">
              <p className="px-1 text-[10px] font-semibold uppercase text-white/35">Hardware</p>
              {HARDWARE_PRODUCTS.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px]"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(livePickProducts[p.id])}
                    onChange={() =>
                      setLivePickProducts((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                    }
                  />
                  <span className="min-w-0 leading-snug">
                    <span className="font-semibold text-white/95">{p.title}</span>
                    <span className="block text-[11px] text-white/50">{p.subtitle}</span>
                  </span>
                </label>
              ))}
              <p className="mt-2 px-1 text-[10px] font-semibold uppercase text-white/35">Supplies</p>
              {SUPPLY_PRODUCTS.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px]"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(livePickProducts[p.id])}
                    onChange={() =>
                      setLivePickProducts((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                    }
                  />
                  <span className="min-w-0 leading-snug">
                    <span className="font-semibold text-white/95">{p.title}</span>
                    <span className="block text-[11px] text-white/50">{p.subtitle}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Your marketplace listings
            </p>
            <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-2">
              {liveMyListings.length ? (
                liveMyListings.map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px]"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(livePickListings[l.id])}
                      onChange={() =>
                        setLivePickListings((prev) => ({ ...prev, [l.id]: !prev[l.id] }))
                      }
                    />
                    <span className="min-w-0 leading-snug">
                      <span className="font-semibold text-white/95">{l.title}</span>
                      <span className="block truncate font-mono text-[10px] text-white/40">{l.id}</span>
                    </span>
                  </label>
                ))
              ) : (
                <p className="px-2 py-2 text-[12px] text-white/50">
                  No published listings on this account. Publish one from Buy &amp; sell, or pick store products
                  above.
                </p>
              )}
            </div>
            </div>
            <div className="shrink-0 border-t border-white/10 bg-zinc-900 p-4 pt-3">
            <button
              type="button"
              disabled={liveBusy || !dropsDb || liveShowcaseCount < 1}
              className="w-full rounded-xl bg-violet-500 py-3 text-[14px] font-bold text-white disabled:opacity-40"
              onClick={() => {
                setLiveBusy(true)
                setLiveInfo(null)
                void (async () => {
                  try {
                    const showcaseItems: { type: 'product' | 'listing'; id: string; label: string }[] = []
                    for (const p of HARDWARE_PRODUCTS) {
                      if (!livePickProducts[p.id]) continue
                      showcaseItems.push({ type: 'product', id: p.id, label: p.title })
                    }
                    for (const p of SUPPLY_PRODUCTS) {
                      if (!livePickProducts[p.id]) continue
                      showcaseItems.push({ type: 'product', id: p.id, label: p.title })
                    }
                    for (const l of liveMyListings) {
                      if (!livePickListings[l.id]) continue
                      showcaseItems.push({ type: 'listing', id: l.id, label: l.title })
                    }
                    const res = await fetch(`${getFetchApiBaseUrl()}/api/drops/live/start`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: liveTitle.trim() || 'Live',
                        authorId: myProfile?.id,
                        sellerDisplay: myProfile ? formatDropHandle(myProfile.displayName) : undefined,
                        showcaseItems,
                      }),
                    })
                    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
                    if (!res.ok) {
                      setLiveInfo({
                        error: typeof j.error === 'string' ? j.error : 'live_start_failed',
                        detail: typeof j.detail === 'string' ? j.detail : undefined,
                        dropId: typeof j.dropId === 'string' ? j.dropId : undefined,
                      })
                      return
                    }
                    setLiveInfo({
                      dropId: typeof j.dropId === 'string' ? j.dropId : undefined,
                      rtmpUrl: typeof j.rtmpUrl === 'string' ? j.rtmpUrl : null,
                      streamKey: typeof j.streamKey === 'string' ? j.streamKey : null,
                      playbackUrl: typeof j.playbackUrl === 'string' ? j.playbackUrl : null,
                    })
                    refreshApiDropsFeed()
                  } catch {
                    setLiveInfo({ error: 'network_error' })
                  } finally {
                    setLiveBusy(false)
                  }
                })()
              }}
            >
              {liveBusy ? 'Starting…' : dropsDb ? 'Start Mux stream' : 'Server feed unavailable'}
            </button>
            {liveShowcaseCount < 1 ? (
              <p className="mt-2 text-center text-[11px] text-white/45">Select at least one product or listing.</p>
            ) : null}
            {liveInfo?.error ? (
              <p className="mt-2 text-[12px] text-amber-300">
                {liveInfo.error}
                {liveInfo.detail ? ` · ${liveInfo.detail}` : ''}
                {liveInfo.dropId ? ` · draft ${liveInfo.dropId}` : ''}
              </p>
            ) : null}
            {liveInfo && !liveInfo.error && liveInfo.streamKey ? (
              <div className="mt-3 space-y-1 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/75">
                <p>
                  <span className="text-white/45">RTMP:</span> {liveInfo.rtmpUrl ?? '—'}
                </p>
                <p className="break-all">
                  <span className="text-white/45">Stream key:</span> {liveInfo.streamKey}
                </p>
                {liveInfo.playbackUrl ? (
                  <p className="break-all">
                    <span className="text-white/45">Preview:</span> {liveInfo.playbackUrl}
                  </p>
                ) : null}
                {liveInfo.dropId ? (
                  <p className="break-all">
                    <span className="text-white/45">Draft drop:</span> {liveInfo.dropId}
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-white py-3 text-[14px] font-bold text-zinc-900"
              onClick={() => setLiveSheetOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
        </div>
      ) : null}

      {dropsBidSheet ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
          role="dialog"
          aria-modal
          aria-labelledby="fetch-drops-bid-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <p id="fetch-drops-bid-title" className="text-[15px] font-bold text-zinc-900">
              {dropsBidSheet.title}
            </p>
            <p className="mt-1 text-[12px] text-zinc-600">
              {dropsBidSheet.priceLabel} · your bid (AUD)
            </p>
            <input
              className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[16px] text-zinc-900"
              value={dropsBidDraft}
              onChange={(e) => setDropsBidDraft(e.target.value)}
              inputMode="decimal"
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-[14px] font-semibold text-zinc-900"
                onClick={() => setDropsBidSheet(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-violet-600 py-2.5 text-[14px] font-semibold text-white"
                onClick={submitDropsBid}
              >
                Place bid
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {myProfile ? (
        <DropsPostWizard
          key={wizardMountKey}
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onPublished={() => {
            refreshApiDropsFeed()
            setTopTab('drops')
            setFeedShuffleNonce(0)
            setWizardOpen(false)
          }}
          authorId={myProfile.id}
          sellerDisplay={formatDropHandle(myProfile.displayName)}
          tryServerPublish={dropsDb}
          onLocalPublish={handleWizardLocalPublish}
          onPublishActivity={onPublishActivity}
        />
      ) : null}
    </div>
  )
}

export const HomeShellReelsPage = memo(HomeShellReelsPageInner)
