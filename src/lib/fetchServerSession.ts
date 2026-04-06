import { getFetchApiBaseUrl } from './fetchApiBase'
import { loadSession } from './fetchUserSession'

function apiRoot() {
  return getFetchApiBaseUrl()
}

/** Mirrors local sign-in to an httpOnly session cookie for marketplace APIs. */
export async function syncCustomerSessionCookie(): Promise<void> {
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
