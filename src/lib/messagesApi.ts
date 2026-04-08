import { useEffect, useRef } from 'react'
import { getFetchApiBaseUrl } from './fetchApiBase'
import { marketplaceActorHeaders } from './booking/marketplaceApiAuth'

export type MessageThreadKind = 'listing' | 'support'

export type MessageThreadSummary = {
  id: string
  kind: MessageThreadKind
  listingId: string | null
  lastMessagePreview: string
  lastMessageAt: number
  updatedAt: number
  unreadCount: number
  role: 'buyer' | 'seller' | null
}

export type PeerThreadMessage = {
  id: string
  threadId: string
  body: string
  createdAt: number
  messageType: 'user' | 'system'
  fromViewer: boolean
}

async function messagesJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getFetchApiBaseUrl()}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.method === 'GET' || init?.method === 'HEAD' ? {} : { 'Content-Type': 'application/json' }),
      ...marketplaceActorHeaders('customer'),
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

export async function fetchMessagesUnreadSummary(): Promise<{
  listing: number
  support: number
  total: number
}> {
  try {
    return await messagesJson<{ listing: number; support: number; total: number }>('/api/messages/unread-summary')
  } catch {
    return { listing: 0, support: 0, total: 0 }
  }
}

export async function fetchMessageThreads(kind?: MessageThreadKind): Promise<MessageThreadSummary[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  const payload = await messagesJson<{ threads: MessageThreadSummary[] }>(`/api/messages/threads${qs}`)
  return payload.threads ?? []
}

export async function createMessageThread(body: {
  kind: MessageThreadKind
  listingId?: string
}): Promise<{ thread: MessageThreadSummary; created: boolean }> {
  return messagesJson('/api/messages/threads', { method: 'POST', body: JSON.stringify(body) })
}

export async function fetchMessageThread(threadId: string): Promise<{
  thread: MessageThreadSummary
  messages: PeerThreadMessage[]
}> {
  return messagesJson(`/api/messages/threads/${encodeURIComponent(threadId)}`)
}

export async function fetchMessageThreadPage(
  threadId: string,
  params?: { cursor?: string; limit?: number },
): Promise<{ messages: PeerThreadMessage[]; nextCursor: string | null }> {
  const qs = new URLSearchParams()
  if (params?.cursor) qs.set('cursor', params.cursor)
  if (params?.limit != null && Number.isFinite(params.limit)) qs.set('limit', String(Math.floor(params.limit)))
  const suffix = qs.toString()
  return messagesJson(`/api/messages/threads/${encodeURIComponent(threadId)}/messages${suffix ? `?${suffix}` : ''}`)
}

export async function postThreadMessage(
  threadId: string,
  text: string,
  opts?: { template?: 'cash_pickup' },
): Promise<{ message: PeerThreadMessage; thread: MessageThreadSummary }> {
  const body: { text: string; template?: string } = { text }
  if (opts?.template === 'cash_pickup') body.template = 'cash_pickup'
  return messagesJson(`/api/messages/threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function markThreadRead(threadId: string): Promise<{ thread: MessageThreadSummary }> {
  return messagesJson(`/api/messages/threads/${encodeURIComponent(threadId)}/read`, { method: 'POST' })
}

/** Polls unread summary while `enabled` (e.g. signed-in + document visible). */
export function useMessagesUnreadPolling(
  enabled: boolean,
  intervalMs: number,
  onCounts: (c: { listing: number; support: number; total: number }) => void,
): void {
  const onRef = useRef(onCounts)
  onRef.current = onCounts
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const tick = () => {
      void fetchMessagesUnreadSummary().then((c) => {
        if (!cancelled) onRef.current(c)
      })
    }
    tick()
    const id = window.setInterval(tick, Math.max(5000, intervalMs))
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, intervalMs])
}
