import { haversineMeters } from './homeDirections'

export type ExploreMapPoiKind =
  | 'nearby'
  | 'park'
  | 'adventure'
  | 'natural'
  | 'fuel'
  | 'food'
  | 'cafe'
  | 'shop'

export type ExploreMapPoi = {
  id: string
  lat: number
  lng: number
  title: string
  kind: ExploreMapPoiKind
  placeId?: string
  types?: string[]
}

const ADVENTURE_PLACE_TYPES = [
  'park',
  'tourist_attraction',
  'natural_feature',
] as const

const RESTAURANT_PLACE_TYPES = ['restaurant', 'cafe', 'meal_takeaway'] as const

/** Default nearby radius (metres). */
export const MAPS_EXPLORE_NEARBY_RADIUS_M = 4200

/** UI chips → Places types (Nearby Search). Dedupe by `place_id` in the caller. */
export const MAPS_EXPLORE_CATEGORY_CHIPS = [
  {
    id: 'nature',
    label: 'Parks',
    types: ['park', 'tourist_attraction', 'natural_feature'] as const,
  },
  {
    id: 'fuel',
    label: 'Fuel',
    types: ['gas_station'] as const,
  },
  {
    id: 'food',
    label: 'Food',
    types: ['restaurant'] as const,
  },
  {
    id: 'cafe',
    label: 'Café',
    types: ['cafe'] as const,
  },
  {
    id: 'shops',
    label: 'Shops',
    types: ['supermarket', 'store'] as const,
  },
] as const

export type MapsExploreCategoryChipId = (typeof MAPS_EXPLORE_CATEGORY_CHIPS)[number]['id']

export function placeTypeToExploreKind(type: string): ExploreMapPoiKind {
  if (type === 'park') return 'park'
  if (type === 'natural_feature') return 'natural'
  if (type === 'tourist_attraction') return 'adventure'
  if (type === 'gas_station') return 'fuel'
  if (type === 'restaurant' || type === 'meal_takeaway') return 'food'
  if (type === 'cafe') return 'cafe'
  if (type === 'supermarket' || type === 'store') return 'shop'
  return 'nearby'
}

function placeResultToPoi(
  p: google.maps.places.PlaceResult,
  kind: ExploreMapPoiKind,
): ExploreMapPoi | null {
  const loc = p.geometry?.location
  if (!loc) return null
  const lat = loc.lat()
  const lng = loc.lng()
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const placeId = p.place_id ?? undefined
  const title =
    (p.name && p.name.trim()) || (p.vicinity && p.vicinity.trim()) || 'Place'
  const id = placeId ?? `${kind}:${lat.toFixed(5)}:${lng.toFixed(5)}`
  return {
    id,
    lat,
    lng,
    title: title.slice(0, 120),
    kind,
    ...(placeId ? { placeId } : {}),
    ...(p.types ? { types: [...p.types] } : {}),
  }
}

/**
 * Nearby Search (classic PlacesService) — one type per request; results merged and de-duped.
 */
export function nearbySearchByTypes(
  service: google.maps.places.PlacesService,
  location: google.maps.LatLngLiteral,
  radiusMeters: number,
  types: readonly string[],
  perTypeLimit: number,
): Promise<ExploreMapPoi[]> {
  if (typeof google === 'undefined') return Promise.resolve([])
  return new Promise((resolve) => {
    const byId = new Map<string, ExploreMapPoi>()
    let remaining = types.length
    if (remaining === 0) {
      resolve([])
      return
    }
    const done = () => {
      remaining -= 1
      if (remaining <= 0) resolve([...byId.values()])
    }
    for (const type of types) {
      service.nearbySearch(
        { location, radius: radiusMeters, type },
        (results, status) => {
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            results?.length
          ) {
            const kind = placeTypeToExploreKind(type)
            for (const r of results.slice(0, perTypeLimit)) {
              const poi = placeResultToPoi(r, kind)
              if (poi && !byId.has(poi.id)) byId.set(poi.id, poi)
            }
          }
          done()
        },
      )
    }
  })
}

