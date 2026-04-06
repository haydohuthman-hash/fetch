import { getDriverId } from '../driver/getDriverId'
import { loadSession } from '../fetchUserSession'

export type MarketplaceApiAuthRole = 'customer' | 'driver' | 'none'

export function marketplaceActorHeaders(role: MarketplaceApiAuthRole): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const h: Record<string, string> = {}
  if (role === 'customer') {
    const s = loadSession()
    if (s?.email) h['X-Fetch-User-Email'] = s.email.trim().toLowerCase()
  }
  if (role === 'driver') {
    h['X-Fetch-Driver-Id'] = getDriverId()
  }
  return h
}
