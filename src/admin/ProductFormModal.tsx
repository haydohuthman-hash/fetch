import { useEffect, useMemo, useState } from 'react'
import type { AdminProduct, AmazonProductImportDraft } from '../lib/adminProductsApi'
import {
  adminCreateLegacyProduct,
  adminCreateProduct,
  adminPatchProduct,
  adminUploadProductImage,
} from '../lib/adminProductsApi'
import { getFetchApiBaseUrl } from '../lib/fetchApiBase'
import type { StorePublicCategory } from '../lib/storeCategoriesPublic'
import { fetchPublicStoreCategories, getStaticFallbackStoreCategories } from '../lib/storeCategoriesPublic'

type Props = {
  open: boolean
  adminKey: string
  databaseProducts: boolean
  initial: AdminProduct | null
  /** When set while opening, pre-fills the form from POST /api/import-product (cleared when modal closes). */
  importDraft?: AmazonProductImportDraft | null
  onClose: () => void
  onSaved: () => void
}

export function ProductFormModal({
  open,
  adminKey,
  databaseProducts,
  initial,
  importDraft = null,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>('kitchen')
  const [price, setPrice] = useState('29')
  const [comparePrice, setComparePrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [isBundle, setIsBundle] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [subOptions, setSubOptions] = useState<{ id: string; label: string }[]>([])
  const [subcategoryId, setSubcategoryId] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<StorePublicCategory[]>(() =>
    getStaticFallbackStoreCategories(),
  )
  const [tagsInput, setTagsInput] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [affiliateUrl, setAffiliateUrl] = useState('')
  const [asin, setAsin] = useState('')
  const [catalogProductKind, setCatalogProductKind] = useState<'fetch' | 'amazon'>('fetch')
  const [importHint, setImportHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewSrc = useMemo(() => {
    if (filePreviewUrl) return filePreviewUrl
    const u = imageUrl.trim()
    return u || null
  }, [filePreviewUrl, imageUrl])

  useEffect(() => {
    if (!open) return
    setError(null)
    setImportHint(null)
    setFile(null)
    setFilePreviewUrl(null)

    if (importDraft) {
      setCatalogProductKind('amazon')
      setTitle(importDraft.title)
      setSubtitle((importDraft.subtitle ?? '').trim())
      setCategory('kitchen')
      setSubcategoryId('')
      setPrice(
        importDraft.priceAud != null && Number.isFinite(importDraft.priceAud) && importDraft.priceAud >= 0
          ? String(importDraft.priceAud)
          : '0',
      )
      setComparePrice('')
      setCostPrice('')
      setDescription('')
      setImageUrl((importDraft.imageUrl ?? '').trim())
      setAffiliateUrl((importDraft.affiliateUrl ?? '').trim())
      setAsin(importDraft.asin)
      setIsBundle(false)
      setIsActive(true)
      setTagsInput('')
      if (importDraft.warning) setImportHint(importDraft.warning)
      return
    }

    if (initial) {
      setCatalogProductKind(initial.productSource === 'amazon' ? 'amazon' : 'fetch')
      setTitle(initial.title)
      setCategory(initial.category)
      setSubcategoryId(initial.subcategoryId ?? '')
      setPrice(String(initial.price))
      setComparePrice(initial.comparePrice != null ? String(initial.comparePrice) : '')
      setCostPrice(initial.costPrice != null ? String(initial.costPrice) : '')
      setDescription(initial.description)
      setImageUrl(initial.imageUrl)
      setSubtitle((initial.subtitle ?? '').trim())
      setAffiliateUrl((initial.affiliateUrl ?? '').trim())
      setAsin((initial.asin ?? '').trim())
      setIsBundle(initial.isBundle)
      setIsActive(initial.isActive)
      setTagsInput((initial.tags ?? []).join(', '))
      return
    }

    setCatalogProductKind('fetch')
    setTitle('')
    setCategory('kitchen')
    setSubcategoryId('')
    setPrice('29')
    setComparePrice('')
    setCostPrice('')
    setDescription('')
    setImageUrl('')
    setSubtitle('')
    setAffiliateUrl('')
    setAsin('')
    setIsBundle(false)
    setIsActive(true)
    setTagsInput('')
  }, [open, initial, importDraft])

  useEffect(() => {
    if (!open) return
    void fetchPublicStoreCategories().then((r) => {
      if (r.categories.length) setCategoryOptions(r.categories)
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `${getFetchApiBaseUrl()}/api/store/subcategories?category=${encodeURIComponent(category)}`,
        )
        const j = (await res.json()) as { subcategories?: { id: string; label: string }[] }
        const list = Array.isArray(j.subcategories) ? j.subcategories.map((s) => ({ id: s.id, label: s.label })) : []
        if (cancelled) return
        setSubOptions(list)
      } catch {
        if (!cancelled) setSubOptions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, category])

  const sortedCategoryOptions = useMemo(
    () => [...categoryOptions].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
    [categoryOptions],
  )

  useEffect(() => {
    if (!subOptions.length) return
    const valid = subOptions.some((s) => s.id === subcategoryId)
    if (!subcategoryId || !valid) {
      setSubcategoryId(subOptions[0]!.id)
    }
  }, [subOptions, subcategoryId])

  useEffect(() => {
    if (!open || !sortedCategoryOptions.length) return
    if (!sortedCategoryOptions.some((c) => c.id === category)) {
      setCategory(sortedCategoryOptions[0]!.id)
    }
  }, [open, sortedCategoryOptions, category])

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null)
      return
    }
    const u = URL.createObjectURL(file)
    setFilePreviewUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  if (!open) return null

  const isAmazon = catalogProductKind === 'amazon'

  const parseTagsField = (s: string): string[] =>
    s
      .split(/[,;]+/)
      .map((t) => t.trim().slice(0, 64))
      .filter(Boolean)
      .slice(0, 32)

  const uploadSelectedFile = async () => {
    const k = adminKey.trim()
    if (!k || !file) return
    setUploadBusy(true)
    setError(null)
    try {
      const url = await adminUploadProductImage(k, file)
      setImageUrl(url)
      setFile(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed')
    } finally {
      setUploadBusy(false)
    }
  }

  const submit = async () => {
    const k = adminKey.trim()
    if (!k) return
    setBusy(true)
    setError(null)
    try {
      let url = imageUrl.trim()
      if (file) {
        url = await adminUploadProductImage(k, file)
        setImageUrl(url)
        setFile(null)
      }
      const priceNum = Math.round(Number(price))
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        setError('Invalid price')
        setBusy(false)
        return
      }
      const cmp =
        comparePrice.trim() === '' ? null : Math.round(Number(comparePrice))
      const cost = costPrice.trim() === '' ? null : Math.round(Number(costPrice))

      const source = initial?.source === 'legacy_file' ? 'legacy_file' : 'database'
      const subLabel = subOptions.find((s) => s.id === subcategoryId)?.label ?? null
      const tags = parseTagsField(tagsInput)
      const asinNorm = asin.trim().toUpperCase()
      const asinFinal = /^[A-Z0-9]{10}$/.test(asinNorm) ? asinNorm : null

      if (isAmazon && !databaseProducts) {
        setError('Amazon listings require the database catalog (DATABASE_URL).')
        setBusy(false)
        return
      }
      if (isAmazon && !affiliateUrl.trim()) {
        setError('Affiliate link is missing — re-import the product URL or contact support.')
        setBusy(false)
        return
      }

      if (initial) {
        const patch: Parameters<typeof adminPatchProduct>[2] = {
          title: title.trim(),
          category,
          subcategoryId: subcategoryId || null,
          subcategoryLabel: source === 'legacy_file' ? subLabel : undefined,
          price: priceNum,
          comparePrice: cmp != null && Number.isFinite(cmp) ? cmp : null,
          costPrice: cost != null && Number.isFinite(cost) ? cost : null,
          description:
            source === 'legacy_file'
              ? [subtitle.trim(), description.trim()].filter(Boolean).join('\n\n').trim()
              : description.trim(),
          imageUrl: url,
          isBundle: isAmazon ? false : isBundle,
          isActive,
          tags,
        }
        if (source === 'database') patch.subtitle = subtitle.trim()
        if (isAmazon && source === 'database') {
          patch.affiliateUrl = affiliateUrl.trim()
          patch.productSource = 'amazon'
          patch.externalListing = true
          patch.asin = asinFinal
        }
        await adminPatchProduct(k, initial.id, patch, source)
      } else if (databaseProducts) {
        await adminCreateProduct(k, {
          title: title.trim(),
          category,
          subcategoryId: subcategoryId || null,
          price: priceNum,
          comparePrice: cmp != null && Number.isFinite(cmp) && cmp > 0 ? cmp : undefined,
          costPrice: cost != null && Number.isFinite(cost) && cost >= 0 ? cost : undefined,
          description: description.trim(),
          subtitle: subtitle.trim() || undefined,
          imageUrl: url,
          isBundle: isAmazon ? false : isBundle,
          isActive,
          tags,
          ...(isAmazon
            ? {
                productSource: 'amazon' as const,
                external: true,
                affiliateUrl: affiliateUrl.trim(),
                asin: asinFinal,
              }
            : {}),
        })
      } else {
        await adminCreateLegacyProduct(k, {
          title: title.trim(),
          category,
          price: priceNum,
          comparePrice: cmp != null && Number.isFinite(cmp) && cmp > 0 ? cmp : undefined,
          description: [subtitle.trim(), description.trim()].filter(Boolean).join('\n\n').trim(),
          imageUrl: url,
          subcategoryId: subcategoryId || null,
          subcategoryLabel: subLabel,
          tags: tags.length ? tags : undefined,
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const legacyEdit = initial?.source === 'legacy_file'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-[1] flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal
        aria-labelledby="product-form-title"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 id="product-form-title" className="text-[17px] font-bold tracking-tight">
            {initial ? 'Edit product' : importDraft ? 'Import product' : 'Add product'}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[14px] font-semibold text-zinc-600"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3">
            {importHint ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium leading-snug text-amber-950">
                {importHint}
              </p>
            ) : null}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Product image</p>
              <div className="mt-2 flex gap-3">
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.opacity = '0.25'
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] font-semibold text-zinc-400">
                      No image yet
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="w-full text-[13px]"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <button
                      type="button"
                      disabled={uploadBusy}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
                      onClick={() => void uploadSelectedFile()}
                    >
                      {uploadBusy ? 'Uploading…' : 'Upload now'}
                    </button>
                  ) : null}
                  <label className="block">
                    <span className="text-[11px] font-semibold text-zinc-600">Or paste image URL</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-[13px]"
                      placeholder="https://…"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                {databaseProducts
                  ? 'Files go to Cloudinary in production, or /listing-uploads when running the API locally without Cloudinary.'
                  : 'Uses the same upload endpoint; saved as a public URL on the product.'}
              </p>
            </div>

            <label className="block">
              <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Title</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px]"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Subtitle</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px]"
                placeholder="Short line under the title"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </label>
            {isAmazon && databaseProducts ? (
              <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/80">Amazon listing</p>
                <label className="block">
                  <span className="text-[11px] font-semibold text-zinc-600">ASIN</span>
                  <input
                    readOnly
                    className="mt-1 w-full cursor-default rounded-lg border border-zinc-200/80 bg-zinc-100/80 px-2 py-2 font-mono text-[12px] text-zinc-700"
                    value={asin}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-zinc-600">Affiliate link (read-only)</span>
                  <input
                    readOnly
                    className="mt-1 w-full cursor-default rounded-lg border border-zinc-200/80 bg-zinc-100/80 px-2 py-2 font-mono text-[11px] text-zinc-700"
                    value={affiliateUrl}
                  />
                </label>
                <p className="text-[10px] leading-snug text-zinc-500">
                  Tag comes from server env <span className="font-mono">AMAZON_AFFILIATE_TAG</span>. FUTURE: PA-API
                  can refresh title, image, and price automatically.
                </p>
              </div>
            ) : null}
            <label className="block">
              <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Category</span>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px]"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {sortedCategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Subcategory</span>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px]"
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                disabled={!subOptions.length}
              >
                {subOptions.length === 0 ? (
                  <option value="">Loading…</option>
                ) : (
                  subOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))
                )}
              </select>
              {!databaseProducts ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                  File-only mode: subcategory is stored on the product for shop carousels when the API exposes it.
                </p>
              ) : null}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">
                  Price (AUD){isAmazon ? ' · optional' : ''}
                </span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px]"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Compare</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px]"
                  value={comparePrice}
                  onChange={(e) => setComparePrice(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            {!legacyEdit ? (
              <label className="block">
                <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Cost (internal)</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px]"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Description</span>
              <textarea
                className="mt-1 min-h-[88px] w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Tags</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px]"
                placeholder="Comma-separated (e.g. eco, bulk, starter)"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-zinc-500">Used for shop filtering and discovery.</p>
            </label>
            {!legacyEdit && !isAmazon ? (
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-[14px] font-semibold">
                  <input type="checkbox" checked={isBundle} onChange={(e) => setIsBundle(e.target.checked)} />
                  Bundle
                </label>
                <label className="flex items-center gap-2 text-[14px] font-semibold">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  Active
                </label>
              </div>
            ) : (
              <p className="text-[12px] text-zinc-500">
                File-based products are always active in the merged catalog. Use the database catalog for bundle/active
                flags.
              </p>
            )}
            {error ? <p className="text-[14px] font-medium text-red-600">{error}</p> : null}
          </div>
        </div>
        <div className="border-t border-zinc-200 px-4 py-3">
          <button
            type="button"
            disabled={busy || !title.trim()}
            className="w-full rounded-xl bg-zinc-900 py-3 text-[15px] font-bold text-white disabled:opacity-40"
            onClick={() => void submit()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
