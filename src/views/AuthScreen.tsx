import { useCallback, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { refreshSessionFromSupabase } from '../lib/fetchUserSession'
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import { getOAuthRedirectTo } from '../lib/supabase/oauthSession'
import { OAuthBrandedButtons } from '../components/auth/OAuthBrandedButtons'
import { FetchEyesHomeIcon } from '../components/icons/HomeShellNavIcons'
import { getFetchDevDemoPasswordPrefill } from '../lib/fetchDevDemo'

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
  const [password, setPassword] = useState(getFetchDevDemoPasswordPrefill)
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
    'rounded-xl border border-zinc-300/80 bg-white px-3 py-2.5 text-[14px] text-zinc-900 placeholder:text-zinc-400 outline-none ring-0 focus:border-[#134632]/50 focus:ring-2 focus:ring-[#134632]/15'

  const emailInsteadLabel = tab === 'signup' ? 'Sign up with email instead' : 'Log in with email instead'

  const tabBtnActive =
    'flex-1 rounded-[0.6rem] bg-[#134632] py-2.5 text-[12px] font-semibold text-white shadow-sm'
  const tabBtnInactive = 'flex-1 rounded-[0.6rem] py-2.5 text-[12px] font-medium text-zinc-500'

  return (
    <div className="mx-auto flex min-h-dvh min-h-[100dvh] w-full max-w-lg flex-col bg-[#e8dfc9]">
      {/* Hero — dark green brand strip */}
      <header className="relative flex min-h-[min(44vh,340px)] shrink-0 flex-col bg-gradient-to-b from-[#1a5c45] to-[#134632] px-5 pt-[max(0.65rem,env(safe-area-inset-top))] pb-10">
        <button
          type="button"
          onClick={onBack}
          className="self-start rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#f4ece0]/80 hover:text-[#f4ece0]"
        >
          Back
        </button>
        <div className="flex flex-1 flex-col items-center justify-center px-2 pb-2 text-center">
          <div className="flex items-center justify-center gap-4 sm:gap-5">
            <FetchEyesHomeIcon className="h-[4.25rem] w-[4.25rem] shrink-0 text-[#f4ece0] sm:h-[5.25rem] sm:w-[5.25rem]" />
            <span className="fetch-home-map-brand-logo text-[clamp(2.5rem,10vw,3.5rem)] font-bold leading-none tracking-[-0.04em] text-[#f4ece0]">
              Fetch
            </span>
          </div>
          <p className="mt-5 max-w-[18rem] text-[15px] font-medium leading-snug tracking-[-0.01em] text-[#f4ece0]/88">
            Anything, on demand, nearby.
          </p>
        </div>
      </header>

      {/* Sand panel — forms & OAuth sit lower with clear separation */}
      <main className="relative -mt-5 flex min-h-0 flex-1 flex-col rounded-t-[26px] bg-[#e8dfc9] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-10px_40px_-14px_rgba(0,0,0,0.18)]">
        <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto overscroll-contain">
          <h1 className="text-[21px] font-semibold tracking-[-0.03em] text-zinc-900">
            Account
          </h1>
          <p className="mt-1 text-[13px] leading-snug text-zinc-600">
            Continue with Apple or Google, or use email.
          </p>

          <div className="mt-5 flex gap-1 rounded-2xl border border-zinc-300/70 bg-white/50 p-1">
            <button
              type="button"
              onClick={() => {
                setTab('signin')
                setError(null)
                setShowEmailForm(false)
              }}
              className={tab === 'signin' ? tabBtnActive : tabBtnInactive}
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
              className={tab === 'signup' ? tabBtnActive : tabBtnInactive}
            >
              Sign up
            </button>
          </div>

          {!showEmailForm ? (
            <div className="mt-10 flex flex-col gap-3">
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
                className="mt-2 w-full py-2.5 text-[13px] font-semibold text-[#134632] underline decoration-[#134632]/35 underline-offset-4 hover:text-[#0f3628]"
              >
                {emailInsteadLabel}
              </button>
              {message ? <p className="text-[12px] text-emerald-800">{message}</p> : null}
              {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
            </div>
          ) : tab === 'signin' ? (
            <form onSubmit={onSignIn} className="mt-8 flex max-w-md flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false)
                  setError(null)
                }}
                className="mb-1 self-start text-[12px] font-semibold text-zinc-600 hover:text-zinc-900"
              >
                ← Apple / Google
              </button>
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
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
                  <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
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
              {message ? <p className="text-[12px] text-emerald-800">{message}</p> : null}
              {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-xl bg-[#134632] py-3 text-[14px] font-bold text-white shadow-sm transition-colors hover:bg-[#0f3628] disabled:opacity-45"
              >
                {busy ? 'Please wait…' : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={onSignUp} className="mt-8 flex max-w-md flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false)
                  setError(null)
                }}
                className="mb-1 self-start text-[12px] font-semibold text-zinc-600 hover:text-zinc-900"
              >
                ← Apple / Google
              </button>
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
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
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
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
              <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Phone{' '}
                <span className="font-normal text-zinc-400">(optional)</span>
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
                  <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
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
              {message ? <p className="text-[12px] text-emerald-800">{message}</p> : null}
              {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-xl bg-[#134632] py-3 text-[14px] font-bold text-white shadow-sm transition-colors hover:bg-[#0f3628] disabled:opacity-45"
              >
                {busy ? 'Please wait…' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
