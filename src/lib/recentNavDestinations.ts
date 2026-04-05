const STORAGE_KEY = 'fetch.recentNavDestinations'
const MAX = 10

export type RecentNavDestination = {
  label: string
  lat: number
  lng: number
  placeId?: string
  at: number
}

function keyFor(r: RecentNavDestination): string {
  if (r.placeId && r.placeId.length > 0) return `id:${r.placeId}`
  const la = Math.round(r.lat * 1e5) / 1e5
  const ln = Math.round(r.lng * 1e5) / 1e5
  return `ll:${la},${ln}`
}

export function loadRecentNavDestinations(): RecentNavDestination[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (row): row is RecentNavDestination =>
          !!row &&
          typeof row === 'object' &&
          typeof (row as RecentNavDestination).label === 'string' &&
          typeof (row as RecentNavDestination).lat === 'number' &&
          typeof (row as RecentNavDestination).lng === 'number' &&
          Number.isFinite((row as RecentNavDestination).lat) &&
          Number.isFinite((row as RecentNavDestination).lng),
      )
      .map((r) => ({
        ...r,
        label: r.label.trim().slice(0, 240),
        at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : Date.now(),
      }))
      .slice(0, MAX)
  } catch {
    return []
  }
}

export function pushRecentNavDestination(entry: Omit<RecentNavDestination, 'at'>) {
  const label = entry.label.trim().slice(0, 240)
  if (!label) return
  const next: RecentNavDestination = {
    label,
    lat: entry.lat,
    lng: entry.lng,
    ...(entry.placeId ? { placeId: entry.placeId } : {}),
    at: Date.now(),
  }
  const k = keyFor(next)
  const prev = loadRecentNavDestinations().filter((r) => keyFor(r) !== k)
  const merged = [next, ...prev].slice(0, MAX)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    /* ignore */
  }
}
