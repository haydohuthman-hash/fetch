import { getFetchApiBaseUrl } from './fetchApiBase'

function apiRoot() {
  return getFetchApiBaseUrl()
}

export type FetchServerUser = {
  id: string
  email: string
  displayName: string
}

export async function postRegister(input: {
  email: string
  password: string
  displayName: string
}): Promise<{ ok: true; user: FetchServerUser } | { ok: false; error: string }> {
  const res = await fetch(`${apiRoot()}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    user?: { id: string; email: string; displayName: string }
  }
  if (!res.ok) {
    return { ok: false, error: typeof data.error === 'string' ? data.error : `register_${res.status}` }
  }
  if (!data.user?.email) {
    return { ok: false, error: 'invalid_response' }
  }
  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.displayName,
    },
  }
}

export async function postLogin(input: {
  email: string
  password: string
}): Promise<{ ok: true; user: FetchServerUser } | { ok: false; error: string }> {
  const res = await fetch(`${apiRoot()}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    user?: { id: string; email: string; displayName: string }
  }
  if (!res.ok) {
    return { ok: false, error: typeof data.error === 'string' ? data.error : `login_${res.status}` }
  }
  if (!data.user?.email) {
    return { ok: false, error: 'invalid_response' }
  }
  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.displayName,
    },
  }
}

export async function fetchAuthMe(): Promise<FetchServerUser | null> {
  const res = await fetch(`${apiRoot()}/api/auth/me`, { credentials: 'include' })
  if (!res.ok) return null
  const data = (await res.json().catch(() => ({}))) as {
    user?: { id: string | null; email: string; displayName: string }
  }
  const u = data.user
  if (!u?.email) return null
  return {
    id: typeof u.id === 'string' ? u.id : '',
    email: u.email,
    displayName: u.displayName,
  }
}
