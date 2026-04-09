import type { DropReel } from './types'

function formatCompactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

/** Rough plays from server view-ms aggregate (~4s engaged view). */
const MS_PER_VIEW_ESTIMATE = 4000

/** Estimated view count for profile grid labels (API `viewMsTotal` preferred). */
export function profileDropEstimatedViews(reel: DropReel): number {
  const ms =
    typeof reel.viewMsTotal === 'number' && reel.viewMsTotal > 0
      ? reel.viewMsTotal
      : typeof reel.watchTimeMsSeed === 'number' && reel.watchTimeMsSeed > 0
        ? reel.watchTimeMsSeed
        : 0
  if (ms <= 0) return 0
  return Math.max(1, Math.round(ms / MS_PER_VIEW_ESTIMATE))
}

/** Short label like `1.2K` for overlay, or null when no signal. */
export function formatProfileDropViews(reel: DropReel): string | null {
  const v = profileDropEstimatedViews(reel)
  return v > 0 ? formatCompactCount(v) : null
}
