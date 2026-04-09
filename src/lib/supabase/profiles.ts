import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient, requireSupabaseBrowserClient } from './client'

const LOG = '[fetch:profile]'

export type SupabaseProfile = {
  id: string
  username: string | null
  avatar_url: string | null
  created_at?: string
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

export async function ensureProfile(user: User | null | undefined): Promise<void> {
  if (!user?.id) return
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    console.warn('PROFILE UPSERT SKIP: supabase client missing')
    return
  }
  const fullName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    ''
  const profileRich = {
    id: user.id,
    email: user.email || '',
    full_name: fullName,
    avatar_url:
      (typeof user.user_metadata?.avatar_url === 'string' && user.user_metadata.avatar_url.trim()) ||
      (typeof user.user_metadata?.picture === 'string' && user.user_metadata.picture.trim()) ||
      '',
    updated_at: new Date().toISOString(),
  }
  const { error: richError } = await sb.from('profiles').upsert(profileRich as never, { onConflict: 'id' })
  if (!richError) {
    console.log('PROFILE UPSERT SUCCESS:', user.id)
    return
  }
  console.error('PROFILE UPSERT ERROR (rich payload):', richError)
  const fallback = profileInsertPayload(user)
  const { error: fallbackError } = await sb.from('profiles').upsert(fallback as never, { onConflict: 'id' })
  if (fallbackError) {
    console.error('PROFILE UPSERT ERROR (fallback payload):', fallbackError)
  } else {
    console.log('PROFILE UPSERT SUCCESS (fallback):', user.id)
  }
}

/**
 * Single entry for ensuring `public.profiles` has a row for this auth user.
 * Safe when `user` is missing (returns null). Uses JWT from the browser Supabase client (must be logged in).
 *
 * Schema today: `id`, `username`, `avatar_url`, `created_at` (see scripts/supabase-auth-profiles-setup.sql).
 * There is no `email` / `full_name` column; display name stays in `user_metadata` and session cache.
 */
export async function ensureUserProfile(user: User | null | undefined): Promise<SupabaseProfile | null> {
  if (!user?.id) {
    console.info(LOG, 'ensure skipped: no user')
    return null
  }

  const sb = getSupabaseBrowserClient()
  if (!sb) {
    console.warn(LOG, 'ensure skipped: Supabase client not configured')
    return null
  }

  const uid = user.id
  console.info(LOG, 'ensure start', { userId: uid })
  await ensureProfile(user)

  const { data: existing, error: selErr } = await sb
    .from('profiles')
    .select('id,username,avatar_url,created_at')
    .eq('id', uid)
    .maybeSingle()

  if (selErr) {
    console.error(LOG, 'select failed', selErr)
    throw selErr
  }

  if (existing) {
    console.info(LOG, 'profile already exists', { userId: uid })
    const row = existing as SupabaseProfile
    const remoteAvatar = avatarUrlFromUser(user)
    if (remoteAvatar && !row.avatar_url) {
      const { data: patched, error: upErr } = await sb
        .from('profiles')
        .update({ avatar_url: remoteAvatar })
        .eq('id', uid)
        .select('id,username,avatar_url,created_at')
        .single()
      if (upErr) {
        console.error(LOG, 'avatar backfill update failed', upErr)
      } else if (patched) {
        console.info(LOG, 'backfilled avatar_url from provider metadata')
        return patched as SupabaseProfile
      }
    }
    return row
  }

  console.info(LOG, 'profile missing, inserting', { userId: uid })
  const payload = profileInsertPayload(user)

  const { error: insErr } = await sb.from('profiles').insert(payload)
  if (insErr) {
    console.error(LOG, 'insert failed', insErr)
    const { data: raced, error: retryErr } = await sb
      .from('profiles')
      .select('id,username,avatar_url,created_at')
      .eq('id', uid)
      .maybeSingle()
    if (retryErr) {
      console.error(LOG, 'post-insert retry select failed', retryErr)
      throw insErr
    }
    if (raced) {
      console.info(LOG, 'profile appeared after insert conflict (trigger or race)', { userId: uid })
      return raced as SupabaseProfile
    }
    throw insErr
  }

  const { data: created, error: readErr } = await sb
    .from('profiles')
    .select('id,username,avatar_url,created_at')
    .eq('id', uid)
    .single()

  if (readErr) {
    console.error(LOG, 'read-after-insert failed', readErr)
    throw readErr
  }
  console.info(LOG, 'profile created', { userId: uid })
  return created as SupabaseProfile
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
}): Promise<SupabaseProfile> {
  const sb = requireSupabaseBrowserClient()
  const user = await resolveAuthUser(sb)
  if (!user) throw new Error('You must be logged in')
  const uid = user.id

  await ensureUserProfile(user)

  const next: Record<string, string | null> = {}
  if (patch.username !== undefined) next.username = patch.username.trim()
  if (patch.avatar_url !== undefined) next.avatar_url = patch.avatar_url
  const { data, error } = await sb
    .from('profiles')
    .update(next)
    .eq('id', uid)
    .select('id,username,avatar_url,created_at')
    .single()
  if (error) throw error
  return data as SupabaseProfile
}
