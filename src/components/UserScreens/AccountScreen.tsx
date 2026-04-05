import { useEffect, useMemo, useState } from 'react'
import {
  loadSavedAddresses,
  saveSavedAddresses,
  type SavedAddress,
} from '../../lib/savedAddresses'
import {
  formatPanGroups,
  loadPaymentMethods,
  normalizeNewPaymentMethod,
  savePaymentMethods,
  type PaymentMethodRecord,
} from '../../lib/paymentMethods'
import {
  loadSession,
  signOutUser,
  updateUserProfile,
} from '../../lib/fetchUserSession'
import { useFetchTheme } from '../../theme/FetchThemeContext'

export type AccountScreenProps = {
  onBack: () => void
  onSignOut: () => void
  onOpenDriver: () => void
}

const shell =
  'fetch-account-screen fetch-account-screen--home-glow fetch-theme-chrome mx-auto flex min-h-dvh w-full max-w-[1024px] flex-col px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]'

const fieldLabel =
  'fetch-account-field-label text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40'

const inputClass =
  'fetch-account-input w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none ring-0 focus:border-emerald-400/50'

const cardClass =
  'fetch-account-card rounded-2xl border border-white/[0.08] bg-black/35 p-4 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]'

const selectClass =
  'fetch-account-input rounded-2xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white outline-none ring-0 focus:border-emerald-400/50'

