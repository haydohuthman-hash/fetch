export const PAYMENT_METHODS_STORAGE_KEY = 'fetch.paymentMethods'

export type PaymentMethodRecord = {
  id: string
  brand: string
  last4: string
  expiryMonth: number
  expiryYear: number
  isDefault: boolean
}

const DEFAULT_PAYMENT_METHODS: PaymentMethodRecord[] = [
  {
    id: 'pm_seed_visa',
    brand: 'Visa',
    last4: '4242',
    expiryMonth: 8,
    expiryYear: 2028,
    isDefault: true,
  },
]

export function loadPaymentMethods(): PaymentMethodRecord[] {
  try {
    const raw = window.localStorage.getItem(PAYMENT_METHODS_STORAGE_KEY)
    if (!raw) return DEFAULT_PAYMENT_METHODS
    const parsed = JSON.parse(raw) as PaymentMethodRecord[]
    if (!Array.isArray(parsed)) return DEFAULT_PAYMENT_METHODS
    const safe = parsed.filter(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        typeof m.brand === 'string' &&
        /^\d{4}$/.test(m.last4) &&
        Number.isFinite(m.expiryMonth) &&
        Number.isFinite(m.expiryYear) &&
        typeof m.isDefault === 'boolean',
    )
    if (!safe.length) return DEFAULT_PAYMENT_METHODS
    if (!safe.some((m) => m.isDefault)) {
      safe[0] = { ...safe[0], isDefault: true }
    }
    return safe
  } catch {
    return DEFAULT_PAYMENT_METHODS
  }
}

export function savePaymentMethods(methods: PaymentMethodRecord[]) {
  try {
    window.localStorage.setItem(
      PAYMENT_METHODS_STORAGE_KEY,
      JSON.stringify(methods),
    )
  } catch {
    /* ignore storage errors */
  }
}

