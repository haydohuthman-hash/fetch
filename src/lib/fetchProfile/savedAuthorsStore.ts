const KEY = 'fetch.savedProfileAuthors.v1'

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

export function isAuthorSaved(authorId: string): boolean {
  return load().includes(authorId)
}

export function toggleSavedAuthor(authorId: string): boolean {
  const cur = load()
  const i = cur.indexOf(authorId)
  if (i >= 0) {
    cur.splice(i, 1)
    save(cur)
    return false
  }
  cur.unshift(authorId)
  save(cur.slice(0, 200))
  return true
}