/** Keyword biased nearby search (e.g. “café”) — single request. */
export function nearbySearchKeyword(
  service: google.maps.places.PlacesService,
  location: google.maps.LatLngLiteral,
  radiusMeters: number,
  keyword: string,
  limit: number,
): Promise<ExploreMapPoi[]> {
  if (typeof google === 'undefined') return Promise.resolve([])
  return new Promise((resolve) => {
    service.nearbySearch(
      { location, radius: radiusMeters, keyword: keyword.slice(0, 80) },
      (results, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !results?.length
        ) {
          resolve([])
          return
        }
        const out: ExploreMapPoi[] = []
        for (const r of results.slice(0, limit)) {
          const poi = placeResultToPoi(r, 'nearby')
          if (poi) out.push(poi)
        }
        resolve(out)
      },
    )
  })
}

export function runAdventureNearbyBatch(
  service: google.maps.places.PlacesService,
  location: google.maps.LatLngLiteral,
  radiusMeters: number = MAPS_EXPLORE_NEARBY_RADIUS_M,
): Promise<ExploreMapPoi[]> {
  return nearbySearchByTypes(
    service,
    location,
    radiusMeters,
    ADVENTURE_PLACE_TYPES as unknown as string[],
    8,
  )
}

export function runRestaurantNearbyBatch(
  service: google.maps.places.PlacesService,
  location: google.maps.LatLngLiteral,
  radiusMeters: number = MAPS_EXPLORE_NEARBY_RADIUS_M,
): Promise<ExploreMapPoi[]> {
  return nearbySearchByTypes(
    service,
    location,
    radiusMeters,
    RESTAURANT_PLACE_TYPES as unknown as string[],
    8,
  )
}

/** Enriched card for photo carousels — requires Places Details (photos). Enable Places Photo on the API key. */
export type ExplorePlacePhotoCard = {
  id: string
  placeId: string
  title: string
  lat: number
  lng: number
  kind: ExploreMapPoiKind
  photoUrl?: string
}

/**
 * Sequential getDetails with small gaps to limit billing bursts. Photos may be empty for many venues.
 * Places Photo (image) access must be enabled for the key or `photoUrl` stays undefined.
 */
export async function fetchExplorePlacePhotoCards(
  service: google.maps.places.PlacesService,
  pois: readonly ExploreMapPoi[],
  opts: { max: number; staggerMs: number },
): Promise<ExplorePlacePhotoCard[]> {
  if (typeof google === 'undefined') return []
  const max = Math.max(0, Math.min(12, opts.max))
  const staggerMs = Math.max(0, opts.staggerMs)
  const withIds = pois.filter((p): p is ExploreMapPoi & { placeId: string } => Boolean(p.placeId))
  const seen = new Set<string>()
  const shortlist: ExploreMapPoi[] = []
  for (const p of withIds) {
    if (seen.has(p.placeId)) continue
    seen.add(p.placeId)
    shortlist.push(p)
    if (shortlist.length >= max) break
  }
  const out: ExplorePlacePhotoCard[] = []
  for (let i = 0; i < shortlist.length; i++) {
    const p = shortlist[i]!
    if (i > 0 && staggerMs) {
      await new Promise((r) => setTimeout(r, staggerMs))
    }
    const card = await new Promise<ExplorePlacePhotoCard | null>((resolve) => {
      service.getDetails(
        {
          placeId: p.placeId!,
          fields: ['place_id', 'name', 'geometry', 'photos'],
        },
        (place, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            resolve(null)
            return
          }
          const loc = place.geometry?.location
          const lat = loc?.lat() ?? p.lat
          const lng = loc?.lng() ?? p.lng
          const title =
            (place.name && place.name.trim()) || p.title
          let photoUrl: string | undefined
          const photos = place.photos
          if (photos?.length) {
            try {
              photoUrl = photos[0]!.getUrl({ maxWidth: 480 })
            } catch {
              photoUrl = undefined
            }
          }
          resolve({
            id: p.placeId!,
            placeId: p.placeId!,
            title: title.slice(0, 120),
            lat,
            lng,
            kind: p.kind,
            ...(photoUrl ? { photoUrl } : {}),
          })
        },
      )
    })
    if (card) out.push(card)
  }
  return out
}

/** Random adventure POI with a place_id (for mystery picker). */
export function pickRandomMysteryPoi(
  pois: readonly ExploreMapPoi[],
): ExploreMapPoi | null {
  const withId = pois.filter((p): p is ExploreMapPoi & { placeId: string } =>
    Boolean(p.placeId),
  )
  if (!withId.length) return null
  return withId[Math.floor(Math.random() * withId.length)]!
}

