import { getFetchApiBaseUrl } from './fetchApiBase'

export type AdminStoreCategoryRow = {
  id: string
  label: string
  sort_order: number
  is_active: boolean
  short_description?: string
  keywords?: string[]
  hero_image_url?: string
}

export type AdminStoreSubcategoryRow = {
  id: string
  category_id: string
  slug: string
  label: string
  sort_order: number
  is_active: boolean
  product_count: number
  short_description?: string
  keywords?: string[]
  hero_image_url?: string
}

async function adminJson<T>(adminKey: string, path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const response = await fetch(`${getFetchApiBaseUrl()}${path}`, {
    credentials: 'include',
    ...init,
    method,
    headers: {
      ...(method === 'GET' || method === 'HEAD' || method === 'DELETE' ? {} : { 'Content-Type': 'application/json' }),
      'X-Fetch-Store-Admin-Key': adminKey.trim(),
      ...(init?.headers ?? {}),
    },
  })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; detail?: string }
  if (!response.ok) {
    const error = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`
    const detail = typeof payload.detail === 'string' ? `: ${payload.detail}` : ''
    throw new Error(`${error}${detail}`)
  }
  return payload
}

export async function fetchAdminCategoryTree(
  adminKey: string,
): Promise<{ categories: AdminStoreCategoryRow[]; subcategories: AdminStoreSubcategoryRow[] }> {
  return adminJson(adminKey, '/api/admin/store/categories')
}

export async function adminCreateCategory(
  adminKey: string,
  body: { id: string; label: string; sortOrder?: number },
): Promise<AdminStoreCategoryRow> {
  const payload = await adminJson<{ category: AdminStoreCategoryRow }>(
    adminKey,
    '/api/admin/store/categories',
    {
      method: 'POST',
      body: JSON.stringify({
        id: body.id,
        label: body.label,
        sortOrder: body.sortOrder,
      }),
    },
  )
  return payload.category
}

export async function adminPatchCategory(
  adminKey: string,
  categoryId: string,
  patch: {
    label?: string
    sortOrder?: number
    isActive?: boolean
    shortDescription?: string
    keywords?: string[]
    heroImageUrl?: string
  },
): Promise<AdminStoreCategoryRow> {
  const payload = await adminJson<{ category: AdminStoreCategoryRow }>(
    adminKey,
    `/api/admin/store/categories/${encodeURIComponent(categoryId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        label: patch.label,
        sortOrder: patch.sortOrder,
        isActive: patch.isActive,
        shortDescription: patch.shortDescription,
        keywords: patch.keywords,
        heroImageUrl: patch.heroImageUrl,
      }),
    },
  )
  return payload.category
}

export async function adminCreateSubcategory(
  adminKey: string,
  body: { categoryId: string; slug: string; label: string; sortOrder?: number },
): Promise<AdminStoreSubcategoryRow> {
  const payload = await adminJson<{ subcategory: AdminStoreSubcategoryRow }>(
    adminKey,
    '/api/admin/store/subcategories',
    {
      method: 'POST',
      body: JSON.stringify({
        categoryId: body.categoryId,
        slug: body.slug,
        label: body.label,
        sortOrder: body.sortOrder,
      }),
    },
  )
  return payload.subcategory
}

export async function adminPatchSubcategory(
  adminKey: string,
  id: string,
  patch: {
    label?: string
    slug?: string
    sortOrder?: number
    isActive?: boolean
    shortDescription?: string
    keywords?: string[]
    heroImageUrl?: string
  },
): Promise<AdminStoreSubcategoryRow> {
  const payload = await adminJson<{ subcategory: AdminStoreSubcategoryRow }>(
    adminKey,
    `/api/admin/store/subcategories/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        label: patch.label,
        slug: patch.slug,
        sortOrder: patch.sortOrder,
        isActive: patch.isActive,
        shortDescription: patch.shortDescription,
        keywords: patch.keywords,
        heroImageUrl: patch.heroImageUrl,
      }),
    },
  )
  return payload.subcategory
}

export async function adminDeleteSubcategory(adminKey: string, id: string): Promise<void> {
  await adminJson(adminKey, `/api/admin/store/subcategories/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
