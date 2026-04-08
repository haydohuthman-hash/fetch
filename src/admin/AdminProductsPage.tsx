import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  adminDeleteProduct,
  adminImportProductFromUrl,
  adminPatchProduct,
  fetchAdminCatalogProducts,
  type AdminProduct,
  type AdminProductSource,
  type AmazonProductImportDraft,
} from '../lib/adminProductsApi'
import { invalidatePublicProductsCache } from '../lib/useFetchProducts'
import { AdminUnlockPanel, useAdminAuth } from './AdminAuthContext'
import { ProductFormModal } from './ProductFormModal'

function formatAud(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

export function AdminProductsPage() {
  const { adminKey, unlocked } = useAdminAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const filterCategory = searchParams.get('category')?.trim() ?? ''
  const filterSubcategory = searchParams.get('subcategory')?.trim() ?? ''
  const filterActive = Boolean(filterCategory || filterSubcategory)

  const [products, setProducts] = useState<AdminProduct[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AdminProduct | null>(null)
  const [importDraft, setImportDraft] = useState<AmazonProductImportDraft | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [databaseProducts, setDatabaseProducts] = useState(true)

  const refresh = useCallback(async () => {
    const k = adminKey.trim()
    if (!k || !unlocked) return
    setBusy(true)
    setError(null)
    try {
      const { products: list, meta } = await fetchAdminCatalogProducts(k)
      setProducts(list)
      setDatabaseProducts(meta.databaseProducts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }, [adminKey, unlocked])

  useEffect(() => {
    if (unlocked) void refresh()
  }, [unlocked, refresh])

  const productSource = (p: AdminProduct): AdminProductSource => p.source ?? 'database'

  const filteredProducts = useMemo(() => {
    let list = products
    if (filterCategory) list = list.filter((p) => p.category === filterCategory)
    if (filterSubcategory) list = list.filter((p) => p.subcategoryId === filterSubcategory)
    return list
  }, [products, filterCategory, filterSubcategory])

  const clearCategoryFilter = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const filterSummary = useMemo(() => {
    if (!filterActive) return ''
    const parts: string[] = []
    if (filterCategory) parts.push(`category ${filterCategory}`)
    if (filterSubcategory) {
      const label = products.find((p) => p.subcategoryId === filterSubcategory)?.subcategoryLabel
      parts.push(label ? `sub “${label}”` : `subcategory ${filterSubcategory}`)
    }
    return parts.join(' · ')
  }, [filterActive, filterCategory, filterSubcategory, products])

  const toggleActive = async (p: AdminProduct) => {
    const k = adminKey.trim()
    if (!k) return
    if (productSource(p) === 'legacy_file') return
    setBusy(true)
    setError(null)
    try {
      await adminPatchProduct(k, p.id, { isActive: !p.isActive }, 'database')
      invalidatePublicProductsCache()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const IMPORT_ERROR_HINT: Record<string, string> = {
    url_required: 'Paste an Amazon product link first.',
    invalid_url: 'That link is not valid.',
    not_amazon_url: 'Use an Amazon product URL (any Amazon domain).',
    asin_not_found: 'We could not find a product ID (ASIN) in that link.',
    import_failed: 'Import failed. Try again or add the product manually.',
  }

  const runAmazonImport = async () => {
    const k = adminKey.trim()
    if (!k || !databaseProducts) return
    const url = importUrl.trim()
    if (!url) {
      setError(IMPORT_ERROR_HINT.url_required)
      return
    }
    setImportBusy(true)
    setError(null)
    try {
      const draft = await adminImportProductFromUrl(k, url)
      setImportDraft(draft)
      setEditing(null)
      setModalOpen(true)
      setImportUrl('')
    } catch (e) {
      const code = e instanceof Error ? e.message : 'import_failed'
      setError(
        IMPORT_ERROR_HINT[code] ??
          "Couldn't import that link — you can still add a product with + Add product.",
      )
    } finally {
      setImportBusy(false)
    }
  }

  const remove = async (p: AdminProduct) => {
    const k = adminKey.trim()
    if (!k) return
    if (!window.confirm(`Delete “${p.title}”?`)) return
    setBusy(true)
    setError(null)
    try {
      await adminDeleteProduct(k, p.id, productSource(p))
      invalidatePublicProductsCache()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  if (!unlocked) {
    return (
      <AdminUnlockPanel
        title="Products"
        description="Enter your store admin key once — it stays active while you use Dashboard, Categories, AI, and other admin pages in this tab."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-stretch">
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="Paste Amazon product link"
              disabled={!databaseProducts || importBusy}
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void runAmazonImport()
                }
              }}
            />
            <button
              type="button"
              disabled={!databaseProducts || importBusy}
              className="shrink-0 rounded-xl border border-amber-300 bg-amber-400 px-4 py-2.5 text-[13px] font-bold text-amber-950 disabled:opacity-40"
              onClick={() => void runAmazonImport()}
            >
              {importBusy ? 'Importing…' : 'Import product'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] font-bold text-zinc-800"
              onClick={() => void refresh()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-[14px] font-bold text-white"
              onClick={() => {
                setImportDraft(null)
                setEditing(null)
                setModalOpen(true)
              }}
            >
              + Add product
            </button>
          </div>
        </div>
      </div>
      {!databaseProducts ? (
        <p className="text-[13px] leading-snug text-amber-900/90">
          No <span className="font-mono text-[12px]">DATABASE_URL</span> — new products save to file overrides and appear
          here with Postgres rows when both are configured.
        </p>
      ) : null}
      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}
      {filterActive ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[12px] font-semibold text-violet-900">
            <span>Filter: {filterSummary}</span>
            <button
              type="button"
              className="rounded-full bg-violet-200/80 px-2 py-0.5 text-[11px] font-bold text-violet-950 hover:bg-violet-200"
              onClick={clearCategoryFilter}
            >
              Clear filter
            </button>
          </span>
        </div>
      ) : null}
      {busy && products.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="aspect-square animate-pulse bg-zinc-100" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-[75%] animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 && filterActive ? (
        <p className="text-[14px] text-zinc-600">
          No products match this filter.{' '}
          <button type="button" className="font-bold text-violet-700 underline" onClick={clearCategoryFilter}>
            Clear filter
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((p) => (
            <article
              key={p.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-900/5"
            >
              <div className="relative aspect-square bg-zinc-100">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-zinc-400">
                    No image
                  </div>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
                <h2 className="line-clamp-2 text-[13px] font-bold leading-snug text-zinc-900">{p.title}</h2>
                <p className="text-[12px] font-semibold text-zinc-600">{formatAud(p.price)}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex w-fit rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                    {p.category}
                  </span>
                  {p.source === 'legacy_file' ? (
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900">
                      File
                    </span>
                  ) : null}
                </div>
                <label className="flex items-center gap-2 text-[12px] font-semibold">
                  <input
                    type="checkbox"
                    checked={p.isActive}
                    disabled={busy || p.source === 'legacy_file'}
                    title={p.source === 'legacy_file' ? 'File-based rows are always merged as active' : undefined}
                    onChange={() => void toggleActive(p)}
                  />
                  Active
                </label>
                <div className="mt-auto flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-zinc-200 py-2 text-[12px] font-bold"
                    onClick={() => {
                      setImportDraft(null)
                      setEditing(p)
                      setModalOpen(true)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-2 py-2 text-[12px] font-bold text-red-700"
                    onClick={() => void remove(p)}
                  >
                    Del
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ProductFormModal
        open={modalOpen}
        adminKey={adminKey}
        databaseProducts={databaseProducts}
        initial={editing}
        importDraft={importDraft}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
          setImportDraft(null)
        }}
        onSaved={() => {
          invalidatePublicProductsCache()
          void refresh()
        }}
      />
    </div>
  )
}
