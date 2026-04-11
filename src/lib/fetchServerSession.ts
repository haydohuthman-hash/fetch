import { getFetchApiBaseUrl } from './fetchApiBase'
import { getSupabaseBrowserClient } from './supabase/client'
import { loadSession } from './fetchUserSession'

function apiRoot() {
  return getFetchApiBaseUrl()
}

/**
 * Mint `fetch_session` from the live Supabase JWT so `/api/listings` and marketplace routes
 * see `customerUserId` (required for seller ownership + publishing).
 */
export async function syncSupabaseSessionCookie(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const sb = getSupabaseBrowserClient()
  if (!sb) return false
  const {
    data: { session },
    error,
  } = await sb.auth.getSession()
  if (error || !session?.access_token) {
    if (error) console.warn('[AUTH] syncSupabaseSessionCookie: no session', error.message)
    return false
  }
  const token = session.access_token
  const res = await fetch(`${apiRoot()}/api/auth/supabase-session`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ access_token: token }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
    console.error('[AUTH] supabase-session failed', res.status, body?.error, body?.detail ?? '')
    return false
  }
  return true
}

/** Mirrors sign-in to an httpOnly session cookie for marketplace APIs. Prefers Supabase JWT when present. */
export async function syncCustomerSessionCookie(): Promise<void> {
  try {
    if (await syncSupabaseSessionCookie()) return
  } catch (e) {
    console.warn('[AUTH] syncSupabaseSessionCookie error', e)
  }
  const s = loadSession()
  if (!s?.email) return
  await fetch(`${apiRoot()}/api/auth/customer-session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: s.email }),
  }).catch(() => {})
}

export async function syncDriverSessionCookie(driverId: string): Promise<void> {
  const id = driverId.trim()
  if (!id) return
  await fetch(`${apiRoot()}/api/auth/driver-session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId: id }),
  }).catch(() => {})
}

export async function clearServerSessionCookie(): Promise<void> {
  await fetch(`${apiRoot()}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {})
}
