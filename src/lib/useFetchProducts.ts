import { useCallback, useEffect, useRef, useState } from 'react'
import { getFetchApiBaseUrl } from './fetchApiBase'
import type { MarketplacePublicProduct } from './publicProduct'

const TTL_MS = 60_000

type CacheEntry = { products: MarketplacePublicProduct[]; fetchedAt: number }

let memoryCache: CacheEntry | null = null

const INVALIDATE_EVENT = 'fetch-public-products-invalidate'

export function invalidatePublicProductsCache() {
  memoryCache = null
  try {
    sessionStorage.removeItem('fetch_public_products_cache_v1')
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(INVALIDATE_EVENT))
  }
}

function readSessionCache(): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem('fetch_public_products_cache_v1')
    if (!raw) return null
    const j = JSON.parse(raw) as CacheEntry
    if (!j || !Array.isArray(j.products) || typeof j.fetchedAt !== 'number') return null
    return j
  } catch {
    return null
  }
}

function writeSessionCache(entry: CacheEntry) {
  try {
    sessionStorage.setItem('fetch_public_products_cache_v1', JSON.stringify(entry))
  } catch {
    /* ignore */
  }
}

export type UseFetchProductsState = {
  loading: boolean
  error: string | null
  products: MarketplacePublicProduct[]
}

export function useFetchProducts() {
  const [state, setState] = useState<UseFetchProductsState>({
    loading: true,
    error: null,
    products: [],
  })
  const mounted = useRef(true)

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force)
    const now = Date.now()
    if (!force && memoryCache && now - memoryCache.fetchedAt < TTL_MS) {
      if (mounted.current) {
        setState({ loading: false, error: null, products: memoryCache.products })
      }
      return memoryCache.products
    }
    const sess = !force ? readSessionCache() : null
    if (sess && now - sess.fetchedAt < TTL_MS) {
      memoryCache = sess
      if (mounted.current) {
        setState({ loading: false, error: null, products: sess.products })
      }
      return sess.products
    }

    if (mounted.current) {
      setState((s) => ({ ...s, loading: true, error: null }))
    }

    try {
      const res = await fetch(`${getFetchApiBaseUrl()}/api/products?active=true`, {
        credentials: 'include',
      })
      const payload = (await res.json().catch(() => ({}))) as {
        products?: MarketplacePublicProduct[]
        error?: string
        detail?: string
      }

      if (res.status === 503) {
        const detail =
          typeof payload.detail === 'string' ? payload.detail : 'Products database is not configured.'
        if (mounted.current) {
          setState({ loading: false, error: detail, products: [] })
        }
        return []
      }

      if (!res.ok) {
        const msg =
          typeof payload.error === 'string'
            ? payload.error
            : `Request failed (${res.status})`
        if (mounted.current) {
          setState({ loading: false, error: msg, products: [] })
        }
        return []
      }

      const rawList = Array.isArray(payload.products) ? payload.products : []
      const products: MarketplacePublicProduct[] = rawList.map((raw) => {
        const p = raw as MarketplacePublicProduct & { tags?: unknown }
        const tags = Array.isArray(p.tags) ? p.tags.map((t) => String(t)) : undefined
        return {
          ...p,
          subcategoryId: p.subcategoryId != null ? String(p.subcategoryId) : null,
          subcategoryLabel: typeof p.subcategoryLabel === 'string' ? p.subcategoryLabel : null,
          ...(tags?.length ? { tags } : {}),
        }
      })
      const entry: CacheEntry = { products, fetchedAt: Date.now() }
      memoryCache = entry
      writeSessionCache(entry)
      if (mounted.current) {
        setState({ loading: false, error: null, products })
      }
      return products
    } catch {
      if (mounted.current) {
        setState({ loading: false, error: 'Network error', products: [] })
      }
      return []
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    queueMicrotask(() => void load())
    return () => {
      mounted.current = false
    }
  }, [load])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onInv = () => {
      void load({ force: true })
    }
    window.addEventListener(INVALIDATE_EVENT, onInv)
    return () => window.removeEventListener(INVALIDATE_EVENT, onInv)
  }, [load])

  const retry = useCallback(() => {
    invalidatePublicProductsCache()
    return load({ force: true })
  }, [load])

  return { ...state, load, retry }
}
