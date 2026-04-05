import type { JobLane } from './types'
import {
  fetchPerfHeaders,
  fetchPerfMark,
  fetchPerfSetServerTiming,
  parseFetchPerfTimingHeader,
} from '../fetchPerf'

export type ScannerEstimatedSize = 'small' | 'medium' | 'large' | 'whole_home'

export type PhotoScanResult = {
  detectedItems: string[]
  estimatedSize: ScannerEstimatedSize
  confidence: number
  notes?: string
  laneHint?: JobLane
  mainItems?: string[]
  specialItemType?: string | null
  isHeavyItem?: boolean
  isBulky?: boolean
  needsTwoMovers?: boolean
  needsSpecialEquipment?: boolean
  accessRisk?: 'low' | 'medium' | 'high' | null
  detailedDescription?: string
  error?: string
}

const DEFAULT_SCAN_API_URL = 'http://127.0.0.1:8787/api/scan'

function normItem(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function toSizeFromCount(count: number): ScannerEstimatedSize {
  if (count >= 12) return 'whole_home'
  if (count >= 7) return 'large'
  if (count >= 4) return 'medium'
  return 'small'
}

function laneFromItems(items: string[], size: ScannerEstimatedSize): JobLane {
  const joined = items.join(' ')
  if (size === 'whole_home') return 'whole_home_move'
  if (/\b(junk|trash|rubbish|waste|scrap|broken)\b/.test(joined)) return 'junk_removal'
  if (/\b(parcel|package|order|store|box)\b/.test(joined)) return 'delivery_pickup'
  return 'single_item_small_move'
}

function fallbackFromFiles(files: File[]): PhotoScanResult {
  const rawTokens = files
    .map((f) => f.name.toLowerCase())
    .flatMap((n) => n.split(/[^a-z0-9]+/g))
    .filter((t) => t.length > 2)

  const dictionary = [
    'couch',
    'sofa',
    'table',
    'chair',
    'fridge',
    'mattress',
    'bed',
    'boxes',
    'box',
    'dresser',
    'wardrobe',
    'washing machine',
    'tv',
    'desk',
    'cabinet',
    'junk',
    'trash',
  ]

  const detected = new Set<string>()
  for (const token of rawTokens) {
    for (const item of dictionary) {
      const parts = item.split(' ')
      const hit = parts.every((p) => token.includes(p) || p.includes(token))
      if (hit) detected.add(item)
    }
  }

  const detectedItems = [...detected].map(normItem)
  const estimatedSize = toSizeFromCount(Math.max(detectedItems.length, files.length))
  const laneHint = laneFromItems(detectedItems, estimatedSize)
  return {
    detectedItems,
    estimatedSize,
    confidence: detectedItems.length ? 0.62 : 0.45,
    notes: detectedItems.length
      ? 'Quick scan locked.'
      : 'Add one more angle and I can sharpen this.',
    laneHint,
  }
}

function parseRemoteScanResult(payload: unknown): PhotoScanResult | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const p =
    root.result && typeof root.result === 'object'
      ? (root.result as Record<string, unknown>)
      : root

  const rawItems =
    (Array.isArray(p.detectedItems) ? p.detectedItems : undefined) ??
    (Array.isArray(p.items) ? p.items : undefined) ??
    []

  const detectedItems = rawItems
    .flatMap((row) => {
      if (typeof row === 'string') return [row]
      if (row && typeof row === 'object' && typeof (row as { name?: unknown }).name === 'string') {
        return [(row as { name: string }).name]
      }
      return []
    })
    .map(normItem)
    .filter(Boolean)
    .slice(0, 24)

  const sizeRaw =
    typeof p.estimatedSize === 'string'
      ? p.estimatedSize.toLowerCase()
      : typeof p.loadSize === 'string'
        ? p.loadSize.toLowerCase()
        : ''
  const estimatedSize: ScannerEstimatedSize =
    sizeRaw === 'whole_home' || sizeRaw === 'whole-home'
      ? 'whole_home'
      : sizeRaw === 'xlarge'
        ? 'large'
      : sizeRaw === 'large'
        ? 'large'
        : sizeRaw === 'medium'
          ? 'medium'
          : 'small'

  const confidence =
    typeof p.confidence === 'number'
      ? Math.max(0, Math.min(1, p.confidence))
      : detectedItems.length > 0
        ? 0.7
        : 0.5

  const notes =
    typeof p.notes === 'string'
      ? p.notes
      : typeof p.pricingReason === 'string'
        ? p.pricingReason
        : typeof p.note === 'string'
          ? p.note
          : undefined
  const laneHint = laneFromItems(detectedItems, estimatedSize)
  const mainItems = Array.isArray(p.mainItems)
    ? p.mainItems.filter((value): value is string => typeof value === 'string').map(normItem).slice(0, 8)
    : undefined
  const specialItemType =
    typeof p.specialItemType === 'string' && p.specialItemType.trim() ? p.specialItemType.trim() : null
  return {
    detectedItems,
    estimatedSize,
    confidence,
    notes,
    laneHint,
    mainItems,
    specialItemType,
    isHeavyItem: Boolean(p.isHeavyItem),
    isBulky: Boolean(p.isBulky),
    needsTwoMovers: Boolean(p.needsTwoMovers),
    needsSpecialEquipment: Boolean(p.needsSpecialEquipment),
    accessRisk:
      p.accessRisk === 'low' || p.accessRisk === 'medium' || p.accessRisk === 'high'
        ? p.accessRisk
        : null,
    detailedDescription:
      typeof p.detailedDescription === 'string' && p.detailedDescription.trim()
        ? p.detailedDescription.trim()
        : undefined,
    error: typeof p.error === 'string' ? p.error : undefined,
  }
}

