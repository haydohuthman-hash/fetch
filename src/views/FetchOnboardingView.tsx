import { useCallback, useEffect, useRef, useState } from 'react'
import { refreshSessionFromSupabase, loadSession } from '../lib/fetchUserSession'
import {
  completeFetchProfileOnboarding,
  uploadMySupabaseAvatar,
} from '../lib/supabase/profiles'

export type FetchOnboardingViewProps = {
  onComplete: () => void
  allowDismiss?: boolean
  onDismiss?: () => void
}

const shell =
  'min-h-dvh w-full bg-[#F5F5F5] text-zinc-900 antialiased selection:bg-zinc-900/10 flex flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]'

const card = 'w-full max-w-md mx-auto rounded-[22px] bg-white/90 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.25)] px-7 py-10'

const btnPrimary =
  'w-full rounded-2xl bg-zinc-900 py-4 text-[16px] font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-45'

const btnGhost = 'text-[14px] font-medium text-zinc-500 underline-offset-4 hover:text-zinc-800'

export default function FetchOnboardingView({
  onComplete,
  allowDismiss,
  onDismiss,
}: FetchOnboardingViewProps) {
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panelVisible, setPanelVisible] = useState(true)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const s = loadSession()
    const seed = (s?.displayName || '').trim()
    if (seed) setName(seed)
  }, [])

  useEffect(() => {
    if (step === 1) {
      const t = window.setTimeout(() => nameInputRef.current?.focus(), reducedMotion ? 0 : 180)
      return () => window.clearTimeout(t)
    }
    return
  }, [step, reducedMotion])

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const goStep = useCallback(
    (next: number) => {
      if (reducedMotion) {
        setPanelVisible(true)
        setStep(next)
        return
      }
      setPanelVisible(false)
      window.setTimeout(() => {
        setStep(next)
        setPanelVisible(true)
      }, 200)
    },
    [reducedMotion],
  )

  const onFinish = async () => {
    const n = name.trim()
    if (n.length < 1) {
      setError('Please enter your name.')
      return
    }
    setError(null)
    setBusy(true)
    console.log('[ONBOARDING] completing flow', { hasAvatar: Boolean(avatarFile) })
    try {
      let avatarUrl: string | null = null
      if (avatarFile) {
        avatarUrl = await uploadMySupabaseAvatar(avatarFile)
      }
      await completeFetchProfileOnboarding({ fullName: n, avatarUrl })
      await refreshSessionFromSupabase()
      console.log('[ONBOARDING] done → app')
      onComplete()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      console.error('[ONBOARDING] complete failed', e)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={shell}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {allowDismiss && onDismiss ? (
          <button type="button" onClick={onDismiss} className={`mb-4 self-start ${btnGhost}`}>
            Cancel
          </button>
        ) : (
          <div className="mb-4 h-8" aria-hidden />
        )}

        <div
          className={[
            'flex flex-1 flex-col transition-all duration-200 ease-out',
            panelVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
            reducedMotion ? 'transition-none' : '',
          ].join(' ')}
        >
          {step === 0 ? (
            <div className={card}>
              <p className="text-[13px] font-medium uppercase tracking-[0.2em] text-zinc-400">Welcome</p>
              <h1 className="mt-3 text-[clamp(1.75rem,6vw,2.25rem)] font-bold leading-tight tracking-[-0.04em] text-zinc-900">
                Welcome to Fetch
              </h1>
              <p className="mt-4 text-[16px] leading-relaxed text-zinc-600">
                Book help, browse Drops, and chat — all in one calm place.
              </p>
              <button type="button" className={`${btnPrimary} mt-10`} onClick={() => goStep(1)}>
                Let&apos;s set you up
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className={card}>
              <h1 className="text-[clamp(1.5rem,5vw,1.9rem)] font-bold tracking-[-0.035em] text-zinc-900">
                What should we call you?
              </h1>
              <p className="mt-2 text-[15px] text-zinc-600">This is how you&apos;ll show up around Fetch.</p>
              <input
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                className="mt-8 w-full rounded-2xl border-0 bg-zinc-100/90 px-4 py-4 text-[17px] font-medium text-zinc-900 outline-none ring-2 ring-transparent transition-shadow placeholder:text-zinc-400 focus:ring-zinc-900/15"
              />
              {error ? <p className="mt-3 text-[14px] text-red-600">{error}</p> : null}
              <button
                type="button"
                className={`${btnPrimary} mt-8`}
                onClick={() => {
                  if (!name.trim()) {
                    setError('Add a name to continue.')
                    return
                  }
                  setError(null)
                  goStep(2)
                }}
              >
                Continue
              </button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className={card}>
              <h1 className="text-[clamp(1.5rem,5vw,1.9rem)] font-bold tracking-[-0.035em] text-zinc-900">
                Want a profile photo?
              </h1>
              <p className="mt-2 text-[15px] text-zinc-600">Totally optional — you can always add one later.</p>
              <div className="mt-8 flex flex-col items-center gap-4">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-zinc-100 ring-4 ring-white shadow-inner">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[42px]">🙂</span>
                  )}
                </div>
                <label className="cursor-pointer rounded-2xl bg-zinc-100 px-5 py-3 text-[14px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-200">
                  Choose photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setAvatarFile(f)
                      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
                      setAvatarPreview(f ? URL.createObjectURL(f) : null)
                    }}
                  />
                </label>
              </div>
              {error ? <p className="mt-3 text-center text-[14px] text-red-600">{error}</p> : null}
              <div className="mt-10 flex flex-col gap-3">
                <button type="button" className={btnPrimary} onClick={() => goStep(3)}>
                  {avatarFile ? 'Looks good' : 'Skip for now'}
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className={card}>
              <h1 className="text-[clamp(1.5rem,5vw,1.9rem)] font-bold tracking-[-0.035em] text-zinc-900">
                You&apos;re ready
              </h1>
              <p className="mt-2 text-[15px] text-zinc-600">
                Thanks, {name.trim().split(/\s+/)[0] || 'friend'}. Let&apos;s jump in.
              </p>
              {error ? <p className="mt-4 text-[14px] text-red-600">{error}</p> : null}
              <button type="button" className={`${btnPrimary} mt-10`} disabled={busy} onClick={() => void onFinish()}>
                {busy ? 'Saving…' : 'Enter app'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
