import { FETCH_DROPS_OFFICIAL_AUTHOR_ID, FETCH_DROPS_OFFICIAL_HANDLE } from './constants'
import { loadSession, normalizeEmail } from '../fetchUserSession'
import type { DropCreatorProfile } from './types'

export type { DropCreatorProfile } from './types'

const STORAGE_KEY = 'fetch.drops.profiles.v2'
const MY_PROFILE_KEY = 'fetch.drops.myProfileId.v2'
const RESERVED_NORMALIZED = new Set(
  ['fetch', 'admin', 'support', 'official', 'teamfetch'].map((s) => s.toLowerCase()),
)

type StoreShape = {
  byId: Record<string, DropCreatorProfile>
  /** normalized display name -> profile id */
  nameIndex: Record<string, string>
}

function emptyStore(): StoreShape {
  return { byId: {}, nameIndex: {} }
}

function loadRaw(): StoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const p = JSON.parse(raw) as StoreShape
    if (!p || typeof p !== 'object' || !p.byId || !p.nameIndex) return emptyStore()
    return p
  } catch {
    return emptyStore()
  }
}

function saveRaw(s: StoreShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/^@+/, '')
}

export function getDropProfilesStore(): StoreShape {
  return loadRaw()
}

/** Stable author id for the signed-in account (Drops, buy & sell, chat). */
export function accountAuthorIdFromEmail(email: string): string {
  return `acct_${normalizeEmail(email).replace(/[^a-z0-9]+/g, '_')}`
}

/**
 * Ensures a public creator row exists for the current session and points MY_PROFILE_KEY at it.
 * Migrates legacy `local_*` profile into the account id when possible.
 */
export function ensureDropProfileForSession(): DropCreatorProfile | null {
  const session = loadSession()
  if (!session) return null
  const id = session.id?.trim() || accountAuthorIdFromEmail(session.email)
  const s = loadRaw()
  if (s.byId[id]) {
    setMyDropProfileId(id)
    return s.byId[id]
  }
  const legacyId = (() => {
    try {
      return localStorage.getItem(MY_PROFILE_KEY)?.trim() ?? ''
    } catch {
      return ''
    }
  })()
  if (legacyId && s.byId[legacyId]) {
    const leg = s.byId[legacyId]
    const prevNorm = normalizeName(leg.displayName)
    if (s.nameIndex[prevNorm] === legacyId) {
      delete s.nameIndex[prevNorm]
      saveRaw(s)
    }
    const err = saveDropProfile(
      {
        id,
        displayName: leg.displayName,
        avatar: leg.avatar,
        linkedEmail: session.email,
      },
      undefined,
    )
    if (!err) {
      setMyDropProfileId(id)
      return loadRaw().byId[id] ?? null
    }
  }
  const nickBase =
    session.displayName.trim().replace(/^@+/, '').slice(0, 24) ||
    session.email.split('@')[0] ||
    'you'
  let nick = nickBase
  for (let i = 0; i < 8; i++) {
    const err = saveDropProfile({
      id,
      displayName: nick,
      avatar: '🎯',
      linkedEmail: session.email,
    })
    if (!err) {
      setMyDropProfileId(id)
      return loadRaw().byId[id] ?? null
    }
    nick = `${nickBase}${i + 1}`.slice(0, 24)
  }
  return null
}

/** Keep @handle aligned with Account display name after profile save. */
export function syncAccountDisplayToDropProfile(displayName: string): void {
  const session = loadSession()
  if (!session) return
  const id = session.id?.trim() || accountAuthorIdFromEmail(session.email)
  const s = loadRaw()
  const me = s.byId[id]
  if (!me) return
  const name = displayName.trim().replace(/^@+/, '').slice(0, 24)
  if (name.length < 2) return
  void saveDropProfile(
    { id, displayName: name, avatar: me.avatar, linkedEmail: session.email },
    id,
  )
}

export function getMyDropProfile(): DropCreatorProfile | null {
  try {
    const session = loadSession()
    if (session) {
      const acctId = session.id?.trim() || accountAuthorIdFromEmail(session.email)
      const s = loadRaw()
      if (s.byId[acctId]) return s.byId[acctId]
    }
    const id = localStorage.getItem(MY_PROFILE_KEY)?.trim()
    if (!id) return null
    const s = loadRaw()
    return s.byId[id] ?? null
  } catch {
    return null
  }
}

