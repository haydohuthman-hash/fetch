import type { DropReel } from './types'

/** Local + API + curated; first occurrence wins by id. */
export function mergeFeedReels(local: DropReel[], api: DropReel[], curated: readonly DropReel[]): DropReel[] {
  const seen = new Set<string>()
  const out: DropReel[] = []
  for (const r of [...local, ...api, ...curated]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}
