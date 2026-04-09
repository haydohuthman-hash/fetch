import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { waitForPaymentIntentServerConfirmed } from '../lib/booking/api'
import {
  analyzeListingPhotosForSell,
  checkoutListing,
  createListing,
  fetchMyListings,
  fetchPublishedListings,
  fetchSellerEarnings,
  listingImageAbsoluteUrl,
  patchListing,
  publishListing,
  refreshSellerConnectStatus,
  registerDevSellerStripe,
  startSellerConnect,
  uploadListingImage,
  type PeerListing,
} from '../lib/listingsApi'
import { formatDropHandle, getMyDropProfile } from '../lib/drops/profileStore'
import { dispatchOpenPublicProfile } from '../lib/fetchProfile/openPublicProfileEvent'
import { syncCustomerSessionCookie } from '../lib/fetchServerSession'
import { loadSession } from '../lib/fetchUserSession'
import { confirmDemoPaymentIntent, isStripePublishableConfigured } from '../lib/paymentCheckout'
import {
  AccountNavIconFilled,
  FetchEyesHomeIcon,
  ShellMenuCloseIcon,
  ShellMenuCreateIcon,
  ShellMenuEarningsIcon,
  ShellMenuIcon,
  ShellMenuListingsIcon,
  ShellMenuPayoutIcon,
  ShellMenuRefreshIcon,
} from './icons/HomeShellNavIcons'
import { FetchShopModeSegment } from './FetchShopModeSegment'
import { FetchStripePaymentElement } from './FetchStripePaymentElement'
import type { HomeShellTabRequest } from './profile/FetchProfileSheet'
import { BRISBANE_CENTER } from './FetchHomeStepOne/brisbaneMap'
import {
  LocationRadiusPickerSheet,
  type LocationRadiusConfirm,
  type ServiceRadiusKm,
} from './FetchHomeStepOne/LocationRadiusPickerSheet'

const BUYSHELL_LOCATION_KEY = 'fetch.buysell.location'
const BUYSHELL_SCOPE_KEY = 'fetch.buysell.scope'
const BUYSHELL_MAP_AREA_KEY = 'fetch.buysell.map-area-v1'

type BuysellMapAreaState = {
  center: google.maps.LatLngLiteral
  radiusKm: ServiceRadiusKm
  label: string
}

function loadBuysellMapArea(): BuysellMapAreaState | null {
  try {
    const raw = localStorage.getItem(BUYSHELL_MAP_AREA_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { lat: number; lng: number; radiusKm: number; label?: string }
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null
    const r = (p.radiusKm === 10 || p.radiusKm === 30 || p.radiusKm === 50 ? p.radiusKm : 30) as ServiceRadiusKm
    return {
      center: { lat: p.lat, lng: p.lng },
      radiusKm: r,
      label: typeof p.label === 'string' ? p.label : '',
    }
  } catch {
    return null
  }
}

function saveBuysellMapArea(value: LocationRadiusConfirm) {
  try {
    localStorage.setItem(
      BUYSHELL_MAP_AREA_KEY,
      JSON.stringify({
        lat: value.lat,
        lng: value.lng,
        radiusKm: value.radiusKm,
        label: value.label,
      }),
    )
  } catch {
    /* ignore */
  }
}

type MarketScope = 'local' | 'global'

function loadStoredScope(): MarketScope {
  try {
    const v = localStorage.getItem(BUYSHELL_SCOPE_KEY)?.trim().toLowerCase()
    if (v === 'global') return 'global'
  } catch {
    /* ignore */
  }
  return 'local'
}

/** Local feed: Fetch delivery + listing area overlaps saved location hint. */
function listingMatchesLocalFeed(l: PeerListing, userLocation: string): boolean {
  if (l.fetchDelivery !== true) return false
  const u = userLocation.trim().toLowerCase()
  if (!u) return true
  const loc = (l.locationLabel || '').toLowerCase()
  const primary = u.split(',')[0]?.trim() ?? u
  if (primary.length >= 3 && loc.includes(primary)) return true
  const words = u.split(/[\s,]+/).filter((w) => w.length >= 4)
  return words.some((w) => loc.includes(w))
}

const CATEGORY_CHIPS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'sports', label: 'Sports' },
  { id: 'free', label: 'Free' },
  { id: 'other', label: 'Other' },
]

const LIST_FORM_CATEGORIES: { id: string; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'sports', label: 'Sports' },
  { id: 'other', label: 'Other' },
]

const CONDITION_OPTIONS: { id: string; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'like new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
  { id: 'used', label: 'Used' },
  { id: 'for parts', label: 'For parts / repair' },
]

const MAX_LISTING_PHOTOS = 12

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function MapPinIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 21.25s-5.75-5.1-5.75-10.5A5.75 5.75 0 1117.75 10.75c0 5.4-5.75 10.5-5.75 10.5z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="10.25" r="2.2" fill="currentColor" />
    </svg>
  )
}

export type BuySellDropsListingHandoff = {
  listingId: string
  /** `sheet` opens listing detail; `buyNow` starts checkout; `bid` opens listing for auction (Phase 6). */
  mode: 'sheet' | 'buyNow' | 'bid'
}

export type HomeShellBuySellPageProps = {
  bottomNav: ReactNode
  onMenuAccount?: () => void
  /** Create/open a listing DM and let the shell switch to the chat tab. */
  onOpenListingChat?: (listingId: string) => void | Promise<void>
  /** Switch to Drops so `FetchProfileSheet` can open (View seller profile). */
  onRequestHomeShellTab?: (tab: HomeShellTabRequest) => void
  /** From Drops: open a peer listing (and optionally start buy). */
  dropsListingHandoff?: BuySellDropsListingHandoff | null
  onDropsListingHandoffConsumed?: () => void
  /** Jump to home services and start pick & drop booking. */
  onBookDriver?: () => void
}

function formatAudFromCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function listingCompareAtCents(l: PeerListing): number {
  const c = l.compareAtCents
  if (c == null || !Number.isFinite(c) || c < 1) return 0
  return Math.round(c)
}

function listingSavingsPercent(l: PeerListing): number | null {
  const was = listingCompareAtCents(l)
  const now = l.priceCents ?? 0
  if (was <= 0 || now <= 0 || was <= now) return null
  return Math.min(99, Math.round(((was - now) / was) * 100))
}

function listingPublicSellerLine(l: PeerListing): string | null {
  const d = l.profileDisplayName?.trim()
  if (!d) return null
  return formatDropHandle(d)
}

type Panel = 'feed' | 'create' | 'connect' | 'earnings' | 'myListings' | 'editListing'

function loadStoredLocation(): string {
  try {
    const v = localStorage.getItem(BUYSHELL_LOCATION_KEY)?.trim()
    if (v) return v
  } catch {
    /* ignore */
  }
  return 'Brisbane, QLD'
}

function listingMatchesCategory(listing: PeerListing, categoryId: string): boolean {
  if (categoryId === 'all') return true
  const c = listing.category?.toLowerCase?.() ?? 'general'
  if (categoryId === 'other') {
    const known = new Set(CATEGORY_CHIPS.map((x) => x.id).filter((id) => id !== 'all' && id !== 'other'))
    return !known.has(c)
  }
  if (categoryId === 'free') {
    return listing.priceCents === 0 || /\bfree\b/i.test(listing.title)
  }
  return c === categoryId
}

