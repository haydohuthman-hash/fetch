/**
 * Server-side bundle defs — must match `src/lib/suppliesCatalog.ts` MARKETPLACE_BUNDLES.
 */

/** @type {readonly { id: string, categoryId: string, title: string, tagline: string, productIds: string[], bundlePriceAud: number }[]} */
export const STORE_BUNDLES = [
  {
    id: 'bundle-drinks-fridge',
    categoryId: 'drinks',
    title: 'Fridge starter drinks pack',
    tagline: 'Soft drinks, sparkling water, sports, and iced tea — one delivery.',
    productIds: ['sup-drink-soft-case', 'sup-drink-sparkling-12', 'sup-drink-sports-6', 'sup-drink-iced-tea-8'],
    bundlePriceAud: 109,
  },
  {
    id: 'bundle-clean-essentials',
    categoryId: 'cleaning',
    title: 'ULTIMATE HOME CLEAN KIT',
    tagline: 'Everything you need to clean your entire home in one delivery.',
    productIds: [
      'sup-clean-spray-trio',
      'sup-clean-glass',
      'sup-clean-degrease',
      'sup-clean-floor',
      'sup-clean-toilet',
      'sup-clean-micro-bulk',
      'sup-clean-gloves-nitrile',
      'sup-clean-odour',
      'sup-clean-mop-pads',
    ],
    bundlePriceAud: 149,
  },
  {
    id: 'bundle-move-starter',
    categoryId: 'packing',
    title: 'Move-in box bundle',
    tagline: 'Cartons, tape, and room markers sized for a 1–2 bedroom pack-out.',
    productIds: ['sup-pack-move-kit', 'sup-pack-tape-kit', 'sup-pack-markers'],
    bundlePriceAud: 129,
  },
  {
    id: 'bundle-kitchen-move-in',
    categoryId: 'kitchen',
    title: 'Kitchen move-in bundle',
    tagline: 'Kettle, utensil block, dinner set, and dish rack.',
    productIds: ['sup-home-kettle', 'sup-home-utensils', 'sup-home-dinner-set', 'sup-kitchen-dishrack'],
    bundlePriceAud: 239,
  },
  {
    id: 'bundle-bedroom-sleep',
    categoryId: 'bedroom',
    title: 'Sleep-ready bundle',
    tagline: 'Queen cotton sheets plus a fresh pillow pair.',
    productIds: ['sup-home-bedding-queen', 'sup-bed-pillows'],
    bundlePriceAud: 149,
  },
  {
    id: 'bundle-bathroom-fresh',
    categoryId: 'bathroom',
    title: 'Bathroom day-one bundle',
    tagline: 'Towels, shower kit, mat, and soap dispensers.',
    productIds: ['sup-home-bath-towels', 'sup-home-shower-curtain', 'sup-home-bath-mat', 'sup-bath-soap'],
    bundlePriceAud: 129,
  },
  {
    id: 'bundle-living-cosy',
    categoryId: 'livingRoom',
    title: 'Living room starter',
    tagline: 'LED lamp, warm bulbs, throw, and coasters.',
    productIds: ['sup-home-desk-lamp', 'sup-home-led-bulbs', 'sup-living-throw', 'sup-living-coasters'],
    bundlePriceAud: 159,
  },
  {
    id: 'bundle-laundry-move-in',
    categoryId: 'laundry',
    title: 'Laundry setup bundle',
    tagline: 'Hamper, liquid, hangers, and fold airer.',
    productIds: ['sup-laundry-hamper', 'sup-laundry-detergent', 'sup-laundry-hangers', 'sup-laundry-airer'],
    bundlePriceAud: 129,
  },
  {
    id: 'bundle-storage-trio',
    categoryId: 'storage',
    title: 'Storage starter bundle',
    tagline: 'Stackable bins, vacuum bags, and fabric cubes.',
    productIds: ['sup-home-storage', 'sup-store-vacuum-bags', 'sup-store-cubes'],
    bundlePriceAud: 99,
  },
]

/**
 * @param {string} bundleId
 * @param {Map<string, { priceAud: number }>} productById
 */
export function bundleRetailTotalAud(bundle, productById) {
  let sum = 0
  for (const pid of bundle.productIds) {
    const p = productById.get(pid)
    if (p) sum += p.priceAud
  }
  return sum
}

/**
 * @param {string} bundleId
 * @param {Map<string, { id: string, sku: string, title: string, priceAud: number }>} productById
 */
export function resolveBundleLines(bundle, productById) {
  /** @type {{ productId: string, sku: string, title: string, unitPriceAud: number, qty: number }[]} */
  const lines = []
  for (const pid of bundle.productIds) {
    const p = productById.get(pid)
    if (p) {
      lines.push({
        productId: p.id,
        sku: p.sku,
        title: p.title,
        unitPriceAud: p.priceAud,
        qty: 1,
      })
    }
  }
  return lines
}
