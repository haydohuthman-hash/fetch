export type OrbStackQuickAction = {
  id: string
  label: string
  source?: 'text' | 'voice' | 'scanner' | 'quick_action'
  text: string
  requiresPhoto?: boolean
  /** Route confirm row: Back = secondary, Next = primary */
  variant?: 'primary' | 'secondary'
}

export type OrbStackLocationField = {
  field: 'pickup' | 'dropoff'
  label: string
  value?: string
  placeholder: string
  verified?: boolean
}

/** Assistant floating card payload (map-first composer). */
export type OrbStackCard = {
  id: string
  title: string
  subtitle?: string
  imagePreviews?: string[]
  scannerPanel?: {
    title: string
    subtitle: string
    ctaLabel: string
    scanText?: string
    loading?: boolean
    loadingLine?: string
  }
  /** Compact AI-style recap after a successful scan (replaces row-heavy dumps). */
  insightPanel?: {
    title: string
    lines: string[]
  }
  /** Post-address route confirmation: hide composer; Back / Next. */
  routeTerminal?: boolean
  /** After route Next: scan-only item step (map stays visible). */
  jobDetailsStep?: boolean
  /** Junk removal: simplified scan step (no inventory / confirm UI). */
  junkScanStep?: boolean
  /** Junk removal: access details before quote. */
  junkAccessStep?: boolean
  junkAccessFields?: {
    stairs: boolean | null
    lift: boolean | null
    carryDistance: number | null
    disassembly: boolean | null
  }
  junkAccessNextEnabled?: boolean
  /** Junk: quote review before confirmation. */
  junkQuoteStep?: boolean
  /** Compact lines: pickup, items, access, price. */
  junkQuoteLines?: string[]
  /** Junk: full summary before payment. */
  junkBookingConfirmStep?: boolean
  junkBookingConfirmLines?: string[]
  /** Scanned list has been confirmed (job-details step). */
  jobDetailsItemsConfirmed?: boolean
  /** Next enabled: ≥1 image, confirmed list, ≥1 line item. */
  jobDetailsNextEnabled?: boolean
  /** Editable lines from scan (id = normalized key). */
  jobDetailsInventory?: {
    lines: { id: string; label: string; quantity: number }[]
    onRename: (id: string, newLabel: string) => void
    onQuantityChange: (id: string, quantity: number) => void
    onRemove: (id: string) => void
  }
  locationFields?: OrbStackLocationField[]
  rows?: string[]
  inputPlaceholder?: string
  quickActions?: OrbStackQuickAction[]
  focusMode?: 'default' | 'question' | 'searching' | 'matched'
}
