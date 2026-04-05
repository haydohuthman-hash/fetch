/**
 * Local saved cards for demo checkout. Full PAN + CVV in localStorage is insecure —
 * production must use a PCI-compliant vault / tokenization (e.g. Stripe).
 */

import type { PaymentCardConfirmPayload } from './booking/api'

export const PAYMENT_METHODS_STORAGE_KEY = 'fetch.paymentMethods'

export type PaymentMethodRecord = {
  id: string
  brand: string
  /** Card number digits only (13–19). */
  pan: string
  last4: string
  /** Card security code (3–4 digits). */
  cvc: string
  expiryMonth: number
  expiryYear: number
  isDefault: boolean
}

const DEFAULT_PAYMENT_METHODS: PaymentMethodRecord[] = [
  {
    id: 'pm_seed_visa',
    brand: 'Visa',
    pan: '4242424242424242',
    last4: '4242',
    cvc: '123',
    expiryMonth: 8,
    expiryYear: 2028,
    isDefault: true,
  },
]

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

export function formatPanGroups(digits: string): string {
  const d = digitsOnly(digits).slice(0, 19)
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

function deriveLast4(pan: string): string {
  const d = digitsOnly(pan)
  return d.length >= 4 ? d.slice(-4) : ''
}

function migrateLegacy(row: PaymentMethodRecord): PaymentMethodRecord {
  let pan = digitsOnly(typeof row.pan === 'string' ? row.pan : '')
  let cvc = digitsOnly(typeof row.cvc === 'string' ? row.cvc : '')
  let last4 = /^\d{4}$/.test(row.last4) ? row.last4 : deriveLast4(pan)
  if (pan.length < 13 && last4 === '4242' && row.brand === 'Visa') {
    pan = '4242424242424242'
    last4 = '4242'
    if (!cvc) cvc = '123'
  }
  if (pan.length >= 13) last4 = deriveLast4(pan)
  return { ...row, pan, last4, cvc }
}

function isValidMethod(m: unknown): m is PaymentMethodRecord {
  if (!m || typeof m !== 'object') return false
  const r = m as PaymentMethodRecord
  if (typeof r.id !== 'string' || typeof r.brand !== 'string') return false
  if (typeof r.isDefault !== 'boolean') return false
  if (!Number.isFinite(r.expiryMonth) || !Number.isFinite(r.expiryYear)) return false
  const pan = digitsOnly(typeof r.pan === 'string' ? r.pan : '')
  const last4 = typeof r.last4 === 'string' ? r.last4 : ''
  const panOk = pan.length >= 13 && pan.length <= 19
  const legacyLast4 = /^\d{4}$/.test(last4)
  return panOk || legacyLast4
}

export function loadPaymentMethods(): PaymentMethodRecord[] {
  try {
    const raw = window.localStorage.getItem(PAYMENT_METHODS_STORAGE_KEY)
    if (!raw) return DEFAULT_PAYMENT_METHODS.map(migrateLegacy)
    const parsed = JSON.parse(raw) as unknown[]
    if (!Array.isArray(parsed)) return DEFAULT_PAYMENT_METHODS.map(migrateLegacy)
    const safe = parsed.filter(isValidMethod).map(migrateLegacy)
    if (!safe.length) return DEFAULT_PAYMENT_METHODS.map(migrateLegacy)
    if (!safe.some((m) => m.isDefault)) {
      safe[0] = { ...safe[0], isDefault: true }
    }
    return safe
  } catch {
    return DEFAULT_PAYMENT_METHODS.map(migrateLegacy)
  }
}

export function savePaymentMethods(methods: PaymentMethodRecord[]) {
  try {
    window.localStorage.setItem(PAYMENT_METHODS_STORAGE_KEY, JSON.stringify(methods))
  } catch {
    /* ignore storage errors */
  }
}

export function getDefaultPaymentMethod(): PaymentMethodRecord | null {
  const all = loadPaymentMethods()
  return all.find((m) => m.isDefault) ?? all[0] ?? null
}

export function paymentMethodToConfirmPayload(
  m: PaymentMethodRecord,
): PaymentCardConfirmPayload | { error: string } {
  const number = digitsOnly(m.pan)
  const cvc = digitsOnly(m.cvc)
  if (number.length < 13 || number.length > 19) {
    return { error: 'Add a full card number in Account (13–19 digits).' }
  }
  if (cvc.length < 3 || cvc.length > 4) {
    return { error: 'Add a valid security code (CVV) for your card in Account.' }
  }
  return {
    number,
    cvc,
    expMonth: Math.min(12, Math.max(1, m.expiryMonth)),
    expYear: m.expiryYear,
    brand: m.brand,
  }
}

export function normalizeNewPaymentMethod(input: {
  brand: string
  panDigits: string
  cvcDigits: string
  expiryMonth: number
  expiryYear: number
  makeDefault: boolean
  existing: PaymentMethodRecord[]
}): PaymentMethodRecord | { error: string } {
  const pan = digitsOnly(input.panDigits).slice(0, 19)
  const cvc = digitsOnly(input.cvcDigits).slice(0, 4)
  if (pan.length < 13 || pan.length > 19) {
    return { error: 'Enter the full card number (13–19 digits).' }
  }
  if (cvc.length < 3 || cvc.length > 4) {
    return { error: 'Enter the 3 or 4 digit security code on the card.' }
  }
  const last4 = pan.slice(-4)
  const next: PaymentMethodRecord = {
    id: `pm_${Date.now()}`,
    brand: input.brand,
    pan,
    last4,
    cvc,
    expiryMonth: Math.min(12, Math.max(1, input.expiryMonth)),
    expiryYear: input.expiryYear,
    isDefault: input.makeDefault || input.existing.length === 0,
  }
  return next
}
