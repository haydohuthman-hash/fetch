import { requireSupabaseBrowserClient } from './client'

export type SupabaseProfile = {
  id: string
  username: string | null
  avatar_url: string | null
  created_at?: string
}

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

/**
 * Ensures a `profiles` row exists (OAuth users may land before DB trigger runs, or trigger may be missing).
 */
export async function ensureMySupabaseProfile(): Promise<SupabaseProfile> {
  const sb = requireSupabaseBrowserClient()
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('You must be logged in')

  const { data: existing, error: selErr } = await sb
    .from('profiles')
    .select('id,username,avatar_url,created_at')
    .eq('id', uid)
    .maybeSingle()
  if (selErr) throw selErr
  if (existing) return existing as SupabaseProfile

  const username = defaultProfileUsername(uid)
  const { error: insErr } = await sb.from('profiles').insert({ id: uid, username })
  if (insErr) {
    const { data: retry, error: retryErr } = await sb
      .from('profiles')
      .select('id,username,avatar_url,created_at')
      .eq('id', uid)
      .maybeSingle()
    if (retryErr) throw retryErr
    if (retry) return retry as SupabaseProfile
    throw insErr
  }

  const { data: created, error: readErr } = await sb
    .from('profiles')
    .select('id,username,avatar_url,created_at')
    .eq('id', uid)
    .single()
  if (readErr) throw readErr
  return created as SupabaseProfile
}

export async function getMySupabaseProfile(): Promise<SupabaseProfile | null> {
  const sb = requireSupabaseBrowserClient()
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user?.id) return null
  return ensureMySupabaseProfile()
}

export async function updateMySupabaseProfile(patch: {
  username?: string
  avatar_url?: string | null
}): Promise<SupabaseProfile> {
  const sb = requireSupabaseBrowserClient()
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('You must be logged in')

  await ensureMySupabaseProfile()

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
