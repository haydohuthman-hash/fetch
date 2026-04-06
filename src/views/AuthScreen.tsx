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

  return (
    <div className="fetch-auth-screen fetch-theme-chrome mx-auto flex min-h-dvh w-full max-w-[1024px] flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="fetch-auth-back rounded-full px-3 py-2 text-[13px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          Back
        </button>
      </div>

      <h1 className="fetch-auth-heading mt-4 text-[26px] font-semibold tracking-[-0.03em] text-white">
        Account
      </h1>
      <p className="fetch-auth-lede mt-1 max-w-md text-[13px] leading-snug text-white/55">
        {serverDbAuth
          ? 'Sign in with email and password. Your session is verified by the server.'
          : 'Sign in or create an account. Fetch remembers your saved addresses and greets you by name.'}
      </p>

      <div className="fetch-auth-tabs mt-6 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
        <button
          type="button"
          onClick={() => {
            setTab('signin')
            setError(null)
          }}
          className={
            tab === 'signin'
              ? 'fetch-auth-tab-active flex-1 rounded-full bg-white/12 py-2.5 text-[13px] font-semibold text-white'
              : 'fetch-auth-tab-inactive flex-1 rounded-full py-2.5 text-[13px] font-medium text-white/45'
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
              ? 'fetch-auth-tab-active flex-1 rounded-full bg-white/12 py-2.5 text-[13px] font-semibold text-white'
              : 'fetch-auth-tab-inactive flex-1 rounded-full py-2.5 text-[13px] font-medium text-white/45'
          }
        >
          Sign up
        </button>
      </div>

      {tab === 'signin' ? (
        <form onSubmit={onSignIn} className="mt-6 flex max-w-md flex-col gap-3">
          <label className="fetch-auth-label text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="fetch-auth-input rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none ring-0 focus:border-violet-400/45"
          />
          {serverDbAuth ? (
            <>
              <label className="fetch-auth-label text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="fetch-auth-input rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none ring-0 focus:border-violet-400/45"
              />
            </>
          ) : null}
          {error ? <p className="text-[12px] text-red-300/90">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-2xl bg-gradient-to-b from-violet-500 to-violet-700 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-violet-950/40 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : 'Continue'}
          </button>
        </form>
      ) : (
        <form onSubmit={onSignUp} className="mt-6 flex max-w-md flex-col gap-3">
          <label className="fetch-auth-label text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Name
          </label>
          <input
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="fetch-auth-input rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none focus:border-violet-400/45"
          />
          <label className="fetch-auth-label text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="fetch-auth-input rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none focus:border-violet-400/45"
          />
          <label className="fetch-auth-label text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Phone <span className="fetch-auth-label-note font-normal text-white/35">(optional)</span>
          </label>
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+61 …"
            className="fetch-auth-input rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none focus:border-violet-400/45"
          />
          {serverDbAuth ? (
            <>
              <label className="fetch-auth-label text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="fetch-auth-input rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none focus:border-violet-400/45"
              />
            </>
          ) : null}
          {error ? <p className="text-[12px] text-red-300/90">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-2xl bg-gradient-to-b from-violet-500 to-violet-700 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-violet-950/40 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  )
}
