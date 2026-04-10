import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient, requireSupabaseBrowserClient } from './client'

const LOG = '[PROFILE]'

const PROFILE_SELECT =
  'id,username,avatar_url,created_at,email,full_name,onboarding_complete' as const

const PROFILE_SELECT_EXTENDED =
  'id,username,avatar_url,created_at,email,full_name,onboarding_complete,bio,location_label,phone,seller_rating,followers_count,following_count,credits_balance_cents' as const

export type SupabaseProfile = {
  id: string
  username: string | null
  avatar_url: string | null
  created_at?: string
  email?: string | null
  full_name?: string | null
  /** When missing (legacy DB), treated as complete so existing users are not blocked. */
  onboarding_complete?: boolean | null
  bio?: string | null
  location_label?: string | null
  phone?: string | null
  seller_rating?: number | null
  followers_count?: number | null
  following_count?: number | null
  credits_balance_cents?: number | null
}

function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Same rules as `primaryEmailFromSupabaseUser` in fetchUserSession (kept local to avoid import cycles). */
function profileEmailFromUser(user: User): string {
  if (user.email?.trim()) return normEmail(user.email)
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const mEmail = meta?.email
  if (typeof mEmail === 'string' && mEmail.trim()) return normEmail(mEmail)
  for (const row of user.identities ?? []) {
    const data = row.identity_data as Record<string, unknown> | undefined
    const e = data?.email
    if (typeof e === 'string' && e.trim()) return normEmail(e)
  }
  const local = user.user_metadata?.full_name
  if (typeof local === 'string' && local.includes('@')) return normEmail(local)
  return normEmail(`${user.id.replace(/-/g, '').slice(0, 12)}@users.oauth.fetch`)
}

function fullNameFromUser(user: User): string {
  const m = user.user_metadata as Record<string, unknown> | undefined
  const a = typeof m?.full_name === 'string' ? m.full_name.trim() : ''
  const b = typeof m?.name === 'string' ? m.name.trim() : ''
  return a || b || ''
}

/** Friendly two-word names for instant profiles (users can change anytime in settings). */
const FETCH_PROFILE_NAME_ADJECTIVES = [
  'Swift',
  'Bright',
  'Calm',
  'Bold',
  'Gentle',
  'Clever',
  'Happy',
  'Lucky',
  'Cosmic',
  'Urban',
  'Coastal',
  'Sunny',
  'Misty',
  'Golden',
  'Silver',
  'Quiet',
  'Brave',
  'Kind',
  'Wild',
  'Noble',
] as const

const FETCH_PROFILE_NAME_NOUNS = [
  'Falcon',
  'Koala',
  'Penguin',
  'Otter',
  'Heron',
  'Lark',
  'Coral',
  'Cedar',
  'Maple',
  'Willow',
  'Harbor',
  'Summit',
  'Breeze',
  'Comet',
  'Nova',
  'River',
  'Meadow',
  'Pebble',
  'Spruce',
  'Laurel',
] as const

function pickRandom<const T extends readonly string[]>(items: T): T[number] {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return items[buf[0]! % items.length]!
  }
  return items[Math.floor(Math.random() * items.length)]!
}

export function generateRandomProfileDisplayName(): string {
  return `${pickRandom(FETCH_PROFILE_NAME_ADJECTIVES)} ${pickRandom(FETCH_PROFILE_NAME_NOUNS)}`
}

/** `false` means the new onboarding flow is required; missing/`true` means proceed to the app. */
export function isProfileOnboardingComplete(row: SupabaseProfile | null | undefined): boolean {
  if (!row) return false
  return row.onboarding_complete !== false
}

/**
 * True when the handle is still the auto-generated one for this user (`user_<6 hex from uuid>`).
 * Avoids treating every `user_*` handle as “default” (e.g. `user_support` is a valid custom handle).
 */
