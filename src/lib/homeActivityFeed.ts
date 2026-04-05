/** Local-only activity timeline and alerts (localStorage). */

export const HOME_ACTIVITY_STORAGE_KEY = 'fetch.homeActivity.v1'
export const HOME_ALERTS_STORAGE_KEY = 'fetch.homeAlerts.v1'

const MAX_ACTIVITY = 40
const MAX_ALERTS = 60

export type HomeActivityEntry = {
  id: string
  at: number
  title: string
  subtitle?: string
  jobType?: string
  priceMin?: number
  priceMax?: number
  paymentIntentId?: string
  paymentStatus?: string
  /** Route distance when known (e.g. quote with computed route). */
  distanceMeters?: number
}

export type HomeAlertRecord = {
  id: string
  at: number
  title: string
  body: string
  read: boolean
}

function safeParseActivity(raw: string | null): HomeActivityEntry[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter(
      (row): row is HomeActivityEntry =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as HomeActivityEntry).id === 'string' &&
        typeof (row as HomeActivityEntry).at === 'number' &&
        typeof (row as HomeActivityEntry).title === 'string',
    )
  } catch {
    return []
  }
}

function safeParseAlerts(raw: string | null): HomeAlertRecord[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter(
      (row): row is HomeAlertRecord =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as HomeAlertRecord).id === 'string' &&
        typeof (row as HomeAlertRecord).at === 'number' &&
        typeof (row as HomeAlertRecord).title === 'string' &&
        typeof (row as HomeAlertRecord).body === 'string' &&
        typeof (row as HomeAlertRecord).read === 'boolean',
    )
  } catch {
    return []
  }
}

export function loadHomeActivities(): HomeActivityEntry[] {
  try {
    return safeParseActivity(window.localStorage.getItem(HOME_ACTIVITY_STORAGE_KEY)).sort(
      (a, b) => b.at - a.at,
    )
  } catch {
    return []
  }
}

export function appendHomeActivity(
  entry: Omit<HomeActivityEntry, 'id' | 'at'> & { id?: string },
): HomeActivityEntry[] {
  const row: HomeActivityEntry = {
    id: entry.id ?? `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: Date.now(),
    title: entry.title,
    subtitle: entry.subtitle,
    jobType: entry.jobType,
    priceMin: entry.priceMin,
    priceMax: entry.priceMax,
    paymentIntentId: entry.paymentIntentId,
    paymentStatus: entry.paymentStatus,
    distanceMeters: entry.distanceMeters,
  }
  try {
    const prev = loadHomeActivities()
    const next = [row, ...prev].slice(0, MAX_ACTIVITY)
    window.localStorage.setItem(HOME_ACTIVITY_STORAGE_KEY, JSON.stringify(next))
    return next
  } catch {
    return [row]
  }
}

export function loadHomeAlerts(): HomeAlertRecord[] {
  try {
    return safeParseAlerts(window.localStorage.getItem(HOME_ALERTS_STORAGE_KEY)).sort(
      (a, b) => b.at - a.at,
    )
  } catch {
    return []
  }
}

export function appendHomeAlert(
  partial: Omit<HomeAlertRecord, 'id' | 'at' | 'read'> & { id?: string },
): HomeAlertRecord[] {
  const row: HomeAlertRecord = {
    id: partial.id ?? `al_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: Date.now(),
    title: partial.title,
    body: partial.body,
    read: false,
  }
  try {
    const prev = loadHomeAlerts()
    const next = [row, ...prev].slice(0, MAX_ALERTS)
    window.localStorage.setItem(HOME_ALERTS_STORAGE_KEY, JSON.stringify(next))
    return next
  } catch {
    return [row]
  }
}

export function markAllHomeAlertsRead(): void {
  try {
    const rows = loadHomeAlerts().map((a) => ({ ...a, read: true }))
    window.localStorage.setItem(HOME_ALERTS_STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* ignore */
  }
}

export function countUnreadHomeAlerts(): number {
  return loadHomeAlerts().filter((a) => !a.read).length
}