export function setMyDropProfileId(id: string) {
  try {
    localStorage.setItem(MY_PROFILE_KEY, id)
  } catch {
    /* ignore */
  }
}

/**
 * Reserve or update profile. Returns error message or null if ok.
 * `excludeProfileId` allows renaming your own handle.
 */
export function saveDropProfile(
  profile: Omit<DropCreatorProfile, 'updatedAt'> & { id: string },
  excludeProfileId?: string,
): string | null {
  const norm = normalizeName(profile.displayName)
  if (norm.length < 2) return 'Name must be at least 2 characters.'
  if (norm.length > 24) return 'Name must be 24 characters or fewer.'
  if (!/^[a-z0-9._-]+$/i.test(profile.displayName.trim().replace(/^@+/, '')))
    return 'Use letters, numbers, dots, underscores, or hyphens.'
  if (RESERVED_NORMALIZED.has(norm)) return 'This name is reserved.'
  const officialNorm = normalizeName(FETCH_DROPS_OFFICIAL_HANDLE.replace('@', ''))
  if (norm === officialNorm) return 'That name is reserved for Fetch.'

  const s = loadRaw()
  const existingOwner = s.nameIndex[norm]
  if (existingOwner && existingOwner !== excludeProfileId && existingOwner !== profile.id) {
    return 'That display name is already taken. Choose another.'
  }

  if (excludeProfileId && excludeProfileId === profile.id) {
    const prev = s.byId[profile.id]
    if (prev) {
      const prevNorm = normalizeName(prev.displayName)
      if (s.nameIndex[prevNorm] === profile.id) delete s.nameIndex[prevNorm]
    }
  }

  const next: DropCreatorProfile = {
    ...profile,
    displayName: profile.displayName.trim().replace(/^@+/, ''),
    avatar: profile.avatar.trim().slice(0, 2048) || '🎯',
    updatedAt: Date.now(),
  }
  s.byId[next.id] = next
  s.nameIndex[norm] = next.id
  saveRaw(s)
  return null
}

export function createLocalDropProfile(displayName: string, avatar: string): { profile: DropCreatorProfile } | { error: string } {
  const session = loadSession()
  if (session) {
    const ensured = ensureDropProfileForSession()
    if (ensured) {
      const err = saveDropProfile(
        {
          id: ensured.id,
          displayName,
          avatar,
          linkedEmail: session.email,
        },
        ensured.id,
      )
      if (err) return { error: err }
      const s = loadRaw()
      const profile = s.byId[ensured.id]
      if (!profile) return { error: 'Could not save profile.' }
      return { profile }
    }
  }
  const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const err = saveDropProfile({ id, displayName, avatar })
  if (err) return { error: err }
  const s = loadRaw()
  const profile = s.byId[id]
  if (!profile) return { error: 'Could not save profile.' }
  setMyDropProfileId(id)
  return { profile }
}

export function updateMyDropProfile(displayName: string, avatar: string): { profile: DropCreatorProfile } | { error: string } {
  const session = loadSession()
  if (session) void ensureDropProfileForSession()
  const me = getMyDropProfile()
  if (!me) return createLocalDropProfile(displayName, avatar)
  const linked = session?.email && me.id.startsWith('acct_') ? { linkedEmail: session.email } : {}
  const err = saveDropProfile({ id: me.id, displayName, avatar, ...linked }, me.id)
  if (err) return { error: err }
  const s = loadRaw()
  const profile = s.byId[me.id]
  if (!profile) return { error: 'Could not update profile.' }
  return { profile }
}

/** Resolve @handle for display (curated reels use seller string; local uses profile). */
export function formatDropHandle(displayName: string): string {
  const t = displayName.trim()
  if (t.startsWith('@')) return t
  return `@${t}`
}

export function isFetchOfficialAuthor(authorId: string): boolean {
  return authorId === FETCH_DROPS_OFFICIAL_AUTHOR_ID
}
