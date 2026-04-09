import type { User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from './supabase/client'
import { ensureProfile, ensureUserProfile } from './supabase/profiles'

/** True while URL still has OAuth/PKCE params (session may not be in storage yet). */
function isBrowserOAuthRedirect(): boolean {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search)
  if (q.has('code')) return true
  const h = window.location.hash ?? ''
  return h.includes('access_token') || h.includes('error')
}

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

let refreshSessionInFlight: Promise<FetchUserRecord | null> | null = null

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

/**
 * Write minimal session cache from the live Supabase user so post-auth routing can run
 * synchronously on `SIGNED_IN` / OAuth before `refreshSessionFromSupabase()` finishes.
 */
export function seedSessionCacheFromSupabaseUser(user: User): void {
  const email = primaryEmailFromSupabaseUser(user)
  if (!email?.trim()) return
  const displayName =
    (typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()) ||
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    email.split('@')[0] ||
    'there'
  const uname =
    typeof user.user_metadata?.username === 'string' ? user.user_metadata.username.trim() : undefined
  applyServerUserProfile({ id: user.id, email, displayName, username: uname })
}

export function loadSession(): FetchUserRecord | null {
  return readSessionCache()
}

/**
 * Sync Supabase auth into `fetch.sessionCache`. Single-flight: overlapping calls share one refresh
 * so parallel `getSession`/PKCE races don’t clear the cache after the other path wrote it.
 *
 * Never clears local session cache just because `getUser()` failed while `getSession()` still has a session.
 */
export async function refreshSessionFromSupabase(): Promise<FetchUserRecord | null> {
  if (!refreshSessionInFlight) {
    refreshSessionInFlight = (async () => {
      try {
        return await refreshSessionFromSupabaseBody()
      } finally {
        refreshSessionInFlight = null
      }
    })()
  }
  return refreshSessionInFlight
}

async function refreshSessionFromSupabaseBody(): Promise<FetchUserRecord | null> {
  const t0 = Date.now()
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchUserSession.ts:refreshBody',message:'no supabase client',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return readSessionCache()
  }

  const { data: sessionData, error: sessionError } = await sb.auth.getSession()
  console.log('[AUTH] initial session:', sessionData, sessionError)
  const sess = sessionData.session
  const oauthRedir = isBrowserOAuthRedirect()
  const cacheBefore = Boolean(readSessionCache()?.email)
  // #region agent log
  fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchUserSession.ts:afterGetSession',message:'getSession result',data:{hasSession:Boolean(sess),oauthRedirect:oauthRedir,cacheHadEmail:cacheBefore,hypothesisId:'H1'},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  if (!sess) {
    // During OAuth return, `getSession()` can briefly be empty while PKCE finishes — don’t wipe cache.
    if (oauthRedir) {
      console.info('[fetch:session] no session yet during OAuth redirect; keeping cache')
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchUserSession.ts:noSessOAuth',message:'keeping cache oauth redirect',data:{hypothesisId:'H1'},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      return readSessionCache()
    }
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchUserSession.ts:clearCache',message:'writeSessionCache null no session',data:{hypothesisId:'H1'},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    writeSessionCache(null)
    return null
  }

  console.info('[fetch:session] access token present, loading user')
  const { data: userData, error: userErr } = await sb.auth.getUser()
  let user: User | null = userData.user ?? null
  const getUserFailed = Boolean(userErr || !user?.id)
  if (userErr || !user?.id) {
    if (userErr) {
      console.warn('[fetch:session] getUser failed, falling back to session user', userErr.message)
    }
    user = sess.user
  }
  if (!user?.id) {
    console.warn('[fetch:session] no user id on session; keeping prior cache')
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchUserSession.ts:noUserId',message:'keeping prior cache',data:{getUserFailed,hypothesisId:'H5'},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    return readSessionCache()
  }

  console.info('[fetch:session] user id', user.id)
  const email = primaryEmailFromSupabaseUser(user)
  const displayName =
    (typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()) ||
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    email.split('@')[0] ||
    'there'

  let profileUsername: string | undefined =
    typeof user.user_metadata?.username === 'string' ? user.user_metadata.username.trim() : undefined

  try {
    await ensureProfile(user)
    const sp = await ensureUserProfile(user)
    if (sp?.username?.trim()) profileUsername = profileUsername ?? sp.username.trim()
  } catch (e) {
    console.error('[fetch:profile] ensureUserProfile during refreshSessionFromSupabase failed', e)
  }

  const row: FetchUserRecord = {
    id: user.id,
    email,
    displayName,
    username: profileUsername,
    phone: '',
    createdAt: Date.now(),
  }
  writeSessionCache(row)
  // #region agent log
  fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchUserSession.ts:refreshOk',message:'cache written',data:{ms:Date.now()-t0,emailLen:email.length,hasUsername:Boolean(profileUsername),hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
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