export type MysteryPlaceBundle = {
  placeId: string
  name: string
  lat: number
  lng: number
  formattedAddress?: string
  photoUrls: string[]
  /** Short factual context for UI + model (address, types, rating). */
  placeSummary: string
}

/** Places Details for mystery panel — photos need Places Photo enabled on the key. */
export function fetchPlaceDetailsForMystery(
  service: google.maps.places.PlacesService,
  placeId: string,
): Promise<MysteryPlaceBundle | null> {
  if (typeof google === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    service.getDetails(
      {
        placeId,
        fields: [
          'place_id',
          'name',
          'geometry',
          'formatted_address',
          'photos',
          'types',
          'rating',
          'vicinity',
        ],
      },
      (place, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          resolve(null)
          return
        }
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        const name = (place.name && place.name.trim()) || 'Place'
        const photos = place.photos ?? []
        const photoUrls: string[] = []
        for (let i = 0; i < Math.min(6, photos.length); i++) {
          try {
            photoUrls.push(photos[i]!.getUrl({ maxWidth: 960 }))
          } catch {
            /* ignore */
          }
        }
        const types = (place.types ?? []).slice(0, 5).join(', ')
        const rating =
          place.rating != null ? `Rated ${place.rating.toFixed(1)}/5.` : ''
        const bits = [
          place.formatted_address ?? place.vicinity,
          types,
          rating,
        ].filter(Boolean)
        resolve({
          placeId: place.place_id ?? placeId,
          name: name.slice(0, 120),
          lat,
          lng,
          formattedAddress: place.formatted_address ?? place.vicinity,
          photoUrls,
          placeSummary: bits.join(' ').slice(0, 520),
        })
      },
    )
  })
}

