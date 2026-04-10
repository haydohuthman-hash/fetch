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
import { loadSession } from '../lib/fetchUserSession'
import {
  getMySupabaseProfile,
  suggestUniqueUsernameFromEmail,
  updateMySupabaseProfile,
  uploadMySupabaseAvatar,
  validateUsername,
} from '../lib/supabase/profiles'

export type DropsCreatorSetupViewProps = {
  onDone: (dest: 'home' | 'account') => void
}

export default function DropsCreatorSetupView({ onDone }: DropsCreatorSetupViewProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      ensureDropProfileForSession()
      const me = getMyDropProfile()
      const sp = await getMySupabaseProfile().catch(() => null)
      if (me) {
        const session = loadSession()
        const suggested =
          session && (!sp?.username || sp.username.startsWith('user_'))
            ? await suggestUniqueUsernameFromEmail(session.email, session.displayName).catch(() => '')
            : ''
        setDisplayName(sp?.username?.trim() || suggested || me.displayName)
        if (sp?.avatar_url?.trim()) setAvatarUrl(sp.avatar_url.trim())
        else if (me.avatar?.startsWith('http')) setAvatarUrl(me.avatar)
      } else if (sp?.username) {
        setDisplayName(sp.username)
      }
    })()
  }, [])

  useEffect(() => {
    if (!avatarFile) {
      queueMicrotask(() => setAvatarPreviewUrl(''))
      return
    }
    const blob = URL.createObjectURL(avatarFile)
    queueMicrotask(() => setAvatarPreviewUrl(blob))
    return () => URL.revokeObjectURL(blob)
  }, [avatarFile])

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
    const usernameErr = validateUsername(displayName.trim())
    if (usernameErr) {
      setErr(usernameErr)
      return
    }
    void (async () => {
      let finalAvatarUrl = avatarUrl.trim()
      try {
        const uploadedAvatarUrl = avatarFile ? await uploadMySupabaseAvatar(avatarFile) : ''
        finalAvatarUrl = uploadedAvatarUrl || finalAvatarUrl
        if (!finalAvatarUrl) {
          setErr('Upload a real profile photo to continue.')
          return
        }
        await updateMySupabaseProfile({
          username: displayName.trim(),
          avatar_url: finalAvatarUrl,
        })
        setAvatarUrl(finalAvatarUrl)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save profile.'
        setErr(msg.toLowerCase().includes('duplicate') ? 'That username is already taken.' : msg)
        return
      }
      const r = updateMyDropProfile(displayName.trim(), finalAvatarUrl)
      if ('error' in r) {
        setErr(r.error)
        return
      }
      setStep(2)
    })()
  }, [avatarFile, avatarUrl, displayName])

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
            <div className="mt-2 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-full border border-white/25 bg-white/10">
                {avatarPreviewUrl ? (
                  <img src={avatarPreviewUrl} alt="Profile preview" className="h-full w-full object-cover" />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Profile preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] text-white/55">No photo</div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setAvatarFile(e.target.files?.[0] ?? null)
                }}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-2 py-2 text-[12px] text-white/80 file:mr-2 file:rounded-lg file:border-0 file:bg-white file:px-2 file:py-1.5 file:text-[12px] file:font-semibold file:text-black"
              />
            </div>
          </div>

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
