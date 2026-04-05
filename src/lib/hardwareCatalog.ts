/** In-app smart-home touch panel catalog (client display; prices validated on server). */

export type HardwareProduct = {
  id: string
  sku: string
  title: string
  subtitle: string
  /** Display price AUD — must match server `getHardwareSkuPriceAud(sku)`. */
  priceAud: number
  /** Optional gradient / illustration (no external assets required). */
  previewStyle: 'slate' | 'violet' | 'emerald'
  specs: string[]
  description: string
}

export const HARDWARE_PRODUCTS: readonly HardwareProduct[] = [
  {
    id: 'hw-fetch-touch-7',
    sku: 'FETCH_TOUCH_7',
    title: 'Fetch Touch 7"',
    subtitle: 'Wall glass · rooms & scenes',
    priceAud: 449,
    previewStyle: 'slate',
    specs: [
      '7" laminated glass front',
      'PoE or Wi‑Fi',
      'Fetch scenes & voice',
      'Matte black or white bezel',
    ],
    description:
      'Compact wall panel for rooms, climate, and Fetch automations. Designed to sit flush in a standard US/AU wall box.',
  },
  {
    id: 'hw-fetch-touch-10',
    sku: 'FETCH_TOUCH_10',
    title: 'Fetch Touch 10"',
    subtitle: 'Primary wall command',
    priceAud: 699,
    previewStyle: 'violet',
    specs: [
      '10.1" anti-glare glass',
      'Quad-core edge module',
      'Stereo speakers + mic array',
      'Includes wall mount kit',
    ],
    description:
      'Main hallway or living hub — larger tiles, camera-ready mic, and richer Fetch status at a glance.',
  },
  {
    id: 'hw-fetch-touch-pro',
    sku: 'FETCH_TOUCH_PRO',
    title: 'Fetch Touch Pro',
    subtitle: 'Premium finish + NFC',
    priceAud: 989,
    previewStyle: 'emerald',
    specs: [
      '11" bonded glass',
      'NFC tap-to-identify',
      'Ambient light + proximity',
      'Brushed aluminium frame',
    ],
    description:
      'Flagship in-wall panel with NFC presence, adaptive brightness, and a rigid aluminium frame for high-traffic entries.',
  },
]

export function getHardwareProductById(id: string): HardwareProduct | undefined {
  return HARDWARE_PRODUCTS.find((p) => p.id === id)
}

export function getHardwareProductBySku(sku: string): HardwareProduct | undefined {
  return HARDWARE_PRODUCTS.find((p) => p.sku === sku)
}