/**
 * AI scanner entrypoint for booking.
 * Uses remote vision endpoint when configured; falls back to local heuristic.
 */
export type ScanBookingPhotosPerfOptions = {
  perfRunId?: string
}

export async function scanBookingPhotos(
  files: File[],
  selectedService?: 'junk' | 'moving' | 'pickup' | 'heavy',
  perf?: ScanBookingPhotosPerfOptions,
): Promise<PhotoScanResult> {
  const usable = files.filter((f) => f.type.startsWith('image/'))
  if (usable.length === 0) {
    return {
      detectedItems: [],
      estimatedSize: 'small',
      confidence: 0.2,
      notes: 'No image files detected.',
    }
  }

  const endpoint = import.meta.env.VITE_SCAN_API_URL?.trim() || DEFAULT_SCAN_API_URL
  const perfRunId = perf?.perfRunId
  try {
    const form = new FormData()
    form.append('mode', 'booking')
    if (selectedService) form.append('selectedService', selectedService)
    for (const file of usable) form.append('images', file)
    if (perfRunId) {
      fetchPerfMark(perfRunId, '3_client_request_sent', { route: 'scan', endpoint })
    }
    const resp = await fetch(endpoint, {
      method: 'POST',
      body: form,
      headers: fetchPerfHeaders(perfRunId),
    })
    if (perfRunId) {
      fetchPerfMark(perfRunId, '4_client_response_received', {
        route: 'scan',
        httpStatus: resp.status,
      })
      fetchPerfSetServerTiming(perfRunId, parseFetchPerfTimingHeader(resp))
    }
    const payload = (await resp.json().catch(() => ({}))) as unknown
    const parsed = parseRemoteScanResult(payload)
    if (resp.ok && parsed) {
      return parsed
    }
    if (parsed?.error) {
      return {
        ...fallbackFromFiles(usable),
        confidence: 0.15,
        notes: parsed.error,
        error: parsed.error,
      }
    }
  } catch {
    // fall through to local fallback
  }

  return fallbackFromFiles(usable)
}

export function scannerSummaryLine(items: string[]): string {
  if (items.length === 0) return 'Nice — I’ve got the photos.'
  if (items.length === 1) return `That looks like ${items[0]}.`
  if (items.length === 2) return `That looks like ${items[0]} and ${items[1]}.`
  const first = items.slice(0, 3)
  return `That looks like ${first[0]}, ${first[1]}, and ${first[2]}.`
}