export function isAutomaticDefaultUsername(
  username: string | null | undefined,
  userId: string | undefined,
): boolean {
  const t = String(username || '').trim()
  if (!t) return true
  if (!userId) return /^user_[0-9a-f]{6}$/i.test(t)
  return defaultProfileUsername(userId) === t
}

/** @deprecated Prefer {@link isAutomaticDefaultUsername} — `/^user_/` false positives broke profile setup. */
export function isDefaultUsername(username: string | null | undefined): boolean {
  return /^user_/i.test(String(username || '').trim())
}

export function validateUsername(username: string): string | null {
  const t = username.trim()
  if (t.length < 3) return 'Username must be at least 3 characters.'
  if (t.length > 20) return 'Username must be 20 characters or fewer.'
  if (!/^[a-zA-Z0-9_]+$/.test(t)) return 'Use only letters, numbers, and underscore.'
  return null
}

function normalizeUsernameSeed(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
}

function clampUsername(text: string): string {
  const cleaned = normalizeUsernameSeed(text)
  if (cleaned.length <= 20) return cleaned
  return cleaned.slice(0, 20).replace(/_+$/g, '')
}

function usernameSeedFromEmail(emailRaw: string, displayName?: string): string {
  const email = String(emailRaw || '').trim().toLowerCase()
  const [localRaw = '', domainRaw = ''] = email.split('@')
  const domainLabel = domainRaw.split('.')[0] || ''
  const localPieces = localRaw.split(/[._+-]+/g).filter(Boolean)
  const namePieces = String(displayName || '')
    .trim()
    .toLowerCase()
    .split(/\s+/g)
    .filter(Boolean)
  const left = localPieces.slice(0, 2).join('_') || namePieces.slice(0, 2).join('_') || 'fetcher'
  const seed = clampUsername(`${left}_${domainLabel}`) || clampUsername(left) || 'fetcher'
  if (seed.length >= 3) return seed
  return 'fetcher'
}

function defaultProfileUsername(userId: string): string {
  const compact = userId.replace(/-/g, '')
  return `user_${compact.slice(0, 6)}`
}

/** Match {@link refreshSessionFromSupabase}: `getUser` can flake while `getSession` already has the user. */
async function resolveAuthUser(sb: SupabaseClient): Promise<User | null> {
  const { data: sessionData } = await sb.auth.getSession()
  const sess = sessionData.session
  const { data, error } = await sb.auth.getUser()
  let user: User | null = data.user ?? null
  if (error || !user?.id) {
    if (error) console.warn(LOG, 'getUser failed; using session.user', error.message)
    user = (sess?.user as User) ?? null
  }
  return user?.id ? user : null
}

/** Picture URLs from Google (picture), Apple variants, or Supabase-normalized fields. */
function avatarUrlFromUser(user: User): string | null {
  const m = user.user_metadata as Record<string, unknown> | undefined
  if (!m) return null
  for (const key of ['avatar_url', 'picture', 'avatar']) {
    const v = m[key]
    if (typeof v === 'string') {
      const u = v.trim()
      if (u.length > 0) return u
    }
  }
  return null
}

function profileInsertPayload(user: User): { id: string; username: string; avatar_url: string | null } {
  const uid = user.id
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const fromMeta =
    typeof meta?.username === 'string' && meta.username.trim().length >= 3
      ? meta.username.trim().slice(0, 20)
      : null
  const username = fromMeta && /^[a-zA-Z0-9_]+$/.test(fromMeta) ? fromMeta : defaultProfileUsername(uid)
  return {
    id: uid,
    username,
    avatar_url: avatarUrlFromUser(user),
  }
}

/** @deprecated Prefer {@link ensureUserProfile}; kept for call sites that only need side effects. */
export async function ensureProfile(user: User | null | undefined): Promise<void> {
  await ensureUserProfile(user)
}

