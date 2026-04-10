import { useCallback, useEffect, useState } from 'react'
import { getFetchApiBaseUrl } from '../fetchApiBase'
import { loadSession } from '../fetchUserSession'
import { isFetchDevDemoSession } from '../fetchDevDemo'
import type { DropReel } from './types'
import { buildDevDemoDropApiRows } from './devDemoDropsFeed'
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
          cache: 'no-store',
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
        let mapped = list.map((row) => mapApiDropToReel(row)).filter(Boolean) as DropReel[]
        const session = loadSession()
        if (session && isFetchDevDemoSession(session)) {
          const demoRows = buildDevDemoDropApiRows(session)
          const demoReels = demoRows
            .map((row) => mapApiDropToReel(row))
            .filter(Boolean) as DropReel[]
          const ids = new Set(mapped.map((r) => r.id))
          const extra = demoReels.filter((r) => !ids.has(r.id))
          mapped = [...extra, ...mapped]
        }
        setReels(mapped)
      } catch (e) {
        console.error('[drops/feed] request failed', e)
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
