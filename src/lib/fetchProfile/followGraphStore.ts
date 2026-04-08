const KEY = 'fetch.followGraph.v1'

type Shape = {
  /** followerAuthorId -> ordered list of authorIds they follow */
  following: Record<string, string[]>
}

function empty(): Shape {
  return { following: {} }
}

function load(): Shape {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const p = JSON.parse(raw) as Shape
    if (!p || typeof p !== 'object' || !p.following) return empty()
    return p
  } catch {
    return empty()
  }
}

function save(s: Shape) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function getFollowersCountForAuthor(authorId: string): number {
  const { following } = load()
  let n = 0
  for (const targets of Object.values(following)) {
    if (targets.includes(authorId)) n++
  }
  return n
}

export function getFollowingCountForAuthor(authorId: string): number {
  return load().following[authorId]?.length ?? 0
}

export function isFollowingAuthor(followerAuthorId: string, targetAuthorId: string): boolean {
  if (!followerAuthorId || !targetAuthorId || followerAuthorId === targetAuthorId) return false
  return load().following[followerAuthorId]?.includes(targetAuthorId) ?? false
}

/** Returns true if now following after toggle. */
export function toggleFollowAuthor(followerAuthorId: string, targetAuthorId: string): boolean {
  if (!followerAuthorId || !targetAuthorId || followerAuthorId === targetAuthorId) return false
  const s = load()
  const cur = [...(s.following[followerAuthorId] ?? [])]
  const i = cur.indexOf(targetAuthorId)
  if (i >= 0) {
    cur.splice(i, 1)
    s.following[followerAuthorId] = cur
    save(s)
    return false
  }
  cur.unshift(targetAuthorId)
  s.following[followerAuthorId] = cur.slice(0, 500)
  save(s)
  return true
}