async function fetchProfileRow(sb: SupabaseClient, uid: string): Promise<SupabaseProfile | null> {
  const { data, error } = await sb.from('profiles').select(PROFILE_SELECT_EXTENDED).eq('id', uid).maybeSingle()
  if (error) {
    const { data: mid, error: e2 } = await sb.from('profiles').select(PROFILE_SELECT).eq('id', uid).maybeSingle()
    if (e2) {
      const { data: legacy, error: e3 } = await sb
        .from('profiles')
        .select('id,username,avatar_url,created_at')
        .eq('id', uid)
        .maybeSingle()
      if (e3) throw error
      return legacy as SupabaseProfile | null
    }
    return mid as SupabaseProfile | null
  }
  return data as SupabaseProfile | null
}

/**
 * Idempotent: ensures a `profiles` row exists and backfills email / full_name / avatar from auth metadata
 * without clobbering `onboarding_complete` once set.
 *
 * Requires migration `scripts/supabase-profiles-onboarding-columns.sql` for full behavior; degrades on older DBs.
 */
export async function ensureUserProfile(user: User | null | undefined): Promise<SupabaseProfile | null> {
  if (!user?.id) {
    console.log('[PROFILE] ensureUserProfile skipped: no auth user')
    return null
  }

  const sb = getSupabaseBrowserClient()
  if (!sb) {
    console.warn('[PROFILE] ensureUserProfile skipped: Supabase client not configured')
    return null
  }

  const uid = user.id
  const email = profileEmailFromUser(user)
  const fullName = fullNameFromUser(user)
  const avatarMeta = avatarUrlFromUser(user)
  console.log('[PROFILE] ensureUserProfile start', { userId: uid })

  let row = await fetchProfileRow(sb, uid)
  const base = profileInsertPayload(user)

  if (!row) {
    const autoDisplayName = fullName || generateRandomProfileDisplayName()
    const rich = {
      id: uid,
      username: base.username,
      avatar_url: base.avatar_url ?? avatarMeta,
      email: email || null,
      full_name: autoDisplayName,
      onboarding_complete: true,
      bio: null as string | null,
      location_label: null as string | null,
      phone: null as string | null,
      seller_rating: 5,
      followers_count: 0,
      following_count: 0,
      credits_balance_cents: 0,
    }
    console.log('[PROFILE] inserting profile row', { userId: uid })
    let insErr = (await sb.from('profiles').insert(rich as never)).error
    if (insErr) {
      const legacy = { id: uid, username: base.username, avatar_url: base.avatar_url ?? avatarMeta ?? null }
      console.warn('[PROFILE] rich insert failed, trying legacy columns', insErr.message)
      insErr = (await sb.from('profiles').insert(legacy as never)).error
    }
    if (insErr) {
      const msg = String(insErr.message || '')
      const dup =
        insErr.code === '23505' || msg.includes('duplicate') || msg.includes('unique')
      if (dup) {
        console.info('[PROFILE] insert raced or row exists; loading existing profile', { userId: uid })
      } else {
        console.warn('[PROFILE] insert failed (RLS or schema)', insErr.message)
      }
    }
    row = await fetchProfileRow(sb, uid)
  }

  if (!row) {
    console.error('[PROFILE] ensureUserProfile failed: could not load row', { userId: uid })
    return null
  }

  /* One-shot: older rows with onboarding_complete = false skip straight into the app with a name. */
  if (row.onboarding_complete === false) {
    const display =
      (row.full_name || '').trim() || fullNameFromUser(user) || generateRandomProfileDisplayName()
    const body = { onboarding_complete: true, full_name: display }
    const { data: fixed, error: fixErr } = await sb
      .from('profiles')
      .update(body as never)
      .eq('id', uid)
      .select(PROFILE_SELECT_EXTENDED)
      .single()
    if (!fixErr && fixed) {
      row = fixed as SupabaseProfile
    } else if (fixErr) {
      const { data: leg, error: legErr } = await sb
        .from('profiles')
        .update({ full_name: display } as never)
        .eq('id', uid)
        .select('id,username,avatar_url,created_at')
        .single()
      if (!legErr && leg) row = { ...(leg as SupabaseProfile), full_name: display, onboarding_complete: true }
      else console.warn('[PROFILE] could not auto-complete onboarding flag', fixErr?.message ?? legErr?.message)
    }
  }

  const patch: Record<string, string | null> = {}
  if (email && !(row.email || '').trim()) patch.email = email
  if (fullName && !(row.full_name || '').trim()) patch.full_name = fullName
  const remoteAvatar = avatarMeta
  if (remoteAvatar && !(row.avatar_url || '').trim()) patch.avatar_url = remoteAvatar

  if (Object.keys(patch).length > 0) {
    console.log('[PROFILE] backfilling empty profile fields', { userId: uid, keys: Object.keys(patch) })
    const { data: updated, error: upErr } = await sb
      .from('profiles')
      .update(patch as never)
      .eq('id', uid)
      .select(PROFILE_SELECT_EXTENDED)
      .single()
    if (!upErr && updated) {
      row = updated as SupabaseProfile
    } else if (upErr) {
      const { data: u2, error: e2 } = await sb
        .from('profiles')
        .update(patch as never)
        .eq('id', uid)
        .select('id,username,avatar_url,created_at')
        .single()
      if (!e2 && u2) row = u2 as SupabaseProfile
      else console.error('[PROFILE] backfill update failed', upErr)
    }
  }

  console.log('[PROFILE] ensureUserProfile done', {
    userId: uid,
    onboarding_complete: row.onboarding_complete,
  })
  return row
}