function HomeShellBuySellPageInner({
  bottomNav,
  onMenuAccount,
  onOpenListingChat,
  onRequestHomeShellTab,
  dropsListingHandoff = null,
  onDropsListingHandoffConsumed,
}: HomeShellBuySellPageProps) {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const [panel, setPanel] = useState<Panel>('feed')
  const prevPanelRef = useRef<Panel>('feed')
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [forYouActive, setForYouActive] = useState(true)
  const [locationLabel, setLocationLabel] = useState(loadStoredLocation)
  const [locationEditorOpen, setLocationEditorOpen] = useState(false)
  const [locationDraft, setLocationDraft] = useState(locationLabel)
  const [mapAreaPickerOpen, setMapAreaPickerOpen] = useState(false)
  const [buysellMapArea, setBuysellMapArea] = useState<BuysellMapAreaState | null>(() =>
    loadBuysellMapArea(),
  )
  const [marketScope, setMarketScope] = useState<MarketScope>(loadStoredScope)
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false)
  const [categoriesOverlayOpen, setCategoriesOverlayOpen] = useState(false)

  const [listings, setListings] = useState<PeerListing[]>([])
  const [listErr, setListErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<PeerListing | null>(null)
  const [stripeBuy, setStripeBuy] = useState<{
    clientSecret: string
    paymentIntentId: string
  } | null>(null)
  const [buyErr, setBuyErr] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priceAud, setPriceAud] = useState('')
  const [compareAtAud, setCompareAtAud] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [createCategory, setCreateCategory] = useState('general')
  const [createCondition, setCreateCondition] = useState('used')
  const [keywords, setKeywords] = useState('')
  const [listingLocationDraft, setListingLocationDraft] = useState(loadStoredLocation)
  const [sku, setSku] = useState('')
  const [measurementWidthCm, setMeasurementWidthCm] = useState('')
  const [measurementHeightCm, setMeasurementHeightCm] = useState('')
  const [measurementDepthCm, setMeasurementDepthCm] = useState('')
  const [measurementsSummary, setMeasurementsSummary] = useState('')
  const [acceptsOffers, setAcceptsOffers] = useState(false)
  const [fetchDelivery, setFetchDelivery] = useState(true)
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [aiFillBusy, setAiFillBusy] = useState(false)
  const [aiFillErr, setAiFillErr] = useState<string | null>(null)
  const listingAiScanLockRef = useRef(false)

  const [earnings, setEarnings] = useState<Awaited<ReturnType<typeof fetchSellerEarnings>> | null>(null)
  const [earnErr, setEarnErr] = useState<string | null>(null)

  const [connectMsg, setConnectMsg] = useState<string | null>(null)
  const [devAcct, setDevAcct] = useState('')

  const [myListings, setMyListings] = useState<PeerListing[]>([])
  const [myListErr, setMyListErr] = useState<string | null>(null)
  const [editingListing, setEditingListing] = useState<PeerListing | null>(null)

  const sessionEmail = loadSession()?.email?.trim() ?? ''
  const isEditMode = panel === 'editListing' && editingListing != null

  useEffect(() => {
    void syncCustomerSessionCookie()
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 320)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!searchOverlayOpen && !categoriesOverlayOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSearchOverlayOpen(false)
      setCategoriesOverlayOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOverlayOpen, categoriesOverlayOpen])

  const photoPreviewUrls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos])
  const photoSig = useMemo(
    () => photos.map((p) => `${p.name}:${p.size}:${p.lastModified}`).join('|'),
    [photos],
  )

  useEffect(() => {
    const urls = photoPreviewUrls
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [photoPreviewUrls])

  const runAiFillFromPhotos = useCallback(
    async (mode: 'empty-only' | 'replace-all') => {
      if (photos.length === 0 || listingAiScanLockRef.current) return
      listingAiScanLockRef.current = true
      setAiFillBusy(true)
      setAiFillErr(null)
      try {
        const fill = await analyzeListingPhotosForSell(photos)
        const all = mode === 'replace-all'
        setTitle((t) => (all || !t.trim() ? fill.title || '' : t))
        setDescription((d) => (all || !d.trim() ? fill.description || '' : d))
        setKeywords((k) => (all || !k.trim() ? fill.keywords || '' : k))
        setMeasurementsSummary((m) => (all || !m.trim() ? (fill.measurementsSummary ?? '').trim() : m))
        setMeasurementWidthCm((w) => {
          if (all || !w.trim()) return fill.widthCm != null ? String(fill.widthCm) : ''
          return w
        })
        setMeasurementHeightCm((h) => {
          if (all || !h.trim()) return fill.heightCm != null ? String(fill.heightCm) : ''
          return h
        })
        setMeasurementDepthCm((dep) => {
          if (all || !dep.trim()) return fill.depthCm != null ? String(fill.depthCm) : ''
          return dep
        })
        setCreateCategory((c) => (all ? fill.category : c === 'general' ? fill.category : c))
        setCreateCondition((c) => (all ? fill.condition : c === 'used' ? fill.condition : c))
        setPriceAud((p) =>
          (all || !p.trim()) && fill.suggestedPriceAud != null ? String(fill.suggestedPriceAud) : p,
        )
        setCompareAtAud((p) =>
          (all || !p.trim()) && fill.suggestedCompareAtAud != null ? String(fill.suggestedCompareAtAud) : p,
        )
        setSku((s) => (all || !s.trim() ? (fill.sku ?? '').trim() : s))
      } catch (e) {
        setAiFillErr(e instanceof Error ? e.message : 'AI scan failed')
      } finally {
        listingAiScanLockRef.current = false
        setAiFillBusy(false)
      }
    },
    [photos],
  )

  useEffect(() => {
    if (panel !== 'create' || photos.length === 0) return
    if (title.trim() !== '' || description.trim() !== '') return
    const id = window.setTimeout(() => {
      void runAiFillFromPhotos('empty-only')
    }, 550)
    return () => window.clearTimeout(id)
  }, [panel, photoSig, runAiFillFromPhotos, title, description])

  useEffect(() => {
    if (panel === 'create' && prevPanelRef.current !== 'create') {
      setListingLocationDraft(locationLabel)
    }
    prevPanelRef.current = panel
  }, [panel, locationLabel])

  const loadBrowse = useCallback(async () => {
    setListErr(null)
    setBusy(true)
    try {
      const serverCategory =
        categoryId === 'all' || categoryId === 'free' || categoryId === 'other' ? undefined : categoryId
      const r = await fetchPublishedListings({
        q: debouncedSearch || undefined,
        category: serverCategory,
        limit: 48,
      })
      let list = r.listings
      if (categoryId === 'free' || categoryId === 'other') {
        list = list.filter((l) => listingMatchesCategory(l, categoryId))
      }
      setListings(list)
    } catch (e) {
      setListings([])
      setListErr(e instanceof Error ? e.message : 'Failed to load listings')
    } finally {
      setBusy(false)
    }
  }, [debouncedSearch, categoryId])

  useEffect(() => {
    void loadBrowse()
  }, [loadBrowse])

  const loadMyListings = useCallback(async () => {
    if (!sessionEmail) {
      setMyListErr('Sign in from Profile to view your listings.')
      setMyListings([])
      return
    }
    setMyListErr(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const rows = await fetchMyListings()
      setMyListings(rows)
    } catch (e) {
      setMyListings([])
      setMyListErr(e instanceof Error ? e.message : 'Failed to load your listings')
    } finally {
      setBusy(false)
    }
  }, [sessionEmail])

  useEffect(() => {
    if (panel === 'myListings') void loadMyListings()
  }, [panel, loadMyListings])

  const hydratedEditIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (panel !== 'editListing' || !editingListing) {
      hydratedEditIdRef.current = null
      return
    }
    if (hydratedEditIdRef.current === editingListing.id) return
    hydratedEditIdRef.current = editingListing.id
    const l = editingListing
    setTitle(l.title ?? '')
    setDescription(l.description ?? '')
    const pc = l.priceCents ?? 0
    setPriceAud(Number.isFinite(pc) ? String(pc / 100) : '')
    const was = listingCompareAtCents(l)
    setCompareAtAud(was > 0 ? String(was / 100) : '')
    setCreateCategory(l.category || 'general')
    setCreateCondition(l.condition || 'used')
    setKeywords(l.keywords?.trim() ?? '')
    setListingLocationDraft(l.locationLabel?.trim() || loadStoredLocation())
    setSku(l.sku?.trim() ?? '')
    setMeasurementWidthCm('')
    setMeasurementHeightCm('')
    setMeasurementDepthCm('')
    setMeasurementsSummary('')
    setAcceptsOffers(Boolean(l.acceptsOffers))
    setFetchDelivery(l.fetchDelivery !== false)
    setPhotos([])
    setCreateErr(null)
    setAiFillErr(null)
  }, [panel, editingListing])

  const persistScope = useCallback((s: MarketScope) => {
    setMarketScope(s)
    try {
      localStorage.setItem(BUYSHELL_SCOPE_KEY, s)
    } catch {
      /* ignore */
    }
  }, [])

  const feedListings = useMemo(() => {
    if (marketScope === 'global') return listings
    return listings.filter((l) => listingMatchesLocalFeed(l, locationLabel))
  }, [listings, marketScope, locationLabel])

  const todaysPicks = useMemo(
    () => feedListings.slice(0, Math.min(8, feedListings.length)),
    [feedListings],
  )

  const pricingPreview = useMemo(() => {
    const sale = Number(priceAud)
    const comp = compareAtAud.trim() === '' ? NaN : Number(compareAtAud)
    if (!Number.isFinite(sale) || sale < 0) return null
    if (!Number.isFinite(comp) || comp <= 0) return null
    if (sale <= 0 || comp <= sale) return null
    const pct = Math.min(99, Math.round(((comp - sale) / comp) * 100))
    return { comp, sale, pct }
  }, [priceAud, compareAtAud])

  const handleCreate = async () => {
    if (!sessionEmail) {
      setCreateErr('Sign in from Profile (email session) to list items.')
      return
    }
    const me = getMyDropProfile()
    if (!me) {
      setCreateErr(
        'Set up your Fetch / Drops profile first (Drops → menu → Your profile). Every listing is tied to that public @handle.',
      )
      return
    }
    setCreateErr(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      if (priceAud.trim() === '') {
        setCreateErr('Set a price in AUD (0 for free) or use AI fill from photos.')
        return
      }
      const n = Number(priceAud)
      if (!Number.isFinite(n) || n < 0) {
        setCreateErr('Enter a valid price in AUD (use 0 for free items).')
        return
      }
      let compareAtPriceAud: number | undefined
      if (compareAtAud.trim() !== '') {
        const c = Number(compareAtAud)
        if (!Number.isFinite(c) || c < 0) {
          setCreateErr('Enter a valid compare-at price in AUD, or leave it blank.')
          return
        }
        if (c > 0 && n > 0 && c <= n) {
          setCreateErr('Compare-at price must be higher than your listing price (e.g. retail vs your deal).')
          return
        }
        if (c > 0) compareAtPriceAud = c
      }
      const dimParts: string[] = []
      const mw = measurementWidthCm.trim()
      const mh = measurementHeightCm.trim()
      const md = measurementDepthCm.trim()
      if (mw) dimParts.push(`W ${mw} cm`)
      if (mh) dimParts.push(`H ${mh} cm`)
      if (md) dimParts.push(`D ${md} cm`)
      const dimBlock = dimParts.length ? `Measurements: ${dimParts.join(' · ')}` : ''
      const sumLine = measurementsSummary.trim()
      let descBody = description.trim()
      if (dimBlock) descBody = descBody ? `${descBody}\n\n${dimBlock}` : dimBlock
      if (sumLine && !descBody.includes(sumLine)) {
        descBody = descBody ? `${descBody}\n${sumLine}` : sumLine
      }

      const listing = await createListing({
        title: title.trim() || 'Untitled',
        description: descBody,
        priceAud: n,
        compareAtPriceAud,
        category: createCategory,
        condition: createCondition,
        keywords: keywords.trim(),
        locationLabel: listingLocationDraft.trim() || locationLabel.trim(),
        sku: sku.trim() || undefined,
        acceptsOffers,
        fetchDelivery,
        profileAuthorId: me.id,
        profileDisplayName: me.displayName,
        profileAvatar: me.avatar,
      })
      for (const file of photos) {
        await uploadListingImage(listing.id, file)
      }
      await publishListing(listing.id)
      setTitle('')
      setDescription('')
      setPriceAud('')
      setCompareAtAud('')
      setPhotos([])
      setCreateCategory('general')
      setCreateCondition('used')
      setKeywords('')
      setSku('')
      setMeasurementWidthCm('')
      setMeasurementHeightCm('')
      setMeasurementDepthCm('')
      setMeasurementsSummary('')
      setAiFillErr(null)
      setAcceptsOffers(false)
      setFetchDelivery(true)
      setPanel('feed')
      void loadBrowse()
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Could not create listing')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!sessionEmail || !editingListing) {
      setCreateErr('Nothing to save.')
      return
    }
    const me = getMyDropProfile()
    if (!me) {
      setCreateErr(
        'Set up your Fetch / Drops profile first (Drops → menu → Your profile) to attach this listing to your public profile.',
      )
      return
    }
    setCreateErr(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      if (priceAud.trim() === '') {
        setCreateErr('Set a price in AUD (0 for free).')
        return
      }
      const n = Number(priceAud)
      if (!Number.isFinite(n) || n < 0) {
        setCreateErr('Enter a valid price in AUD (use 0 for free items).')
        return
      }
      let compareAtPriceAud: number | undefined
      if (compareAtAud.trim() !== '') {
        const c = Number(compareAtAud)
        if (!Number.isFinite(c) || c < 0) {
          setCreateErr('Enter a valid compare-at price in AUD, or leave it blank.')
          return
        }
        if (c > 0 && n > 0 && c <= n) {
          setCreateErr('Compare-at price must be higher than your listing price.')
          return
        }
        if (c > 0) compareAtPriceAud = c
      }
      const dimParts: string[] = []
      const mw = measurementWidthCm.trim()
      const mh = measurementHeightCm.trim()
      const md = measurementDepthCm.trim()
      if (mw) dimParts.push(`W ${mw} cm`)
      if (mh) dimParts.push(`H ${mh} cm`)
      if (md) dimParts.push(`D ${md} cm`)
      const dimBlock = dimParts.length ? `Measurements: ${dimParts.join(' · ')}` : ''
      const sumLine = measurementsSummary.trim()
      let descBody = description.trim()
      if (dimBlock) descBody = descBody ? `${descBody}\n\n${dimBlock}` : dimBlock
      if (sumLine && !descBody.includes(sumLine)) {
        descBody = descBody ? `${descBody}\n${sumLine}` : sumLine
      }

      await patchListing(editingListing.id, {
        title: title.trim() || 'Untitled',
        description: descBody,
        priceAud: n,
        compareAtPriceAud,
        category: createCategory,
        condition: createCondition,
        keywords: keywords.trim(),
        locationLabel: listingLocationDraft.trim() || locationLabel.trim(),
        sku: sku.trim() || undefined,
        acceptsOffers,
        fetchDelivery,
        profileAuthorId: me.id,
        profileDisplayName: me.displayName,
        profileAvatar: me.avatar,
      })
      setEditingListing(null)
      hydratedEditIdRef.current = null
      setPanel('myListings')
      void loadMyListings()
      void loadBrowse()
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Could not update listing')
    } finally {
      setBusy(false)
    }
  }

  const openSellerPublicProfile = useCallback(
    (l: PeerListing) => {
      const id = l.profileAuthorId?.trim()
      if (!id) return
      const raw = l.profileDisplayName?.trim()
      dispatchOpenPublicProfile({
        authorId: id,
        sellerDisplay: raw ? formatDropHandle(raw) : '@seller',
      })
      onRequestHomeShellTab?.('reels')
    },
    [onRequestHomeShellTab],
  )

  const startBuy = async (listing: PeerListing) => {
    setBuyErr(null)
    setStripeBuy(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const { paymentIntent } = await checkoutListing(listing.id)
      if (paymentIntent.provider === 'stripe') {
        if (!isStripePublishableConfigured()) {
          setBuyErr('Set VITE_STRIPE_PUBLISHABLE_KEY to pay with Stripe.')
          return
        }
        if (!paymentIntent.clientSecret) {
          setBuyErr('Missing Stripe client secret.')
          return
        }
        setStripeBuy({ clientSecret: paymentIntent.clientSecret, paymentIntentId: paymentIntent.id })
        return
      }
      await confirmDemoPaymentIntent(paymentIntent)
      setSelected(null)
      void loadBrowse()
    } catch (e) {
      setBuyErr(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setBusy(false)
    }
  }

  const dropsListingHandoffDoneRef = useRef<string | null>(null)
  useEffect(() => {
    if (!dropsListingHandoff) {
      dropsListingHandoffDoneRef.current = null
      return
    }
    if (busy) return
    const sig = `${dropsListingHandoff.listingId}:${dropsListingHandoff.mode}`
    if (dropsListingHandoffDoneRef.current === sig) return
    const listing = listings.find((l) => l.id === dropsListingHandoff.listingId)
    if (!listing) {
      onDropsListingHandoffConsumed?.()
      return
    }
    dropsListingHandoffDoneRef.current = sig
    setPanel('feed')
    setMenuOpen(false)
    setStripeBuy(null)
    setBuyErr(null)
    setSelected(listing)
    if (dropsListingHandoff.mode === 'buyNow') {
      queueMicrotask(() => void startBuy(listing))
    }
    onDropsListingHandoffConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- startBuy not stable; once per handoff via dropsListingHandoffDoneRef
  }, [busy, dropsListingHandoff, listings, onDropsListingHandoffConsumed])

  const loadEarnings = useCallback(async () => {
    if (!sessionEmail) {
      setEarnErr('Sign in from Profile to view seller earnings.')
      return
    }
    setEarnErr(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const e = await fetchSellerEarnings()
      setEarnings(e)
    } catch (err) {
      setEarnings(null)
      setEarnErr(err instanceof Error ? err.message : 'Failed to load earnings')
    } finally {
      setBusy(false)
    }
  }, [sessionEmail])

  useEffect(() => {
    if (panel === 'earnings') void loadEarnings()
  }, [panel, loadEarnings])

  const openConnect = async () => {
    if (!sessionEmail) {
      setConnectMsg('Sign in from Profile first.')
      return
    }
    setConnectMsg(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const { url } = await startSellerConnect()
      window.open(url, '_blank', 'noopener,noreferrer')
      setConnectMsg('Complete onboarding in the new tab, then tap “Refresh status”.')
    } catch (e) {
      setConnectMsg(e instanceof Error ? e.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  const refreshConnect = async () => {
    setConnectMsg(null)
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      const s = await refreshSellerConnectStatus()
      setConnectMsg(
        s.onboardingComplete
          ? 'Stripe Connect is ready — you can publish paid listings checkout.'
          : 'Onboarding not complete yet.',
      )
    } catch (e) {
      setConnectMsg(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setBusy(false)
    }
  }

  const devRegister = async () => {
    if (!devAcct.trim()) return
    setBusy(true)
    try {
      await syncCustomerSessionCookie()
      await registerDevSellerStripe(devAcct.trim())
      setConnectMsg('Dev: connected account saved as onboarded.')
      setDevAcct('')
    } catch (e) {
      setConnectMsg(e instanceof Error ? e.message : 'Register failed')
    } finally {
      setBusy(false)
    }
  }

  const saveLocation = () => {
    const next = locationDraft.trim() || 'Brisbane, QLD'
    setLocationLabel(next)
    persistScope('local')
    try {
      localStorage.setItem(BUYSHELL_LOCATION_KEY, next)
    } catch {
      /* ignore */
    }
    setLocationEditorOpen(false)
  }

  const locationInlineTitle = useMemo(() => {
    const r = buysellMapArea?.radiusKm ?? 30
    const primary = (buysellMapArea?.label?.trim() || locationLabel.trim()) || ''
    if (!primary) return 'Set your area'
    return primary.length > 36
      ? `${primary.slice(0, 33)}… · ${r} km`
      : `${primary} · ${r} km`
  }, [buysellMapArea, locationLabel])

  const locationDisplayLine = useMemo(
    () => (marketScope === 'global' ? 'Australia wide' : locationInlineTitle),
    [marketScope, locationInlineTitle],
  )

  const onBuysellMapAreaConfirm = useCallback(
    (v: LocationRadiusConfirm) => {
      persistScope('local')
      setBuysellMapArea({
        center: { lat: v.lat, lng: v.lng },
        radiusKm: v.radiusKm,
        label: v.label,
      })
      saveBuysellMapArea(v)
      const labelForListings = v.label.trim() || locationLabel.trim() || 'Brisbane, QLD'
      setLocationLabel(labelForListings)
      try {
        localStorage.setItem(BUYSHELL_LOCATION_KEY, labelForListings)
      } catch {
        /* ignore */
      }
      setMapAreaPickerOpen(false)
    },
    [locationLabel, persistScope],
  )

  const menuNavigate = (to: Panel) => {
    setMenuOpen(false)
    setPanel(to)
  }

  const openSetLocation = useCallback(() => {
    if (mapsApiKey) {
      setMapAreaPickerOpen(true)
    } else {
      setLocationDraft(locationLabel)
      setLocationEditorOpen(true)
    }
  }, [mapsApiKey, locationLabel])

  const scopeTabClass = (isActive: boolean) =>
    [
      'flex-1 bg-transparent py-2 text-center text-[11px] font-semibold transition-colors',
      'border-b-2 -mb-px outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2',
      isActive ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 active:text-zinc-700',
    ].join(' ')

  const marketplaceScopePillsRow = (
    <div className="w-full min-w-0 border-b border-zinc-200/90" role="group" aria-label="Marketplace scope">
      <div className="flex w-full min-w-0">
        <button type="button" className={scopeTabClass(marketScope === 'local')} onClick={() => persistScope('local')}>
          Fetch local
        </button>
        <button type="button" className={scopeTabClass(marketScope === 'global')} onClick={() => persistScope('global')}>
          Fetch world
        </button>
      </div>
    </div>
  )

  const feedChrome = (
    <>
      <header className="shrink-0 border-b border-zinc-200/80 bg-white px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-4">
        <div className="mx-auto grid w-full min-w-0 max-w-lg grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-800 transition-colors active:bg-zinc-100"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <ShellMenuIcon className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center justify-center gap-2">
            <FetchEyesHomeIcon className="h-8 w-8 shrink-0 text-zinc-900 sm:h-9 sm:w-9" />
            <div className="min-w-0 text-left">
              <span className="flex min-w-0 items-baseline gap-1 truncate">
                <span className="fetch-home-map-brand-logo shrink-0 text-[1.2rem] font-bold leading-none tracking-[-0.03em] text-zinc-900 sm:text-[1.35rem]">
                  Fetch
                </span>
                <span className="min-w-0 truncate text-[1.1rem] font-semibold leading-none tracking-[-0.02em] text-zinc-500 sm:text-[1.1rem]">
                  Shop
                </span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-0.5 justify-self-end">
            <button
              type="button"
              onClick={() => setSearchOverlayOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-800 transition-colors active:bg-zinc-100"
              aria-label="Search marketplace"
            >
              <SearchIcon className="text-zinc-600" />
            </button>
            {onMenuAccount ? (
              <button
                type="button"
                onClick={onMenuAccount}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-800 transition-colors active:bg-zinc-100"
                aria-label="Profile"
              >
                <AccountNavIconFilled className="h-6 w-6" />
              </button>
            ) : null}
          </div>
        </div>

        {onRequestHomeShellTab ? (
          <div className="mx-auto mt-2 w-full min-w-0 max-w-lg">
            <FetchShopModeSegment
              active="peer"
              onChange={(mode) => {
                if (mode === 'supplies') onRequestHomeShellTab('marketplace')
              }}
            />
          </div>
        ) : null}

        <div
          className="mx-auto mt-2 flex w-full min-w-0 max-w-lg flex-wrap justify-start gap-1.5 px-0.5"
          role="group"
          aria-label="Quick actions"
        >
          <button
            type="button"
            onClick={() => {
              setForYouActive(false)
              setEditingListing(null)
              setPanel('create')
            }}
            className="rounded-full border border-zinc-200 bg-zinc-50/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 active:scale-[0.98]"
          >
            Sell
          </button>
          <button
            type="button"
            onClick={() => setCategoriesOverlayOpen(true)}
            className="rounded-full border border-zinc-200 bg-zinc-50/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 active:scale-[0.98]"
          >
            Categories
          </button>
          <button
            type="button"
            onClick={() => {
              setForYouActive(true)
              setCategoryId('all')
            }}
            className={[
              'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
              forYouActive && categoryId === 'all'
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-zinc-50/90 text-zinc-900 hover:bg-zinc-100 active:scale-[0.98]',
            ].join(' ')}
          >
            For you
          </button>
        </div>

        <div className="mx-auto mt-2 flex w-full min-w-0 max-w-lg items-center gap-2 px-1">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <MapPinIcon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <span className="min-w-0 truncate text-[13px] font-semibold text-zinc-800">{locationDisplayLine}</span>
          </div>
          <button
            type="button"
            onClick={openSetLocation}
            className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-[#1877f2] underline decoration-[#1877f2]/40 underline-offset-2 active:opacity-80"
          >
            Set location
          </button>
        </div>
      </header>
    </>
  )

  const listingGridCard = (l: PeerListing) => {
    const now = l.priceCents ?? 0
    const sellerLine = listingPublicSellerLine(l)
    const label = `${l.title}, ${formatAudFromCents(now)}`
    return (
      <button
        type="button"
        aria-label={label}
        className="group flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white text-left shadow-sm active:bg-zinc-50"
        onClick={() => setSelected(l)}
      >
        <div className="relative aspect-square min-h-0 min-w-0 w-full max-w-full bg-zinc-100">
          {l.images?.[0]?.url ? (
            <img
              src={listingImageAbsoluteUrl(l.images[0].url)}
              alt=""
              className="h-full w-full object-cover transition-transform group-active:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[12px] font-medium text-zinc-400">
              No photo
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 border-t border-zinc-100 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="shrink-0 text-[13px] font-bold tabular-nums text-zinc-900">{formatAudFromCents(now)}</p>
            <p className="min-w-0 flex-1 truncate text-right text-[13px] font-semibold leading-tight text-zinc-900">
              {l.title}
            </p>
          </div>
          {sellerLine ? (
            <p className="truncate text-center text-[10px] font-semibold text-zinc-500">{sellerLine}</p>
          ) : null}
        </div>
      </button>
    )
  }

  return (
    <div
      className="fetch-home-buysell-page absolute inset-0 z-[60] flex min-h-0 min-w-0 w-full flex-col bg-zinc-100"
      role="main"
      aria-label="Fetch buy and sell"
    >
      {menuOpen ? (
        <div className="fixed inset-0 z-[75] flex" role="dialog" aria-modal aria-label="Buy and sell menu">
          <button
            type="button"
            className="min-h-0 flex-1 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="flex h-full w-[min(18rem,88vw)] flex-col border-l border-zinc-200 bg-white shadow-xl">
            <div className="border-b border-zinc-100 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
              <p className="text-[16px] font-bold text-zinc-900">Buy &amp; sell</p>
              <p className="mt-0.5 text-[12px] text-zinc-500">Peer listings &amp; Stripe checkout</p>
            </div>
            <nav className="flex flex-col gap-0.5 p-2">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-zinc-900 active:bg-zinc-100"
                onClick={() => {
                  setMenuOpen(false)
                  void loadBrowse()
                }}
              >
                <ShellMenuRefreshIcon className="h-[1.35rem] w-[1.35rem] shrink-0 text-zinc-500" />
                <span className="min-w-0">Refresh feed</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-zinc-900 active:bg-zinc-100"
                onClick={() => menuNavigate('create')}
              >
                <ShellMenuCreateIcon className="h-[1.35rem] w-[1.35rem] shrink-0 text-zinc-500" />
                <span className="min-w-0">List something</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-zinc-900 active:bg-zinc-100"
                onClick={() => menuNavigate('myListings')}
              >
                <ShellMenuListingsIcon className="h-[1.35rem] w-[1.35rem] shrink-0 text-zinc-500" />
                <span className="min-w-0">Your listings</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-zinc-900 active:bg-zinc-100"
                onClick={() => menuNavigate('connect')}
              >
                <ShellMenuPayoutIcon className="h-[1.35rem] w-[1.35rem] shrink-0 text-zinc-500" />
                <span className="min-w-0">Seller — Stripe Connect</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-zinc-900 active:bg-zinc-100"
                onClick={() => menuNavigate('earnings')}
              >
                <ShellMenuEarningsIcon className="h-[1.35rem] w-[1.35rem] shrink-0 text-zinc-500" />
                <span className="min-w-0">Seller earnings</span>
              </button>
            </nav>
            <div className="mt-auto border-t border-zinc-100 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[15px] font-semibold text-zinc-600 active:bg-zinc-100"
                onClick={() => setMenuOpen(false)}
              >
                <ShellMenuCloseIcon className="h-[1.2rem] w-[1.2rem] shrink-0 text-zinc-400" />
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {locationEditorOpen ? (
        <div className="fixed inset-0 z-[76] flex flex-col justify-end bg-black/40" role="dialog" aria-modal>
          <button
            type="button"
            className="min-h-0 flex-1"
            aria-label="Dismiss"
            onClick={() => setLocationEditorOpen(false)}
          />
          <div className="rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
            <p className="text-[14px] font-bold text-zinc-900">Set your location</p>
            <p className="mt-1 text-[12px] text-zinc-500">Used to sort nearby picks (demo — stored on this device).</p>
            <input
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px]"
              placeholder="City, region"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-zinc-200 py-3 text-[15px] font-semibold"
                onClick={() => setLocationEditorOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-zinc-900 py-3 text-[15px] font-semibold text-white"
                onClick={saveLocation}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {searchOverlayOpen ? (
        <div
          className="fixed inset-0 z-[76] flex flex-col bg-zinc-900/35 backdrop-blur-[2px]"
          role="dialog"
          aria-modal
          aria-label="Search marketplace"
        >
          <button
            type="button"
            className="min-h-0 flex-1"
            aria-label="Close search"
            onClick={() => setSearchOverlayOpen(false)}
          />
          <div className="shrink-0 rounded-t-2xl border-t border-zinc-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] sm:px-4">
            <div className="mx-auto flex w-full max-w-lg items-center gap-2 rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5">
              <SearchIcon className="shrink-0 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search marketplace"
                className="min-w-0 flex-1 bg-transparent text-[16px] text-zinc-900 outline-none placeholder:text-zinc-400"
                autoComplete="off"
                enterKeyHint="search"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setSearchOverlayOpen(false)}
                className="shrink-0 rounded-lg px-2 py-1.5 text-[15px] font-semibold text-[#1877f2] active:opacity-80"
              >
                Done
              </button>
            </div>
            <p className="mx-auto mt-2 max-w-lg text-center text-[11px] text-zinc-500">
              Results update as you type
            </p>
          </div>
        </div>
      ) : null}

      {categoriesOverlayOpen ? (
        <div
          className="fixed inset-0 z-[76] flex flex-col bg-zinc-900/35 backdrop-blur-[2px]"
          role="dialog"
          aria-modal
          aria-label="Categories and browse area"
        >
          <button
            type="button"
            className="min-h-0 flex-1"
            aria-label="Close categories"
            onClick={() => setCategoriesOverlayOpen(false)}
          />
          <div className="max-h-[min(78dvh,28rem)] shrink-0 overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] sm:px-4">
            <div className="mx-auto w-full max-w-lg">
              <p className="text-[15px] font-bold text-zinc-900">Categories</p>
              <p className="mt-0.5 text-[12px] text-zinc-500">Browse area and listing type</p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Browse</p>
              <div className="mt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    persistScope('local')
                    setCategoriesOverlayOpen(false)
                  }}
                  className={[
                    'w-full rounded-xl border px-3 py-2.5 text-left text-[14px] font-semibold transition-colors',
                    marketScope === 'local'
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-900 active:bg-zinc-100',
                  ].join(' ')}
                >
                  Near you
                  <span className="mt-0.5 block text-[12px] font-normal opacity-80">
                    Fetch delivery listings that match your set location
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    persistScope('global')
                    setCategoriesOverlayOpen(false)
                  }}
                  className={[
                    'w-full rounded-xl border px-3 py-2.5 text-left text-[14px] font-semibold transition-colors',
                    marketScope === 'global'
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-900 active:bg-zinc-100',
                  ].join(' ')}
                >
                  Australia wide
                  <span className="mt-0.5 block text-[12px] font-normal opacity-80">
                    All published listings across Australia
                  </span>
                </button>
              </div>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Category</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORY_CHIPS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(c.id)
                      setForYouActive(c.id === 'all')
                      setCategoriesOverlayOpen(false)
                    }}
                    className={[
                      'rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors',
                      categoryId === c.id
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 active:bg-zinc-50',
                    ].join(' ')}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCategoriesOverlayOpen(false)}
                className="mt-4 w-full rounded-xl border border-zinc-200 py-3 text-[15px] font-semibold text-zinc-900 active:bg-zinc-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        {panel === 'feed' ? (
          <>
            {feedChrome}

            {!sessionEmail ? (
              <p className="mx-3 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900 sm:mx-4">
                Open Profile and sign in with email so the server can attach listings and payouts to you.
              </p>
            ) : null}

            <div className="mx-auto w-full min-w-0 max-w-lg flex-1 px-3 pb-4 pt-2 sm:px-4">
              {listErr ? <p className="text-[13px] font-medium text-red-600">{listErr}</p> : null}

              <div className="mt-2 mb-3">{marketplaceScopePillsRow}</div>

              {todaysPicks.length > 0 ? (
                <section className="mt-0" aria-labelledby="buysell-todays-picks">
                  <div className="flex items-end justify-between gap-2">
                    <h2 id="buysell-todays-picks" className="text-[16px] font-bold tracking-tight text-zinc-900">
                      Today&apos;s picks
                    </h2>
                    <span className="text-[12px] font-semibold text-zinc-400">
                      {marketScope === 'global' ? 'Australia wide' : locationLabel.split(',')[0]}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {todaysPicks.map((l) => (
                      <button
                        key={`pick-${l.id}`}
                        type="button"
                        aria-label={`${l.title}, ${formatAudFromCents(l.priceCents ?? 0)}`}
                        onClick={() => setSelected(l)}
                        className="w-[7.5rem] shrink-0 overflow-hidden rounded-xl border border-zinc-200/90 bg-white text-left shadow-sm active:bg-zinc-50"
                      >
                        <div className="aspect-square w-full bg-zinc-100">
                          {l.images?.[0]?.url ? (
                            <img
                              src={listingImageAbsoluteUrl(l.images[0].url)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="flex min-w-0 items-center gap-1 border-t border-zinc-100 px-1.5 py-1">
                          <span className="shrink-0 text-[11px] font-bold tabular-nums text-zinc-900">
                            {formatAudFromCents(l.priceCents ?? 0)}
                          </span>
                          <p className="ml-auto min-w-0 max-w-[4.25rem] truncate text-right text-[11px] font-semibold leading-tight text-zinc-900">
                            {l.title}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="mt-5" aria-label="Listings">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[16px] font-bold tracking-tight text-zinc-900">
                    {categoryId === 'all' ? 'Browse' : CATEGORY_CHIPS.find((c) => c.id === categoryId)?.label ?? 'Browse'}
                  </h2>
                  <button
                    type="button"
                    className="text-[13px] font-semibold text-[#1877f2] disabled:opacity-40"
                    disabled={busy}
                    onClick={() => void loadBrowse()}
                  >
                    Refresh
                  </button>
                </div>
                {busy && feedListings.length === 0 ? (
                  <p className="py-8 text-center text-[14px] text-zinc-500">Loading…</p>
                ) : feedListings.length === 0 ? (
                  <p className="py-8 text-center text-[14px] text-zinc-500">
                    {debouncedSearch
                      ? 'Nothing matches your search.'
                      : marketScope === 'local' && listings.length > 0
                        ? 'No Fetch delivery listings match your area. Open Categories for Australia wide or update Set location.'
                        : 'No published listings yet.'}
                  </p>
                ) : (
                  <ul className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:gap-3">
                    {feedListings.map((l) => (
                      <li key={l.id} className="min-w-0">
                        {listingGridCard(l)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}

        {panel === 'create' || isEditMode ? (
          <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col bg-gradient-to-b from-violet-100/80 via-white to-zinc-100">
            <header className="shrink-0 border-b border-violet-200/60 bg-white/90 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] backdrop-blur-sm sm:px-4">
              <div className="mx-auto flex min-w-0 max-w-lg items-center gap-2">
                <button
                  type="button"
                  className="rounded-full px-2 py-2 text-[15px] font-semibold text-[#1877f2]"
                  onClick={() => {
                    if (isEditMode) {
                      setEditingListing(null)
                      hydratedEditIdRef.current = null
                      setPanel('myListings')
                    } else {
                      setPanel('feed')
                    }
                  }}
                >
                  {isEditMode ? 'Back' : 'Cancel'}
                </button>
                <h1 className="min-w-0 flex-1 text-center text-[16px] font-bold text-zinc-900">
                  {isEditMode ? 'Edit listing' : 'List an item'}
                </h1>
                <div className="w-14 shrink-0" aria-hidden />
              </div>
            </header>
            <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-lg flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-10 pt-4 [-webkit-overflow-scrolling:touch]">
              {(() => {
                const me = getMyDropProfile()
                if (!me) {
                  return (
                    <div className="rounded-2xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-950">
                      <span className="font-semibold">Profile required.</span> Open the Drops tab → menu → Your profile to
                      create your public @handle. Marketplace listings always show under that identity.
                    </div>
                  )
                }
                return (
                  <div className="rounded-2xl border border-violet-200/80 bg-violet-50/90 px-3 py-2.5 text-[12px] text-violet-950">
                    <span className="font-semibold text-violet-800">Public seller:</span>{' '}
                    <span className="font-bold">{formatDropHandle(me.displayName)}</span>
                  </div>
                )
              })()}
              {!isEditMode ? (
                <div className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-4 text-white shadow-lg shadow-violet-900/20">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">Your drop</p>
                  <p className="mt-1 text-[1.35rem] font-extrabold leading-tight tracking-tight">Photos first, AI fills the rest</p>
                  <p className="mt-2 max-w-[20rem] text-[13px] leading-snug text-white/90">
                    Add pictures — Fetch scans them and drafts title, description, category, condition, measurements, keywords,
                    and a fair AUD price. Edit anything before you publish.
                  </p>
                </div>
              ) : (
                <p className="text-[13px] leading-snug text-zinc-600">
                  Update text, price, and options. Photos stay as published — add new shots from a fresh listing if needed.
                </p>
              )}

              <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Photos</p>
                {isEditMode && editingListing ? (
                  <>
                    <p className="mt-0.5 text-[13px] text-zinc-600">Current listing images (read-only).</p>
                    <div className="mt-3 grid min-w-0 grid-cols-[repeat(3,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
                      {editingListing.images?.length ? (
                        [...editingListing.images]
                          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
                          .map((im) => (
                            <div
                              key={im.url}
                              className="aspect-square min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
                            >
                              <img
                                src={listingImageAbsoluteUrl(im.url)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))
                      ) : (
                        <p className="col-span-full text-[13px] text-zinc-500">No images on this listing.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-0.5 text-[13px] text-zinc-600">
                      Upload up to {MAX_LISTING_PHOTOS} images (JPEG, PNG, WebP). Cover = first tile. AI runs automatically
                      when title and description are empty, or tap the button to re-scan and overwrite fields.
                    </p>
                    <div className="mt-3 grid min-w-0 grid-cols-[repeat(3,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
                      {photoPreviewUrls.map((url, i) => (
                        <div
                          key={url}
                          className="relative aspect-square min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-[12px] font-bold text-white"
                            aria-label="Remove photo"
                            onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {photos.length < MAX_LISTING_PHOTOS ? (
                        <label className="flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 text-center transition-colors active:bg-violet-100/80">
                          <span className="text-[1.5rem] font-light leading-none text-violet-500">+</span>
                          <span className="mt-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                            Add
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            className="sr-only"
                            onChange={(e) => {
                              const next = Array.from(e.target.files ?? []).slice(0, MAX_LISTING_PHOTOS - photos.length)
                              if (next.length) setPhotos((prev) => [...prev, ...next].slice(0, MAX_LISTING_PHOTOS))
                              e.target.value = ''
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                    {photos.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {aiFillErr ? (
                          <p className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[12px] font-medium text-amber-900">
                            {aiFillErr}
                          </p>
                        ) : null}
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <button
                            type="button"
                            disabled={busy || aiFillBusy}
                            onClick={() => void runAiFillFromPhotos('replace-all')}
                            className="rounded-xl bg-violet-600 px-4 py-2.5 text-[14px] font-bold text-white shadow-sm shadow-violet-900/20 transition active:scale-[0.99] disabled:opacity-45"
                          >
                            {aiFillBusy ? 'Scanning photos…' : 'Scan photos & fill listing'}
                          </button>
                          <p className="text-[12px] leading-snug text-zinc-600 sm:max-w-[14rem]">
                            Overwrites title, description, price, measurements, category, and more from your current photos.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </section>

              <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Title &amp; description</p>
                <p className="mt-0.5 text-[13px] text-zinc-600">
                  {isEditMode
                    ? 'Edit how the item reads in search and on the detail sheet.'
                    : 'AI drafts these from your photos — add dimensions, defects, or what’s included before publishing.'}
                </p>
                <label className="mt-3 block">
                  <span className="text-[12px] font-semibold text-zinc-700">Title</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[15px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                    placeholder="e.g. Herman Miller Aeron — size B, graphite"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="text-[12px] font-semibold text-zinc-700">Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={5}
                    className="mt-1 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[15px] leading-relaxed outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                    placeholder="Condition, inclusions (cables, box), why you’re selling…"
                  />
                </label>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Measurements</p>
                <p className="mt-0.5 text-[12px] text-zinc-600">
                  Optional W×H×D in centimetres. AI fills these when it can read a label or scale; edit or leave blank.
                </p>
                <div className="mt-2 grid min-w-0 grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
                  <label className="block min-w-0">
                    <span className="text-[11px] font-semibold text-zinc-600">Width (cm)</span>
                    <input
                      value={measurementWidthCm}
                      onChange={(e) => setMeasurementWidthCm(e.target.value)}
                      inputMode="decimal"
                      className="mt-0.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-2.5 py-2 text-[14px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                      placeholder="—"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-[11px] font-semibold text-zinc-600">Height (cm)</span>
                    <input
                      value={measurementHeightCm}
                      onChange={(e) => setMeasurementHeightCm(e.target.value)}
                      inputMode="decimal"
                      className="mt-0.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-2.5 py-2 text-[14px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                      placeholder="—"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-[11px] font-semibold text-zinc-600">Depth (cm)</span>
                    <input
                      value={measurementDepthCm}
                      onChange={(e) => setMeasurementDepthCm(e.target.value)}
                      inputMode="decimal"
                      className="mt-0.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-2.5 py-2 text-[14px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                      placeholder="—"
                    />
                  </label>
                </div>
                <label className="mt-2 block">
                  <span className="text-[12px] font-semibold text-zinc-700">Measurement note</span>
                  <input
                    value={measurementsSummary}
                    onChange={(e) => setMeasurementsSummary(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[14px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                    placeholder="e.g. Approx. sizes from photo — confirm with tape measure"
                  />
                </label>
              </section>

              <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Price &amp; compare</p>
                <p className="mt-0.5 text-[13px] text-zinc-600">
                  Your <span className="font-semibold text-zinc-800">listing price</span> is what buyers pay. Optional{' '}
                  <span className="font-semibold text-zinc-800">compare-at</span> shows a crossed-out “was” price (e.g. RRP)
                  when it’s higher than your price.
                </p>
                <div className="mt-3 grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
                  <label className="block min-w-0">
                    <span className="text-[12px] font-semibold text-zinc-700">Your price (AUD)</span>
                    <input
                      value={priceAud}
                      onChange={(e) => setPriceAud(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[15px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                      placeholder="AI suggests from photos"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-[12px] font-semibold text-zinc-700">Compare at (optional)</span>
                    <input
                      value={compareAtAud}
                      onChange={(e) => setCompareAtAud(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[15px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                      placeholder="Retail / was"
                    />
                  </label>
                </div>
                {pricingPreview ? (
                  <p className="mt-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-[12px] font-semibold text-emerald-950">
                    Buyers see:{' '}
                    <span className="tabular-nums line-through decoration-emerald-700/50">
                      {formatAudFromCents(Math.round(pricingPreview.comp * 100))}
                    </span>{' '}
                    <span className="tabular-nums text-emerald-900">
                      {formatAudFromCents(Math.round(pricingPreview.sale * 100))}
                    </span>
                    <span className="ml-1 font-bold text-emerald-800">({pricingPreview.pct}% off)</span>
                  </p>
                ) : null}
                <label className="mt-3 block">
                  <span className="text-[12px] font-semibold text-zinc-700">SKU (optional)</span>
                  <input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 font-mono text-[14px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                    placeholder="SKU-1024"
                  />
                </label>
              </section>

              <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Category &amp; condition</p>
                <div className="mt-3 grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
                  <label className="block min-w-0">
                    <span className="text-[12px] font-semibold text-zinc-700">Category</span>
                    <select
                      value={createCategory}
                      onChange={(e) => setCreateCategory(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[14px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                    >
                      {LIST_FORM_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <span className="text-[12px] font-semibold text-zinc-700">Condition</span>
                    <select
                      value={createCondition}
                      onChange={(e) => setCreateCondition(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[14px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                    >
                      {CONDITION_OPTIONS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Search &amp; place</p>
                <label className="mt-3 block">
                  <span className="text-[12px] font-semibold text-zinc-700">Keywords</span>
                  <textarea
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    rows={2}
                    className="mt-1 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[14px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                    placeholder="vintage, mid-century, oak, desk…"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">Matched when buyers search the marketplace.</p>
                </label>
                <label className="mt-3 block">
                  <span className="text-[12px] font-semibold text-zinc-700">Location tag</span>
                  <input
                    value={listingLocationDraft}
                    onChange={(e) => setListingLocationDraft(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[15px] outline-none ring-violet-500/30 focus:border-violet-400 focus:ring-2"
                    placeholder="Suburb, city"
                  />
                </label>
              </section>

              <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Buyer options</p>
                <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-3">
                  <div>
                    <p className="text-[14px] font-semibold text-zinc-900">Accept offers</p>
                    <p className="text-[11px] text-zinc-500">Signal that price can be negotiated.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={acceptsOffers}
                    onChange={(e) => setAcceptsOffers(e.target.checked)}
                    className="h-5 w-5 accent-violet-600"
                  />
                </label>
                <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-3">
                  <div>
                    <p className="text-[14px] font-semibold text-zinc-900">Fetch delivery</p>
                    <p className="text-[11px] text-zinc-500">Show the Fetch delivery badge on your listing.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={fetchDelivery}
                    onChange={(e) => setFetchDelivery(e.target.checked)}
                    className="h-5 w-5 accent-violet-600"
                  />
                </label>
              </section>

              {createErr ? <p className="text-[13px] font-medium text-red-600">{createErr}</p> : null}
              <button
                type="button"
                disabled={busy}
                className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-[16px] font-bold text-white shadow-lg shadow-violet-900/25 transition active:scale-[0.99] disabled:opacity-50"
                onClick={() => void (isEditMode ? handleSaveEdit() : handleCreate())}
              >
                {busy ? (isEditMode ? 'Saving…' : 'Publishing…') : isEditMode ? 'Save changes' : 'Publish to marketplace'}
              </button>
            </div>
          </div>
        ) : null}

        {panel === 'myListings' ? (
          <div className="flex min-h-0 flex-1 flex-col bg-zinc-50">
            <header className="shrink-0 border-b border-zinc-200/80 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-4">
              <div className="mx-auto flex max-w-lg items-center gap-2">
                <button
                  type="button"
                  className="rounded-full px-2 py-2 text-[15px] font-semibold text-[#1877f2]"
                  onClick={() => setPanel('feed')}
                >
                  Back
                </button>
                <h1 className="min-w-0 flex-1 text-center text-[16px] font-bold text-zinc-900">Your listings</h1>
                <div className="w-14 shrink-0" aria-hidden />
              </div>
            </header>
            <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 overflow-y-auto px-4 pb-8 pt-4">
              {myListErr ? <p className="text-[13px] font-medium text-red-600">{myListErr}</p> : null}
              {!sessionEmail ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                  Sign in from Profile to manage your listings.
                </p>
              ) : busy && myListings.length === 0 ? (
                <p className="py-8 text-center text-[14px] text-zinc-500">Loading…</p>
              ) : myListings.length === 0 ? (
                <p className="py-8 text-center text-[14px] text-zinc-500">You have no listings yet. Sell something from the feed.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {myListings.map((l) => (
                    <li
                      key={l.id}
                      className="flex gap-3 rounded-2xl border border-zinc-200/90 bg-white p-3 shadow-sm"
                    >
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                        {l.images?.[0]?.url ? (
                          <img
                            src={listingImageAbsoluteUrl(l.images[0].url)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">No photo</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[14px] font-bold text-zinc-900">{l.title}</p>
                        <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-zinc-700">
                          {formatAudFromCents(l.priceCents ?? 0)}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium capitalize text-zinc-500">{l.status}</p>
                        <button
                          type="button"
                          className="mt-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-bold text-white"
                          onClick={() => {
                            setEditingListing(l)
                            setPanel('editListing')
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white py-3 text-[14px] font-semibold text-zinc-800"
                disabled={busy || !sessionEmail}
                onClick={() => void loadMyListings()}
              >
                Refresh
              </button>
            </div>
          </div>
        ) : null}

        {panel === 'connect' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-zinc-200/80 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-4">
              <div className="mx-auto flex max-w-lg items-center gap-2">
                <button
                  type="button"
                  className="rounded-full px-2 py-2 text-[15px] font-semibold text-[#1877f2]"
                  onClick={() => setPanel('feed')}
                >
                  Back
                </button>
                <h1 className="min-w-0 flex-1 text-center text-[16px] font-bold text-zinc-900">Stripe Connect</h1>
                <div className="w-14 shrink-0" aria-hidden />
              </div>
            </header>
            <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pb-8 pt-4">
              <p className="text-[13px] leading-snug text-zinc-600">
                Starts Stripe Express onboarding in a new tab. Set{' '}
                <span className="font-mono text-[11px]">STRIPE_CONNECT_RETURN_URL</span> /{' '}
                <span className="font-mono text-[11px]">STRIPE_CONNECT_REFRESH_URL</span> on the server for production.
              </p>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-violet-600 py-3 text-[15px] font-semibold text-white"
                onClick={() => void openConnect()}
              >
                Open Connect onboarding
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-zinc-200 bg-white py-3 text-[15px] font-semibold"
                onClick={() => void refreshConnect()}
              >
                Refresh status
              </button>
              {connectMsg ? <p className="text-[13px] text-zinc-700">{connectMsg}</p> : null}
              {import.meta.env.DEV ? (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3">
                  <p className="text-[11px] font-semibold uppercase text-zinc-500">Dev only</p>
                  <p className="mt-1 text-[12px] text-zinc-600">
                    Paste a test connected account id (requires server env{' '}
                    <span className="font-mono">FETCH_ALLOW_CONNECT_REGISTER_DEV=1</span> in production).
                  </p>
                  <input
                    value={devAcct}
                    onChange={(e) => setDevAcct(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-[12px]"
                    placeholder="acct_..."
                  />
                  <button
                    type="button"
                    className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-[12px] font-semibold text-white"
                    onClick={() => void devRegister()}
                  >
                    Save dev account
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {panel === 'earnings' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-zinc-200/80 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-4">
              <div className="mx-auto flex max-w-lg items-center gap-2">
                <button
                  type="button"
                  className="rounded-full px-2 py-2 text-[15px] font-semibold text-[#1877f2]"
                  onClick={() => setPanel('feed')}
                >
                  Back
                </button>
                <h1 className="min-w-0 flex-1 text-center text-[16px] font-bold text-zinc-900">Earnings</h1>
                <div className="w-14 shrink-0" aria-hidden />
              </div>
            </header>
            <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pb-8 pt-4">
              {earnErr ? <p className="text-[13px] text-red-600">{earnErr}</p> : null}
              {earnings ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-[12px] font-semibold text-zinc-500">Totals (ledger)</p>
                  <p className="mt-1 text-[15px] font-bold tabular-nums text-zinc-900">
                    Gross {formatAudFromCents(earnings.summary.grossCents)} · Fees{' '}
                    {formatAudFromCents(earnings.summary.feeCents)} · Net{' '}
                    {formatAudFromCents(earnings.summary.netCents)}
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                className="rounded-xl bg-zinc-900 py-3 text-[15px] font-semibold text-white"
                onClick={() => void loadEarnings()}
                disabled={busy}
              >
                Refresh earnings
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/40" role="dialog" aria-modal>
          <button
            type="button"
            className="min-h-0 flex-1"
            aria-label="Close"
            onClick={() => {
              setSelected(null)
              setStripeBuy(null)
              setBuyErr(null)
            }}
          />
          <div className="max-h-[min(92dvh,36rem)] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
            {selected.images && selected.images.length > 0 ? (
              <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[...selected.images]
                  .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
                  .map((im) => (
                    <img
                      key={im.url}
                      src={listingImageAbsoluteUrl(im.url)}
                      alt=""
                      className="h-44 w-44 shrink-0 rounded-2xl border border-zinc-200/80 object-cover shadow-sm"
                    />
                  ))}
              </div>
            ) : (
              <div className="mb-3 flex h-36 items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-[12px] font-medium text-zinc-400">
                No photos
              </div>
            )}
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Listing</p>
            <h2 className="mt-1 text-[1.15rem] font-bold text-zinc-900">{selected.title}</h2>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {listingCompareAtCents(selected) > 0 &&
              (selected.priceCents ?? 0) > 0 &&
              listingCompareAtCents(selected) > (selected.priceCents ?? 0) ? (
                <span className="text-[16px] font-bold tabular-nums text-zinc-400 line-through decoration-zinc-300">
                  {formatAudFromCents(listingCompareAtCents(selected))}
                </span>
              ) : null}
              <p className="text-[20px] font-extrabold tabular-nums text-zinc-900">
                {formatAudFromCents(selected.priceCents)}
              </p>
              {listingSavingsPercent(selected) != null ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[12px] font-extrabold text-emerald-900">
                  Save {listingSavingsPercent(selected)}%
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-zinc-800">
                {selected.condition || 'used'}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-zinc-800">
                {selected.category || 'general'}
              </span>
              {selected.locationLabel?.trim() ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-900">
                  <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                  {selected.locationLabel.trim()}
                </span>
              ) : null}
              {selected.sku?.trim() ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-950">
                  SKU {selected.sku.trim()}
                </span>
              ) : null}
              {selected.acceptsOffers ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900">Offers welcome</span>
              ) : null}
              {selected.fetchDelivery ? (
                <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white">Fetch delivery</span>
              ) : null}
            </div>
            {selected.profileAuthorId?.trim() ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-white text-lg leading-none">
                  {(() => {
                    const av = selected.profileAvatar?.trim()
                    if (av && /^https?:\/\//i.test(av)) {
                      return (
                        <img src={av} alt="" className="h-full w-full object-cover" />
                      )
                    }
                    return <span aria-hidden>{av && av.length <= 8 ? av : '🏪'}</span>
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Seller</p>
                  <p className="truncate text-[14px] font-semibold text-zinc-900">
                    {listingPublicSellerLine(selected) ?? '@seller'}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-[12px] font-bold text-white active:bg-zinc-800"
                  onClick={() => openSellerPublicProfile(selected)}
                >
                  View profile
                </button>
              </div>
            ) : null}
            {selected.keywords?.trim() ? (
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                <span className="font-semibold text-zinc-600">Search terms: </span>
                {selected.keywords.trim()}
              </p>
            ) : null}
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-snug text-zinc-600">{selected.description}</p>
            {(() => {
              const sellerEm = selected.sellerEmail?.trim().toLowerCase() ?? ''
              const viewerEm = sessionEmail.trim().toLowerCase()
              const isViewerSeller = Boolean(sellerEm && viewerEm && sellerEm === viewerEm)
              return sessionEmail && onOpenListingChat && !isViewerSeller ? (
                <button
                  type="button"
                  disabled={busy}
                  className="mt-3 w-full rounded-xl border border-zinc-300 bg-white py-3 text-[15px] font-semibold text-zinc-900 shadow-sm active:bg-zinc-50 disabled:opacity-50"
                  onClick={() => void onOpenListingChat(selected.id)}
                >
                  Message seller
                </button>
              ) : null
            })()}
            {buyErr ? <p className="mt-2 text-[12px] text-red-600">{buyErr}</p> : null}
            {stripeBuy && import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ? (
              <div className="mt-4 rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                <FetchStripePaymentElement
                  publishableKey={import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()}
                  clientSecret={stripeBuy.clientSecret}
                  submitLabel={busy ? '…' : 'Pay'}
                  disabled={busy}
                  errorText={buyErr}
                  onError={(m) => setBuyErr(m)}
                  onSuccess={() => {
                    void (async () => {
                      setBusy(true)
                      try {
                        await waitForPaymentIntentServerConfirmed(stripeBuy.paymentIntentId)
                        setSelected(null)
                        setStripeBuy(null)
                        void loadBrowse()
                      } catch (e) {
                        setBuyErr(e instanceof Error ? e.message : 'Confirm failed')
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="mt-4 w-full rounded-xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                onClick={() => void startBuy(selected)}
              >
                {busy ? '…' : 'Buy now'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {mapsApiKey ? (
        <LocationRadiusPickerSheet
          apiKey={mapsApiKey}
          open={mapAreaPickerOpen}
          onClose={() => setMapAreaPickerOpen(false)}
          initialCenter={buysellMapArea?.center ?? BRISBANE_CENTER}
          initialRadiusKm={buysellMapArea?.radiusKm ?? 30}
          onConfirm={onBuysellMapAreaConfirm}
        />
      ) : null}

      {bottomNav ? (
        <div className="fetch-home-marketplace-shell-footer shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
          {bottomNav}
        </div>
      ) : null}
    </div>
  )
}

export const HomeShellBuySellPage = memo(HomeShellBuySellPageInner)
