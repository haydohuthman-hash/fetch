/** Server-side AUD prices for hardware SKUs — single source of truth for payment intents. */

const PRICES_AUD = {
  FETCH_TOUCH_7: 449,
  FETCH_TOUCH_10: 699,
  FETCH_TOUCH_PRO: 989,
}

export function getHardwareSkuPriceAud(sku) {
  if (typeof sku !== 'string') return null
  const n = PRICES_AUD[sku]
  return typeof n === 'number' ? n : null
}

export function listHardwareSkus() {
  return Object.keys(PRICES_AUD)
}
