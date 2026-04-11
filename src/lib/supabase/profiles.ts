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

/**
 * All Supabase **writes** must use this — matches production JWT validation (no session.user fallback).
 */
export async function requireSupabaseAuthUser(sb: SupabaseClient): Promise<User> {
  const { data, error } = await sb.auth.getUser()
  if (error) {
    console.error(LOG, 'AUTH_GET_USER_ERROR', error.message, error)
    throw new Error(error.message || 'Authentication failed')
  }
  const user = data.user
  if (!user?.id) {
    console.error(LOG, 'AUTH_GET_USER_MISSING')
    throw new Error('Not signed in')
  }
  console.log(LOG, 'auth user id', user.id)
  return user
}

export function formatProfileSaveError(err: unknown): string {
  if (err == null) return 'Save failed'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || 'Save failed'
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>
    const msg = typeof o.message === 'string' ? o.message : ''
    const det = typeof o.details === 'string' ? o.details : ''
    const hint = typeof o.hint === 'string' ? o.hint : ''
    const code = typeof o.code === 'string' ? o.code : ''
    const parts = [msg, det, hint, code ? `[${code}]` : ''].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }
  try {
    return JSON.stringify(err)
  } catch {
    return 'Save failed'
  }
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
    console.log('[PROFILE] upsert profile row (ignoreDuplicates)', { userId: uid, payloadKeys: Object.keys(rich) })
    let insErr = (
      await sb.from('profiles').upsert(rich as never, { onConflict: 'id', ignoreDuplicates: true })
    ).error
    if (insErr) {
      const legacy = { id: uid, username: base.username, avatar_url: base.avatar_url ?? avatarMeta ?? null }
      console.warn('[PROFILE] rich upsert failed, trying legacy upsert', insErr.message)
      insErr = (
        await sb.from('profiles').upsert(legacy as never, { onConflict: 'id', ignoreDuplicates: true })
      ).error
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
  const user = await requireSupabaseAuthUser(sb)
  const uid = user.id
  await ensureUserProfile(user)
  const name = input.fullName.trim()
  if (name.length < 1) throw new Error('Enter your name.')

  const existing = await fetchProfileRow(sb, uid)
  const base = profileInsertPayload(user)
  const email = profileEmailFromUser(user)
  const merged: Record<string, unknown> = {
    id: uid,
    username: existing?.username ?? base.username,
    avatar_url: input.avatarUrl ?? existing?.avatar_url ?? base.avatar_url ?? avatarUrlFromUser(user),
    email: existing?.email || email || null,
    full_name: name,
    onboarding_complete: true,
    bio: existing?.bio ?? null,
    location_label: existing?.location_label ?? null,
    phone: existing?.phone ?? null,
    seller_rating: existing?.seller_rating ?? 5,
    followers_count: existing?.followers_count ?? 0,
    following_count: existing?.following_count ?? 0,
    credits_balance_cents: existing?.credits_balance_cents ?? 0,
  }
  console.log('[ONBOARDING] profile upsert payload', { userId: uid, keys: Object.keys(merged) })
  const { data, error } = await sb
    .from('profiles')
    .upsert(merged as never, { onConflict: 'id' })
    .select(PROFILE_SELECT_EXTENDED)
    .single()
  if (error) {
    console.error('[ONBOARDING] PROFILE_SAVE_ERROR', error)
    const leg = await sb
      .from('profiles')
      .upsert(
        {
          id: uid,
          username: merged.username,
          avatar_url: merged.avatar_url,
          full_name: name,
        } as never,
        { onConflict: 'id' },
      )
      .select('id,username,avatar_url,created_at')
      .single()
    if (leg.error) {
      console.error('[ONBOARDING] legacy upsert failed', leg.error)
      throw error
    }
    console.log('[ONBOARDING] profile marked complete (legacy columns)', { userId: uid })
    return { ...(leg.data as SupabaseProfile), full_name: name, onboarding_complete: true }
  }
  if (!data) throw new Error('Could not update profile.')
  console.log('[ONBOARDING] profile marked complete', { userId: uid })
  return data as SupabaseProfile
}

/**
 * Like {@link ensureUserProfile} but throws if Supabase is unconfigured or user is missing,
 * for flows that already require an authenticated client.
 */
