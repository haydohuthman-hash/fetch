import type { BookingMatchingMeta } from '../assistant/types'

/** Seconds until sequential offer deadline, or null if not applicable. */
export function sequentialOfferSecondsRemaining(
  meta: BookingMatchingMeta | null | undefined,
): number | null {
  if (!meta) return null
  const { offerSentAt, offerTimeoutMs } = meta
  if (offerSentAt == null || offerTimeoutMs == null || !Number.isFinite(offerTimeoutMs)) {
    return null
  }
  const end = offerSentAt + offerTimeoutMs
  return Math.max(0, Math.ceil((end - Date.now()) / 1000))
}

/** User-facing line for sequential matching when an offer is in flight. */
export function formatSequentialOfferCountdownLine(
  meta: BookingMatchingMeta | null | undefined,
): string | null {
  const sec = sequentialOfferSecondsRemaining(meta)
  if (sec == null) return null
  if (sec <= 0) {
    return 'Offer time is up — waiting for the driver or the next offer.'
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `Driver offer expires in ${m}m ${s}s`
  }
  return `Driver offer expires in ${sec}s`
}
