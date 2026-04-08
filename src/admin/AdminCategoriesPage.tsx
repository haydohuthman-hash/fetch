import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminCreateCategory,
  adminCreateSubcategory,
  adminDeleteSubcategory,
  adminPatchCategory,
  adminPatchSubcategory,
  fetchAdminCategoryTree,
  type AdminStoreCategoryRow,
  type AdminStoreSubcategoryRow,
} from '../lib/adminCategoriesApi'
import { fetchAdminCatalogProducts, type AdminProduct } from '../lib/adminProductsApi'
import { AdminHeroImageField } from './AdminHeroImageField'
import { AdminUnlockPanel, useAdminAuth } from './AdminAuthContext'

function formatAud(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function keywordsToInput(kw: string[] | undefined): string {
  return Array.isArray(kw) ? kw.join(', ') : ''
}

function parseKeywordsInput(raw: string): string[] {
  return raw
    .split(/[,]+/)
    .map((s) => s.trim().slice(0, 64))
    .filter(Boolean)
    .slice(0, 32)
}

export function AdminCategoriesPage() {
  const { adminKey, unlocked } = useAdminAuth()
  const [categories, setCategories] = useState<AdminStoreCategoryRow[]>([])
  const [subcategories, setSubcategories] = useState<AdminStoreSubcategoryRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [categoryEditOpen, setCategoryEditOpen] = useState<Record<string, boolean>>({})
  const [subEditOpen, setSubEditOpen] = useState<Record<string, boolean>>({})
  const [catalogProducts, setCatalogProducts] = useState<AdminProduct[]>([])
  const [productsCatOpen, setProductsCatOpen] = useState<Record<string, boolean>>({})
  const [productsSubOpen, setProductsSubOpen] = useState<Record<string, boolean>>({})
  const [newSlug, setNewSlug] = useState<Record<string, string>>({})
  const [newLabel, setNewLabel] = useState<Record<string, string>>({})
  const [newTopId, setNewTopId] = useState('')
  const [newTopLabel, setNewTopLabel] = useState('')
  const [newTopSort, setNewTopSort] = useState('0')
  const [catDraft, setCatDraft] = useState<
    Record<
      string,
      {
        displayLabel: string
        sortOrder: string
        shortDescription: string
        keywords: string
        heroImageUrl: string
      }
    >
  >({})
  const [subDraft, setSubDraft] = useState<
    Record<
      string,
      {
        displayLabel: string
        sortOrder: string
        shortDescription: string
        keywords: string
        heroImageUrl: string
      }
    >
  >({})

  const refresh = useCallback(async () => {
    const k = adminKey.trim()
    if (!k || !unlocked) return
    setBusy(true)
    setError(null)
    try {
      const [tree, catalog] = await Promise.all([fetchAdminCategoryTree(k), fetchAdminCatalogProducts(k)])
      setCategories(tree.categories ?? [])
      setSubcategories(tree.subcategories ?? [])
      setCatalogProducts(catalog.products ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }, [adminKey, unlocked])

  useEffect(() => {
    if (unlocked) void refresh()
  }, [unlocked, refresh])

  const subsByCategory = useMemo(() => {
    const m = new Map<string, AdminStoreSubcategoryRow[]>()
    for (const s of subcategories) {
      const list = m.get(s.category_id) ?? []
      list.push(s)
      m.set(s.category_id, list)
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    }
    return m
  }, [subcategories])

  const catDefaults = (c: AdminStoreCategoryRow) => ({
    displayLabel: c.label,
    sortOrder: String(c.sort_order),
    shortDescription: c.short_description ?? '',
    keywords: keywordsToInput(c.keywords),
    heroImageUrl: c.hero_image_url ?? '',
  })

  const subDefaults = (s: AdminStoreSubcategoryRow) => ({
    displayLabel: s.label,
    sortOrder: String(s.sort_order),
    shortDescription: s.short_description ?? '',
    keywords: keywordsToInput(s.keywords),
    heroImageUrl: s.hero_image_url ?? '',
  })

  const productsForCategory = useCallback(
    (categoryId: string) => catalogProducts.filter((p) => p.category === categoryId),
    [catalogProducts],
  )

  const productsForSub = useCallback(
    (categoryId: string, subId: string) =>
      catalogProducts.filter((p) => p.category === categoryId && p.subcategoryId === subId),
    [catalogProducts],
  )

  const addTopCategory = async () => {
    const k = adminKey.trim()
    const id = newTopId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
    const label = newTopLabel.trim()
    const sortOrder = Math.round(Number(newTopSort))
    if (!k || !id || !label) return
    setBusy(true)
    setError(null)
    try {
      await adminCreateCategory(k, {
        id,
        label,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      })
      setNewTopId('')
      setNewTopLabel('')
      setNewTopSort('0')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const saveCategoryMeta = async (c: AdminStoreCategoryRow) => {
    const k = adminKey.trim()
    const d = catDraft[c.id] ?? catDefaults(c)
    if (!k) return
    setBusy(true)
    setError(null)
    try {
      const sortOrder = Math.round(Number(d.sortOrder))
      await adminPatchCategory(k, c.id, {
        label: d.displayLabel.trim() || c.label,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : c.sort_order,
        shortDescription: d.shortDescription,
        keywords: parseKeywordsInput(d.keywords),
        heroImageUrl: d.heroImageUrl,
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const toggleCategoryActive = async (c: AdminStoreCategoryRow, isActive: boolean) => {
    const k = adminKey.trim()
    if (!k) return
    setBusy(true)
    setError(null)
    try {
      await adminPatchCategory(k, c.id, { isActive })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const saveSubMeta = async (s: AdminStoreSubcategoryRow) => {
    const k = adminKey.trim()
    const d = subDraft[s.id] ?? subDefaults(s)
    if (!k) return
    setBusy(true)
    setError(null)
    try {
      const sortOrder = Math.round(Number(d.sortOrder))
      await adminPatchSubcategory(k, s.id, {
        label: d.displayLabel.trim() || s.label,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : s.sort_order,
        shortDescription: d.shortDescription,
        keywords: parseKeywordsInput(d.keywords),
        heroImageUrl: d.heroImageUrl,
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const addSub = async (categoryId: string) => {
    const k = adminKey.trim()
    const slug = (newSlug[categoryId] ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    const label = (newLabel[categoryId] ?? '').trim()
    if (!k || !slug || !label) return
    setBusy(true)
    setError(null)
    try {
      await adminCreateSubcategory(k, { categoryId, slug, label })
      setNewSlug((p) => ({ ...p, [categoryId]: '' }))
      setNewLabel((p) => ({ ...p, [categoryId]: '' }))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const removeSub = async (id: string) => {
    const k = adminKey.trim()
    if (!k || !window.confirm('Delete this subcategory? Products using it must be reassigned first.')) return
    setBusy(true)
    setError(null)
    try {
      await adminDeleteSubcategory(k, id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
    [categories],
  )

  if (!unlocked) {
    return (
      <AdminUnlockPanel
        title="Categories"
        description="Same admin key as Dashboard and Products — unlock once per browser tab."
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-[14px] text-zinc-600">
            Top-level shop categories and subcategories (product grouping and carousels). Slug is permanent after
            create.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] font-semibold text-zinc-800"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Add category</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          URL-safe id (e.g. <span className="font-mono">pet-supplies</span>). A &quot;General&quot; subcategory is
          created automatically.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[100px] flex-1">
            <span className="text-[11px] font-semibold text-zinc-500">Slug id</span>
            <input
              className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-[13px]"
              placeholder="pet-supplies"
              value={newTopId}
              onChange={(e) => setNewTopId(e.target.value)}
            />
          </label>
          <label className="min-w-[120px] flex-1">
            <span className="text-[11px] font-semibold text-zinc-500">Display label</span>
            <input
              className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
              placeholder="Pet supplies"
              value={newTopLabel}
              onChange={(e) => setNewTopLabel(e.target.value)}
            />
          </label>
          <label className="w-20">
            <span className="text-[11px] font-semibold text-zinc-500">Sort</span>
            <input
              type="number"
              className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
              value={newTopSort}
              onChange={(e) => setNewTopSort(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
            onClick={() => void addTopCategory()}
          >
            Create
          </button>
        </div>
      </div>

      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}
      <ul className="space-y-2">
        {sortedCategories.map((c) => {
          const open = expanded[c.id] ?? true
          const subs = subsByCategory.get(c.id) ?? []
          const editExpanded = categoryEditOpen[c.id] ?? false
          const catProds = productsForCategory(c.id)
          const catProductsExpanded = productsCatOpen[c.id] ?? false
          const heroUrl = (c.hero_image_url ?? '').trim()
          return (
            <li key={c.id} className="rounded-xl border border-zinc-200 bg-white">
              <div className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                  onClick={() => setExpanded((p) => ({ ...p, [c.id]: !open }))}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {heroUrl ? (
                      <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
                        <img
                          src={heroUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      </span>
                    ) : null}
                    <span className="text-[16px] font-bold text-zinc-900">
                      {c.label}
                      {!c.is_active ? (
                        <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                          Inactive
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="text-[12px] font-semibold text-zinc-500">{open ? '▼' : '▶'}</span>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {c.is_active ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-bold text-zinc-600"
                      onClick={() => void toggleCategoryActive(c, false)}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white"
                      onClick={() => void toggleCategoryActive(c, true)}
                    >
                      Reactivate
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-bold text-violet-800"
                    onClick={() => setCategoryEditOpen((p) => ({ ...p, [c.id]: !editExpanded }))}
                  >
                    {editExpanded ? 'Hide edit' : 'Edit category'}
                  </button>
                </div>
              </div>
              <p className="px-4 pb-2 font-mono text-[11px] text-zinc-400">{c.id}</p>
              {editExpanded ? (
                <div className="space-y-2 border-t border-zinc-100 px-4 py-3">
                  {(() => {
                    const d = catDraft[c.id] ?? catDefaults(c)
                    return (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <label className="min-w-[140px] flex-1">
                            <span className="text-[11px] font-semibold text-zinc-500">Display label</span>
                            <input
                              className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
                              value={d.displayLabel}
                              onChange={(e) =>
                                setCatDraft((p) => ({
                                  ...p,
                                  [c.id]: { ...(p[c.id] ?? catDefaults(c)), displayLabel: e.target.value },
                                }))
                              }
                            />
                          </label>
                          <label className="w-24">
                            <span className="text-[11px] font-semibold text-zinc-500">Sort order</span>
                            <input
                              type="number"
                              className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
                              value={d.sortOrder}
                              onChange={(e) =>
                                setCatDraft((p) => ({
                                  ...p,
                                  [c.id]: { ...(p[c.id] ?? catDefaults(c)), sortOrder: e.target.value },
                                }))
                              }
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-[11px] font-semibold text-zinc-500">Short description (shop card)</span>
                          <textarea
                            className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
                            rows={2}
                            value={d.shortDescription}
                            onChange={(e) =>
                              setCatDraft((p) => ({
                                ...p,
                                [c.id]: { ...(p[c.id] ?? catDefaults(c)), shortDescription: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-semibold text-zinc-500">Keywords (comma-separated)</span>
                          <input
                            className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
                            value={d.keywords}
                            onChange={(e) =>
                              setCatDraft((p) => ({
                                ...p,
                                [c.id]: { ...(p[c.id] ?? catDefaults(c)), keywords: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <AdminHeroImageField
                          label="Hero image"
                          value={d.heroImageUrl}
                          onChange={(next) =>
                            setCatDraft((p) => ({
                              ...p,
                              [c.id]: { ...(p[c.id] ?? catDefaults(c)), heroImageUrl: next },
                            }))
                          }
                          adminKey={adminKey}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-bold text-white"
                          onClick={() => void saveCategoryMeta(c)}
                        >
                          Save category
                        </button>
                      </>
                    )
                  })()}
                </div>
              ) : null}
              {open ? (
                <div className="border-t border-zinc-100 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                      Products in this category
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-semibold text-zinc-600">{catProds.length} listed</span>
                      <Link
                        to={`/admin/products?category=${encodeURIComponent(c.id)}`}
                        className="text-[12px] font-bold text-violet-700 underline decoration-violet-300 underline-offset-2"
                      >
                        View all in Products
                      </Link>
                      <button
                        type="button"
                        className="text-[11px] font-bold text-zinc-500"
                        onClick={() => setProductsCatOpen((p) => ({ ...p, [c.id]: !catProductsExpanded }))}
                      >
                        {catProductsExpanded ? 'Hide list' : 'Show list'}
                      </button>
                    </div>
                  </div>
                  {catProductsExpanded ? (
                    <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
                      {catProds.length === 0 ? (
                        <li className="px-2 py-3 text-[12px] text-zinc-500">No products in catalog for this category.</li>
                      ) : (
                        catProds.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center gap-2 rounded-md border border-zinc-100 bg-zinc-50/80 px-2 py-1.5"
                          >
                            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-zinc-200">
                              {p.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-zinc-900">
                              {p.title}
                            </span>
                            <span className="shrink-0 text-[11px] font-bold text-zinc-600">{formatAud(p.price)}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}

                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Subcategories</p>
                  <ul className="mt-2 space-y-1.5">
                    {subs.map((s) => {
                      const subEdit = subEditOpen[s.id] ?? false
                      const subProds = productsForSub(c.id, s.id)
                      const subListOpen = productsSubOpen[s.id] ?? false
                      return (
                        <li key={s.id} className="rounded-lg bg-zinc-50 px-3 py-2 text-[14px]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <span className="font-semibold text-zinc-900">{s.label}</span>
                              <span className="ml-2 text-zinc-500">({s.slug})</span>
                              <span className="ml-2 text-[12px] text-zinc-400">{s.product_count} products</span>
                            </span>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Link
                                to={`/admin/products?category=${encodeURIComponent(c.id)}&subcategory=${encodeURIComponent(s.id)}`}
                                className="text-[11px] font-bold text-violet-700 underline decoration-violet-300 underline-offset-2"
                              >
                                Products
                              </Link>
                              <button
                                type="button"
                                className="text-[11px] font-bold text-zinc-600"
                                onClick={() => setProductsSubOpen((p) => ({ ...p, [s.id]: !subListOpen }))}
                              >
                                {subListOpen ? 'Hide list' : 'Show list'}
                              </button>
                              <button
                                type="button"
                                className="text-[11px] font-bold text-violet-700"
                                onClick={() => setSubEditOpen((p) => ({ ...p, [s.id]: !subEdit }))}
                              >
                                {subEdit ? 'Hide edit' : 'Edit subcategory'}
                              </button>
                              {s.slug !== 'general' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="text-[12px] font-bold text-red-600"
                                  onClick={() => void removeSub(s.id)}
                                >
                                  Delete
                                </button>
                              ) : (
                                <span className="text-[11px] text-zinc-400">Required</span>
                              )}
                            </div>
                          </div>
                          {subListOpen ? (
                            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-zinc-200 bg-white p-1.5">
                              {subProds.length === 0 ? (
                                <li className="px-2 py-2 text-[11px] text-zinc-500">No products in this subcategory.</li>
                              ) : (
                                subProds.map((p) => (
                                  <li
                                    key={p.id}
                                    className="flex items-center gap-2 rounded border border-zinc-100 px-1.5 py-1 text-[11px]"
                                  >
                                    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded bg-zinc-200">
                                      {p.imageUrl ? (
                                        <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                      ) : null}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-semibold text-zinc-800">{p.title}</span>
                                    <span className="shrink-0 font-bold text-zinc-600">{formatAud(p.price)}</span>
                                  </li>
                                ))
                              )}
                            </ul>
                          ) : null}
                          {subEdit ? (
                            <div className="mt-2 space-y-2 border-t border-zinc-200/80 pt-2">
                              {(() => {
                                const d = subDraft[s.id] ?? subDefaults(s)
                                return (
                                  <>
                                    <div className="flex flex-wrap gap-2">
                                      <label className="min-w-[120px] flex-1">
                                        <span className="text-[10px] font-semibold text-zinc-500">Display label</span>
                                        <input
                                          className="mt-0.5 w-full rounded border border-zinc-200 px-2 py-1 text-[12px]"
                                          value={d.displayLabel}
                                          onChange={(e) =>
                                            setSubDraft((p) => ({
                                              ...p,
                                              [s.id]: { ...(p[s.id] ?? subDefaults(s)), displayLabel: e.target.value },
                                            }))
                                          }
                                        />
                                      </label>
                                      <label className="w-20">
                                        <span className="text-[10px] font-semibold text-zinc-500">Sort</span>
                                        <input
                                          type="number"
                                          className="mt-0.5 w-full rounded border border-zinc-200 px-2 py-1 text-[12px]"
                                          value={d.sortOrder}
                                          onChange={(e) =>
                                            setSubDraft((p) => ({
                                              ...p,
                                              [s.id]: { ...(p[s.id] ?? subDefaults(s)), sortOrder: e.target.value },
                                            }))
                                          }
                                        />
                                      </label>
                                    </div>
                                    <label className="block">
                                      <span className="text-[10px] font-semibold text-zinc-500">Short description</span>
                                      <textarea
                                        className="mt-0.5 w-full rounded border border-zinc-200 px-2 py-1 text-[12px]"
                                        rows={2}
                                        value={d.shortDescription}
                                        onChange={(e) =>
                                          setSubDraft((p) => ({
                                            ...p,
                                            [s.id]: { ...(p[s.id] ?? subDefaults(s)), shortDescription: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-[10px] font-semibold text-zinc-500">Keywords</span>
                                      <input
                                        className="mt-0.5 w-full rounded border border-zinc-200 px-2 py-1 text-[12px]"
                                        value={d.keywords}
                                        onChange={(e) =>
                                          setSubDraft((p) => ({
                                            ...p,
                                            [s.id]: { ...(p[s.id] ?? subDefaults(s)), keywords: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>
                                    <AdminHeroImageField
                                      label="Hero image"
                                      value={d.heroImageUrl}
                                      onChange={(next) =>
                                        setSubDraft((p) => ({
                                          ...p,
                                          [s.id]: { ...(p[s.id] ?? subDefaults(s)), heroImageUrl: next },
                                        }))
                                      }
                                      adminKey={adminKey}
                                      disabled={busy}
                                      previewClassName="h-20 w-28"
                                    />
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-bold text-white"
                                      onClick={() => void saveSubMeta(s)}
                                    >
                                      Save subcategory
                                    </button>
                                  </>
                                )
                              })()}
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Add subcategory</p>
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
                    <label className="min-w-[120px] flex-1">
                      <span className="text-[11px] font-semibold text-zinc-500">Slug</span>
                      <input
                        className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
                        placeholder="e.g. energy-drinks"
                        value={newSlug[c.id] ?? ''}
                        onChange={(e) => setNewSlug((p) => ({ ...p, [c.id]: e.target.value }))}
                      />
                    </label>
                    <label className="min-w-[140px] flex-1">
                      <span className="text-[11px] font-semibold text-zinc-500">Title</span>
                      <input
                        className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
                        placeholder="Display name"
                        value={newLabel[c.id] ?? ''}
                        onChange={(e) => setNewLabel((p) => ({ ...p, [c.id]: e.target.value }))}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
                      onClick={() => void addSub(c.id)}
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