export function formatDistanceLabel(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

/** Compact string for server / model context (trusted facts only). */
export function buildNearbyExploreSummary(
  pois: readonly ExploreMapPoi[],
  user: google.maps.LatLngLiteral | null,
  maxLines = 14,
): string {
  if (!pois.length) return ''
  const lines: string[] = []
  for (const p of pois.slice(0, maxLines)) {
    const dist =
      user != null
        ? formatDistanceLabel(haversineMeters(user, { lat: p.lat, lng: p.lng }))
        : ''
    const typeHint =
      p.kind === 'park'
        ? 'park'
        : p.kind === 'natural'
          ? 'natural'
          : p.kind === 'adventure'
            ? 'attraction'
            : p.kind === 'fuel'
              ? 'fuel'
              : p.kind === 'food'
                ? 'restaurant'
                : p.kind === 'cafe'
                  ? 'cafe'
                  : p.kind === 'shop'
                    ? 'shop'
                    : 'place'
    const tail = dist ? ` — ${dist} away` : ''
    lines.push(`- ${p.title} (${typeHint})${tail}`)
  }
  return lines.join('\n').slice(0, 1600)
}

/** Enriched row for Fetch Brain field panel (nearby restaurants). */
export type BrainFieldPlaceCard = {
  id: string
  placeId: string
  title: string
  lat: number
  lng: number
  vicinity?: string
  formattedAddress?: string
  rating?: number
  userRatingsTotal?: number
  priceLevel?: number
  openNow?: boolean
  summary: string
  distanceMeters?: number
  mapsUrl: string
}

function brainMapsUrl(lat: number, lng: number, placeId: string) {
  const q = encodeURIComponent(`${lat},${lng}`)
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(placeId)}`
}

function nearbyResultToBrainCard(
  p: google.maps.places.PlaceResult,
  origin: google.maps.LatLngLiteral,
): BrainFieldPlaceCard | null {
  const loc = p.geometry?.location
  const pid = p.place_id
  if (!loc || !pid) return null
  const lat = loc.lat()
  const lng = loc.lng()
  const title = (p.name && p.name.trim()) || 'Restaurant'
  const dist = haversineMeters(origin, { lat, lng })
  const bits: string[] = []
  if (p.vicinity) bits.push(p.vicinity)
  if (p.rating != null) bits.push(`${p.rating.toFixed(1)}★`)
  if (p.price_level != null && p.price_level > 0) {
    bits.push('$'.repeat(Math.min(4, p.price_level)))
  }
  if (p.opening_hours?.open_now != null) {
    bits.push(p.opening_hours.open_now ? 'Open now' : 'Closed')
  }
  return {
    id: pid,
    placeId: pid,
    title: title.slice(0, 120),
    lat,
    lng,
    vicinity: p.vicinity,
    rating: p.rating,
    userRatingsTotal: p.user_ratings_total,
    priceLevel: p.price_level ?? undefined,
    openNow: p.opening_hours?.open_now,
    summary: bits.join(' · ').slice(0, 220),
    distanceMeters: dist,
    mapsUrl: brainMapsUrl(lat, lng, pid),
  }
}

function enrichBrainPlaceCardDetails(
  service: google.maps.places.PlacesService,
  card: BrainFieldPlaceCard,
  signal?: AbortSignal,
): Promise<BrainFieldPlaceCard> {
  if (typeof google === 'undefined') return Promise.resolve(card)
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(card)
      return
    }
    service.getDetails(
      {
        placeId: card.placeId,
        fields: [
          'place_id',
          'name',
          'formatted_address',
          'vicinity',
          'rating',
          'user_ratings_total',
          'price_level',
          'opening_hours',
          'types',
        ],
      },
      (place, status) => {
        if (signal?.aborted) {
          resolve(card)
          return
        }
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          resolve(card)
          return
        }
        const types = (place.types ?? [])
          .filter((t) => !['point_of_interest', 'establishment'].includes(t))
          .slice(0, 4)
          .join(', ')
        const addr = place.formatted_address ?? place.vicinity ?? card.vicinity
        const head = [card.rating != null ? `${card.rating.toFixed(1)}★` : null, types || null]
          .filter(Boolean)
          .join(' · ')
        const summary = [head, addr].filter(Boolean).join(' — ').slice(0, 360)
        resolve({
          ...card,
          formattedAddress: place.formatted_address ?? card.formattedAddress,
          vicinity: place.vicinity ?? card.vicinity,
          rating: place.rating ?? card.rating,
          userRatingsTotal: place.user_ratings_total ?? card.userRatingsTotal,
          priceLevel: place.price_level ?? card.priceLevel,
          openNow: place.opening_hours?.open_now ?? card.openNow,
          summary: summary || card.summary,
        })
      },
    )
  })
}

/**
 * Nearby restaurants for Brain field — caps 10, enriches first rows with Place Details (sequential).
 */
export async function fetchBrainNearbyRestaurants(
  service: google.maps.places.PlacesService,
  location: google.maps.LatLngLiteral,
  opts: {
    radiusMeters?: number
    maxResults?: number
    detailEnrichCount?: number
    signal?: AbortSignal
  } = {},
): Promise<BrainFieldPlaceCard[]> {
  if (typeof google === 'undefined') return []
  const radiusMeters = opts.radiusMeters ?? MAPS_EXPLORE_NEARBY_RADIUS_M
  const maxResults = Math.max(1, Math.min(10, opts.maxResults ?? 10))
  const detailEnrichCount = Math.max(0, Math.min(3, opts.detailEnrichCount ?? 3))
  const signal = opts.signal

  const raw = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
    if (signal?.aborted) {
      resolve([])
      return
    }
    service.nearbySearch(
      { location, radius: radiusMeters, type: 'restaurant' },
      (results, status) => {
        if (signal?.aborted) {
          resolve([])
          return
        }
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
          resolve([])
          return
        }
        resolve([...results])
      },
    )
  })

  if (signal?.aborted) return []

  const cards: BrainFieldPlaceCard[] = []
  for (const r of raw) {
    const c = nearbyResultToBrainCard(r, location)
    if (c) cards.push(c)
  }

  cards.sort((a, b) => {
    const ra = a.rating ?? 0
    const rb = b.rating ?? 0
    if (rb !== ra) return rb - ra
    return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0)
  })

  const top = cards.slice(0, maxResults)
  const out: BrainFieldPlaceCard[] = []

  for (let i = 0; i < top.length; i += 1) {
    if (signal?.aborted) break
    const c = top[i]!
    if (i < detailEnrichCount) {
      out.push(await enrichBrainPlaceCardDetails(service, c, signal))
    } else {
      out.push(c)
    }
  }

  return out
}
