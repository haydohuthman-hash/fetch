const KEY = 'fetch_driver_online'

export function getDriverOnline(): boolean {
  if (typeof window === 'undefined') return true
  const v = window.localStorage.getItem(KEY)
  if (v == null) return true
  return v === '1' || v === 'true'
}

export function setDriverOnline(online: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, online ? '1' : '0')
}
