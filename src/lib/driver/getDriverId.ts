const STORAGE_KEY = 'fetch_driver_id'
const DEFAULT_ID = 'driver_demo_1'

/** Stable demo driver id for marketplace offers and assignment (replace with auth later). */
export function getDriverId(): string {
  if (typeof window === 'undefined') return DEFAULT_ID
  try {
    let id = window.localStorage.getItem(STORAGE_KEY)?.trim()
    if (!id) {
      id = DEFAULT_ID
      window.localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    return DEFAULT_ID
  }
}

export function setDriverIdForDemo(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, id.trim() || DEFAULT_ID)
  } catch {
    /* ignore */
  }
}
