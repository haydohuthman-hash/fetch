import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react'
import type { HomeServiceLandingId } from '../lib/homeServiceInfoContent'
import { HOME_SERVICE_HERO_PATHS } from '../lib/homeServiceInfoContent'
import { LANDING_PRIMARY_SERVICES } from '../views/homeConstants'

/** Fallback tile frame before the lead image’s natural size is known */
const FALLBACK_TILE_W = 5
const FALLBACK_TILE_H = 4

const DOC_PROMO_NW = '--fetch-promo-nw'
const DOC_PROMO_NH = '--fetch-promo-nh'

const LEAD_PROMO_HERO_INDEX = LANDING_PRIMARY_SERVICES.findIndex(
  (o) => HOME_SERVICE_HERO_PATHS[o.jobType] != null,
)

type HomeServicePromoCarouselProps = {
  onSelectService: (landingId: HomeServiceLandingId) => void
}

export function HomeServicePromoCarousel({ onSelectService }: HomeServicePromoCarouselProps) {
  const [leadNatural, setLeadNatural] = useState<{ nw: number; nh: number } | null>(null)
  const leadImgRef = useRef<HTMLImageElement | null>(null)

  const captureLeadSize = (im: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = im
    if (naturalWidth > 0 && naturalHeight > 0) {
      setLeadNatural({ nw: naturalWidth, nh: naturalHeight })
    }
  }

  useLayoutEffect(() => {
    const im = leadImgRef.current
    if (im?.complete) captureLeadSize(im)
  }, [])

  useEffect(() => {
    const r = document.documentElement
    if (leadNatural && leadNatural.nw > 0 && leadNatural.nh > 0) {
      r.style.setProperty(DOC_PROMO_NW, String(leadNatural.nw))
      r.style.setProperty(DOC_PROMO_NH, String(leadNatural.nh))
    }
    return () => {
      r.style.removeProperty(DOC_PROMO_NW)
      r.style.removeProperty(DOC_PROMO_NH)
    }
  }, [leadNatural])

  const tileAspectStyle: CSSProperties = {
    aspectRatio: leadNatural
      ? `${leadNatural.nw} / ${leadNatural.nh}`
      : `${FALLBACK_TILE_W} / ${FALLBACK_TILE_H}`,
  }

  const onLeadImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    captureLeadSize(e.currentTarget)
  }

  return (
    <div className="fetch-home-service-promo-wrap fetch-home-service-promo-wrap--eats w-full min-w-0">
      <div
        className="fetch-home-service-promo-clip w-full min-w-0"
        role="presentation"
      >
        <div
          className="fetch-home-service-promo-carousel flex w-full min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Service highlights"
        >
          <div className="fetch-home-service-promo-track flex flex-row">
            {LANDING_PRIMARY_SERVICES.map((opt, index) => {
              const jt = opt.jobType
              const hero = HOME_SERVICE_HERO_PATHS[jt]
              const lid = opt.id as HomeServiceLandingId
              const bannerRight = jt === 'homeMoving'
              const bannerLeft = jt === 'cleaning'
              return (
                <button
                  key={opt.id}
                  type="button"
                  className="fetch-home-service-promo-card flex shrink-0 snap-start flex-col overflow-hidden rounded-[1.125rem] bg-white text-left transition-[transform,box-shadow] active:scale-[0.985] motion-safe:duration-200 motion-safe:ease-out"
                  aria-label={`${opt.cardHeading} — details`}
                  onClick={() => onSelectService(lid)}
                >
                  <div
                    className="fetch-home-service-promo-card__media relative w-full overflow-hidden bg-neutral-100"
                    style={tileAspectStyle}
                  >
                    {hero ? (
                      <img
                        ref={index === LEAD_PROMO_HERO_INDEX ? leadImgRef : undefined}
                        src={hero}
                        alt=""
                        onLoad={
                          index === LEAD_PROMO_HERO_INDEX && hero ? onLeadImageLoad : undefined
                        }
                        className={[
                          'fetch-home-service-promo-card__img h-full w-full object-cover',
                          bannerRight
                            ? 'fetch-home-service-promo-card__img--banner-right'
                            : bannerLeft
                              ? 'fetch-home-service-promo-card__img--banner-left'
                              : 'object-[85%_center]',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      />
                    ) : (
                      <div
                        className="fetch-home-service-promo-card__placeholder flex h-full w-full items-center justify-center bg-slate-100"
                        aria-hidden
                      />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
