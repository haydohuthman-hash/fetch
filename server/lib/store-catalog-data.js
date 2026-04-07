/**
 * Fetch supplies storefront catalog — must stay aligned with `src/lib/suppliesCatalog.ts`
 * (ids, skus, categories, titles, prices from `server/lib/supplies-catalog.js`).
 */

/** @type {readonly { id: string, sku: string, title: string, subtitle: string, categoryId: string, priceAud: number }[]} */
export const STORE_CATALOG_PRODUCTS = [
  { id: 'sup-drink-soft-case', sku: 'SUPPLY_DRINK_SOFT_CASE', title: 'Soft drink mixed case', subtitle: 'Cola · citrus · variety cans', categoryId: 'drinks', priceAud: 42 },
  { id: 'sup-drink-sparkling-12', sku: 'SUPPLY_DRINK_SPARKLING_12', title: 'Sparkling water (12)', subtitle: 'Plain · slim cans', categoryId: 'drinks', priceAud: 28 },
  { id: 'sup-drink-sports-6', sku: 'SUPPLY_DRINK_SPORTS_6', title: 'Isotonic sports pack', subtitle: 'Mixed flavours · 600 ml', categoryId: 'drinks', priceAud: 32 },
  { id: 'sup-drink-iced-tea-8', sku: 'SUPPLY_DRINK_ICED_TEA_8', title: 'Iced tea cans (8)', subtitle: 'Lemon · peach', categoryId: 'drinks', priceAud: 26 },
  { id: 'sup-clean-pro-kit', sku: 'SUPPLY_CLEAN_PRO_KIT', title: 'Pro clean starter', subtitle: 'Spray bottles · cloths · gloves', categoryId: 'cleaning', priceAud: 48 },
  { id: 'sup-clean-floor', sku: 'SUPPLY_CLEAN_FLOOR_SYS', title: 'Hard-floor system', subtitle: 'Mop · pads · neutral cleaner', categoryId: 'cleaning', priceAud: 72 },
  { id: 'sup-clean-stick-vac', sku: 'SUPPLY_CLEAN_STICK_VAC', title: 'Stick vacuum kit', subtitle: 'Crevice tool · hard floors', categoryId: 'cleaning', priceAud: 118 },
  { id: 'sup-clean-spray-trio', sku: 'SUPPLY_CLEAN_SPRAY_TRIO', title: 'Surface spray trio', subtitle: 'Glass · bath · degrease', categoryId: 'cleaning', priceAud: 36 },
  { id: 'sup-pack-move-kit', sku: 'SUPPLY_PACK_MOVE_KIT_S', title: 'Apartment pack kit', subtitle: 'Boxes · tape · bubble wrap', categoryId: 'packing', priceAud: 89 },
  { id: 'sup-pack-fragile', sku: 'SUPPLY_PACK_FRAGILE', title: 'Fragile cell kit', subtitle: 'Dish cells · corners · tape', categoryId: 'packing', priceAud: 56 },
  { id: 'sup-pack-tape-kit', sku: 'SUPPLY_PACK_TAPE_KIT', title: 'Tape & dispenser', subtitle: 'Fibre tape · cutter · refills', categoryId: 'packing', priceAud: 42 },
  { id: 'sup-pack-pad-blanket', sku: 'SUPPLY_PACK_PAD_BLANKET', title: 'Furniture pad bundle', subtitle: 'Quilted pads · edge quilts', categoryId: 'packing', priceAud: 78 },
  { id: 'sup-clean-micro-bulk', sku: 'SUPPLY_CLEAN_MICRO_BULK', title: 'Microfibre bulk pack', subtitle: '24 cloths · colour bands', categoryId: 'cleaning', priceAud: 34 },
  { id: 'sup-clean-gloves-nitrile', sku: 'SUPPLY_CLEAN_GLOVES_NITRILE', title: 'Nitrile gloves (L)', subtitle: '100 pack · powder-free', categoryId: 'cleaning', priceAud: 28 },
  { id: 'sup-clean-degrease', sku: 'SUPPLY_CLEAN_DEGREASE', title: 'Kitchen degreaser', subtitle: '2 L refill · citrus', categoryId: 'cleaning', priceAud: 22 },
  { id: 'sup-clean-toilet', sku: 'SUPPLY_CLEAN_TOILET_SYS', title: 'Bath & toilet kit', subtitle: 'Bowl · brush · lime scale', categoryId: 'cleaning', priceAud: 31 },
  { id: 'sup-clean-glass', sku: 'SUPPLY_CLEAN_GLASS_PRO', title: 'Glass & mirror pro', subtitle: 'Squeegee · 1 L refill', categoryId: 'cleaning', priceAud: 26 },
  { id: 'sup-clean-odour', sku: 'SUPPLY_CLEAN_ODOUR_NEUT', title: 'Odour neutraliser', subtitle: 'Spray · 500 ml × 2', categoryId: 'cleaning', priceAud: 19 },
  { id: 'sup-clean-mop-pads', sku: 'SUPPLY_CLEAN_MOP_PADS_8', title: 'Mop pad refill (8)', subtitle: 'Microfibre · loop backing', categoryId: 'cleaning', priceAud: 24 },
  { id: 'sup-pack-wardrobe', sku: 'SUPPLY_PACK_WARDROBE_BOX', title: 'Wardrobe cartons (3)', subtitle: 'Bar included · tall', categoryId: 'packing', priceAud: 64 },
  { id: 'sup-pack-paper', sku: 'SUPPLY_PACK_PAPER_10KG', title: 'Packing paper bundle', subtitle: '10 kg news offcuts', categoryId: 'packing', priceAud: 38 },
  { id: 'sup-pack-stretch', sku: 'SUPPLY_PACK_STRETCH_WRAP', title: 'Stretch wrap hand roll', subtitle: '400 mm × 300 m', categoryId: 'packing', priceAud: 29 },
  { id: 'sup-pack-markers', sku: 'SUPPLY_PACK_MARKER_SET', title: 'Room marker set', subtitle: '12 permanent · labels', categoryId: 'packing', priceAud: 16 },
  { id: 'sup-pack-mattress', sku: 'SUPPLY_PACK_MATTRESS_BAG', title: 'Mattress bag (queen)', subtitle: 'Heavy poly · zip', categoryId: 'packing', priceAud: 18 },
  { id: 'sup-fetch-mattress-bag-double', sku: 'SUPPLY_FETCH_MATTRESS_BAG_D', title: 'Fetch heavy mattress bag', subtitle: 'Double · zip · handles', categoryId: 'packing', priceAud: 37 },
  { id: 'sup-fetch-mattress-bag-queen', sku: 'SUPPLY_FETCH_MATTRESS_BAG_Q', title: 'Fetch heavy mattress bag', subtitle: 'Queen · zip · handles', categoryId: 'packing', priceAud: 43 },
  { id: 'sup-fetch-mattress-bag-king', sku: 'SUPPLY_FETCH_MATTRESS_BAG_K', title: 'Fetch heavy mattress bag', subtitle: 'King · zip · handles', categoryId: 'packing', priceAud: 47 },
  { id: 'sup-pack-rope', sku: 'SUPPLY_PACK_ROPE_TIE', title: 'Tie-down rope kit', subtitle: '15 m × 2 · carabiners', categoryId: 'packing', priceAud: 22 },
  { id: 'sup-pack-bubble-narrow', sku: 'SUPPLY_PACK_BUBBLE_NARROW', title: 'Bubble roll (narrow)', subtitle: '30 cm × 50 m', categoryId: 'packing', priceAud: 35 },
  { id: 'sup-pack-blade', sku: 'SUPPLY_PACK_UTILITY_BLADES', title: 'Utility blades (20)', subtitle: 'Standard trapezoid', categoryId: 'packing', priceAud: 12 },
  { id: 'sup-home-desk-lamp', sku: 'SUPPLY_HOME_DESK_LAMP', title: 'LED desk lamp', subtitle: 'Dimmable · warm white', categoryId: 'livingRoom', priceAud: 46 },
  { id: 'sup-home-kettle', sku: 'SUPPLY_HOME_KETTLE', title: 'Electric kettle', subtitle: '1.7 L · rapid boil', categoryId: 'kitchen', priceAud: 59 },
  { id: 'sup-home-bedding-queen', sku: 'SUPPLY_HOME_BEDDING_Q', title: 'Cotton sheet set (queen)', subtitle: 'Fitted · flat · 2 pillowcases', categoryId: 'bedroom', priceAud: 92 },
  { id: 'sup-home-bath-towels', sku: 'SUPPLY_HOME_TOWEL_SET', title: 'Bath towel bundle', subtitle: '4 bath · 2 hand', categoryId: 'bathroom', priceAud: 52 },
  { id: 'sup-home-utensils', sku: 'SUPPLY_HOME_UTENSIL_BLK', title: 'Kitchen utensil block', subtitle: '12 pieces · bamboo block', categoryId: 'kitchen', priceAud: 64 },
  { id: 'sup-home-saucepans', sku: 'SUPPLY_HOME_SAUCEPAN_SET', title: 'Non-stick saucepan pair', subtitle: '18 cm + 24 cm · lids', categoryId: 'kitchen', priceAud: 118 },
  { id: 'sup-home-shower-curtain', sku: 'SUPPLY_HOME_SHOWER_CURT', title: 'Shower curtain kit', subtitle: 'Liner + rings · mildew resistant', categoryId: 'bathroom', priceAud: 36 },
  { id: 'sup-home-bath-mat', sku: 'SUPPLY_HOME_BATH_MAT', title: 'Memory foam bath mat', subtitle: '50 × 80 cm · non-slip', categoryId: 'bathroom', priceAud: 34 },
  { id: 'sup-home-storage', sku: 'SUPPLY_HOME_STORAGE_3', title: 'Storage bin trio', subtitle: 'Stackable · 15 L each', categoryId: 'storage', priceAud: 44 },
  { id: 'sup-home-dinner-set', sku: 'SUPPLY_HOME_DINNER_START', title: 'Dinner starter set', subtitle: '4 place settings · stoneware', categoryId: 'kitchen', priceAud: 78 },
  { id: 'sup-home-led-bulbs', sku: 'SUPPLY_HOME_LED_BULBS', title: 'LED bulb multipack', subtitle: '6 × A60 · 2700 K', categoryId: 'livingRoom', priceAud: 32 },
  { id: 'sup-home-pedal-bin', sku: 'SUPPLY_HOME_PEDAL_BIN', title: 'Pedal bin (20 L)', subtitle: 'Soft-close lid · kitchen', categoryId: 'kitchen', priceAud: 72 },
  { id: 'sup-kitchen-dishrack', sku: 'SUPPLY_KITCHEN_DISH_RACK', title: 'Dish drying rack', subtitle: '2-tier · cutlery caddy', categoryId: 'kitchen', priceAud: 54 },
  { id: 'sup-bed-pillows', sku: 'SUPPLY_BED_PILLOW_PAIR', title: 'Pillow pair (standard)', subtitle: 'Medium loft · breathable cover', categoryId: 'bedroom', priceAud: 68 },
  { id: 'sup-bed-blackout', sku: 'SUPPLY_BED_BLACKOUT_PAIR', title: 'Blackout curtains (pair)', subtitle: '220 cm drop · charcoal', categoryId: 'bedroom', priceAud: 112 },
  { id: 'sup-bath-soap', sku: 'SUPPLY_BATH_SOAP_SET', title: 'Soap dispenser duo', subtitle: 'Pump bottles · labels', categoryId: 'bathroom', priceAud: 28 },
  { id: 'sup-living-throw', sku: 'SUPPLY_LIVING_THROW', title: 'Knit throw blanket', subtitle: '130 × 170 cm · oatmeal', categoryId: 'livingRoom', priceAud: 74 },
  { id: 'sup-living-coasters', sku: 'SUPPLY_LIVING_COASTERS_6', title: 'Coaster set (6)', subtitle: 'Cork-backed · stone look', categoryId: 'livingRoom', priceAud: 22 },
  { id: 'sup-laundry-hamper', sku: 'SUPPLY_LAUNDRY_HAMPER', title: 'Laundry hamper (wheeled)', subtitle: 'Breathable liner · 60 L', categoryId: 'laundry', priceAud: 48 },
  { id: 'sup-laundry-detergent', sku: 'SUPPLY_LAUNDRY_LIQUID_2L', title: 'Laundry liquid (2 L)', subtitle: 'Concentrated · sensitive', categoryId: 'laundry', priceAud: 26 },
  { id: 'sup-laundry-hangers', sku: 'SUPPLY_LAUNDRY_HANGERS_30', title: 'Velvet hangers (30)', subtitle: 'Slim · non-slip', categoryId: 'laundry', priceAud: 34 },
  { id: 'sup-laundry-airer', sku: 'SUPPLY_LAUNDRY_AIRER', title: 'Fold clothes airer', subtitle: 'Wing · 18 m line', categoryId: 'laundry', priceAud: 42 },
  { id: 'sup-store-vacuum-bags', sku: 'SUPPLY_STORE_VAC_BAGS', title: 'Vacuum storage bags (6)', subtitle: 'Jumbo + large mix', categoryId: 'storage', priceAud: 36 },
  { id: 'sup-store-cubes', sku: 'SUPPLY_STORE_FABRIC_CUBE_2', title: 'Fabric cube bins (2)', subtitle: '28 cm · label window', categoryId: 'storage', priceAud: 32 },
]

/** @type {Map<string, (typeof STORE_CATALOG_PRODUCTS)[number]>} */
export function buildStoreProductByIdMap() {
  return new Map(STORE_CATALOG_PRODUCTS.map((p) => [p.id, p]))
}
