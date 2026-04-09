import type { User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from './supabase/client'

/** Apple / Google may omit top-level email; read from metadata / identities. */
export function primaryEmailFromSupabaseUser(user: User): string {
  if (user.email?.trim()) return normalizeEmail(user.email)
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const mEmail = meta?.email
  if (typeof mEmail === 'string' && mEmail.trim()) return normalizeEmail(mEmail)
  for (const row of user.identities ?? []) {
    const data = row.identity_data as Record<string, unknown> | undefined
    const e = data?.email
    if (typeof e === 'string' && e.trim()) return normalizeEmail(e)
  }
  const local = user.user_metadata?.full_name
  if (typeof local === 'string' && local.includes('@')) return normalizeEmail(local)
  return normalizeEmail(`${user.id.replace(/-/g, '').slice(0, 12)}@users.oauth.fetch`)
}

export const USER_REGISTRY_KEY = 'fetch.userRegistry'
export const SESSION_EMAIL_KEY = 'fetch.sessionEmail'
const SESSION_CACHE_KEY = 'fetch.sessionCache.v2'

export type FetchUserRecord = {
  id?: string
  email: string
  displayName: string
  username?: string
  phone: string
  createdAt: number
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function readSessionCache(): FetchUserRecord | null {
  try {
    const raw = window.localStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FetchUserRecord
    if (!parsed || !parsed.email) return null
    return parsed
  } catch {
    return null
  }
}

function writeSessionCache(row: FetchUserRecord | null): void {
  try {
    if (!row) {
      window.localStorage.removeItem(SESSION_CACHE_KEY)
      window.localStorage.removeItem(SESSION_EMAIL_KEY)
      return
    }
    window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(row))
    window.localStorage.setItem(SESSION_EMAIL_KEY, row.email)
  } catch {
    /* ignore */
  }
}

export function applyServerUserProfile(user: { id?: string; email: string; displayName: string; username?: string }) {
  const email = normalizeEmail(user.email)
  if (!email) return
  writeSessionCache({
    id: user.id,
    email,
    displayName: user.displayName.trim() || email.split('@')[0] || 'there',
    username: user.username?.trim() || undefined,
    phone: '',
    createdAt: Date.now(),
  })
}

export function loadSession(): FetchUserRecord | null {
  return readSessionCache()
}

export async function refreshSessionFromSupabase(): Promise<FetchUserRecord | null> {
  const sb = getSupabaseBrowserClient()
  if (!sb) return readSessionCache()
  const { data: sessionData } = await sb.auth.getSession()
  if (!sessionData.session) {
    writeSessionCache(null)
    return null
  }
  const { data } = await sb.auth.getUser()
  const user = data.user
  if (!user?.id) {
    writeSessionCache(null)
    return null
  }
  const email = primaryEmailFromSupabaseUser(user)
  const displayName =
    (typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()) ||
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    email.split('@')[0] ||
    'there'
  const row: FetchUserRecord = {
    id: user.id,
    email,
    displayName,
    username: typeof user.user_metadata?.username === 'string' ? user.user_metadata.username.trim() : undefined,
    phone: '',
    createdAt: Date.now(),
  }
  writeSessionCache(row)
  return row
}

export function signUpUser(_input: {
  email: string
  displayName: string
  phone?: string
}): { ok: true } | { ok: false; error: string } {
  return { ok: false, error: 'Use Supabase auth sign-up flow.' }
}

export function signInUser(_emailRaw: string): { ok: true } | { ok: false; error: string } {
  return { ok: false, error: 'Use Supabase auth sign-in flow.' }
}

export function signOutUser() {
  writeSessionCache(null)
  const sb = getSupabaseBrowserClient()
  if (sb) void sb.auth.signOut()
  void import('./fetchServerSession')
    .then((m) => m.clearServerSessionCookie())
    .catch(() => {})
}

export function updateUserProfile(patch: {
  displayName?: string
  email?: string
  phone?: string
}): { ok: true } | { ok: false; error: string } {
  const cur = loadSession()
  if (!cur) return { ok: false, error: 'Not signed in.' }
  const nextEmail = normalizeEmail(patch.email ?? cur.email)
  const nextName = (patch.displayName ?? cur.displayName).trim()
  if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return { ok: false, error: 'Enter a valid email.' }
  }
  if (nextName.length < 2) {
    return { ok: false, error: 'Enter your name.' }
  }
  writeSessionCache({ ...cur, email: nextEmail, displayName: nextName, phone: (patch.phone ?? cur.phone).trim() })
  return { ok: true }
}

export function firstNameFromDisplay(displayName: string): string {
  const t = displayName.trim().split(/\s+/)[0] ?? ''
  return t.length > 0 ? t : 'there'
}
