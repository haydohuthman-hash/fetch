import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadSession } from '../lib/fetchUserSession'
import { ensureDropProfileForSession, getMyDropProfile } from '../lib/drops/profileStore'
import {
  buildValidatedCreateListingBody,
  createListing,
  fetchListing,
  patchListing,
  publishListing,
  uploadListingImage,
  uploadListingImagesForCreate,
  withListingImages,
} from '../lib/listingsApi'

const LIST_CATEGORIES: { id: string; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'sports', label: 'Sports' },
  { id: 'other', label: 'Other' },
]

const CONDITIONS: { id: string; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'like new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
  { id: 'used', label: 'Used' },
  { id: 'for parts', label: 'For parts / repair' },
]

export type FetchMarketplaceListingCreateViewProps = {
  onDone: () => void
}

export default function FetchMarketplaceListingCreateView({ onDone }: FetchMarketplaceListingCreateViewProps) {
  const [sp] = useSearchParams()
  const editId = (sp.get('edit') || '').trim()

  const [loading, setLoading] = useState(Boolean(editId))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priceAud, setPriceAud] = useState('')
  const [category, setCategory] = useState('general')
  const [condition, setCondition] = useState('good')
  const [locationLabel, setLocationLabel] = useState('')
  const [tags, setTags] = useState('')
  const [quantity, setQuantity] = useState('')
  const [fetchDelivery, setFetchDelivery] = useState(false)
  const [sameDayDelivery, setSameDayDelivery] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [listingId, setListingId] = useState<string | null>(editId || null)

  useEffect(() => {
    if (!editId) {
      setLoading(false)
      return
    }
    void (async () => {
      setErr(null)
      setLoading(true)
      try {
        const l = await fetchListing(editId)
        const sid = loadSession()?.id?.trim()
        if (sid && l.sellerUserId && l.sellerUserId !== sid) {
          setErr('You can only edit your own listings.')
          return
        }
        setListingId(l.id)
        setTitle(l.title || '')
        setDescription(l.description || '')
        setPriceAud(l.priceCents ? String(l.priceCents / 100) : '')
        setCategory(l.category || 'general')
        setCondition(l.condition || 'good')
        setLocationLabel(l.locationLabel || '')
        setTags((l.keywords || '').replace(/\s+/g, ' ').trim())
        setFetchDelivery(Boolean(l.fetchDelivery))
        setSameDayDelivery(Boolean(l.sameDayDelivery))
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not load listing.')
      } finally {
        setLoading(false)
      }
    })()
  }, [editId])

  const onFiles = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    setFiles((prev) => [...prev, ...picked].slice(0, 12))
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const buildKeywords = useCallback(() => {
    const base = tags
      .split(/[,#\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    const q = quantity.trim()
    if (q && /^\d+$/.test(q)) base.push(`qty:${q}`)
    return base.join(', ').slice(0, 2000)
  }, [quantity, tags])

  const submit = useCallback(
    async (ev: FormEvent) => {
      ev.preventDefault()
      setErr(null)
      const price = Number.parseFloat(priceAud.replace(/,/g, ''))
      if (!title.trim()) {
        setErr('Add a product title.')
        return
      }
      if (!Number.isFinite(price) || price < 0) {
        setErr('Enter a valid price (0 or more AUD).')
        return
      }
      ensureDropProfileForSession()
      const me = getMyDropProfile()
      if (!me) {
        setErr('Profile not ready. Open the app once while signed in, then try again.')
        return
      }

      setSaving(true)
      try {
        let id = listingId
        const keywords = buildKeywords()
        const isNew = !id
        let preUploadedImages: { url: string; sort: number }[] | undefined
        if (isNew && files.length > 0) {
          const urls = await uploadListingImagesForCreate(files)
          preUploadedImages = urls.map((url, i) => ({ url, sort: i }))
        }

        if (!id) {
          const draft = buildValidatedCreateListingBody({
            title: title.trim(),
            description: description.trim(),
            priceAud: price,
            category,
            condition,
            keywords,
            locationLabel: locationLabel.trim(),
            fetchDelivery,
            sameDayDelivery,
            profileAuthorId: me.id,
            profileDisplayName: me.displayName,
            profileAvatar: me.avatar?.trim() || undefined,
          })
          if (!draft.ok) {
            setErr(draft.error)
            return
          }
          const created = await createListing(withListingImages(draft.body, preUploadedImages))
          id = created.id
          setListingId(id)
        } else {
          await patchListing(id, {
            title: title.trim(),
            description: description.trim(),
            priceAud: price,
            category,
            condition,
            keywords,
            locationLabel: locationLabel.trim(),
            fetchDelivery,
            sameDayDelivery,
            profileAuthorId: me.id,
            profileDisplayName: me.displayName,
            profileAvatar: me.avatar?.trim() || null,
          })
          for (const f of files) {
            await uploadListingImage(id, f)
          }
        }

        await publishListing(id)
        setFiles([])
        onDone()
      } catch (e) {
        console.error('[FetchMarketplaceListingCreateView] publish failed', e)
        setErr(e instanceof Error ? e.message : 'Could not save listing.')
      } finally {
        setSaving(false)
      }
    },
    [
      buildKeywords,
      category,
      condition,
      description,
      fetchDelivery,
      sameDayDelivery,
      files,
      listingId,
      locationLabel,
      onDone,
      priceAud,
      title,
    ],
  )

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-emerald-100/80">
        <p className="text-sm">Loading listing…</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-950/90 via-zinc-950 to-black px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onDone}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:scale-[0.97]"
          aria-label="Back"
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
        <h1 className="text-lg font-semibold tracking-tight">
          {editId ? 'Edit listing' : 'List an item'}
        </h1>
      </header>

      {err ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-[12px] text-red-100">
          {err}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Photos
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-xl border border-dashed border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-[12px] font-semibold text-emerald-100">
              Add images
              <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
            </label>
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex items-center gap-1 rounded-lg bg-black/35 px-2 py-1 text-[11px] text-emerald-100/80"
              >
                {f.name.slice(0, 18)}
                <button type="button" className="text-white/50" onClick={() => removeFile(i)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <p className="mt-1 text-[10px] font-normal normal-case text-emerald-100/35">
            Up to 12 images · saved after you tap Publish
          </p>
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="What are you selling?"
            maxLength={200}
          />
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Price (AUD)
          <input
            value={priceAud}
            onChange={(e) => setPriceAud(e.target.value)}
            required
            inputMode="decimal"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="0.00"
          />
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={8000}
            className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[14px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Condition details, dimensions, what’s included…"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-2 py-2.5 text-[14px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            >
              {LIST_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id} className="bg-zinc-900">
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
            Condition
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-2 py-2.5 text-[14px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            >
              {CONDITIONS.map((c) => (
                <option key={c.id} value={c.id} className="bg-zinc-900">
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Pickup suburb / location
          <input
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="e.g. West End, Brisbane"
            maxLength={200}
          />
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
          <input
            type="checkbox"
            checked={fetchDelivery}
            onChange={(e) => setFetchDelivery(e.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          <span className="text-[13px] font-medium text-emerald-50/90">Fetch delivery available</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
          <input
            type="checkbox"
            checked={sameDayDelivery}
            onChange={(e) => setSameDayDelivery(e.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          <span className="text-[13px] font-medium text-emerald-50/90">Same-day delivery promo badge</span>
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Quantity <span className="font-normal text-white/35">(optional)</span>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="numeric"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="1"
          />
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Tags <span className="font-normal text-white/35">(optional)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="vintage, desk, pickup only"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="mt-2 w-full rounded-2xl bg-emerald-500 py-4 text-[15px] font-bold text-emerald-950 shadow-lg disabled:opacity-45"
        >
          {saving ? 'Publishing…' : 'Publish listing'}
        </button>
      </form>
    </div>
  )
}
