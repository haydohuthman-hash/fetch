import { getFetchApiBaseUrl } from './fetchApiBase'

const SESSION_KEY = 'fetch_analytics_sid_v1'
const MIN_MS = 60_000

function analyticsSessionId(): string {
  try {
    let s = sessionStorage.getItem(SESSION_KEY)
    if (!s) {
      s =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      sessionStorage.setItem(SESSION_KEY, s)
    }
    return s
  } catch {
    return `s_${Date.now()}`
  }
}

let lastAt = 0

/** Throttled heartbeat for visitor analytics (Postgres `analytics_pings`). */
export function pingAnalytics(pathname: string): void {
  const now = Date.now()
  if (now - lastAt < MIN_MS) return
  lastAt = now
  const path = pathname.trim().slice(0, 256)
  void fetch(`${getFetchApiBaseUrl()}/api/analytics/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sessionId: analyticsSessionId(), path }),
  }).catch(() => {})
}
