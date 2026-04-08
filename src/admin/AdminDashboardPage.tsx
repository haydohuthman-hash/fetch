import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  ComposedChart,
  Bar,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchAdminCategoryTree, type AdminStoreCategoryRow, type AdminStoreSubcategoryRow } from '../lib/adminCategoriesApi'
import { fetchAdminAnalyticsOverview, type AdminAnalyticsOverview } from '../lib/adminAnalyticsApi'
import {
  fetchAdminCatalogProducts,
  type AdminCatalogMeta,
  type AdminProduct,
} from '../lib/adminProductsApi'
import { AdminUnlockPanel, useAdminAuth } from './AdminAuthContext'

function formatAud(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

type CategoryTreeState = {
  categories: AdminStoreCategoryRow[]
  subcategories: AdminStoreSubcategoryRow[]
}

export function AdminDashboardPage() {
  const { adminKey, unlocked } = useAdminAuth()
  const [overview, setOverview] = useState<AdminAnalyticsOverview | null>(null)
  const [catalogProducts, setCatalogProducts] = useState<AdminProduct[]>([])
  const [catalogMeta, setCatalogMeta] = useState<AdminCatalogMeta | null>(null)
  const [categoryTree, setCategoryTree] = useState<CategoryTreeState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const k = adminKey.trim()
    if (!k || !unlocked) return
    setBusy(true)
    setError(null)
    setCatalogError(null)
    try {
      const [rOverview, rCatalog, rTree] = await Promise.allSettled([
        fetchAdminAnalyticsOverview(k, 30),
        fetchAdminCatalogProducts(k),
        fetchAdminCategoryTree(k),
      ])

      if (rOverview.status === 'fulfilled') {
        setOverview(rOverview.value)
      } else {
        setOverview(null)
        setError(rOverview.reason instanceof Error ? rOverview.reason.message : 'Analytics failed')
      }

      if (rCatalog.status === 'fulfilled') {
        setCatalogProducts(rCatalog.value.products)
        setCatalogMeta(rCatalog.value.meta)
      } else {
        setCatalogProducts([])
        setCatalogMeta(null)
        setCatalogError(
          rCatalog.reason instanceof Error ? rCatalog.reason.message : 'Could not load catalog products',
        )
      }

      if (rTree.status === 'fulfilled') {
        setCategoryTree({
          categories: rTree.value.categories ?? [],
          subcategories: rTree.value.subcategories ?? [],
        })
      } else {
        setCategoryTree(null)
      }
    } finally {
      setBusy(false)
    }
  }, [adminKey, unlocked])

  useEffect(() => {
    if (unlocked) void load()
  }, [unlocked, load])

  const chartRows = useMemo(() => {
    if (!overview) return []
    const map = new Map<string, { day: string; revenueAud: number; visitors: number }>()
    for (const e of overview.earningsByDay) {
      map.set(e.day, { day: e.day, revenueAud: e.revenueAud, visitors: 0 })
    }
    for (const v of overview.visitorsByDay) {
      const cur = map.get(v.day) ?? { day: v.day, revenueAud: 0, visitors: 0 }
      cur.visitors = v.visitors
      map.set(v.day, cur)
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
  }, [overview])

  const sortedCategories = useMemo(() => {
    if (!categoryTree?.categories.length) return []
    return [...categoryTree.categories].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
  }, [categoryTree])

  const subsByCategoryId = useMemo(() => {
    const m = new Map<string, AdminStoreSubcategoryRow[]>()
    if (!categoryTree) return m
    for (const s of categoryTree.subcategories) {
      const list = m.get(s.category_id) ?? []
      list.push(s)
      m.set(s.category_id, list)
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    }
    return m
  }, [categoryTree])

  const productsSorted = useMemo(() => {
    return [...catalogProducts].sort((a, b) => {
      const c = a.category.localeCompare(b.category)
      if (c !== 0) return c
      return a.title.localeCompare(b.title)
    })
  }, [catalogProducts])

  const categorySummaryFromProducts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of catalogProducts) {
      m.set(p.category, (m.get(p.category) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [catalogProducts])

  const activeProductCount = useMemo(
    () => catalogProducts.filter((p) => p.isActive).length,
    [catalogProducts],
  )

  if (!unlocked) {
    return (
      <AdminUnlockPanel
        title="Dashboard"
        description="Enter your store admin key once — it applies to all admin sections until you sign out from the sidebar."
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-[14px] text-zinc-600">
            Live view of what buyers see in Fetch Shop, plus revenue and visitor trends.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] font-semibold text-zinc-800"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}
      {catalogError ? <p className="text-[14px] text-amber-800">{catalogError}</p> : null}

      <section className="space-y-3" aria-labelledby="dash-catalog-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dash-catalog-heading" className="text-lg font-bold tracking-tight text-zinc-900">
            Categories in the app
          </h2>
          <p className="text-[12px] text-zinc-500">
            {categoryTree
              ? 'Postgres store categories and subcategories (same IDs as the shop).'
              : 'Database categories unavailable — counts below are from the merged product list only.'}
          </p>
        </div>
        {sortedCategories.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedCategories.map((c) => {
              const subs = subsByCategoryId.get(c.id) ?? []
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-900/[0.03]"
                >
                  <p className="text-[15px] font-bold text-zinc-900">{c.label}</p>
                  <p className="text-[11px] font-mono text-zinc-400">{c.id}</p>
                  <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2">
                    {subs.length === 0 ? (
                      <li className="text-[12px] text-zinc-500">No subcategories</li>
                    ) : (
                      subs.map((s) => (
                        <li key={s.id} className="flex justify-between gap-2 text-[13px] text-zinc-700">
                          <span className="min-w-0 truncate font-medium">{s.label}</span>
                          <span className="shrink-0 tabular-nums text-zinc-500">{s.product_count} items</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4">
            <p className="text-[13px] font-semibold text-zinc-700">Product rows by category (merged catalog)</p>
            {categorySummaryFromProducts.length === 0 ? (
              <p className="mt-1 text-[12px] text-zinc-500">No products loaded yet.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {categorySummaryFromProducts.map(([id, n]) => (
                  <li
                    key={id}
                    className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-zinc-800 ring-1 ring-zinc-200"
                  >
                    {id}{' '}
                    <span className="tabular-nums text-zinc-500">({n})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="dash-products-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dash-products-heading" className="text-lg font-bold tracking-tight text-zinc-900">
            All products in the app
          </h2>
          <p className="text-[12px] text-zinc-500">
            Merged catalog (static + file overrides + database when configured).{' '}
            <span className="tabular-nums">
              {catalogProducts.length} rows · {activeProductCount} active
            </span>
            {catalogMeta ? (
              <>
                {' '}
                · DB layer {catalogMeta.databaseProducts ? 'on' : 'off'}
              </>
            ) : null}
          </p>
        </div>
        {productsSorted.length === 0 ? (
          <p className="text-[14px] text-zinc-500">{busy ? 'Loading catalog…' : 'No products in merged catalog.'}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Subcategory</th>
                  <th className="px-3 py-2.5">Tags</th>
                  <th className="px-3 py-2.5">Price</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Source</th>
                </tr>
              </thead>
              <tbody>
                {productsSorted.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-semibold text-zinc-900">{p.title}</p>
                          <p className="text-[11px] font-mono text-zinc-400">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-zinc-700">{p.category}</td>
                    <td className="px-3 py-2.5 text-zinc-600">{p.subcategoryLabel ?? '—'}</td>
                    <td className="max-w-[140px] px-3 py-2.5 text-[11px] leading-snug text-zinc-600">
                      {p.tags?.length ? p.tags.join(', ') : '—'}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-zinc-900">{formatAud(p.price)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          p.isActive ? 'font-semibold text-emerald-700' : 'font-semibold text-zinc-400 line-through'
                        }
                      >
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {p.source === 'legacy_file' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                          File
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600">
                          Database
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="dash-analytics-heading">
        <h2 id="dash-analytics-heading" className="text-lg font-bold tracking-tight text-zinc-900">
          Analytics
        </h2>
        <p className="text-[13px] text-zinc-600">Shop revenue from paid orders and visitor pings (last 30 days).</p>
      </section>

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Live visitors</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{overview.liveVisitors}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">Distinct sessions, last 5 minutes</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Revenue (window)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
              {formatAud(overview.totals.revenueAud)}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{overview.rangeDays}d paid orders (sample)</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Paid orders</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{overview.totals.paidOrders}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">In persisted store orders file</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Avg order</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
              {formatAud(overview.totals.avgOrderAud)}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">Mean subtotal (paid)</p>
          </div>
        </div>
      ) : !error ? (
        <p className="text-[14px] text-zinc-500">{busy ? 'Loading analytics…' : 'No analytics data yet.'}</p>
      ) : null}

      {chartRows.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-[15px] font-bold text-zinc-900">Earnings and visitors by day</h2>
          <p className="mb-3 text-[12px] text-zinc-500">Bars: revenue (AUD). Line: distinct visitors.</p>
          <div className="h-[280px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#71717a" />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#71717a" width={40} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#71717a" width={36} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 12 }}
                  formatter={(value, name) => {
                    const n = typeof value === 'number' ? value : Number(value)
                    if (name === 'revenueAud') return [formatAud(Number.isFinite(n) ? n : 0), 'Revenue']
                    return [Number.isFinite(n) ? n : 0, 'Visitors']
                  }}
                />
                <Bar yAxisId="left" dataKey="revenueAud" fill="#18181b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="visitors"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <p className="text-[14px] text-zinc-600">
        Manage catalog in{' '}
        <Link to="/admin/products" className="font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-2">
          Products
        </Link>{' '}
        or{' '}
        <Link
          to="/admin/categories"
          className="font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-2"
        >
          Categories
        </Link>
        . Ask the{' '}
        <Link to="/admin/assistant" className="font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-2">
          AI assistant
        </Link>{' '}
        for summaries.
      </p>
    </div>
  )
}
