import { useCallback, useEffect, useState } from 'react'
import {
  completeDropsCreatorOnboarding,
  consumeDropsCreatorReturnTarget,
  stashPendingDropsPostWizard,
} from '../lib/drops/fetchDropsCreatorOnboarding'
import {
  ensureDropProfileForSession,
  formatDropHandle,
  getMyDropProfile,
  updateMyDropProfile,
} from '../lib/drops/profileStore'

const AVATAR_PRESETS = ['🎯', '🛍️', '📦', '⭐', '🔥', '💼', '🌿', '🏪', '🎬', '✨', '🚀', '💜']

export type DropsCreatorSetupViewProps = {
  onDone: (dest: 'home' | 'account') => void
}

export default function DropsCreatorSetupView({ onDone }: DropsCreatorSetupViewProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [displayName, setDisplayName] = useState('')
  const [avatar, setAvatar] = useState('🎯')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ensureDropProfileForSession()
    const me = getMyDropProfile()
    if (me) {
      setDisplayName(me.displayName)
      setAvatar(me.avatar && !me.avatar.startsWith('http') ? me.avatar : '🎯')
      if (me.avatar?.startsWith('http')) setAvatarUrl(me.avatar)
    }
  }, [])

  const finish = useCallback(
    (opts?: { openWizard?: boolean }) => {
      completeDropsCreatorOnboarding()
      const dest = consumeDropsCreatorReturnTarget()
      if (opts?.openWizard) stashPendingDropsPostWizard()
      if (dest === 'home') {
        try {
          sessionStorage.setItem('fetch.pendingHomeShellTab', 'reels')
        } catch {
          /* ignore */
        }
      }
      onDone(dest)
    },
    [onDone],
  )

  const saveProfileAndContinue = useCallback(() => {
    setErr(null)
    const pic = avatarUrl.trim().startsWith('https://') ? avatarUrl.trim().slice(0, 2048) : avatar.trim() || '🎯'
    const r = updateMyDropProfile(displayName.trim(), pic)
    if ('error' in r) {
      setErr(r.error)
      return
    }
    setStep(2)
  }, [avatar, avatarUrl, displayName])

  const goUploadFirst = useCallback(() => {
    finish({ openWizard: true })
  }, [finish])

  const skipUpload = useCallback(() => {
    finish()
  }, [finish])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-zinc-950 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300/90">Creator setup</p>
      <h1 className="mt-2 text-[22px] font-bold tracking-tight">
        {step === 1 ? 'Your public Drops profile' : 'Ready to post'}
      </h1>
      <p className="mt-1.5 text-[13px] leading-snug text-white/55">
        {step === 1
          ? 'Shoppers see this handle and photo on your drops. You can change them later in profile.'
          : 'Upload a short video or a photo carousel. You can skip and post later from Drops.'}
      </p>

      {err ? <p className="mt-3 text-[13px] text-amber-300">{err}</p> : null}

      {step === 1 ? (
        <div className="mt-5 flex flex-1 flex-col gap-4">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-white/45">
            Display name (your @handle)
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="YourShop"
              autoComplete="username"
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/30"
            />
          </label>
          <p className="text-[12px] text-white/45">Preview: {formatDropHandle(displayName.trim() || 'YourShop')}</p>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Profile photo</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVATAR_PRESETS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setAvatar(e)
                    setAvatarUrl('')
                  }}
                  className={[
                    'flex h-11 w-11 items-center justify-center rounded-xl border text-xl transition-colors',
                    avatar === e && !avatarUrl.trim()
                      ? 'border-white bg-white/15'
                      : 'border-white/15 bg-black/30 hover:bg-white/10',
                  ].join(' ')}
                  aria-label={`Avatar ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-[11px] font-semibold uppercase tracking-wide text-white/45">
            Or image URL (https)
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-white/30"
            />
          </label>

          <button
            type="button"
            onClick={saveProfileAndContinue}
            className="mt-auto w-full rounded-xl bg-black py-3.5 text-[15px] font-bold text-white ring-1 ring-white/20 hover:bg-zinc-900"
          >
            Continue
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-1 flex-col gap-3">
          <button
            type="button"
            onClick={goUploadFirst}
            className="w-full rounded-xl bg-black py-3.5 text-[15px] font-bold text-white ring-1 ring-white/20 hover:bg-zinc-900"
          >
            Upload first drop
          </button>
          <button
            type="button"
            onClick={skipUpload}
            className="w-full rounded-xl border border-white/20 py-3 text-[14px] font-semibold text-white/80 hover:bg-white/5"
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  )
}
