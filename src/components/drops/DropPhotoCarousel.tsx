import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  reelId: string
  urls: readonly string[]
  /** When false, show first image only (distant slide). */
  interactive: boolean
  active: boolean
  className?: string
}

/**
 * Mobile-first swipeable photo carousel with dots (Drops feed).
 */
export function DropPhotoCarousel({ reelId, urls, interactive, active, className = '' }: Props) {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const safeUrls = urls.length ? urls : ['']

  useEffect(() => {
    setIndex(0)
  }, [reelId])

  useEffect(() => {
    if (!interactive || !active || safeUrls.length <= 1) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % safeUrls.length)
    }, 4200)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [active, interactive, safeUrls.length])

  const go = useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => {
        const n = safeUrls.length
        if (n <= 1) return 0
        return (i + dir + n) % n
      })
    },
    [safeUrls.length],
  )

  const onTouchStart = (e: React.TouchEvent) => {
    if (!interactive) return
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!interactive || touchStartX.current == null) return
    const x = e.changedTouches[0]?.clientX ?? touchStartX.current
    const d = x - touchStartX.current
    touchStartX.current = null
    if (Math.abs(d) < 48) return
    if (d < 0) go(1)
    else go(-1)
  }

  const src = safeUrls[index] ?? safeUrls[0]

  if (!interactive) {
    return (
      <img
        src={src || undefined}
        alt=""
        className={className}
        decoding="async"
        loading="lazy"
      />
    )
  }

  return (
    <div
      className={`absolute inset-0 ${className}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label={`Photo ${index + 1} of ${safeUrls.length}`}
    >
      <img
        key={`${reelId}-${index}`}
        src={src || undefined}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        decoding="async"
        loading={active ? 'eager' : 'lazy'}
      />
      {safeUrls.length > 1 ? (
        <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-[1] flex justify-center gap-1.5 px-4">
          {safeUrls.map((_, i) => (
            <span
              key={i}
              className={[
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/45',
              ].join(' ')}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
