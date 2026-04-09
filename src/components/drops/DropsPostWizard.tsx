import { useCallback, useMemo, useState, type ChangeEvent } from 'react'
import { marketplaceActorHeaders } from '../../lib/booking/marketplaceApiAuth'
import { BOOST_TIER_COPY, setBoostTierForReel } from '../../lib/drops/boostStore'
import { DROP_CATEGORY_LABELS, DROP_REGION_LABELS } from '../../lib/drops/constants'
import { dropsPublishApiErrorMessage } from '../../lib/drops/dropsDeployErrors'
import { UploadDropMediaError } from '../../lib/drops/uploadDropMedia'
import { uploadDropsMediaForPublish } from '../../lib/drops/uploadDropsMediaForPublish'
import { getFetchApiBaseUrl } from '../../lib/fetchApiBase'
import type {
  DropCategoryId,
  DropRegionCode,
  DropsCommerceSaleMode,
  DropsCommerceTarget,
} from '../../lib/drops/types'

type WizardStep = 'pick' | 'edit' | 'details' | 'boost' | 'commerce' | 'review'

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

type Props = {
  open: boolean
  onClose: () => void
  /** After successful server publish */
  onPublished: (serverId?: string) => void
  authorId: string
  sellerDisplay: string
  tryServerPublish: boolean
  /** When `tryServerPublish` is false, uploads media then builds a local feed row. */
  onLocalPublish?: (payload: DropsLocalPublishPayload) => Promise<void>
}

