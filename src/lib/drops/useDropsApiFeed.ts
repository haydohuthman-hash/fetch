import { useCallback, useEffect, useState } from 'react'
import { getFetchApiBaseUrl } from '../fetchApiBase'
import type { DropReel } from './types'
import { mapApiDropToReel } from './mapApiReel'

export type UseDropsApiFeedState = {
  loading: boolean
  error: string | null
  reels: DropReel[]
  database: boolean
  refresh: () => void
}

export function useDropsApiFeed(): UseDropsApiFeedState {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reels, setReels] = useState<DropReel[]>([])
  const [database, setDatabase] = useState(false)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(`${getFetchApiBaseUrl()}/api/drops/feed?limit=48&rank=1`, {
          credentials: 'include',
        })
        const payload = (await res.json().catch(() => ({}))) as {
          drops?: Record<string, unknown>[]
          database?: boolean
          error?: string
        }
        if (cancelled) return
        setDatabase(Boolean(payload.database))
        if (!res.ok) {
          setReels([])
          setError(typeof payload.error === 'string' ? payload.error : 'drops_feed_failed')
          return
        }
        const list = Array.isArray(payload.drops) ? payload.drops : []
        const mapped = list.map((row) => mapApiDropToReel(row)).filter(Boolean) as DropReel[]
        setReels(mapped)
      } catch {
        if (!cancelled) {
          setReels([])
          setError('network_error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tick])

  return { loading, error, reels, database, refresh }
}
