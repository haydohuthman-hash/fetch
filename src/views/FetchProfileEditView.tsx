import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import {
  getMySupabaseProfile,
  updateMySupabaseProfile,
  uploadMySupabaseAvatar,
  validateUsername,
} from '../lib/supabase/profiles'
import { refreshSessionFromSupabase } from '../lib/fetchUserSession'
import {
  ensureDropProfileForSession,
  syncAccountDisplayToDropProfile,
  updateMyDropProfile,
} from '../lib/drops/profileStore'

export type FetchProfileEditViewProps = {
  onDone: () => void
}

export default function FetchProfileEditView({ onDone }: FetchProfileEditViewProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [locationLabel, setLocationLabel] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const p = await getMySupabaseProfile()
        if (!p) {
          setErr('Could not load profile.')
          return
        }
        setFullName((p.full_name || '').trim())
        setUsername((p.username || '').trim())
        setBio((p.bio || '').trim())
        setLocationLabel((p.location_label || '').trim())
        setPhone((p.phone || '').trim())
        setAvatarUrl((p.avatar_url || '').trim())
        ensureDropProfileForSession()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not load profile.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!avatarFile) {
      queueMicrotask(() => setAvatarPreview(''))
      return
    }
    const u = URL.createObjectURL(avatarFile)
    queueMicrotask(() => setAvatarPreview(u))
    return () => URL.revokeObjectURL(u)
  }, [avatarFile])

  const onPickAvatar = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setAvatarFile(f ?? null)
  }, [])

  const save = useCallback(() => {
    setErr(null)
    const uerr = validateUsername(username.trim())
    if (uerr) {
      setErr(uerr)
      return
    }
    if (!fullName.trim()) {
      setErr('Display name is required.')
      return
    }
    setSaving(true)
    void (async () => {
      try {
        let nextAvatar = avatarUrl.trim()
        if (avatarFile) {
          nextAvatar = await uploadMySupabaseAvatar(avatarFile)
        }
        await updateMySupabaseProfile({
          username: username.trim(),
          full_name: fullName.trim(),
          bio: bio.trim() || null,
          location_label: locationLabel.trim() || null,
          phone: phone.trim() || null,
          avatar_url: nextAvatar || null,
        })
        await refreshSessionFromSupabase()
        ensureDropProfileForSession()
        syncAccountDisplayToDropProfile(fullName.trim())
        const r = updateMyDropProfile(username.trim() || fullName.trim(), nextAvatar)
        if ('error' in r) setErr(r.error)
        else onDone()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed.')
      } finally {
        setSaving(false)
      }
    })()
  }, [avatarFile, avatarUrl, bio, fullName, locationLabel, onDone, phone, username])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-emerald-100/80">
        <p className="text-sm">Loading profile…</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-950/90 via-zinc-950 to-black px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <header className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDone}
          className="text-[13px] font-semibold text-emerald-200/80"
        >
          Cancel
        </button>
        <h1 className="text-base font-semibold tracking-tight">Edit profile</h1>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-[13px] font-semibold text-emerald-300 disabled:opacity-45"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      {err ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-[12px] text-red-100">
          {err}
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div
            className="relative h-24 w-24 overflow-hidden rounded-full ring-2 ring-emerald-400/35 ring-offset-4 ring-offset-zinc-950"
            style={{
              backgroundImage: avatarPreview
                ? `url(${avatarPreview})`
                : avatarUrl
                  ? `url(${avatarUrl})`
                  : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {!avatarPreview && !avatarUrl ? (
              <div className="flex h-full w-full items-center justify-center bg-emerald-900/40 text-2xl font-semibold text-emerald-100/60">
                {(fullName || username || '?').slice(0, 1).toUpperCase()}
              </div>
            ) : null}
          </div>
          <label className="cursor-pointer rounded-full border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-[12px] font-semibold text-emerald-100 active:scale-[0.98]">
            Change photo
            <input type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          </label>
        </div>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Display name
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Your name"
            maxLength={80}
          />
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="public_handle"
            maxLength={20}
            autoCapitalize="none"
          />
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={500}
            className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[14px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Tell buyers about you…"
          />
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Location
          <input
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="Suburb or city"
            maxLength={120}
          />
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
          Phone <span className="font-normal text-white/35">(optional)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] text-white outline-none ring-emerald-500/30 focus:ring-2"
            placeholder="For verified sellers"
            maxLength={32}
            inputMode="tel"
          />
        </label>
      </div>
    </div>
  )
}
