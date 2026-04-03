import type { BookingRecord } from '../../lib/booking'

type ActivityScreenProps = {
  bookings: BookingRecord[]
}

export function ActivityScreen({ bookings }: ActivityScreenProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1024px] flex-col bg-fetch-soft-gray px-4 pb-28 pt-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-fetch-charcoal">
        Activity
      </h1>
      <div className="mt-4 space-y-3">
        {bookings.length === 0 ? (
          <p className="rounded-[0.9rem] bg-white px-3 py-4 text-[13px] leading-snug text-fetch-muted ring-1 ring-black/[0.06]">
            No bookings yet.
          </p>
        ) : (
          bookings.map((booking) => (
            <article
              key={booking.id}
              className="rounded-[1rem] bg-white px-4 py-3 shadow-[0_6px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold capitalize text-fetch-charcoal">
                    {booking.serviceMode ?? booking.serviceType ?? 'Booking'}
                  </p>
                  <p className="mt-1 text-[12px] text-fetch-muted">
                    {booking.pickupAddressText || 'Pickup pending'}
                    {booking.dropoffAddressText ? ` -> ${booking.dropoffAddressText}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-fetch-soft-gray px-2.5 py-1 text-[11px] font-semibold capitalize text-fetch-charcoal ring-1 ring-black/[0.06]">
                  {booking.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-fetch-muted">
                <p>Quote: {booking.pricing ? `$${booking.pricing.minPrice}-$${booking.pricing.maxPrice}` : 'Pending'}</p>
                <p>
                  Payment: {booking.paymentIntent ? booking.paymentIntent.status.replace(/_/g, ' ') : 'Pending'}
                </p>
                <p>Items: {Object.values(booking.itemCounts).reduce((sum, qty) => sum + (qty || 0), 0) || booking.detectedItems.length}</p>
                <p>
                  Updated: {new Date(booking.updatedAt).toLocaleString()}
                </p>
              </div>
              {booking.aiReview?.summary ? (
                <p className="mt-3 rounded-[0.85rem] bg-fetch-soft-gray/55 px-3 py-2 text-[12px] leading-snug text-fetch-charcoal">
                  {booking.aiReview.summary}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  )
}