function parseTags(s: string): string[] {
  return s
    .split(/[,#\s]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 24)
}

export function DropsPostWizard({
  open,
  onClose,
  onPublished,
  authorId,
  sellerDisplay,
  tryServerPublish,
  onLocalPublish,
}: Props) {
  const [step, setStep] = useState<WizardStep>('pick')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ffmpegBusy, setFfmpegBusy] = useState(false)

  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [editNote, setEditNote] = useState(
    'Phase 4A: server ffmpeg can trim/mute/rotate (see Edit). Phase 4B/C: text, stickers, speed, filters, music — native SDK or SaaS timeline for CapCut-class editing.',
  )

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
  const [commerceListingId, setCommerceListingId] = useState('')
  const [listingSaleAuction, setListingSaleAuction] = useState(false)

  const tags = useMemo(() => parseTags(tagInput), [tagInput])

  const commercePayload = useMemo((): DropsCommerceTarget | undefined => {
    if (commerceKind === 'marketplace' && commerceProductId.trim()) {
      return { kind: 'marketplace_product', productId: commerceProductId.trim() }
    }
    if (commerceKind === 'listing' && commerceListingId.trim()) {
      return { kind: 'buy_sell_listing', listingId: commerceListingId.trim() }
    }
    return undefined
  }, [commerceKind, commerceListingId, commerceProductId])

  const commerceSaleMode: DropsCommerceSaleMode =
    commerceKind === 'listing' && listingSaleAuction ? 'auction' : 'buy_now'

  const reset = useCallback(() => {
    setStep('pick')
    setErr(null)
    setVideoFile(null)
    setImageFiles([])
    setEditNote('Trim & filters ship in Phase 4 — preview only here.')
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
    setCommerceListingId('')
    setListingSaleAuction(false)
  }, [])

  const onPickVideo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f?.type.startsWith('video/')) {
      setImageFiles([])
      setVideoFile(f)
    }
  }

  const onPickPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    e.target.value = ''
    if (!list?.length) return
    const next: File[] = []
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      if (f?.type.startsWith('image/')) next.push(f)
    }
    if (next.length) {
      setVideoFile(null)
      setImageFiles(next.slice(0, 12))
    }
  }

  const canAdvancePick = Boolean(videoFile || imageFiles.length)

  const applyServerFfmpeg = async () => {
    if (!videoFile) {
      setErr('Pick a video first.')
      return
    }
    setErr(null)
    setFfmpegBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', videoFile)
      fd.append('mute', '0')
      fd.append('rotation', '0')
      fd.append('trimStartSec', '0')
      const res = await fetch(`${getFetchApiBaseUrl()}/api/drops/process-video`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; videoUrl?: string }
      if (!res.ok) {
        setErr(
          payload.error === 'ffmpeg_not_available'
            ? 'Server ffmpeg not installed (set FFMPEG_PATH or install ffmpeg).'
            : payload.error || 'process_failed',
        )
        return
      }
      const rel = typeof payload.videoUrl === 'string' ? payload.videoUrl : ''
      if (!rel) {
        setErr('No video URL returned')
        return
      }
      const blob = await fetch(`${getFetchApiBaseUrl()}${rel}`, { credentials: 'include' }).then((r) => r.blob())
      const next = new File([blob], 'edited-drop.mp4', { type: blob.type || 'video/mp4' })
      setVideoFile(next)
      setEditNote('Processed clip replaced the original for upload.')
    } catch {
      setErr('network_error')
    } finally {
      setFfmpegBusy(false)
    }
  }

  const publish = async (): Promise<void> => {
    setErr(null)
    if (!canAdvancePick) {
      setErr('Add a video or photos first.')
      return
    }
    const blurb = [caption.trim(), tags.map((t) => `#${t}`).join(' '), locationLabel.trim()]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 400)
    const priceResolved =
      priceLabel.trim() ||
      title.match(/\$\s*[\d,.]+/)?.[0] ||
      (title.match(/\d+/)?.[0] ? `$${title.match(/\d+/)![0]}` : '') ||
      'Ask'

    if (!tryServerPublish) {
      setBusy(true)
      try {
        await onLocalPublish?.({
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
        })
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'local_publish_failed')
        setBusy(false)
        return
      }
      setBusy(false)
      onClose()
      reset()
      onPublished(undefined)
      return
    }

    setBusy(true)
    try {
      const media = await uploadDropsMediaForPublish({
        video: videoFile,
        images: [...imageFiles],
      })
      if (!media.videoUrl && !(media.imageUrls?.length ?? 0)) {
        setErr('Upload failed — no media URL returned.')
        setBusy(false)
        return
      }

      const res = await fetch(`${getFetchApiBaseUrl()}/api/publish`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...marketplaceActorHeaders('customer'),
        },
        body: JSON.stringify({
          authorId,
          sellerDisplay,
          title: title.trim() || 'Your drop',
          priceLabel: priceResolved,
          blurb: blurb || 'New drop',
          categories: [category],
          region,
          commerce: commercePayload,
          commerceSaleMode,
          growthVelocityScore: 1.55,
          ...(media.videoUrl ? { videoUrl: media.videoUrl } : { imageUrls: media.imageUrls ?? [] }),
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (!res.ok) {
        setErr(dropsPublishApiErrorMessage(payload.error, res.status))
        setBusy(false)
        return
      }
      const id = typeof payload.id === 'string' ? payload.id : null
      if (!id) {
        setErr('Missing drop id')
        setBusy(false)
        return
      }

      if (boostTier > 0) {
        setBoostTierForReel(id, boostTier)
      }

      onClose()
      reset()
      onPublished(id)
    } catch (e) {
      if (e instanceof UploadDropMediaError) {
        setErr(e.message)
      } else {
        setErr('network_error')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const stepIndex = ['pick', 'edit', 'details', 'boost', 'commerce', 'review'].indexOf(step)

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
        className="relative z-[1] flex max-h-[min(92dvh,40rem)] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-900 text-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drops-wizard-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="drops-wizard-title" className="text-[16px] font-bold">
            New drop
          </h2>
          <span className="text-[11px] font-semibold text-white/50">
            Step {stepIndex + 1} / 6 · mobile-first
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {err ? <p className="mb-2 text-[13px] text-amber-300">{err}</p> : null}

          {step === 'pick' ? (
            <div className="space-y-3">
              <p className="text-[13px] text-white/65">Choose photos (carousel) or one short video.</p>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-white/50">
                Photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onPickPhotos}
                  className="mt-1 block w-full text-[13px] file:mr-2 file:rounded-lg file:border-0 file:bg-white/15 file:px-3 file:py-2"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-white/50">
                Video
                <input
                  type="file"
                  accept="video/*"
                  onChange={onPickVideo}
                  className="mt-1 block w-full text-[13px] file:mr-2 file:rounded-lg file:border-0 file:bg-white/15 file:px-3 file:py-2"
                />
              </label>
              <p className="text-[12px] text-white/45">
                {imageFiles.length
                  ? `${imageFiles.length} photo(s) selected`
                  : videoFile
                    ? `Video: ${videoFile.name}`
                    : 'Nothing selected yet'}
              </p>
            </div>
          ) : null}

          {step === 'edit' ? (
            <div className="space-y-3">
              <p className="text-[13px] text-white/65">{editNote}</p>
              {videoFile ? (
                <button
                  type="button"
                  disabled={ffmpegBusy}
                  onClick={() => void applyServerFfmpeg()}
                  className="w-full rounded-xl bg-violet-600 py-3 text-[14px] font-bold text-white disabled:opacity-40"
                >
                  {ffmpegBusy ? 'Processing…' : 'Re-encode on server (ffmpeg baseline)'}
                </button>
              ) : null}
              <p className="text-[11px] text-white/45">
                For trim/mute/rotate, call{' '}
                <span className="font-mono">POST /api/drops/process-video</span> with form fields{' '}
                <span className="font-mono">trimStartSec</span>, <span className="font-mono">trimDurationSec</span>,{' '}
                <span className="font-mono">mute</span>, <span className="font-mono">rotation</span> (extend UI
                later).
              </p>
            </div>
          ) : null}

          {step === 'details' ? (
            <div className="space-y-3">
              <label className="block text-[11px] font-semibold uppercase text-white/50">
                Title
                <input
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[15px]"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Energy Pack (24×)"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase text-white/50">
                Price label
                <input
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[15px]"
                  value={priceLabel}
                  onChange={(e) => setPriceLabel(e.target.value)}
                  placeholder="$48 or Ask"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase text-white/50">
                Caption
                <textarea
                  className="mt-1 min-h-[72px] w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[14px]"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase text-white/50">
                Tags (comma or #hashtag)
                <input
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[14px]"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="bulk, eco, #brisbane"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase text-white/50">
                Category
                <select
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[14px]"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DropCategoryId)}
                >
                  {(Object.keys(DROP_CATEGORY_LABELS) as DropCategoryId[]).map((k) => (
                    <option key={k} value={k} className="bg-zinc-900">
                      {DROP_CATEGORY_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] font-semibold uppercase text-white/50">
                Region
                <select
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[14px]"
                  value={region}
                  onChange={(e) => setRegion(e.target.value as DropRegionCode)}
                >
                  {(Object.keys(DROP_REGION_LABELS) as DropRegionCode[]).map((k) => (
                    <option key={k} value={k} className="bg-zinc-900">
                      {DROP_REGION_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] font-semibold uppercase text-white/50">
                Location label
                <input
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[14px]"
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="West End · pickup OK"
                />
              </label>
            </div>
          ) : null}

          {step === 'boost' ? (
            <div className="space-y-2">
              <p className="text-[13px] text-white/65">
                Select a boost tier (demo: stored locally per reel id after publish). Production: Stripe.
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[14px]">
                  <input type="radio" checked={boostTier === 0} onChange={() => setBoostTier(0)} />
                  No boost
                </label>
                {BOOST_TIER_COPY.map((b) => (
                  <label key={b.tier} className="flex items-center gap-2 text-[14px]">
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
            <div className="space-y-3">
              <p className="text-[13px] text-white/65">Attach a store product or peer listing for Fetch it / Buy.</p>
              <label className="flex items-center gap-2 text-[14px]">
                <input
                  type="radio"
                  checked={commerceKind === 'none'}
                  onChange={() => setCommerceKind('none')}
                />
                None
              </label>
              <label className="flex items-center gap-2 text-[14px]">
                <input
                  type="radio"
                  checked={commerceKind === 'marketplace'}
                  onChange={() => setCommerceKind('marketplace')}
                />
                Marketplace product id
              </label>
              {commerceKind === 'marketplace' ? (
                <input
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-[13px]"
                  value={commerceProductId}
                  onChange={(e) => setCommerceProductId(e.target.value)}
                  placeholder="sup-drink-soft-case"
                />
              ) : null}
              <label className="flex items-center gap-2 text-[14px]">
                <input
                  type="radio"
                  checked={commerceKind === 'listing'}
                  onChange={() => setCommerceKind('listing')}
                />
                Buy &amp; Sell listing id
              </label>
              {commerceKind === 'listing' ? (
                <input
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-[13px]"
                  value={commerceListingId}
                  onChange={(e) => setCommerceListingId(e.target.value)}
                  placeholder="lst_…"
                />
              ) : null}
              {commerceKind === 'listing' && commerceListingId.trim() ? (
                <label className="flex items-center gap-2 text-[13px] text-amber-100/90">
                  <input
                    type="checkbox"
                    checked={listingSaleAuction}
                    onChange={(e) => setListingSaleAuction(e.target.checked)}
                  />
                  Treat listing as auction (Place bid CTA)
                </label>
              ) : null}
            </div>
          ) : null}

          {step === 'review' ? (
            <ul className="space-y-2 text-[13px] text-white/80">
              <li>
                <span className="text-white/50">Media:</span>{' '}
                {imageFiles.length ? `${imageFiles.length} photos` : videoFile?.name ?? '—'}
              </li>
              <li>
                <span className="text-white/50">Title:</span> {title.trim() || '—'}
              </li>
              <li>
                <span className="text-white/50">Price:</span>{' '}
                {(() => {
                  const num = title.match(/\d+/)
                  return (
                    priceLabel.trim() ||
                    title.match(/\$\s*[\d,.]+/)?.[0] ||
                    (num ? `$${num[0]}` : '') ||
                    'Ask'
                  )
                })()}
              </li>
              <li>
                <span className="text-white/50">Blurb:</span>{' '}
                {[caption.trim(), tags.map((t) => `#${t}`).join(' '), locationLabel].filter(Boolean).join(' · ') ||
                  '—'}
              </li>
              <li>
                <span className="text-white/50">Boost:</span>{' '}
                {boostTier === 0 ? 'None' : BOOST_TIER_COPY.find((b) => b.tier === boostTier)?.label}
              </li>
              <li>
                <span className="text-white/50">Commerce:</span>{' '}
                {commercePayload ? JSON.stringify(commercePayload) : 'None'}
                {commercePayload ? ` · ${commerceSaleMode}` : ''}
              </li>
              <li className="text-[12px] text-white/45">
                Server publish uses your signed-in session. Media uploads go to Supabase Storage from the app, then the server saves the drop to Postgres.
              </li>
            </ul>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            className="flex-1 rounded-xl border border-white/20 py-3 text-[14px] font-bold text-white"
            onClick={() => {
              const order: WizardStep[] = ['pick', 'edit', 'details', 'boost', 'commerce', 'review']
              const i = order.indexOf(step)
              if (i <= 0) {
                reset()
                onClose()
              } else setStep(order[i - 1]!)
            }}
          >
            {step === 'pick' ? 'Cancel' : 'Back'}
          </button>
          {step !== 'review' ? (
            <button
              type="button"
              disabled={step === 'pick' && !canAdvancePick}
              className="flex-[1.2] rounded-xl bg-white py-3 text-[14px] font-bold text-zinc-900 disabled:opacity-40"
              onClick={() => {
                const order: WizardStep[] = ['pick', 'edit', 'details', 'boost', 'commerce', 'review']
                const i = order.indexOf(step)
                if (i < order.length - 1) setStep(order[i + 1]!)
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="flex-[1.2] rounded-xl bg-fetch-red py-3 text-[14px] font-bold text-white disabled:opacity-40"
              onClick={() => void publish()}
            >
              {busy ? 'Publishing…' : tryServerPublish ? 'Publish' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
