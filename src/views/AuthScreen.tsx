import { useState, type FormEvent } from 'react'
import { postLogin, postRegister } from '../lib/fetchServerAuth'
import { syncCustomerSessionCookie } from '../lib/fetchServerSession'
import { applyServerUserProfile, signInUser, signUpUser } from '../lib/fetchUserSession'

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

export default function AuthScreen({
  onSuccess,
  onBack,
  initialTab = 'signin',
}: AuthScreenProps) {
  const serverDbAuth = import.meta.env.VITE_FETCH_AUTH_USERS_DB === '1'
  const [tab, setTab] = useState<'signin' | 'signup'>(initialTab)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        const r = await postLogin({ email, password })
        if (!r.ok) {
          setError(mapServerAuthError(r.error))
          return
        }
        applyServerUserProfile(r.user)
        onSuccess()
      } finally {
        setBusy(false)
      }
      return
    }
    const r = signInUser(email)
    if (!r.ok) {
      setError(r.error)
      return
    }
    void syncCustomerSessionCookie()
    onSuccess()
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
        const r = await postRegister({ email, password, displayName })
        if (!r.ok) {
          setError(mapServerAuthError(r.error))
          return
        }
        applyServerUserProfile(r.user)
        onSuccess()
      } finally {
        setBusy(false)
      }
      return
    }
    const r = signUpUser({ email, displayName, phone })
    if (!r.ok) {
      setError(r.error)
      return
    }
    void syncCustomerSessionCookie()
    onSuccess()
  }

  const inputClass =
    'fetch-auth-input rounded-xl border border-white/12 bg-black/40 px-3 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none ring-0 focus:border-white/25'

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
        {serverDbAuth
          ? 'Email and password — verified by the server.'
          : 'Sign in or create an account. Fetch saves your preferences and name.'}
      </p>

      <div className="fetch-auth-tabs mt-4 flex gap-0.5 rounded-xl border border-white/10 bg-black/40 p-0.5">
        <button
          type="button"
          onClick={() => {
            setTab('signin')
            setError(null)
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

      {tab === 'signin' ? (
        <form onSubmit={onSignIn} className="mt-4 flex max-w-md flex-col gap-2">
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
