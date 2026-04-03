import type { BookingState } from './types'

function normKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((v) => v.trim()).filter(Boolean))].slice(0, 16)
}

function itemSummary(itemCounts: Record<string, number>): string | null {
  const pairs = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])
  if (pairs.length === 0) return null
  const first = pairs.slice(0, 4).map(([name, qty]) => (qty > 1 ? `${qty}x ${name}` : name))
  return first.join(', ')
}

function displayLabelForKey(key: string, detectedItems: string[]): string {
  const hit = detectedItems.find((d) => normKey(d) === key)
  if (hit?.trim()) return hit.trim()
  return key
    .split(' ')
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export type InventoryLine = { id: string; label: string; quantity: number }

export function inventoryLinesFromState(
  state: Pick<BookingState, 'itemCounts' | 'detectedItems'>,
): InventoryLine[] {
  return Object.entries(state.itemCounts)
    .map(([key, quantity]) => ({
      id: key,
      label: displayLabelForKey(key, state.detectedItems),
      quantity,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

export function applyInventoryQuantityChange(
  state: BookingState,
  id: string,
  quantity: number,
): BookingState {
  const raw = Math.round(quantity)
  const q = Number.isFinite(raw) ? Math.max(0, Math.min(99, raw)) : 1
  const nextCounts = { ...state.itemCounts }
  if (q <= 0) {
    delete nextCounts[id]
  } else {
    nextCounts[id] = q
  }
  const label = displayLabelForKey(id, state.detectedItems)
  let nextDetected = state.detectedItems.filter((d) => normKey(d) !== id)
  if (q > 0) nextDetected = dedupe([...nextDetected, label])
  return {
    ...state,
    itemCounts: nextCounts,
    detectedItems: nextDetected,
    inventorySummary: itemSummary(nextCounts),
    jobDetailsItemsConfirmed: false,
  }
}

export function applyInventoryRemove(state: BookingState, id: string): BookingState {
  const nextCounts = { ...state.itemCounts }
  delete nextCounts[id]
  const nextDetected = state.detectedItems.filter((d) => normKey(d) !== id)
  return {
    ...state,
    itemCounts: nextCounts,
    detectedItems: dedupe(nextDetected),
    inventorySummary: itemSummary(nextCounts),
    jobDetailsItemsConfirmed: false,
  }
}

export function applyInventoryRename(state: BookingState, id: string, newLabel: string): BookingState {
  const raw = newLabel.trim()
  if (!raw) return state
  const newKey = normKey(raw)
  if (!newKey) return state
  const qty = state.itemCounts[id] ?? 0
  if (qty <= 0) return state
  const nextCounts = { ...state.itemCounts }
  delete nextCounts[id]
  nextCounts[newKey] = (nextCounts[newKey] ?? 0) + qty
  const nextDetected = dedupe([
    ...state.detectedItems.filter((d) => normKey(d) !== id),
    raw,
  ])
  return {
    ...state,
    itemCounts: nextCounts,
    detectedItems: nextDetected,
    inventorySummary: itemSummary(nextCounts),
    jobDetailsItemsConfirmed: false,
  }
}
