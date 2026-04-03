import { useEffect, useMemo, useState } from 'react'
import {
  loadSavedAddresses,
  saveSavedAddresses,
  type SavedAddress,
} from '../../lib/savedAddresses'
import {
  loadPaymentMethods,
  savePaymentMethods,
  type PaymentMethodRecord,
} from '../../lib/paymentMethods'

export function AccountScreen() {
  const [name, setName] = useState('Alex Johnson')
  const [email, setEmail] = useState('alex@email.com')
  const [phone, setPhone] = useState('+61 400 000 000')
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [payments, setPayments] = useState<PaymentMethodRecord[]>([])
  const [addressType, setAddressType] = useState<'home' | 'work' | 'custom'>('home')
  const [customLabel, setCustomLabel] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newAddressNotes, setNewAddressNotes] = useState('')
  const [newAddressLat, setNewAddressLat] = useState('')
  const [newAddressLng, setNewAddressLng] = useState('')
  const [newPaymentBrand, setNewPaymentBrand] = useState('Visa')
  const [newPaymentLast4, setNewPaymentLast4] = useState('')
  const [newPaymentExpiryMonth, setNewPaymentExpiryMonth] = useState('')
  const [newPaymentExpiryYear, setNewPaymentExpiryYear] = useState('')

  useEffect(() => {
    setAddresses(loadSavedAddresses())
    setPayments(loadPaymentMethods())
  }, [])

  const primaryPaymentId = useMemo(
    () => payments.find((p) => p.isDefault)?.id ?? null,
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
      const next = [...prev.filter((a) => a.label !== inferredLabel || addressType === 'custom'), nextAddress]
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
    const last4 = newPaymentLast4.trim()
    if (!/^\d{4}$/.test(last4)) return
    setPayments((prev) => {
      const next = [
      ...prev,
      {
        id: `pm_${Date.now()}`,
        brand: newPaymentBrand,
        last4,
        expiryMonth: Number.parseInt(newPaymentExpiryMonth, 10) || 1,
        expiryYear: Number.parseInt(newPaymentExpiryYear, 10) || 2030,
        isDefault: prev.length === 0,
      },
      ]
      savePaymentMethods(next)
      return next
    })
    setNewPaymentBrand('Visa')
    setNewPaymentLast4('')
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
    <div className="mx-auto flex min-h-dvh w-full max-w-[1024px] flex-col bg-fetch-soft-gray px-4 pb-28 pt-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-fetch-charcoal">
        Account
      </h1>

      <section className="mt-4 rounded-[1rem] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fetch-muted/70">
          Profile Info
        </p>
        <div className="mt-2 grid gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[14px] font-semibold text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
            placeholder="Full name"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[14px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
            placeholder="Email"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[14px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
            placeholder="Phone"
          />
        </div>
      </section>

      <section className="mt-4 rounded-[1rem] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fetch-muted/70">
          Saved Addresses
        </p>
        <div className="mt-3 space-y-2.5">
          {addresses.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-2 rounded-[0.85rem] bg-fetch-soft-gray/45 px-3 py-2.5 ring-1 ring-black/[0.06]"
            >
              <div>
                <p className="text-[14px] font-semibold text-fetch-charcoal">
                  {item.label}
                </p>
                <p className="mt-0.5 text-[13px] text-fetch-muted">{item.address}</p>
                {item.notes ? (
                  <p className="mt-0.5 text-[11px] text-fetch-muted/75">{item.notes}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeAddress(item.id)}
                className="rounded-full bg-fetch-red px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <select
              value={addressType}
              onChange={(e) =>
                setAddressType(e.target.value as 'home' | 'work' | 'custom')
              }
              className="rounded-[0.8rem] bg-fetch-soft-gray/60 px-2 py-2.5 text-[12px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
            >
              <option value="home">Home</option>
              <option value="work">Work</option>
              <option value="custom">Custom</option>
            </select>
            {addressType === 'custom' ? (
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="min-w-0 flex-1 rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[13px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
                placeholder="Custom label"
              />
            ) : null}
          </div>
          <div className="flex gap-2">
            <input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="min-w-0 flex-1 rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[13px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
              placeholder="Add new address"
            />
          </div>
          <input
            value={newAddressNotes}
            onChange={(e) => setNewAddressNotes(e.target.value)}
            className="w-full rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[13px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
            placeholder="Notes (optional)"
          />
          <div className="flex gap-2">
            <input
              value={newAddressLat}
              onChange={(e) => setNewAddressLat(e.target.value)}
              className="min-w-0 flex-1 rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[13px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
              placeholder="Lat (optional)"
            />
            <input
              value={newAddressLng}
              onChange={(e) => setNewAddressLng(e.target.value)}
              className="min-w-0 flex-1 rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[13px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
              placeholder="Lng (optional)"
            />
            <button
              type="button"
              onClick={addAddress}
              className="rounded-[0.8rem] bg-fetch-red px-3 py-2.5 text-[12px] font-semibold text-white"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[1rem] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fetch-muted/70">
          Payment Methods
        </p>
        <div className="mt-3 space-y-2.5">
          {payments.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-[0.85rem] bg-fetch-soft-gray/45 px-3 py-2.5 ring-1 ring-black/[0.06]"
            >
              <div>
                <p className="text-[14px] font-semibold text-fetch-charcoal">
                  {item.brand} •••• {item.last4}
                </p>
                <p className="mt-0.5 text-[12px] text-fetch-muted">
                  Expires {String(item.expiryMonth).padStart(2, '0')}/{String(item.expiryYear).slice(-2)}
                </p>
              </div>
              {item.isDefault ? (
                <span className="rounded-full bg-fetch-red px-2.5 py-1 text-[11px] font-semibold text-white">
                  Primary
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPrimary(item.id)}
                  className="rounded-full bg-fetch-red px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  Set primary
                </button>
              )}
              <button
                type="button"
                onClick={() => removePayment(item.id)}
                className="ml-2 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-fetch-muted ring-1 ring-black/[0.1]"
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <select
              value={newPaymentBrand}
              onChange={(e) => setNewPaymentBrand(e.target.value)}
              className="rounded-[0.8rem] bg-fetch-soft-gray/60 px-2 py-2.5 text-[12px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
            >
              <option>Visa</option>
              <option>Mastercard</option>
              <option>Amex</option>
            </select>
            <input
              value={newPaymentLast4}
              onChange={(e) => setNewPaymentLast4(e.target.value)}
              className="min-w-0 flex-1 rounded-[0.8rem] bg-fetch-soft-gray/60 px-3 py-2.5 text-[13px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
              placeholder="Last 4 digits"
              maxLength={4}
            />
            <input
              value={newPaymentExpiryMonth}
              onChange={(e) => setNewPaymentExpiryMonth(e.target.value)}
              className="w-16 rounded-[0.8rem] bg-fetch-soft-gray/60 px-2 py-2.5 text-[13px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
              placeholder="MM"
              maxLength={2}
            />
            <input
              value={newPaymentExpiryYear}
              onChange={(e) => setNewPaymentExpiryYear(e.target.value)}
              className="w-20 rounded-[0.8rem] bg-fetch-soft-gray/60 px-2 py-2.5 text-[13px] text-fetch-charcoal ring-1 ring-black/[0.08] outline-none"
              placeholder="YYYY"
              maxLength={4}
            />
            <button
              type="button"
              onClick={addPayment}
              className="rounded-[0.8rem] bg-fetch-red px-3 py-2.5 text-[12px] font-semibold text-white"
            >
              Add card
            </button>
          </div>
          <p className="text-[11px] text-fetch-muted/75">
            Active primary: {primaryPaymentId ?? 'none'}
          </p>
        </div>
      </section>
    </div>
  )
}
