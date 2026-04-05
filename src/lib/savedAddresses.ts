export const SAVED_ADDRESSES_STORAGE_KEY = 'fetch.savedAddresses'

export type SavedAddress = {
  id: string
  label: string
  address: string
  lat: number
  lng: number
  notes: string
}

const DEFAULT_SAVED_ADDRESSES: SavedAddress[] = [
  {
    id: 'addr_home',
    label: 'Home',
    address: '12 River St, New Farm QLD',
    lat: -27.4679,
    lng: 153.0381,
    notes: '',
  },
  {
    id: 'addr_work',
    label: 'Work',
    address: '88 Charlotte St, Brisbane City QLD',
    lat: -27.4682,
    lng: 153.0277,
    notes: '',
  },
]

export function loadSavedAddresses(): SavedAddress[] {
  try {
    const raw = window.localStorage.getItem(SAVED_ADDRESSES_STORAGE_KEY)
    if (!raw) return DEFAULT_SAVED_ADDRESSES
    const parsed = JSON.parse(raw) as SavedAddress[]
    if (!Array.isArray(parsed)) return DEFAULT_SAVED_ADDRESSES
    if (parsed.length === 0) return []
    const safe = parsed.filter(
      (row) =>
        row &&
        typeof row.id === 'string' &&
        typeof row.label === 'string' &&
        typeof row.address === 'string' &&
        typeof row.notes === 'string' &&
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lng),
    )
    return safe.length > 0 ? safe : DEFAULT_SAVED_ADDRESSES
  } catch {
    return DEFAULT_SAVED_ADDRESSES
  }
}

export function saveSavedAddresses(addresses: SavedAddress[]) {
  try {
    window.localStorage.setItem(
      SAVED_ADDRESSES_STORAGE_KEY,
      JSON.stringify(addresses),
    )
  } catch {
    /* ignore storage errors */
  }
}

