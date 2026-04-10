import { useCallback, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { refreshSessionFromSupabase } from '../lib/fetchUserSession'
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import { getOAuthRedirectTo } from '../lib/supabase/oauthSession'
import { OAuthBrandedButtons } from '../components/auth/OAuthBrandedButtons'

function mapServerAuthError(code: string): string {
  switch (code) {
    case 'email_taken':
      return 'That email already has an account. Sign in instead.'
    case 'invalid_credentials':
      return 'Email or password is incorrect.'
    case 'password_too_short':
      return 'Password must be at least 8 characters.'
    case 'display_name_required':
      return 'Enter your name.'
    case 'invalid_email':
      return 'Enter a valid email.'
    case 'server_auth_not_configured':
      return 'Server accounts are not enabled. Set FETCH_AUTH_USERS_DB=1 and DATABASE_URL on the API.'
    default:
      return 'Something went wrong. Try again.'
  }
}

type AuthScreenProps = {
  /** Called after Supabase session is valid — parent runs `handlePostAuthUser`. */
  onSignedIn: (user: User) => void | Promise<void>
  onBack: () => void
  initialTab?: 'signin' | 'signup'
}

export default function AuthScreen({ onSignedIn, onBack, initialTab = 'signin' }: AuthScreenProps) {
  const serverDbAuth = true
  const [tab, setTab] = useState<'signin' | 'signup'>(initialTab)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const requireAuthenticatedSessionUser = useCallback(async () => {
    const sb = getSupabaseBrowserClient()
    if (!sb) throw new Error('Supabase is not configured in this app.')
    const { data, error: sessionError } = await sb.auth.getSession()
    console.log('[AUTH] getSession in AuthScreen:', Boolean(data.session?.user), sessionError?.message ?? '')
    if (sessionError) throw sessionError
    const user = data.session?.user ?? null
    if (!user) throw new Error('Authentication incomplete. Please sign in again.')
    return user
  }, [])

  const afterSupabaseAuth = useCallback(async () => {
    const sessionUser = await requireAuthenticatedSessionUser()
    console.log('[AUTH] AuthScreen → refresh + onSignedIn', sessionUser.id)
    await refreshSessionFromSupabase()
    await onSignedIn(sessionUser)
  }, [onSignedIn, requireAuthenticatedSessionUser])

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    console.log('[AUTH] login start')
    if (serverDbAuth) {
      if (password.length < 8) {
        setError('Enter your password (at least 8 characters).')
        return
      }
      setBusy(true)
      try {
        const sb = getSupabaseBrowserClient()
        if (!sb) {
          setError('Supabase is not configured in this app.')
          return
        }
        const { data, error: authError } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        console.log('[AUTH] login result:', Boolean(data.session), authError?.message)
        if (authError) throw authError
        const session = data?.session || null
        const user = data?.user || null
        if (!session || !user) throw new Error('Login failed: no session')
        await afterSupabaseAuth()
      } catch (e) {
        const msg = e instanceof Error ? e.message : mapServerAuthError('invalid_credentials')
        console.error('[AUTH] login error:', e)
        setError(msg)
      } finally {
        setBusy(false)
      }
    }
  }

  const onSignUp = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    console.log('[AUTH] signup start')
    if (serverDbAuth) {
      if (password.length < 8) {
        setError('Choose a password at least 8 characters long.')
        return
      }
      setBusy(true)
      try {
        const sb = getSupabaseBrowserClient()
        if (!sb) {
          setError('Supabase is not configured in this app.')
          return
        }
        const { data, error: authError } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: displayName.trim() || '' },
          },
        })
        console.log('[AUTH] signup result:', Boolean(data.session), authError?.message)
        if (authError) {
          console.error('[AUTH] signup error:', authError)
          throw authError
        }
        const session = data?.session || null
        const user = data?.user || null
        if (!user) throw new Error('Signup succeeded but no user returned')
        if (!session) {
          console.log('[AUTH] no session (email confirmation required)')
          setMessage('Account created. Check your email to confirm your account.')
          return
        }
        await afterSupabaseAuth()
      } catch (e) {
        const msg = e instanceof Error ? e.message : mapServerAuthError('invalid_credentials')
        setError(msg)
      } finally {
        setBusy(false)
      }
    }
  }

  const signInWithGoogleOAuth = async () => {
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase is not configured in this app.')
        return
      }
      const redirectTo = getOAuthRedirectTo()
      console.log('[AUTH] oauth redirectTo:', redirectTo)
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      console.log('[AUTH] oauth google:', data?.url ? 'redirecting' : 'no url', oauthError?.message)
      if (oauthError) setError(oauthError.message || 'Google sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const signInWithAppleOAuth = async () => {
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase is not configured in this app.')
        return
      }
      const redirectTo = getOAuthRedirectTo()
      console.log('[AUTH] oauth redirectTo:', redirectTo)
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo },
      })
      console.log('[AUTH] oauth apple:', data?.url ? 'redirecting' : 'no url', oauthError?.message)
      if (oauthError) setError(oauthError.message || 'Apple sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'fetch-auth-input rounded-xl border border-white/12 bg-black/40 px-3 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none ring-0 focus:border-white/25'

  const emailInsteadLabel = tab === 'signup' ? 'Sign up with email instead' : 'Log in with email instead'

  return (
    <div className="fetch-auth-screen mx-auto flex min-h-dvh min-h-[100dvh] w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-md px-4 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="fetch-auth-back rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white/65 hover:text-white"
        >
          Back
        </button>
      </div>

      <h1 className="fetch-auth-heading mt-3 text-[21px] font-semibold tracking-[-0.03em] text-white">Account</h1>
      <p className="fetch-auth-lede mt-1 max-w-md text-[12px] leading-snug text-white/50">
        Continue with Apple or Google, or use email.
      </p>

      <div className="fetch-auth-tabs mt-4 flex gap-0.5 rounded-xl border border-white/10 bg-black/40 p-0.5">
        <button
          type="button"
          onClick={() => {
            setTab('signin')
            setError(null)
            setShowEmailForm(false)
          }}
          className={
            tab === 'signin'
              ? 'fetch-auth-tab-active flex-1 rounded-[0.6rem] bg-black py-2 text-[12px] font-semibold text-white ring-1 ring-white/15'
              : 'fetch-auth-tab-inactive flex-1 rounded-[0.6rem] py-2 text-[12px] font-medium text-white/40'
          }
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('signup')
            setError(null)
            setShowEmailForm(false)
          }}
          className={
            tab === 'signup'
              ? 'fetch-auth-tab-active flex-1 rounded-[0.6rem] bg-black py-2 text-[12px] font-semibold text-white ring-1 ring-white/15'
              : 'fetch-auth-tab-inactive flex-1 rounded-[0.6rem] py-2 text-[12px] font-medium text-white/40'
          }
        >
          Sign up
        </button>
      </div>

      {!showEmailForm ? (
        <div className="mt-4 flex flex-col gap-2">
          <OAuthBrandedButtons
            disabled={busy}
            onApple={() => void signInWithAppleOAuth()}
            onGoogle={() => void signInWithGoogleOAuth()}
          />
          <button
            type="button"
            onClick={() => {
              setError(null)
              setShowEmailForm(true)
            }}
            className="mt-1 w-full py-2.5 text-[13px] font-semibold text-white/70 underline decoration-white/30 underline-offset-2 hover:text-white"
          >
            {emailInsteadLabel}
          </button>
          {message ? <p className="mt-1 text-[11px] text-emerald-300/90">{message}</p> : null}
          {error ? <p className="mt-1 text-[11px] text-red-300/90">{error}</p> : null}
        </div>
      ) : tab === 'signin' ? (
        <form onSubmit={onSignIn} className="mt-4 flex max-w-md flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setShowEmailForm(false)
              setError(null)
            }}
            className="mb-1 self-start text-[12px] font-semibold text-white/55 hover:text-white"
          >
            ← Apple / Google
          </button>
          <label className="fetch-auth-label text-[10px] font-semibold uppercase tracking-[0.1em] text-white/38">
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={inputClass}
          />
          {serverDbAuth ? (
            <>
              <label className="fetch-auth-label text-[10px] font-semibold uppercase tracking-[0.1em] text-white/38">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </>
          ) : null}
          {message ? <p className="text-[11px] text-emerald-300/90">{message}</p> : null}
          {error ? <p className="text-[11px] text-red-300/90">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl bg-black py-3 text-[14px] font-bold text-white ring-1 ring-white/20 hover:bg-zinc-950 disabled:opacity-45"
          >
            {busy ? 'Please wait…' : 'Continue'}
          </button>
        </form>
      ) : (
        <form onSubmit={onSignUp} className="mt-4 flex max-w-md flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setShowEmailForm(false)
              setError(null)
            }}
            className="mb-1 self-start text-[12px] font-semibold text-white/55 hover:text-white"
          >
            ← Apple / Google
          </button>
          <label className="fetch-auth-label text-[10px] font-semibold uppercase tracking-[0.1em] text-white/38">
            Name
          </label>
          <input
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className={inputClass}
          />
          <label className="fetch-auth-label text-[10px] font-semibold uppercase tracking-[0.1em] text-white/38">
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={inputClass}
          />
          <label className="fetch-auth-label text-[10px] font-semibold uppercase tracking-[0.1em] text-white/38">
            Phone <span className="fetch-auth-label-note font-normal text-white/35">(optional)</span>
          </label>
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+61 …"
            className={inputClass}
          />
          {serverDbAuth ? (
            <>
              <label className="fetch-auth-label text-[10px] font-semibold uppercase tracking-[0.1em] text-white/38">
                Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={inputClass}
              />
            </>
          ) : null}
          {message ? <p className="text-[11px] text-emerald-300/90">{message}</p> : null}
          {error ? <p className="text-[11px] text-red-300/90">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl bg-black py-3 text-[14px] font-bold text-white ring-1 ring-white/20 hover:bg-zinc-950 disabled:opacity-45"
          >
            {busy ? 'Please wait…' : 'Create account'}
          </button>
        </form>
      )}
        </div>
      </div>
    </div>
  )
}
