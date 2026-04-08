import { useCallback, useEffect, useRef, useState } from 'react'
import {
  completePlatformOnboarding,
  FETCHER_INTEREST_OPTIONS,
  PARTNER_INTEREST_OPTIONS,
  type PlatformInterestId,
  type PlatformRole,
} from '../lib/fetchPlatformIdentity'

type Step = 'role' | 'interests'

export type AccountOnboardingViewProps = {
  onDoneFetcher: () => void
  onDonePartner: () => void
  onDismissToAccount?: () => void
  allowDismissToAccount?: boolean
}

function hapticLight() {
  try {
    navigator.vibrate?.(12)
  } catch {
    /* ignore */
  }
}

function IconFetcher({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="20" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M15 36c2.2-5.5 7.5-8 9-8s6.8 2.5 9 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M34 12l4-3M10 22h5M38 24h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  )
}

function IconPartner({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M9 30h29l-2.2-12H11.2L9 30z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M12 16h24l-1.8 6H13.8L12 16z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <circle cx="15.5" cy="34" r="2.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="31.5" cy="34" r="2.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export default function AccountOnboardingView({
  onDoneFetcher,
  onDonePartner,
  onDismissToAccount,
  allowDismissToAccount,
}: AccountOnboardingViewProps) {
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const [step, setStep] = useState<Step>('role')
  const [role, setRole] = useState<PlatformRole | null>(null)
  const [highlightRole, setHighlightRole] = useState<PlatformRole | null>(null)
  const [panelOpacity, setPanelOpacity] = useState(1)
  const [interestKey, setInterestKey] = useState(0)
  const [selectedInterest, setSelectedInterest] = useState<Set<PlatformInterestId>>(() => new Set())
  const finishTimerRef = useRef<number | null>(null)
  const finishOnceRef = useRef(false)

  const clearFinishTimer = () => {
    if (finishTimerRef.current != null) {
      window.clearTimeout(finishTimerRef.current)
      finishTimerRef.current = null
    }
  }

  const goInterestsAfterRole = useCallback(
    (r: PlatformRole) => {
      hapticLight()
      setHighlightRole(r)
      const advance = () => {
        if (reducedMotion) {
          setRole(r)
          setSelectedInterest(new Set())
          setInterestKey((k) => k + 1)
          setStep('interests')
          setHighlightRole(null)
          return
        }
        setPanelOpacity(0)
        window.setTimeout(() => {
          setRole(r)
          setSelectedInterest(new Set())
          setInterestKey((k) => k + 1)
          setStep('interests')
          setHighlightRole(null)
          setPanelOpacity(1)
        }, 220)
      }
      window.setTimeout(advance, reducedMotion ? 0 : 120)
    },
    [reducedMotion],
  )

  const toggleInterest = (id: PlatformInterestId) => {
    hapticLight()
    setSelectedInterest((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    clearFinishTimer()
    if (step !== 'interests' || !role) return
    if (selectedInterest.size === 0) return
    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null
      if (finishOnceRef.current) return
      finishOnceRef.current = true
      const ids = [...selectedInterest]
      completePlatformOnboarding({ role, interests: ids })
      if (reducedMotion) {
        if (role === 'partner') onDonePartner()
        else onDoneFetcher()
        return
      }
      setPanelOpacity(0)
      window.setTimeout(() => {
        if (role === 'partner') onDonePartner()
        else onDoneFetcher()
      }, 260)
    }, 560)
    return clearFinishTimer
  }, [step, role, selectedInterest, onDoneFetcher, onDonePartner, reducedMotion])

  useEffect(() => {
    if (step === 'role') finishOnceRef.current = false
  }, [step])

  const interestOptions =
    role === 'partner'
      ? PARTNER_INTEREST_OPTIONS
      : role === 'fetcher'
        ? FETCHER_INTEREST_OPTIONS
        : []

  const dimActive = highlightRole !== null

  return (
    <div className="fetch-onboarding-root fetch-account-screen fetch-account-screen--home-glow fetch-theme-chrome relative mx-auto flex min-h-dvh w-full max-w-[1024px] flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        className={[
          'pointer-events-none fixed inset-0 z-0 transition-[background-color] duration-200 ease-out',
          dimActive ? 'bg-black/35' : 'bg-black/0',
        ].join(' ')}
        aria-hidden
      />

      <div className="relative z-10 flex flex-1 flex-col">
        {step === 'role' ? (
          <div className="flex flex-col pt-1">
            {allowDismissToAccount && onDismissToAccount ? (
              <button
                type="button"
                onClick={onDismissToAccount}
                className="fetch-account-btn-ghost-glass mb-4 self-start px-3 py-2 text-[13px] font-semibold"
              >
                Cancel
              </button>
            ) : (
              <div className="mb-4 h-10" aria-hidden />
            )}

            <div className="mx-auto w-full max-w-md flex-1 px-1">
              <h1 className="fetch-onboarding-title text-center text-[clamp(1.45rem,5.2vw,1.85rem)] font-semibold tracking-[-0.035em]">
                How do you want to use Fetch?
              </h1>
              <p className="fetch-onboarding-sub mx-auto mt-3 max-w-[20rem] text-center text-[14px] leading-snug">
                Choose your role. You can switch anytime.
              </p>

              <div className="mt-10 flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => goInterestsAfterRole('fetcher')}
                  aria-pressed={highlightRole === 'fetcher'}
                  className={[
                    'fetch-onboarding-card-in group relative flex w-full flex-col items-start gap-3 rounded-[1.35rem] border p-5 text-left transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out',
                    'bg-[var(--fetch-onb-card-bg)] shadow-[var(--fetch-onb-card-shadow)]',
                    highlightRole === 'fetcher'
                      ? 'fetch-onboarding-card--selected scale-[1.045] border-emerald-400/55 shadow-[0_0_48px_rgba(52,211,153,0.22),var(--fetch-onb-card-shadow)]'
                      : 'border-[var(--fetch-onb-card-border)] hover:border-white/22',
                    highlightRole && highlightRole !== 'fetcher' ? 'scale-[0.98] opacity-45' : '',
                  ].join(' ')}
                >
                  <IconFetcher className="h-12 w-12 shrink-0 text-[var(--fetch-onb-icon)] transition-transform duration-150 group-hover:scale-105" />
                  <div>
                    <p className="fetch-onboarding-title text-[1.15rem] font-semibold tracking-[-0.02em]">
                      Fetcher
                    </p>
                    <p className="fetch-onboarding-sub mt-1.5 text-[14px] leading-relaxed">
                      Buy, sell, discover and go live
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => goInterestsAfterRole('partner')}
                  aria-pressed={highlightRole === 'partner'}
                  className={[
                    'fetch-onboarding-card-in fetch-onboarding-card-in--2 group relative flex w-full flex-col items-start gap-3 rounded-[1.35rem] border p-5 text-left transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out',
                    'bg-[var(--fetch-onb-card-bg)] shadow-[var(--fetch-onb-card-shadow)]',
                    highlightRole === 'partner'
                      ? 'fetch-onboarding-card--selected scale-[1.045] border-emerald-400/55 shadow-[0_0_48px_rgba(52,211,153,0.22),var(--fetch-onb-card-shadow)]'
                      : 'border-[var(--fetch-onb-card-border)] hover:border-white/22',
                    highlightRole && highlightRole !== 'partner' ? 'scale-[0.98] opacity-45' : '',
                  ].join(' ')}
                >
                  <IconPartner className="h-12 w-12 shrink-0 text-[var(--fetch-onb-icon)] transition-transform duration-150 group-hover:scale-105" />
                  <div>
                    <p className="fetch-onboarding-title text-[1.15rem] font-semibold tracking-[-0.02em]">
                      Fetch Partner
                    </p>
                    <p className="fetch-onboarding-sub mt-1.5 text-[14px] leading-relaxed">
                      Deliver, move, clean and earn
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            key={interestKey}
            className={[
              'flex flex-1 flex-col pt-1',
              reducedMotion ? '' : 'fetch-onboarding-panel-transition--enter',
            ].join(' ')}
            style={{ opacity: panelOpacity }}
          >
            <button
              type="button"
              onClick={() => {
                clearFinishTimer()
                if (reducedMotion) {
                  setStep('role')
                  setRole(null)
                  setSelectedInterest(new Set())
                  return
                }
                setPanelOpacity(0)
                window.setTimeout(() => {
                  setStep('role')
                  setRole(null)
                  setSelectedInterest(new Set())
                  setPanelOpacity(1)
                }, 200)
              }}
              className="fetch-account-btn-ghost-glass mb-4 self-start px-3 py-2 text-[13px] font-semibold"
            >
              Back
            </button>

            <div
              className={['mx-auto w-full max-w-md flex-1 px-1', 'fetch-onboarding-panel-transition'].join(
                ' ',
              )}
              style={{ opacity: panelOpacity }}
            >
              <h1 className="fetch-onboarding-title text-center text-[clamp(1.35rem,4.8vw,1.65rem)] font-semibold tracking-[-0.03em]">
                What do you want to do?
              </h1>
              <p className="fetch-onboarding-sub mx-auto mt-3 max-w-[22rem] text-center text-[13px] leading-relaxed">
                {role === 'fetcher'
                  ? 'Tap everything that fits.'
                  : 'Tap everything that fits — choose as many as you want.'}
              </p>

              <div className="mt-9 flex flex-col gap-3">
                {interestOptions.map((opt) => {
                  const on = selectedInterest.has(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleInterest(opt.id)}
                      aria-pressed={on}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-[1.15rem] border px-4 py-3.5 text-left transition-[transform,background-color,border-color,box-shadow] duration-150',
                        'bg-[var(--fetch-onb-card-bg)] shadow-sm',
                        on
                          ? 'border-emerald-400/50 shadow-[0_0_28px_rgba(52,211,153,0.14)]'
                          : 'border-[var(--fetch-onb-card-border)] hover:border-white/20',
                      ].join(' ')}
                    >
                      <span className="fetch-onboarding-title text-[15px] font-semibold tracking-[-0.015em]">
                        {opt.label}
                      </span>
                      <span
                        className={[
                          'fetch-onboarding-chip flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold transition-colors',
                          on
                            ? 'fetch-onboarding-chip-on border-emerald-400/60 bg-emerald-500/25 text-emerald-100'
                            : 'fetch-onboarding-chip-off border-white/15 bg-white/[0.04] text-white/25',
                        ].join(' ')}
                        aria-hidden
                      >
                        {on ? '✓' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>

              {role === 'fetcher' ? (
                <p className="fetch-onboarding-sub mt-8 text-center text-[12px] leading-relaxed">
                  You can do everything anytime.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
