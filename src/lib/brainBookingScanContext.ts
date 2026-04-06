import type { PhotoScanResult } from './assistant/photoScanner'

/** Compact scan facts for the chat LLM (appendix + optional follow-up turns). */
export function buildBrainBookingScanSummaryFromPhoto(
  r: PhotoScanResult | null | undefined,
): string {
  if (!r) return ''
  const lines: string[] = []
  if (r.detectedItems?.length) {
    lines.push(`Items: ${r.detectedItems.join(', ')}`)
  }
  lines.push(`Estimated size: ${r.estimatedSize}`)
  if (r.confidence != null && Number.isFinite(r.confidence)) {
    lines.push(`Confidence: ${Math.round(r.confidence * 100)}%`)
  }
  if (r.notes?.trim()) lines.push(`Notes: ${r.notes.trim()}`)
  if (r.detailedDescription?.trim()) {
    lines.push(`Detail: ${r.detailedDescription.trim().slice(0, 500)}`)
  }
  if (r.laneHint) lines.push(`Lane hint: ${r.laneHint}`)
  if (r.accessRisk) lines.push(`Access risk: ${r.accessRisk}`)
  if (r.isHeavyItem) lines.push('Heavy item: yes')
  if (r.isBulky) lines.push('Bulky: yes')
  if (r.needsTwoMovers) lines.push('Needs two movers: yes')
  if (r.needsSpecialEquipment) lines.push('Special equipment: yes')
  return lines.join('\n').trim()
}
