/**
 * Client API for Live Battles. Talks to Express server routes.
 * SSE subscription for real-time events during a battle.
 */

import { getFetchApiBaseUrl } from '../fetchApiBase'
import type {
  Battle,
  BattleBoostTier,
  BattleRealtimeEvent,
  BattleResult,
  BattleSellerStats,
  BattleSide,
} from './types'

const base = () => getFetchApiBaseUrl()

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  return body as T
}

export async function createBattleApi(mode: string, durationMs: number) {
  return json<{ ok: boolean; battle: Battle }>(`${base()}/api/battles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, durationMs }),
  })
}

export async function joinBattleApi(battleId: string, side: BattleSide, displayName: string, avatar: string, rating?: number) {
  return json<{ ok: boolean }>(`${base()}/api/battles/${battleId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, displayName, avatar, rating }),
  })
}

export async function startBattleApi(battleId: string) {
  return json<{ ok: boolean; battle: Battle }>(`${base()}/api/battles/${battleId}/start`, {
    method: 'POST',
  })
}

export async function sendBoostApi(battleId: string, side: BattleSide, tier: BattleBoostTier, viewerId: string, viewerName: string) {
  return json<{ ok: boolean; newScore: number }>(`${base()}/api/battles/${battleId}/boost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, tier, viewerId, viewerName }),
  })
}

export async function sendCommentApi(battleId: string, viewerId: string, viewerName: string, text: string) {
  return json<{ ok: boolean }>(`${base()}/api/battles/${battleId}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ viewerId, viewerName, text }),
  })
}

export async function addScoreApi(battleId: string, side: BattleSide, reason: 'sale' | 'bid', points?: number) {
  return json<{ ok: boolean; newScore: number }>(`${base()}/api/battles/${battleId}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, reason, points }),
  })
}

export async function endBattleApi(battleId: string) {
  return json<{ ok: boolean; result: BattleResult }>(`${base()}/api/battles/${battleId}/end`, {
    method: 'POST',
  })
}

export async function getBattleApi(battleId: string) {
  return json<{ ok: boolean; battle: Battle; participants: unknown[]; result: BattleResult | null }>(
    `${base()}/api/battles/${battleId}`,
  )
}

export async function listBattlesApi() {
  return json<{ ok: boolean; battles: Battle[] }>(`${base()}/api/battles`)
}

export async function getSellerStatsApi(sellerId: string) {
  return json<{ ok: boolean; stats: BattleSellerStats | null }>(
    `${base()}/api/battles/seller/${encodeURIComponent(sellerId)}/stats`,
  )
}

/**
 * SSE subscription for real-time battle events.
 * Returns a cleanup function.
 */
export function subscribeBattleStream(
  battleId: string,
  onEvent: (evt: BattleRealtimeEvent) => void,
): () => void {
  const url = `${base()}/api/battles/${battleId}/stream`
  let es: EventSource | null = null
  let reconnectTimer: number | null = null
  let closed = false

  function connect() {
    if (closed) return
    es = new EventSource(url, { withCredentials: true })

    es.addEventListener('battle', (e) => {
      try {
        const data = JSON.parse(e.data)
        onEvent(data)
      } catch {}
    })

    es.onerror = () => {
      es?.close()
      es = null
      if (!closed) {
        reconnectTimer = window.setTimeout(connect, 3000)
      }
    }
  }

  connect()

  return () => {
    closed = true
    es?.close()
    if (reconnectTimer != null) window.clearTimeout(reconnectTimer)
  }
}
