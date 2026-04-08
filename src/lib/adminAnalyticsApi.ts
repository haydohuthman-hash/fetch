import { getFetchApiBaseUrl } from './fetchApiBase'

export type AdminAnalyticsOverview = {
  rangeDays: number
  liveVisitors: number
  earningsByDay: { day: string; revenueAud: number; orders: number }[]
  visitorsByDay: { day: string; visitors: number }[]
  totals: { revenueAud: number; paidOrders: number; avgOrderAud: number }
}

async function adminJson<T>(adminKey: string, path: string): Promise<T> {
  const response = await fetch(`${getFetchApiBaseUrl()}${path}`, {
    credentials: 'include',
    headers: { 'X-Fetch-Store-Admin-Key': adminKey.trim() },
  })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`)
  }
  return payload
}

export async function fetchAdminAnalyticsOverview(
  adminKey: string,
  days = 30,
): Promise<AdminAnalyticsOverview> {
  const qs = new URLSearchParams({ days: String(days) })
  return adminJson<AdminAnalyticsOverview>(adminKey, `/api/store/admin/analytics/overview?${qs}`)
}