export async function ensureMySupabaseProfile(): Promise<SupabaseProfile> {
  const sb = requireSupabaseBrowserClient()
  const user = await requireSupabaseAuthUser(sb)
  const profile = await ensureUserProfile(user)
  if (!profile) throw new Error('Could not load or create profile.')
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
  const user = await requireSupabaseAuthUser(sb)
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
  const user = await requireSupabaseAuthUser(sb)
  const uid = user.id
  const bucket = import.meta.env.VITE_SUPABASE_PROFILE_BUCKET || import.meta.env.VITE_SUPABASE_DROP_BUCKET || 'drops'
  const ext = extensionForImage(file)
  const path = `profiles/${uid}/avatar-${Date.now()}.${ext}`

  console.log(LOG, 'avatar upload start', { userId: uid, bucket, path, bytes: file.size })
  const { error: uploadError } = await sb.storage.from(bucket).upload(path, file, {
    upsert: true,
    cacheControl: '3600',
    contentType: file.type || undefined,
  })
  if (uploadError) {
    console.error(LOG, 'AVATAR_UPLOAD_ERROR', uploadError.message, uploadError)
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
  const user = await requireSupabaseAuthUser(sb)
  const uid = user.id

  await ensureUserProfile(user)

  const existing = await fetchProfileRow(sb, uid)
  if (!existing) {
    console.error(LOG, 'PROFILE_SAVE_ERROR no row after ensure', { userId: uid })
    throw new Error('Profile not found. Try signing out and back in.')
  }

  const base = profileInsertPayload(user)
  const email = profileEmailFromUser(user)

  let username = existing.username ?? base.username
  if (patch.username !== undefined) {
    const raw = patch.username.trim()
    const verr = validateUsername(raw)
    if (verr) throw new Error(verr)
    username = raw.toLowerCase()
  }

  const merged: Record<string, unknown> = {
    id: uid,
    email: existing.email || email || null,
    username,
    avatar_url:
      patch.avatar_url !== undefined ? patch.avatar_url : (existing.avatar_url ?? base.avatar_url),
    full_name:
      patch.full_name !== undefined
        ? patch.full_name?.trim() || null
        : existing.full_name ?? (fullNameFromUser(user) || null),
    bio:
      patch.bio !== undefined
        ? (() => {
            const t = patch.bio == null ? '' : String(patch.bio).trim()
            return t ? t.slice(0, 500) : null
          })()
        : (existing.bio ?? null),
    location_label:
      patch.location_label !== undefined
        ? (() => {
            const t = patch.location_label == null ? '' : String(patch.location_label).trim()
            return t ? t.slice(0, 120) : null
          })()
        : (existing.location_label ?? null),
    phone:
      patch.phone !== undefined
        ? (() => {
            const t = patch.phone == null ? '' : String(patch.phone).trim()
            return t ? t.slice(0, 32) : null
          })()
        : (existing.phone ?? null),
    onboarding_complete: existing.onboarding_complete !== false,
    seller_rating: existing.seller_rating ?? 5,
    followers_count: existing.followers_count ?? 0,
    following_count: existing.following_count ?? 0,
    credits_balance_cents: existing.credits_balance_cents ?? 0,
  }

  console.log(LOG, 'PROFILE_UPSERT_PAYLOAD', { userId: uid, keys: Object.keys(merged) })
  const { data, error } = await sb
    .from('profiles')
    .upsert(merged as never, { onConflict: 'id' })
    .select(PROFILE_SELECT_EXTENDED)
    .single()

  if (error) {
    console.error(LOG, 'PROFILE_SAVE_ERROR', error)
    const slim: Record<string, unknown> = {
      id: uid,
      username: merged.username,
      avatar_url: merged.avatar_url,
      full_name: merged.full_name,
    }
    const { data: d2, error: e2 } = await sb
      .from('profiles')
      .upsert(slim as never, { onConflict: 'id' })
      .select('id,username,avatar_url,created_at')
      .single()
    if (e2) {
      console.error(LOG, 'PROFILE_SAVE_ERROR legacy upsert', e2)
      throw error
    }
    return {
      ...(d2 as SupabaseProfile),
      full_name: merged.full_name as string | null,
      bio: merged.bio as string | null,
      location_label: merged.location_label as string | null,
      phone: merged.phone as string | null,
    }
  }

  return data as SupabaseProfile
}
