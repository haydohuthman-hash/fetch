import type { BookingLifecycleStatus } from '../assistant/types'
import type { BookingRecord } from '../booking/types'

/**
 * Driver-app phases aligned with shared {@link BookingLifecycleStatus} — no parallel status enum.
 */
export type DriverLifecyclePhase =
  | 'offline'
  | 'online_idle'
  | 'receiving_offer'
  | 'accepted_job'
  | 'en_route_to_pickup'
  | 'arrived_at_pickup'
  | 'in_transit'
  | 'completed'

export function driverPhaseFromBookingStatus(
  status: BookingLifecycleStatus,
  ctx: 'incoming_offer' | 'assigned',
): DriverLifecyclePhase | null {
  if (ctx === 'incoming_offer' && (status === 'dispatching' || status === 'pending_match')) {
    return 'receiving_offer'
  }
  if (ctx !== 'assigned') return null
  switch (status) {
    case 'matched':
      return 'accepted_job'
    case 'en_route':
      return 'en_route_to_pickup'
    case 'arrived':
      return 'arrived_at_pickup'
    case 'in_progress':
      return 'in_transit'
    case 'completed':
      return 'completed'
    default:
      return null
  }
}

export function driverPhaseLabel(phase: DriverLifecyclePhase): string {
  const labels: Record<DriverLifecyclePhase, string> = {
    offline: 'Offline',
    online_idle: 'Online',
    receiving_offer: 'Incoming offer',
    accepted_job: 'Accepted',
    en_route_to_pickup: 'En route to pickup',
    arrived_at_pickup: 'Arrived at pickup',
    in_transit: 'In transit',
    completed: 'Completed',
  }
  return labels[phase]
}

/** Primary CTA when advancing assigned job (shared lifecycle order — label = action into next status). */
export function nextDriverAdvanceLabel(nextStatus: BookingLifecycleStatus | null): string | null {
  if (!nextStatus) return null
  const map: Partial<Record<BookingLifecycleStatus, string>> = {
    en_route: 'Head to pickup',
    arrived: "I've arrived",
    in_progress: 'Start delivery',
    completed: 'Complete job',
  }
  return map[nextStatus] ?? `Mark ${nextStatus.replace(/_/g, ' ')}`
}

export function offerExpiryDeadlineMs(booking: BookingRecord | null, offerWindowMs: number): number | null {
  const meta = booking?.matchingMeta
  if (meta?.offerSentAt != null && typeof meta.offerTimeoutMs === 'number' && Number.isFinite(meta.offerTimeoutMs)) {
    return meta.offerSentAt + meta.offerTimeoutMs
  }
  const started = booking?.dispatchMeta?.startedAt
  if (started == null || !Number.isFinite(started)) return null
  return started + offerWindowMs
}

export function secondsRemaining(deadlineMs: number | null, nowMs: number): number | null {
  if (deadlineMs == null) return null
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
}

export type DashboardHeadlinePhase =
  | { kind: 'offline' }
  | { kind: 'online_idle' }
  | { kind: 'receiving_offer'; count: number }
  | { kind: 'on_job'; phase: DriverLifecyclePhase; bookingId: string }

/**
 * Single line for peek / header: offline, idle online, pooled offers, or active assigned job phase.
 */
export function resolveDashboardHeadlinePhase(input: {
  online: boolean
  incomingOfferCount: number
  /** Assigned active bookings for this driver (non-terminal). */
  assignedActive: BookingRecord[]
}): DashboardHeadlinePhase {
  if (!input.online) return { kind: 'offline' }
  const active = input.assignedActive.filter((b) =>
    ['matched', 'en_route', 'arrived', 'in_progress'].includes(b.status),
  )
  if (active.length) {
    const b = active[0]!
    const phase = driverPhaseFromBookingStatus(b.status, 'assigned')
    if (phase && phase !== 'completed') {
      return { kind: 'on_job', phase, bookingId: b.id }
    }
  }
  if (input.incomingOfferCount > 0) {
    return { kind: 'receiving_offer', count: input.incomingOfferCount }
  }
  return { kind: 'online_idle' }
}

export function formatDashboardPeekLine(headline: DashboardHeadlinePhase): string {
  switch (headline.kind) {
    case 'offline':
      return 'Offline · not receiving offers'
    case 'online_idle':
      return 'Online · waiting for offers'
    case 'receiving_offer':
      return headline.count === 1
        ? '1 incoming offer'
        : `${headline.count} incoming offers`
    case 'on_job':
      return driverPhaseLabel(headline.phase)
  }
}