export async function completeFetchProfileOnboarding(input: {
  fullName: string
  avatarUrl?: string | null
}): Promise<SupabaseProfile> {
  const sb = requireSupabaseBrowserClient()
  const user = await resolveAuthUser(sb)
  if (!user) throw new Error('You must be logged in')
  const uid = user.id
  await ensureUserProfile(user)
  const name = input.fullName.trim()
  if (name.length < 1) throw new Error('Enter your name.')

  const body = {
    full_name: name,
    avatar_url: input.avatarUrl ?? null,
    onboarding_complete: true,
  }
  const full = await sb
    .from('profiles')
    .update(body as never)
    .eq('id', uid)
    .select(PROFILE_SELECT_EXTENDED)
    .single()
  let data: SupabaseProfile | null = (full.data as SupabaseProfile | null) ?? null
  if (full.error) {
    const leg = await sb
      .from('profiles')
      .update({ full_name: name, avatar_url: input.avatarUrl ?? null } as never)
      .eq('id', uid)
      .select('id,username,avatar_url,created_at')
      .single()
    if (leg.error) throw full.error
    data = leg.data as SupabaseProfile
  }
  if (!data) throw new Error('Could not update profile.')
  console.log('[ONBOARDING] profile marked complete', { userId: uid })
  return data
}

/**
 * Like {@link ensureUserProfile} but throws if Supabase is unconfigured or user is missing,
 * for flows that already require an authenticated client.
 */
export async function ensureMySupabaseProfile(): Promise<SupabaseProfile> {
  const sb = requireSupabaseBrowserClient()
  const user = await resolveAuthUser(sb)
  if (!user) throw new Error('You must be logged in')
  const profile = await ensureUserProfile(user)
  if (!profile) throw new Error('You must be logged in')
  return profile
}

export async function getMySupabaseProfile(): Promise<SupabaseProfile | null> {
  const sb = requireSupabaseBrowserClient()
  const user = await resolveAuthUser(sb)
  if (!user) return null
  return ensureUserProfile(user)
}

async function usernameTaken(sb: SupabaseClient, candidate: string, userId: string): Promise<boolean> {
  const { data, error } = await sb
    .from('profiles')
    .select('id')
    .eq('username', candidate)
    .maybeSingle()
  if (error) throw error
  return Boolean(data?.id && data.id !== userId)
}

