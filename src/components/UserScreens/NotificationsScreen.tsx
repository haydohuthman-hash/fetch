export type AppNotification = {
  id: string
  bookingId?: string
  title: string
  message: string
  createdAt: number
  isRead: boolean
}

type NotificationsScreenProps = {
  notifications: AppNotification[]
  onMarkAllRead: () => void
  onMarkRead?: (id: string) => void
}

export function NotificationsScreen({
  notifications,
  onMarkAllRead,
  onMarkRead,
}: NotificationsScreenProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1024px] flex-col bg-fetch-soft-gray px-4 pb-28 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-fetch-charcoal">
          Notifications
        </h1>
        <button
          type="button"
          onClick={onMarkAllRead}
          className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-fetch-charcoal ring-1 ring-black/[0.08]"
        >
          Mark all read
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {notifications.length === 0 ? (
          <p className="rounded-[0.9rem] bg-white px-3 py-3 text-[12px] text-fetch-muted ring-1 ring-black/[0.06]">
            No notifications yet
          </p>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={[
                'rounded-[0.9rem] bg-white px-3 py-3 ring-1',
                n.isRead ? 'ring-black/[0.06]' : 'ring-fetch-red/30',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-semibold text-fetch-charcoal">{n.title}</p>
                {!n.isRead ? (
                  <button
                    type="button"
                    onClick={() => onMarkRead?.(n.id)}
                    className="rounded-full bg-fetch-red px-2 py-1 text-[10px] font-semibold text-white"
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-[12px] leading-snug text-fetch-muted/88">{n.message}</p>
              {n.bookingId ? (
                <p className="mt-1 text-[11px] text-fetch-muted/72">Booking: {n.bookingId}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-fetch-muted/72">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