export function AccountScreen({ onBack, onSignOut, onOpenDriver }: AccountScreenProps) {
  const { preference, setPreference } = useFetchTheme()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [payments, setPayments] = useState<PaymentMethodRecord[]>([])
  const [addressType, setAddressType] = useState<'home' | 'work' | 'custom'>('home')
  const [customLabel, setCustomLabel] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newAddressNotes, setNewAddressNotes] = useState('')
  const [newAddressLat, setNewAddressLat] = useState('')
  const [newAddressLng, setNewAddressLng] = useState('')
  const [newPaymentBrand, setNewPaymentBrand] = useState('Visa')
  const [newPaymentPan, setNewPaymentPan] = useState('')
  const [newPaymentCvc, setNewPaymentCvc] = useState('')
  const [newPaymentExpiryMonth, setNewPaymentExpiryMonth] = useState('')
  const [newPaymentExpiryYear, setNewPaymentExpiryYear] = useState('')
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null)

  useEffect(() => {
    const u = loadSession()
    if (u) {
      setName(u.displayName)
      setEmail(u.email)
      setPhone(u.phone)
    }
    setAddresses(loadSavedAddresses())
    setPayments(loadPaymentMethods())
  }, [])

  const saveProfile = () => {
    setProfileMsg(null)
    const r = updateUserProfile({
      displayName: name,
      email,
      phone,
    })
    if (!r.ok) {
      setProfileMsg(r.error)
      return
    }
    setProfileMsg('Saved — Fetch will use this when it talks to you.')
    window.setTimeout(() => setProfileMsg(null), 3200)
  }

  const handleSignOut = () => {
    signOutUser()
    onSignOut()
  }

  const defaultPayment = useMemo(
    () => payments.find((p) => p.isDefault) ?? null,
    [payments],
  )

  const addAddress = () => {
    const address = newAddress.trim()
    if (!address) return
    const lat = Number.parseFloat(newAddressLat)
    const lng = Number.parseFloat(newAddressLng)
    const inferredLabel =
      addressType === 'home'
        ? 'Home'
        : addressType === 'work'
          ? 'Work'
          : customLabel.trim() || 'Custom'
    const nextAddress: SavedAddress = {
      id: `addr_${Date.now()}`,
      label: inferredLabel,
      address,
      lat: Number.isFinite(lat) ? lat : -27.4698,
      lng: Number.isFinite(lng) ? lng : 153.0251,
      notes: newAddressNotes.trim(),
    }
    setAddresses((prev) => {
      const next = [
        ...prev.filter((a) => a.label !== inferredLabel || addressType === 'custom'),
        nextAddress,
      ]
      saveSavedAddresses(next)
      return next
    })
    setNewAddress('')
    setNewAddressNotes('')
    setNewAddressLat('')
    setNewAddressLng('')
    setCustomLabel('')
  }

  const removeAddress = (id: string) => {
    setAddresses((prev) => {
      const next = prev.filter((a) => a.id !== id)
      saveSavedAddresses(next)
      return next
    })
  }

  const addPayment = () => {
    setPaymentFormError(null)
    const created = normalizeNewPaymentMethod({
      brand: newPaymentBrand,
      panDigits: newPaymentPan,
      cvcDigits: newPaymentCvc,
      expiryMonth: Number.parseInt(newPaymentExpiryMonth, 10) || 1,
      expiryYear: Number.parseInt(newPaymentExpiryYear, 10) || 2030,
      makeDefault: false,
      existing: payments,
    })
    if ('error' in created) {
      setPaymentFormError(created.error)
      return
    }
    setPayments((prev) => {
      const next = [...prev, created]
      savePaymentMethods(next)
      return next
    })
    setNewPaymentBrand('Visa')
    setNewPaymentPan('')
    setNewPaymentCvc('')
    setNewPaymentExpiryMonth('')
    setNewPaymentExpiryYear('')
  }

  const setPrimary = (id: string) => {
    setPayments((prev) => {
      const next = prev.map((p) => ({ ...p, isDefault: p.id === id }))
      savePaymentMethods(next)
      return next
    })
  }

  const removePayment = (id: string) => {
    setPayments((prev) => {
      const next = prev.filter((p) => p.id !== id)
      if (next.length > 0 && !next.some((p) => p.isDefault)) {
        next[0] = { ...next[0], isDefault: true }
      }
      savePaymentMethods(next)
      return [...next]
    })
  }

  return (
    <div className={shell}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="fetch-account-btn-ghost-glass">
          ← Home
        </button>
        <button type="button" onClick={handleSignOut} className="fetch-account-btn-danger-glass">
          Sign out
        </button>
      </header>

      <details className={`${cardClass} mt-5`}>
        <summary className="fetch-account-appearance-summary cursor-pointer list-none text-[13px] font-semibold text-white/85 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Appearance
            <span className="fetch-account-appearance-badge text-[11px] font-medium text-white/40">
              Advanced
            </span>
          </span>
        </summary>
        <p className="fetch-account-appearance-copy mt-2 text-[12px] leading-relaxed text-white/45">
          <span className="fetch-account-appearance-hint">
            System follows your clock: light theme from 5:00 a.m. to 5:59 p.m., dark from 6:00 p.m. to 4:59
            a.m. Or lock light or dark anytime.
          </span>
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              { id: 'system' as const, label: 'System' },
              { id: 'light' as const, label: 'Light' },
              { id: 'dark' as const, label: 'Dark' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreference(id)}
              className={
                preference === id
                  ? 'fetch-account-theme-opt-glass fetch-account-theme-opt-glass--active'
                  : 'fetch-account-theme-opt-glass'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </details>

      <section className={`${cardClass} fetch-account-panel mt-4`}>
        <p className={fieldLabel}>Driver</p>
        <p className="mt-1 text-[13px] text-white/45">
          Switch to the demo driver dashboard to see incoming jobs, accept bookings, and simulate
          pickup routes.
        </p>
        <button
          type="button"
          onClick={onOpenDriver}
          aria-label="Open driver dashboard"
          className="fetch-account-driver-switch mt-4 flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-emerald-400/35 hover:bg-white/[0.06]"
        >
          <span className="fetch-account-driver-switch-label text-[14px] font-semibold text-white/90">
            Driver dashboard
          </span>
          <span
            aria-hidden
            className="relative inline-flex h-7 w-11 shrink-0 items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]"
          >
            <span className="h-[1.125rem] w-[1.125rem] translate-x-0 rounded-full bg-white/95 shadow-sm ring-1 ring-white/25" />
          </span>
        </button>
      </section>

      <div className="mt-5">
        <p className="fetch-account-kicker text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/85">
          Your Fetch account
        </p>
        <h1 className="fetch-account-page-title mt-1 text-[26px] font-semibold tracking-[-0.03em] text-white">
          {name.trim() ? name.trim() : 'Profile'}
        </h1>
        <p className="fetch-account-lede mt-2 max-w-lg text-[14px] leading-relaxed text-white/50">
          Keep your details and saved places up to date. Fetch uses this for voice greetings,
          smarter answers, and faster bookings — stored on this device for now.
        </p>
      </div>

      <section className={`${cardClass} fetch-account-panel mt-8`}>
        <p className={fieldLabel}>How Fetch knows you</p>
        <p className="mt-1 text-[13px] text-white/45">
          Name and contact — used when Fetch speaks to you and in chat context.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className={fieldLabel} htmlFor="acct-name">
              Display name
            </label>
            <input
              id="acct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClass} mt-1.5`}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="acct-email">
              Email
            </label>
            <input
              id="acct-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} mt-1.5`}
              placeholder="you@email.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="acct-phone">
              Phone <span className="font-normal text-white/35">(optional)</span>
            </label>
            <input
              id="acct-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`${inputClass} mt-1.5`}
              placeholder="+61 …"
              autoComplete="tel"
            />
          </div>
          {profileMsg ? (
            <p className="text-[13px] font-medium text-emerald-200/85">{profileMsg}</p>
          ) : null}
          <button
            type="button"
            onClick={saveProfile}
            className="fetch-account-btn-primary mt-1 w-full sm:w-auto sm:self-start"
          >
            Save details
          </button>
        </div>
      </section>

      <section className={`${cardClass} fetch-account-panel mt-4`}>
        <p className={fieldLabel}>Saved places</p>
        <p className="mt-1 text-[13px] text-white/45">
          Home, work, and custom spots. Fetch can reference these when you ask for pickups or
          deliveries.
        </p>
        <div className="mt-4 space-y-3">
          {addresses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/12 px-3 py-4 text-[13px] text-white/40">
              No saved places yet. Add your first address below.
            </p>
          ) : (
            addresses.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-white">{item.label}</p>
                  <p className="mt-0.5 text-[13px] text-white/55">{item.address}</p>
                  {item.notes ? (
                    <p className="mt-1 text-[12px] text-white/40">{item.notes}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => removeAddress(item.id)}
                  className="fetch-account-btn-subtle-glass--danger shrink-0 self-start"
                >
                  Remove
                </button>
              </div>
            ))
          )}

          <div className="flex flex-wrap gap-2">
            <select
              value={addressType}
              onChange={(e) =>
                setAddressType(e.target.value as 'home' | 'work' | 'custom')
              }
              className={selectClass}
            >
              <option value="home">Home</option>
              <option value="work">Work</option>
              <option value="custom">Custom label</option>
            </select>
            {addressType === 'custom' ? (
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className={`${inputClass} min-w-[8rem] flex-1 px-4 py-2.5 text-[14px]`}
                placeholder={"Label (e.g. Mum's)"}
              />
            ) : null}
          </div>
          <input
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            className={inputClass}
            placeholder="Street, suburb, postcode"
          />
          <input
            value={newAddressNotes}
            onChange={(e) => setNewAddressNotes(e.target.value)}
            className={inputClass}
            placeholder="Gate code, building name… (optional)"
          />
          <details className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <summary className="cursor-pointer text-[12px] font-medium text-white/45">
              Precise map coordinates (optional)
            </summary>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={newAddressLat}
                onChange={(e) => setNewAddressLat(e.target.value)}
                className={inputClass}
                placeholder="Latitude"
                inputMode="decimal"
              />
              <input
                value={newAddressLng}
                onChange={(e) => setNewAddressLng(e.target.value)}
                className={inputClass}
                placeholder="Longitude"
                inputMode="decimal"
              />
            </div>
          </details>
          <button type="button" onClick={addAddress} className="fetch-account-btn-primary w-full sm:w-auto">
            Save place
          </button>
        </div>
      </section>

      <section className={`${cardClass} fetch-account-panel mt-4`}>
        <p className={fieldLabel}>Cards for checkout</p>
        <p className="mt-1 text-[13px] text-white/45">
          <span className="font-semibold text-white/60">Demo mode: </span>
          Full card number, expiry, and CVV live in this browser only. Book now calls the Fetch
          server to create and confirm a payment intent with those details — same API shape as
          production, but not PCI-safe until you swap in tokenization (for example Stripe Elements).
        </p>
        <div className="mt-4 space-y-3">
          {payments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/12 px-3 py-4 text-[13px] text-white/40">
              No cards saved. Add one — Book now charges the default card.
            </p>
          ) : (
            payments.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-white">{item.brand}</p>
                  <p className="mt-1 break-all font-mono text-[13px] tracking-wide text-white/90">
                    {item.pan.length >= 13 ? formatPanGroups(item.pan) : `···· ···· ···· ${item.last4}`}
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-white/55">
                    CVV <span className="text-white/85">{item.cvc || '—'}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-white/45">
                    Expires {String(item.expiryMonth).padStart(2, '0')}/
                    {String(item.expiryYear).slice(-2)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.isDefault ? (
                    <span className="fetch-account-badge-default">Default</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPrimary(item.id)}
                      className="fetch-account-btn-subtle-glass"
                    >
                      Use as default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removePayment(item.id)}
                    className="fetch-account-btn-subtle-glass--danger"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <select
                value={newPaymentBrand}
                onChange={(e) => setNewPaymentBrand(e.target.value)}
                className={`${selectClass} sm:w-auto`}
              >
                <option>Visa</option>
                <option>Mastercard</option>
                <option>Amex</option>
              </select>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="new-card-pan">
                Card number
              </label>
              <input
                id="new-card-pan"
                value={formatPanGroups(newPaymentPan)}
                onChange={(e) => setNewPaymentPan(e.target.value.replace(/\D/g, '').slice(0, 19))}
                className={`${inputClass} mt-1.5 font-mono tracking-wide`}
                placeholder="1234 5678 9012 3456"
                autoComplete="cc-number"
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1">
                <label className={fieldLabel} htmlFor="new-card-cvc">
                  Security code (CVV)
                </label>
                <input
                  id="new-card-cvc"
                  value={newPaymentCvc}
                  onChange={(e) => setNewPaymentCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className={`${inputClass} mt-1.5 font-mono`}
                  placeholder="123"
                  autoComplete="cc-csc"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              <div className="flex gap-2 sm:items-end">
                <div>
                  <label className={fieldLabel} htmlFor="new-card-mm">
                    MM
                  </label>
                  <input
                    id="new-card-mm"
                    value={newPaymentExpiryMonth}
                    onChange={(e) => setNewPaymentExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    className={`${inputClass} mt-1.5 sm:w-20`}
                    placeholder="MM"
                    autoComplete="cc-exp-month"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className={fieldLabel} htmlFor="new-card-yyyy">
                    YYYY
                  </label>
                  <input
                    id="new-card-yyyy"
                    value={newPaymentExpiryYear}
                    onChange={(e) => setNewPaymentExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className={`${inputClass} mt-1.5 sm:w-28`}
                    placeholder="YYYY"
                    autoComplete="cc-exp-year"
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>
            {paymentFormError ? (
              <p className="text-[12px] font-medium text-red-300/90">{paymentFormError}</p>
            ) : null}
            <button type="button" onClick={addPayment} className="fetch-account-btn-primary w-full sm:w-auto">
              Add card
            </button>
          </div>
          <p className="text-[12px] text-white/35">
            {defaultPayment
              ? `Default at checkout: ${defaultPayment.brand} — ${defaultPayment.pan.length >= 13 ? formatPanGroups(defaultPayment.pan) : `···· ${defaultPayment.last4}`}`
              : 'No default card selected.'}
          </p>
        </div>
      </section>
    </div>
  )
}
