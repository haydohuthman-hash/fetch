/**
 * Lightweight local session (demo / prototype — not a secure auth system).
 * Persists profile in localStorage for personalization and AI context.
 */

export const USER_REGISTRY_KEY = 'fetch.userRegistry'
export const SESSION_EMAIL_KEY = 'fetch.sessionEmail'

export type FetchUserRecord = {
  email: string
  displayName: string
  phone: string
  createdAt: number
}

function readRegistry(): Record<string, FetchUserRecord> {
  try {
    const raw = window.localStorage.getItem(USER_REGISTRY_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as Record<string, FetchUserRecord>
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

function writeRegistry(map: Record<string, FetchUserRecord>) {
  try {
    window.localStorage.setItem(USER_REGISTRY_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function loadSession(): FetchUserRecord | null {
  try {
    const email = window.localStorage.getItem(SESSION_EMAIL_KEY)?.trim()
    if (!email) return null
    const key = normalizeEmail(email)
    const row = readRegistry()[key]
    return row ?? null
  } catch {
    return null
  }
}

export function signUpUser(input: {
  email: string
  displayName: string
  phone?: string
}): { ok: true } | { ok: false; error: string } {
  const email = normalizeEmail(input.email)
  const displayName = input.displayName.trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email.' }
  }
  if (displayName.length < 2) {
    return { ok: false, error: 'Enter your name.' }
  }
  const reg = readRegistry()
  if (reg[email]) {
    return { ok: false, error: 'That email already has an account. Sign in instead.' }
  }
  const row: FetchUserRecord = {
    email,
    displayName,
    phone: (input.phone ?? '').trim(),
    createdAt: Date.now(),
  }
  reg[email] = row
  writeRegistry(reg)
  try {
    window.localStorage.setItem(SESSION_EMAIL_KEY, email)
  } catch {
    /* ignore */
  }
  return { ok: true }
}

export function signInUser(emailRaw: string): { ok: true } | { ok: false; error: string } {
  const email = normalizeEmail(emailRaw)
  if (!email) {
    return { ok: false, error: 'Enter your email.' }
  }
  const reg = readRegistry()
  if (!reg[email]) {
    return { ok: false, error: 'No account for that email. Create one first.' }
  }
  try {
    window.localStorage.setItem(SESSION_EMAIL_KEY, email)
  } catch {
    /* ignore */
  }
  return { ok: true }
}

export function signOutUser() {
  try {
    window.localStorage.removeItem(SESSION_EMAIL_KEY)
  } catch {
    /* ignore */
  }
}

export function updateUserProfile(patch: {
  displayName?: string
  email?: string
  phone?: string
}): { ok: true } | { ok: false; error: string } {
  const cur = loadSession()
  if (!cur) return { ok: false, error: 'Not signed in.' }

  let nextEmail = normalizeEmail(patch.email ?? cur.email)
  const nextName = (patch.displayName ?? cur.displayName).trim()
  const nextPhone = (patch.phone ?? cur.phone).trim()

  if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return { ok: false, error: 'Enter a valid email.' }
  }
  if (nextName.length < 2) {
    return { ok: false, error: 'Enter your name.' }
  }

  const reg = readRegistry()
  const oldKey = normalizeEmail(cur.email)

  if (nextEmail !== oldKey) {
    if (reg[nextEmail]) {
      return { ok: false, error: 'That email is already used by another account.' }
    }
    delete reg[oldKey]
  }

  const row: FetchUserRecord = {
    email: nextEmail,
    displayName: nextName,
    phone: nextPhone,
    createdAt: cur.createdAt,
  }
  reg[nextEmail] = row
  writeRegistry(reg)
  try {
    window.localStorage.setItem(SESSION_EMAIL_KEY, nextEmail)
  } catch {
    /* ignore */
  }
  return { ok: true }
}

/** First token for spoken greeting */
export function firstNameFromDisplay(displayName: string): string {
  const t = displayName.trim().split(/\s+/)[0] ?? ''
  return t.length > 0 ? t : 'there'
}
