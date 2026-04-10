import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { marketplaceActorHeaders } from '../../lib/booking/marketplaceApiAuth'
import { BOOST_TIER_COPY, setBoostTierForReel } from '../../lib/drops/boostStore'
import { DROP_CATEGORY_LABELS, DROP_REGION_LABELS } from '../../lib/drops/constants'
import { dropsPublishApiErrorMessage } from '../../lib/drops/dropsDeployErrors'
import { UploadDropMediaError } from '../../lib/drops/uploadDropMedia'
import { uploadDropsMediaForPublish } from '../../lib/drops/uploadDropsMediaForPublish'
import { getFetchApiBaseUrl } from '../../lib/fetchApiBase'
import { syncCustomerSessionCookie } from '../../lib/fetchServerSession'
import { getSupabaseBrowserClient } from '../../lib/supabase/client'
import { fetchMyListings, listingImageAbsoluteUrl, type PeerListing } from '../../lib/listingsApi'
import type {
  DropCategoryId,
  DropRegionCode,
  DropsCommerceSaleMode,
  DropsCommerceTarget,
} from '../../lib/drops/types'

type WizardStep = 'library' | 'preview' | 'edit' | 'details' | 'boost' | 'commerce' | 'review'

export type DropsLocalPublishPayload = {
  videoFile: File | null
  imageFiles: File[]
  title: string
  priceLabel: string
  blurb: string
  category: DropCategoryId
  region: DropRegionCode
  commerce?: DropsCommerceTarget
  commerceSaleMode?: DropsCommerceSaleMode
  boostTier: 0 | 1 | 2 | 3
}

export type DropsPublishActivityEvent =
  | { type: 'idle' }
  | { type: 'progress'; step: 'upload' | 'publish'; hasVideo: boolean; mediaLabel: string }
  | { type: 'error'; message: string }

type Props = {
  open: boolean
  onClose: () => void
  onPublished: (serverId?: string, publicDrop?: Record<string, unknown> | null) => void
  authorId: string
  sellerDisplay: string
  tryServerPublish: boolean
  onLocalPublish?: (payload: DropsLocalPublishPayload) => Promise<void>
  onPublishActivity?: (event: DropsPublishActivityEvent) => void
  /** When set while opening, seeds the wizard with this clip (e.g. in-app camera). */
  initialVideoFile?: File | null
  onInitialVideoConsumed?: () => void
}

function parseTags(s: string): string[] {
  return s
    .split(/[,#\s]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 24)
}

function formatAudFromCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer != null) window.clearTimeout(timer)
  }
}

const primaryBtn =
  'min-h-[3rem] w-full rounded-full bg-emerald-800 py-3.5 text-center text-[14px] font-bold uppercase tracking-[0.06em] text-white shadow-[0_1px_0_#065f46,0_4px_14px_rgba(6,95,70,0.35)] transition-transform hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-45'
const secondaryBtn =
  'min-h-[3rem] w-full rounded-full border-2 border-emerald-800 bg-white py-3.5 text-center text-[14px] font-bold uppercase tracking-[0.06em] text-emerald-900 transition-transform hover:bg-emerald-50 active:scale-[0.99] disabled:opacity-45'
const fieldLabel = 'block text-[11px] font-bold uppercase tracking-wide text-emerald-900/70'
const fieldInput =
  'mt-1 w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-[15px] text-zinc-900 shadow-sm outline-none ring-emerald-800/20 placeholder:text-zinc-400 focus:border-emerald-700 focus:ring-2'

