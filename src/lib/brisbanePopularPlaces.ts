/** Shown in Maps → Saved places when the user has no saved addresses. */
export type BrisbanePopularPlace = {
  id: string
  label: string
  address: string
  lat: number
  lng: number
}

export const BRISBANE_POPULAR_PLACES: BrisbanePopularPlace[] = [
  {
    id: 'popular_south_bank',
    label: 'South Bank Parklands',
    address: 'Little Stanley St, South Brisbane QLD 4101',
    lat: -27.4753,
    lng: 153.0207,
  },
  {
    id: 'popular_queen_st_mall',
    label: 'Queen Street Mall',
    address: 'Queen St, Brisbane City QLD 4000',
    lat: -27.4709,
    lng: 153.0235,
  },
  {
    id: 'popular_story_bridge',
    label: 'Story Bridge',
    address: 'Main St, Kangaroo Point QLD 4169',
    lat: -27.4686,
    lng: 153.0355,
  },
  {
    id: 'popular_mt_coot_tha',
    label: 'Mount Coot-tha Lookout',
    address: 'Sir Samuel Griffith Dr, Mt Coot-tha QLD 4066',
    lat: -27.4761,
    lng: 152.9488,
  },
  {
    id: 'popular_new_farm_park',
    label: 'New Farm Park',
    address: '1042 Brunswick St, New Farm QLD 4005',
    lat: -27.4648,
    lng: 153.0468,
  },
  {
    id: 'popular_howard_smith_wharves',
    label: 'Howard Smith Wharves',
    address: '5 Boundary St, Brisbane City QLD 4000',
    lat: -27.4602,
    lng: 153.0348,
  },
]
