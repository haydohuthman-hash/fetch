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
