import type { BookingLifecycleStatus, BookingStage } from '../assistant/types'

/**
 * Maps server booking lifecycle to customer-centric map stages so
 * {@link BookingMapReflection} pins/routes look sensible for the driver app.
 */
export function bookingLifecycleToMapStage(status: BookingLifecycleStatus | null | undefined): BookingStage {
  switch (status) {
    case 'dispatching':
    case 'draft':
    case 'payment_required':
    case 'confirmed':
      return 'building'
    case 'matched':
    case 'en_route':
      return 'matched'
    case 'arrived':
    case 'in_progress':
      return 'live'
    case 'completed':
    case 'cancelled':
    default:
      return 'idle'
  }
}
