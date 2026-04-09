const KEY = 'fetch.drops.watchMs.v2'

type WatchMap = Record<string, number>

function load(): WatchMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as WatchMap
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

function save(m: WatchMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

export function getWatchMsForReel(reelId: string): number {
  return load()[reelId] ?? 0
}

export function addWatchMsForReel(reelId: string, deltaMs: number) {
  if (deltaMs <= 0) return
  const m = load()
  m[reelId] = Math.min(86_400_000 * 30, (m[reelId] ?? 0) + deltaMs)
  save(m)
}

export function getAllWatchMs(): WatchMap {
  return load()
}