export function DropsPostWizard({
  open,
  onClose,
  onPublished,
  authorId,
  sellerDisplay,
  tryServerPublish,
  onLocalPublish,
  onPublishActivity,
  initialVideoFile = null,
  onInitialVideoConsumed,
}: Props) {
  const [step, setStep] = useState<WizardStep>('library')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ffmpegBusy, setFfmpegBusy] = useState(false)

  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const libraryInputRef = useRef<HTMLInputElement>(null)

  const [videoDuration, setVideoDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [volumePct, setVolumePct] = useState(100)
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)

  const [title, setTitle] = useState('')
  const [priceLabel, setPriceLabel] = useState('')
  const [caption, setCaption] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [category, setCategory] = useState<DropCategoryId>('community')
  const [region, setRegion] = useState<DropRegionCode>('SEQ')
  const [locationLabel, setLocationLabel] = useState('')

  const [boostTier, setBoostTier] = useState<0 | 1 | 2 | 3>(0)

  const [commerceKind, setCommerceKind] = useState<'none' | 'marketplace' | 'listing'>('none')
  const [commerceProductId, setCommerceProductId] = useState('')
  const [myListings, setMyListings] = useState<PeerListing[]>([])
  const [listingsLoading, setListingsLoading] = useState(false)
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([])
  const [listingPreview, setListingPreview] = useState<PeerListing | null>(null)
  const [listingSaleAuction, setListingSaleAuction] = useState(false)

  const tags = useMemo(() => parseTags(tagInput), [tagInput])

  const isCarousel = imageFiles.length > 0
  const stepFlow = useMemo((): WizardStep[] => {
    if (isCarousel) {
      return ['library', 'preview', 'details', 'boost', 'commerce', 'review']
    }
    return ['library', 'preview', 'edit', 'details', 'boost', 'commerce', 'review']
  }, [isCarousel])

  const stepIndex = stepFlow.indexOf(step)
  const mediaPreviewUrl = useMemo(() => {
    if (videoFile) return URL.createObjectURL(videoFile)
    return null
  }, [videoFile])

  const imagePreviewUrls = useMemo(
    () => imageFiles.map((f) => URL.createObjectURL(f)),
    [imageFiles],
  )

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    }
  }, [mediaPreviewUrl])

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [imagePreviewUrls])

  useEffect(() => {
    if (!open || !initialVideoFile) return
    setErr(null)
    setVideoFile(initialVideoFile)
    setImageFiles([])
    setVideoDuration(0)
    setTrimStart(0)
    setTrimEnd(0)
    setStep('preview')
    queueMicrotask(() => onInitialVideoConsumed?.())
  }, [open, initialVideoFile, onInitialVideoConsumed])

  useEffect(() => {
    if (!open || step !== 'commerce' || commerceKind !== 'listing') return
    let cancelled = false
    void (async () => {
      setListingsLoading(true)
      try {
        await syncCustomerSessionCookie()
        const rows = await fetchMyListings()
        if (!cancelled) setMyListings(rows.filter((l) => l.status === 'published'))
      } catch {
        if (!cancelled) setMyListings([])
      } finally {
        if (!cancelled) setListingsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, step, commerceKind])

  const commercePayload = useMemo((): DropsCommerceTarget | undefined => {
    if (commerceKind === 'marketplace' && commerceProductId.trim()) {
      return { kind: 'marketplace_product', productId: commerceProductId.trim() }
    }
    if (commerceKind === 'listing' && selectedListingIds.length === 1) {
      return { kind: 'buy_sell_listing', listingId: selectedListingIds[0]! }
    }
    if (commerceKind === 'listing' && selectedListingIds.length > 1) {
      const items = selectedListingIds.map((id) => {
        const l = myListings.find((x) => x.id === id)
        return {
          kind: 'buy_sell_listing' as const,
          listingId: id,
          label: l?.title?.trim() || id,
        }
      })
      return { kind: 'live_showcase', items }
    }
    return undefined
  }, [commerceKind, commerceProductId, myListings, selectedListingIds])

  const commerceSaleMode: DropsCommerceSaleMode =
    commerceKind === 'listing' && listingSaleAuction ? 'auction' : 'buy_now'

  const reset = useCallback(() => {
    setStep('library')
    setErr(null)
    setVideoFile(null)
    setImageFiles([])
    setVideoDuration(0)
    setTrimStart(0)
    setTrimEnd(0)
    setVolumePct(100)
    setRotation(0)
    setTitle('')
    setPriceLabel('')
    setCaption('')
    setTagInput('')
    setCategory('community')
    setRegion('SEQ')
    setLocationLabel('')
    setBoostTier(0)
    setCommerceKind('none')
    setCommerceProductId('')
    setSelectedListingIds([])
    setListingPreview(null)
    setListingSaleAuction(false)
    setMyListings([])
  }, [])

  const onLibraryPick = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    e.target.value = ''
    if (!list?.length) return
    const files = Array.from(list)
    const vids = files.filter((f) => f.type.startsWith('video/'))
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (vids.length) {
      setImageFiles([])
      setVideoFile(vids[0]!)
      setVideoDuration(0)
      setTrimStart(0)
      setTrimEnd(0)
      return
    }
    if (imgs.length) {
      setVideoFile(null)
      setImageFiles((prev) => {
        const merged = [...prev, ...imgs].slice(0, 12)
        return merged
      })
    }
  }

  const removeImageAt = (i: number) => {
    setImageFiles((prev) => prev.filter((_, j) => j !== i))
  }

  const canAdvanceLibrary = Boolean(videoFile || imageFiles.length)

  const goNext = () => {
    const i = stepFlow.indexOf(step)
    if (i >= 0 && i < stepFlow.length - 1) setStep(stepFlow[i + 1]!)
  }

  const goBack = () => {
    const i = stepFlow.indexOf(step)
    if (i <= 0) {
      reset()
      onClose()
    } else setStep(stepFlow[i - 1]!)
  }

  const onVideoMeta = (d: number) => {
    setVideoDuration(d)
    setTrimEnd((e) => (e <= 0 || e > d ? d : e))
    setTrimStart((s) => (s > d ? 0 : s))
  }

  const applyServerFfmpeg = async () => {
    if (!videoFile) {
      setErr('Add a video first.')
      return
    }
    setErr(null)
    setFfmpegBusy(true)
    const duration = Math.max(videoDuration, 0.1)
    const start = Math.min(Math.max(0, trimStart), duration - 0.05)
    const end = Math.min(Math.max(start + 0.05, trimEnd), duration)
    const trimDurationSec = Math.max(0.1, end - start)
    try {
      const fd = new FormData()
      fd.append('file', videoFile)
      fd.append('mute', volumePct <= 0 ? '1' : '0')
      fd.append('rotation', String(rotation))
      fd.append('trimStartSec', String(start))
      fd.append('trimDurationSec', String(trimDurationSec))
      const headers: Record<string, string> = {}
      const sb = getSupabaseBrowserClient()
      const { data: { session } = { session: null } } = sb
        ? await sb.auth.getSession()
        : { data: { session: null } }
      headers.Authorization = `Bearer ${session?.access_token ?? ''}`

      const res = await fetch(`${getFetchApiBaseUrl()}/api/drops/process-video`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: fd,
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; videoUrl?: string }
      if (!res.ok) {
        setErr(
          payload.error === 'ffmpeg_not_available'
            ? 'Video processing is not available on this server yet.'
            : payload.error || 'Could not process video.',
        )
        return
      }
      const rel = typeof payload.videoUrl === 'string' ? payload.videoUrl : ''
      if (!rel) {
        setErr('No video returned.')
        return
      }
      const blob = await fetch(`${getFetchApiBaseUrl()}${rel}`, { credentials: 'include' }).then((r) =>
        r.blob(),
      )
      const next = new File([blob], 'edited-drop.mp4', { type: blob.type || 'video/mp4' })
      setVideoFile(next)
      setVideoDuration(0)
      setTrimStart(0)
      setTrimEnd(0)
    } catch {
      setErr('Network error while processing video.')
    } finally {
      setFfmpegBusy(false)
    }
  }

  const toggleListingSelect = (id: string) => {
    setSelectedListingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const publish = (): void => {
    if (busy) return
    setErr(null)
    if (!canAdvanceLibrary) {
      setErr('Choose a video or photos first.')
      return
    }
    setBusy(true)
    const blurb = [caption.trim(), tags.map((t) => `#${t}`).join(' '), locationLabel.trim()]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 400)
    const priceResolved =
      priceLabel.trim() ||
      title.match(/\$\s*[\d,.]+/)?.[0] ||
      (title.match(/\d+/)?.[0] ? `$${title.match(/\d+/)![0]}` : '') ||
      'Ask'

    const hasVideo = Boolean(videoFile)
    const mediaLabel = videoFile?.name ?? (imageFiles.length ? `${imageFiles.length} photos` : 'Media')

    if (!tryServerPublish) {
      const payload: DropsLocalPublishPayload = {
        videoFile,
        imageFiles: [...imageFiles],
        title: title.trim() || 'Your drop',
        priceLabel: priceResolved,
        blurb: blurb || `Just posted · ${DROP_CATEGORY_LABELS[category]}`,
        category,
        region,
        commerce: commercePayload,
        commerceSaleMode,
        boostTier,
      }
      onPublishActivity?.({ type: 'progress', step: 'upload', hasVideo, mediaLabel })
      setBusy(false)
      onClose()
      reset()
      void (async () => {
        try {
          await withTimeout(Promise.resolve(onLocalPublish?.(payload)), 30_000, 'Local publish')
          onPublishActivity?.({ type: 'idle' })
          onPublished(undefined, null)
        } catch (e) {
          onPublishActivity?.({
            type: 'error',
            message: e instanceof Error ? e.message : 'local_publish_failed',
          })
        } finally {
          setBusy(false)
        }
      })()
      return
    }

    const snapshot = {
      authorId,
      sellerDisplay,
      title: title.trim() || 'Your drop',
      priceLabel: priceResolved,
      blurb: blurb || 'New drop',
      category,
      region,
      commerce: commercePayload,
      commerceSaleMode,
      boostTier,
      video: videoFile,
      images: [...imageFiles],
      hasVideo,
      mediaLabel,
    }

    void (async () => {
      const sb = getSupabaseBrowserClient()
      try {
        const { data: { session } = { session: null } } = sb
          ? await withTimeout(sb.auth.getSession(), 10_000, 'Auth session lookup')
          : { data: { session: null } }
        if (!session?.access_token) {
          throw new Error('You must be logged in')
        }

        onPublishActivity?.({ type: 'progress', step: 'upload', hasVideo, mediaLabel: snapshot.mediaLabel })
        setBusy(false)
        onClose()
        reset()

        const uploadMs = snapshot.hasVideo ? 180_000 : 60_000
        const media = await withTimeout(
          uploadDropsMediaForPublish({
            video: snapshot.video,
            images: snapshot.images,
          }),
          uploadMs,
          'Upload',
        )
        if (!media.videoUrl && !(media.imageUrls?.length ?? 0)) {
          onPublishActivity?.({ type: 'error', message: 'Upload failed — no media URL returned.' })
          return
        }

        onPublishActivity?.({
          type: 'progress',
          step: 'publish',
          hasVideo: snapshot.hasVideo,
          mediaLabel: snapshot.mediaLabel,
        })

        const res = await withTimeout(
          fetch(`${getFetchApiBaseUrl()}/api/publish`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              ...marketplaceActorHeaders('customer'),
            },
            body: JSON.stringify({
              authorId: snapshot.authorId,
              sellerDisplay: snapshot.sellerDisplay,
              title: snapshot.title,
              priceLabel: snapshot.priceLabel,
              blurb: snapshot.blurb,
              categories: [snapshot.category],
              region: snapshot.region,
              commerce: snapshot.commerce,
              commerceSaleMode: snapshot.commerceSaleMode,
              growthVelocityScore: 1.55,
              ...(media.videoUrl ? { videoUrl: media.videoUrl } : { imageUrls: media.imageUrls ?? [] }),
            }),
          }),
          30_000,
          'Create drop',
        )
        const payload = (await res.json().catch(() => ({}))) as {
          id?: string
          drop?: Record<string, unknown> | null
          error?: string
        }
        if (!res.ok) {
          onPublishActivity?.({
            type: 'error',
            message: dropsPublishApiErrorMessage(payload.error, res.status),
          })
          return
        }
        const id = typeof payload.id === 'string' ? payload.id : null
        if (!id) {
          onPublishActivity?.({ type: 'error', message: 'Missing drop id' })
          return
        }

        if (snapshot.boostTier > 0) {
          setBoostTierForReel(id, snapshot.boostTier)
        }

        onPublishActivity?.({ type: 'idle' })
        onPublished(id, payload.drop ?? null)
      } catch (e) {
        if (e instanceof UploadDropMediaError) {
          onPublishActivity?.({ type: 'error', message: e.message })
        } else {
          onPublishActivity?.({
            type: 'error',
            message: e instanceof Error ? e.message : 'Publishing failed',
          })
        }
      } finally {
        setBusy(false)
      }
    })()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => {
          reset()
          onClose()
        }}
      />
      <div
        className="relative z-[1] flex max-h-[min(94dvh,44rem)] flex-col overflow-hidden rounded-t-[1.25rem] border border-emerald-900/12 bg-white text-zinc-900 shadow-[0_-12px_48px_rgba(6,95,70,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drops-wizard-title"
      >
        <div className="flex items-center justify-between border-b border-emerald-900/10 bg-emerald-950 px-4 py-3.5 text-white">
          <h2 id="drops-wizard-title" className="text-[17px] font-bold tracking-tight">
            Create a drop
          </h2>
          <span className="text-[11px] font-semibold text-white/70">
            {stepIndex + 1} / {stepFlow.length}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {err ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900">
              {err}
            </p>
          ) : null}

          {step === 'library' ? (
            <div className="space-y-4">
              <p className="text-[14px] font-medium leading-snug text-zinc-600">
                Pick from your library — one video or up to 12 photos for a carousel.
              </p>
              <input
                ref={libraryInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={onLibraryPick}
              />
              <button type="button" className={primaryBtn} onClick={() => libraryInputRef.current?.click()}>
                Open library
              </button>
              {videoFile ? (
                <div className="overflow-hidden rounded-2xl border border-emerald-900/12 bg-emerald-50/40 p-2">
                  <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-emerald-900/60">
                    Video
                  </p>
                  <div className="aspect-[9/16] max-h-[14rem] w-full overflow-hidden rounded-xl bg-black">
                    <video
                      src={mediaPreviewUrl ?? undefined}
                      className="h-full w-full object-contain"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  </div>
                  <p className="mt-2 truncate text-center text-[12px] font-medium text-zinc-600">{videoFile.name}</p>
                  <button
                    type="button"
                    className="mt-2 w-full text-[13px] font-semibold text-emerald-800 underline decoration-emerald-800/30"
                    onClick={() => {
                      setVideoFile(null)
                      setVideoDuration(0)
                    }}
                  >
                    Remove video
                  </button>
                </div>
              ) : null}
              {imageFiles.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-emerald-900/60">
                    Photos ({imageFiles.length})
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {imageFiles.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100 ring-2 ring-emerald-700/25"
                      >
                        <img
                          src={imagePreviewUrls[i]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-[15px] font-bold text-white shadow-md"
                          aria-label={`Remove photo ${i + 1}`}
                          onClick={() => removeImageAt(i)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {imageFiles.length < 12 ? (
                      <button
                        type="button"
                        className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-emerald-800/35 bg-emerald-50/50 text-[2rem] font-light text-emerald-800/50"
                        aria-label="Add more photos"
                        onClick={() => libraryInputRef.current?.click()}
                      >
                        +
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'preview' ? (
            <div className="space-y-4">
              <p className="text-[14px] font-medium text-zinc-600">Preview before you continue.</p>
              {videoFile && mediaPreviewUrl ? (
                <video
                  key={videoFile.name + videoFile.size}
                  src={mediaPreviewUrl}
                  controls
                  playsInline
                  className="max-h-[min(52dvh,22rem)] w-full rounded-2xl bg-black object-contain shadow-inner ring-1 ring-emerald-900/10"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration
                    if (Number.isFinite(d) && d > 0) onVideoMeta(d)
                  }}
                />
              ) : null}
              {imageFiles.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {imageFiles.map((f, i) => (
                    <div key={`pv-${f.name}-${i}`} className="aspect-square overflow-hidden rounded-xl bg-zinc-100">
                      <img src={imagePreviewUrls[i]} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'edit' && videoFile ? (
            <div className="space-y-4">
              <p className="text-[14px] font-medium text-zinc-600">
                Trim, rotation, and mute. Volume in the final file is on or off (server processing).
              </p>
              {mediaPreviewUrl ? (
                <video
                  src={mediaPreviewUrl}
                  controls
                  playsInline
                  className="max-h-[36dvh] w-full rounded-2xl bg-black object-contain"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration
                    if (Number.isFinite(d) && d > 0) onVideoMeta(d)
                  }}
                />
              ) : null}
              {videoDuration > 0 ? (
                <>
                  <div>
                    <label className={fieldLabel}>
                      Trim start ({trimStart.toFixed(1)}s)
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, videoDuration - 0.1)}
                        step={0.1}
                        value={trimStart}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setTrimStart(v)
                          setTrimEnd((te) => (te <= v ? Math.min(v + 0.5, videoDuration) : te))
                        }}
                        className="mt-2 w-full accent-emerald-800"
                      />
                    </label>
                  </div>
                  <div>
                    <label className={fieldLabel}>
                      Trim end ({trimEnd.toFixed(1)}s)
                      <input
                        type="range"
                        min={Math.min(videoDuration, trimStart + 0.1)}
                        max={videoDuration}
                        step={0.1}
                        value={trimEnd}
                        onChange={(e) => setTrimEnd(Number(e.target.value))}
                        className="mt-2 w-full accent-emerald-800"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <p className="text-[12px] text-zinc-500">Load duration by playing the preview above once.</p>
              )}
              <div>
                <label className={fieldLabel}>
                  Volume ({volumePct === 0 ? 'muted' : `${volumePct}%`})
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volumePct}
                    onChange={(e) => setVolumePct(Number(e.target.value))}
                    className="mt-2 w-full accent-emerald-800"
                  />
                </label>
              </div>
              <div>
                <p className={fieldLabel}>Rotation</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([0, 90, 180, 270] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRotation(r)}
                      className={[
                        'rounded-full px-4 py-2 text-[13px] font-bold transition-colors',
                        rotation === r
                          ? 'bg-emerald-800 text-white'
                          : 'border border-emerald-900/20 bg-white text-emerald-900',
                      ].join(' ')}
                    >
                      {r}°
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={ffmpegBusy || !videoFile}
                className={primaryBtn}
                onClick={() => void applyServerFfmpeg()}
              >
                {ffmpegBusy ? 'Processing…' : 'Apply edits to video'}
              </button>
            </div>
          ) : null}

          {step === 'details' ? (
            <div className="space-y-3">
              <label className={fieldLabel}>
                Title
                <input
                  className={fieldInput}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What are you selling?"
                />
              </label>
              <label className={fieldLabel}>
                Price label
                <input
                  className={fieldInput}
                  value={priceLabel}
                  onChange={(e) => setPriceLabel(e.target.value)}
                  placeholder="$48 or Ask"
                />
              </label>
              <label className={fieldLabel}>
                Caption
                <textarea
                  className={`${fieldInput} min-h-[88px] resize-none text-[14px]`}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </label>
              <label className={fieldLabel}>
                Tags
                <input
                  className={fieldInput}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="bulk, eco, #brisbane"
                />
              </label>
              <label className={fieldLabel}>
                Category
                <select
                  className={fieldInput}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DropCategoryId)}
                >
                  {(Object.keys(DROP_CATEGORY_LABELS) as DropCategoryId[]).map((k) => (
                    <option key={k} value={k}>
                      {DROP_CATEGORY_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={fieldLabel}>
                Region
                <select
                  className={fieldInput}
                  value={region}
                  onChange={(e) => setRegion(e.target.value as DropRegionCode)}
                >
                  {(Object.keys(DROP_REGION_LABELS) as DropRegionCode[]).map((k) => (
                    <option key={k} value={k}>
                      {DROP_REGION_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={fieldLabel}>
                Location
                <input
                  className={fieldInput}
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="West End · pickup OK"
                />
              </label>
            </div>
          ) : null}

          {step === 'boost' ? (
            <div className="space-y-3">
              <p className="text-[14px] font-medium text-zinc-600">
                Optional boost — stored with your drop after publish.
              </p>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-900/10 bg-emerald-50/40 px-3 py-2.5 text-[14px] font-medium">
                  <input type="radio" checked={boostTier === 0} onChange={() => setBoostTier(0)} />
                  No boost
                </label>
                {BOOST_TIER_COPY.map((b) => (
                  <label
                    key={b.tier}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-[14px] font-medium shadow-sm"
                  >
                    <input
                      type="radio"
                      checked={boostTier === b.tier}
                      onChange={() => setBoostTier(b.tier)}
                    />
                    {b.label} · {b.priceAud}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {step === 'commerce' ? (
            <div className="space-y-4">
              <p className="text-[14px] font-medium text-zinc-600">
                Link your shop — viewers can tap through like a storefront.
              </p>
              <label className="flex cursor-pointer items-center gap-3 text-[14px] font-semibold">
                <input
                  type="radio"
                  checked={commerceKind === 'none'}
                  onChange={() => {
                    setCommerceKind('none')
                    setSelectedListingIds([])
                  }}
                />
                None
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-[14px] font-semibold">
                <input
                  type="radio"
                  checked={commerceKind === 'marketplace'}
                  onChange={() => {
                    setCommerceKind('marketplace')
                    setSelectedListingIds([])
                  }}
                />
                Marketplace product ID
              </label>
              {commerceKind === 'marketplace' ? (
                <input
                  className={fieldInput}
                  value={commerceProductId}
                  onChange={(e) => setCommerceProductId(e.target.value)}
                  placeholder="Product id"
                />
              ) : null}
              <label className="flex cursor-pointer items-center gap-3 text-[14px] font-semibold">
                <input
                  type="radio"
                  checked={commerceKind === 'listing'}
                  onChange={() => setCommerceKind('listing')}
                />
                Your listings (multi-select)
              </label>
              {commerceKind === 'listing' ? (
                <>
                  {listingsLoading ? (
                    <p className="text-[13px] text-zinc-500">Loading your listings…</p>
                  ) : myListings.length === 0 ? (
                    <p className="rounded-xl border border-emerald-900/10 bg-emerald-50/50 px-3 py-2 text-[13px] text-zinc-600">
                      No published listings yet. Publish from Sell, then come back.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {myListings.map((l) => {
                        const img = l.images?.[0]?.url
                        const selected = selectedListingIds.includes(l.id)
                        return (
                          <div
                            key={l.id}
                            className={[
                              'relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-colors',
                              selected ? 'border-emerald-700 ring-2 ring-emerald-700/25' : 'border-emerald-900/10',
                            ].join(' ')}
                          >
                            <button
                              type="button"
                              className="block w-full text-left"
                              onClick={() => toggleListingSelect(l.id)}
                            >
                              <div className="aspect-square bg-zinc-100">
                                {img ? (
                                  <img
                                    src={listingImageAbsoluteUrl(img)}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-[2rem] text-zinc-300">
                                    —
                                  </div>
                                )}
                              </div>
                              <div className="p-2">
                                <p className="line-clamp-2 text-[12px] font-bold leading-snug text-zinc-900">
                                  {l.title}
                                </p>
                                <p className="mt-0.5 text-[11px] font-semibold text-emerald-800">
                                  {formatAudFromCents(l.priceCents ?? 0)}
                                </p>
                              </div>
                            </button>
                            <button
                              type="button"
                              className="absolute bottom-10 right-1.5 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-900 shadow ring-1 ring-emerald-900/15"
                              onClick={(e) => {
                                e.stopPropagation()
                                setListingPreview(l)
                              }}
                            >
                              View
                            </button>
                            {selected ? (
                              <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-800 text-[12px] font-bold text-white shadow">
                                ✓
                              </span>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {selectedListingIds.length === 1 ? (
                    <label className="flex items-center gap-2 text-[13px] font-medium text-amber-900">
                      <input
                        type="checkbox"
                        checked={listingSaleAuction}
                        onChange={(e) => setListingSaleAuction(e.target.checked)}
                      />
                      Auction (Place bid on this listing)
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {step === 'review' ? (
            <ul className="space-y-2.5 text-[14px] text-zinc-700">
              <li>
                <span className="font-semibold text-emerald-900/80">Media:</span>{' '}
                {imageFiles.length ? `${imageFiles.length} photos` : videoFile?.name ?? '—'}
              </li>
              <li>
                <span className="font-semibold text-emerald-900/80">Title:</span> {title.trim() || '—'}
              </li>
              <li>
                <span className="font-semibold text-emerald-900/80">Price:</span> {priceLabel.trim() || 'Ask'}
              </li>
              <li>
                <span className="font-semibold text-emerald-900/80">Listings:</span>{' '}
                {commerceKind === 'listing' && selectedListingIds.length
                  ? `${selectedListingIds.length} selected`
                  : commercePayload
                    ? commerceKind === 'marketplace'
                      ? 'Product linked'
                      : 'Linked'
                    : 'None'}
              </li>
              <li>
                <span className="font-semibold text-emerald-900/80">Boost:</span>{' '}
                {boostTier === 0 ? 'None' : BOOST_TIER_COPY.find((b) => b.tier === boostTier)?.label}
              </li>
            </ul>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-emerald-900/10 bg-emerald-50/50 px-4 py-3">
          <button type="button" className={secondaryBtn} onClick={goBack}>
            {step === 'library' ? 'Cancel' : 'Back'}
          </button>
          {step !== 'review' ? (
            <button
              type="button"
              disabled={step === 'library' && !canAdvanceLibrary}
              className={primaryBtn}
              onClick={goNext}
            >
              Continue
            </button>
          ) : (
            <button type="button" disabled={busy} className={primaryBtn} onClick={() => publish()}>
              {busy ? 'Publishing…' : tryServerPublish ? 'Publish' : 'Done'}
            </button>
          )}
        </div>
      </div>

      {listingPreview ? (
        <div className="fixed inset-0 z-[95] flex flex-col justify-end" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close listing"
            onClick={() => setListingPreview(null)}
          />
          <div className="relative z-[1] mx-auto max-h-[min(70dvh,28rem)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-emerald-900/12 bg-white p-4 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200" />
            {listingPreview.images?.[0]?.url ? (
              <img
                src={listingImageAbsoluteUrl(listingPreview.images[0].url)}
                alt=""
                className="mx-auto max-h-48 rounded-xl object-contain"
              />
            ) : null}
            <h3 className="mt-3 text-[17px] font-bold text-zinc-900">{listingPreview.title}</h3>
            <p className="mt-1 text-[18px] font-extrabold text-emerald-800">
              {formatAudFromCents(listingPreview.priceCents ?? 0)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-snug text-zinc-600">
              {listingPreview.description}
            </p>
            <button
              type="button"
              className={`${primaryBtn} mt-4`}
              onClick={() => setListingPreview(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
