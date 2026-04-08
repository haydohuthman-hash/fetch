import { getFetchApiBaseUrl } from './fetchApiBase'
import { MARKETPLACE_SUPPLY_CATEGORY_IDS } from './suppliesCatalog'

export type StorePublicSubcategory = {
  id: string
  category_id: string
  slug: string
  label: string
  sort_order: number
  short_description?: string
  keywords?: string[]
  hero_image_url?: string
}

export type StorePublicCategory = {
  id: string
  label: string
  sort_order: number
  short_description?: string
  keywords?: string[]
  hero_image_url?: string
  subcategories: StorePublicSubcategory[]
}

const FALLBACK_LABELS: Record<string, string> = {
  drinks: 'Drinks',
  cleaning: 'Cleaning supplies',
  packing: 'Moving supplies',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  livingRoom: 'Living room',
  laundry: 'Laundry',
  storage: 'Storage',
}

/** Used as initial UI state before the public categories request resolves. */
export function getStaticFallbackStoreCategories(): StorePublicCategory[] {
  return MARKETPLACE_SUPPLY_CATEGORY_IDS.map((id, i) => ({
    id,
    label: FALLBACK_LABELS[id] ?? id,
    sort_order: i,
    subcategories: [],
  }))
}

function staticFallbackCategories(): StorePublicCategory[] {
  return getStaticFallbackStoreCategories()
}

export async function fetchPublicStoreCategories(): Promise<{
  categories: StorePublicCategory[]
  source: 'database' | 'none'
}> {
  try {
    const res = await fetch(`${getFetchApiBaseUrl()}/api/store/categories`, { credentials: 'include' })
    const j = (await res.json()) as { categories?: StorePublicCategory[]; meta?: { source?: string } }
    const list = Array.isArray(j.categories) ? j.categories : []
    if (list.length > 0) {
      return { categories: list, source: 'database' }
    }
  } catch {
    /* use fallback */
  }
  return { categories: staticFallbackCategories(), source: 'none' }
}