export async function suggestUniqueUsernameFromEmail(email: string, displayName?: string): Promise<string> {
  const sb = requireSupabaseBrowserClient()
  const user = await resolveAuthUser(sb)
  if (!user?.id) throw new Error('You must be logged in')
  const uid = user.id
  const base = usernameSeedFromEmail(email, displayName)
  const candidates: string[] = []
  if (base.length >= 3) candidates.push(base)
  for (let n = 11; n <= 99; n += 1) {
    const suffix = String(n)
    const room = Math.max(0, 20 - suffix.length)
    const stem = base.slice(0, room).replace(/_+$/g, '')
    const cand = `${stem}${suffix}`
    if (cand.length >= 3) candidates.push(cand)
  }
  for (const candidate of candidates) {
    if (!validateUsername(candidate) && !(await usernameTaken(sb, candidate, uid))) return candidate
  }
  return defaultProfileUsername(uid)
}

function extensionForImage(file: File): string {
  const fromName = file.name.split('.').pop()?.trim().toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

export async function uploadMySupabaseAvatar(file: File): Promise<string> {
  if (!file || !(file instanceof File)) throw new Error('Choose a profile photo first.')
  if (!file.type.startsWith('image/')) throw new Error('Profile photo must be an image file.')
  if (file.size > 8 * 1024 * 1024) throw new Error('Profile photo must be 8MB or smaller.')

  const sb = requireSupabaseBrowserClient()
  const user = await resolveAuthUser(sb)
  if (!user?.id) throw new Error('You must be logged in')
  const uid = user.id
  const bucket = import.meta.env.VITE_SUPABASE_PROFILE_BUCKET || import.meta.env.VITE_SUPABASE_DROP_BUCKET || 'drops'
  const ext = extensionForImage(file)
  const path = `profiles/${uid}/avatar-${Date.now()}.${ext}`

  const { error: uploadError } = await sb.storage.from(bucket).upload(path, file, {
    upsert: true,
    cacheControl: '3600',
    contentType: file.type || undefined,
  })
  if (uploadError) {
    throw new Error(uploadError.message || 'Could not upload profile photo.')
  }
  const { data } = sb.storage.from(bucket).getPublicUrl(path)
  const publicUrl = data.publicUrl?.trim()
  if (!publicUrl) throw new Error('Could not resolve uploaded photo URL.')
  return publicUrl
}

export async function updateMySupabaseProfile(patch: {
  username?: string
  avatar_url?: string | null
  full_name?: string | null
  bio?: string | null
  location_label?: string | null
  phone?: string | null
}): Promise<SupabaseProfile> {
  const sb = requireSupabaseBrowserClient()
  const user = await resolveAuthUser(sb)
  if (!user) throw new Error('You must be logged in')
  const uid = user.id

  await ensureUserProfile(user)

  const next: Record<string, string | null> = {}
  if (patch.username !== undefined) {
    const u = patch.username.trim()
    const verr = validateUsername(u)
    if (verr) throw new Error(verr)
    next.username = u
  }
  if (patch.avatar_url !== undefined) next.avatar_url = patch.avatar_url
  if (patch.full_name !== undefined) next.full_name = patch.full_name?.trim() || null
  if (patch.bio !== undefined) next.bio = patch.bio?.trim() ? patch.bio.trim().slice(0, 500) : null
  if (patch.location_label !== undefined)
    next.location_label = patch.location_label?.trim() ? patch.location_label.trim().slice(0, 120) : null
  if (patch.phone !== undefined) next.phone = patch.phone?.trim() ? patch.phone.trim().slice(0, 32) : null
  const { data, error } = await sb
    .from('profiles')
    .update(next)
    .eq('id', uid)
    .select(PROFILE_SELECT_EXTENDED)
    .single()
  if (error) {
    const { data: d2, error: e2 } = await sb
      .from('profiles')
      .update(next)
      .eq('id', uid)
      .select('id,username,avatar_url,created_at')
      .single()
    if (e2) throw error
    return d2 as SupabaseProfile
  }
  return data as SupabaseProfile
}
