import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { applyServerUserProfile, refreshSessionFromSupabase } from '../lib/fetchUserSession'
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import {
  getMySupabaseProfile,
  isAutomaticDefaultUsername,
  updateMySupabaseProfile,
  validateUsername,
} from '../lib/supabase/profiles'
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
  onSuccess: () => void
  onBack: () => void
  /** Open on sign-in or sign-up tab */
  initialTab?: 'signin' | 'signup'
}

export default function AuthScreen({ onSuccess, onBack, initialTab = 'signin' }: AuthScreenProps) {
  const serverDbAuth = true
  const [tab, setTab] = useState<'signin' | 'signup'>(initialTab)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [needsUsername, setNeedsUsername] = useState(false)
  const [username, setUsername] = useState('')

  const afterSupabaseAuth = useCallback(async () => {
    const me = await refreshSessionFromSupabase()
    if (!me) throw new Error('Could not load your session.')
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'AuthScreen:afterSupabaseAuth',message:'session loaded',data:{hasProfileStep:true,uidLen:me.id?.length??0,hypothesisId:'P1'},timestamp:Date.now(),hypothesisId:'P1'})}).catch(()=>{});
    // #endregion
    const profile = await getMySupabaseProfile()
    if (!profile) throw new Error('Could not create or load your profile. Run the profiles SQL in Supabase.')
    console.log('USERNAME', profile?.username ?? null)
    const needHandle = !profile?.username || isAutomaticDefaultUsername(profile.username, me.id)
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'AuthScreen:afterSupabaseAuth',message:'profile gate',data:{needHandle,unameLen:(profile.username||'').length,hypothesisId:'P1'},timestamp:Date.now(),hypothesisId:'P1'})}).catch(()=>{});
    // #endregion
    if (needHandle) {
      setNeedsUsername(true)
      setUsername(
        profile?.username && !isAutomaticDefaultUsername(profile.username, me.id) ? profile.username : '',
      )
      return
    }
    applyServerUserProfile({
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      username: profile.username,
    })
    onSuccess()
  }, [onSuccess])

  useEffect(() => {
    void (async () => {
      const sb = getSupabaseBrowserClient()
      if (!sb) return
      const {
        data: { session },
      } = await sb.auth.getSession()
      if (session?.access_token) {
        try {
          await afterSupabaseAuth()
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not finish sign-in.'
          setError(msg)
        }
      }
    })()
  }, [afterSupabaseAuth])

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
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
        const { error: authError } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (authError) {
          setError(authError.message || mapServerAuthError('invalid_credentials'))
          return
        }
        await afterSupabaseAuth()
      } finally {
        setBusy(false)
      }
      return
    }
  }

  const onSignUp = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
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
        const { data: signUpData, error: authError } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
          },
        })
        if (authError) {
          setError(authError.message || mapServerAuthError('invalid_credentials'))
          return
        }
        if (!signUpData.session) {
          const { error: signInErr } = await sb.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
          if (signInErr) {
            setError(
              'Account created. Check your email to verify, then log in to continue setup.',
            )
            return
          }
        }
        await afterSupabaseAuth()
      } finally {
        setBusy(false)
      }
      return
    }
  }

  const onCompleteUsername = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const err = validateUsername(username)
    if (err) {
      setError(err)
      return
    }
    setBusy(true)
    try {
      const updated = await updateMySupabaseProfile({ username: username.trim() })
      // #region agent log
      fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'AuthScreen:onCompleteUsername',message:'username saved',data:{ok:true,hypothesisId:'P2'},timestamp:Date.now(),hypothesisId:'P2'})}).catch(()=>{});
      // #endregion
      await refreshSessionFromSupabase()
      const me = await refreshSessionFromSupabase()
      if (me?.email) {
        applyServerUserProfile({
          id: me.id,
          email: me.email,
          displayName: me.displayName,
          username: updated.username || undefined,
        })
      }
      onSuccess()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not set username.'
      setError(msg.toLowerCase().includes('duplicate') ? 'That username is already taken.' : msg)
    } finally {
      setBusy(false)
    }
  }

  const signInWithGoogleOAuth = async () => {
    setError(null)
    setBusy(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase is not configured in this app.')
        return
      }
      const redirectTo = getOAuthRedirectTo()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (oauthError) setError(oauthError.message || 'Google sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const signInWithAppleOAuth = async () => {
    setError(null)
    setBusy(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase is not configured in this app.')
        return
      }
      const redirectTo = getOAuthRedirectTo()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo },
      })
      if (oauthError) setError(oauthError.message || 'Apple sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'fetch-auth-input rounded-xl border border-white/12 bg-black/40 px-3 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none ring-0 focus:border-white/25'

  const emailInsteadLabel = tab === 'signup' ? 'Sign up with email instead' : 'Log in with email instead'

  return (
    <div className="fetch-auth-screen fetch-theme-chrome mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8 pt-[max(0.65rem,env(safe-area-inset-top))]">
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

      {needsUsername ? (
        <form onSubmit={onCompleteUsername} className="mt-4 flex max-w-md flex-col gap-2">
          <label className="fetch-auth-label text-[10px] font-semibold uppercase tracking-[0.1em] text-white/38">
            Choose username
          </label>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="my_store_name"
            className={inputClass}
          />
          <p className="text-[11px] text-white/55">3-20 chars, letters/numbers/underscore.</p>
          {error ? <p className="text-[11px] text-red-300/90">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl bg-black py-3 text-[14px] font-bold text-white ring-1 ring-white/20 hover:bg-zinc-950 disabled:opacity-45"
          >
            {busy ? 'Please wait…' : 'Continue'}
          </button>
        </form>
      ) : !showEmailForm ? (
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
  )
}
