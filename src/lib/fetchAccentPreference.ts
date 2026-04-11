/** Client-only accent colour (primary chrome + brand orb). Persisted in localStorage. */

export const FETCH_ACCENT_STORAGE_KEY = 'fetch.accentHex'

/** Default matches legacy Fetch emerald dock (#064e3b). */
export const FETCH_ACCENT_DEFAULT_HEX = '#064e3b'

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/** Accepts #RGB or #RRGGBB; returns canonical #RRGGBB or null. */
export function normalizeAccentHex(input: string): string | null {
  const s = input.trim()
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return null
  if (s.length === 4) {
    const r = s[1]!
    const g = s[2]!
    const b = s[3]!
    return (`#${r}${r}${g}${g}${b}${b}`).toLowerCase()
  }
  return s.toLowerCase()
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeAccentHex(hex) ?? FETCH_ACCENT_DEFAULT_HEX
  const x = parseInt(n.slice(1), 16)
  return { r: (x >> 16) & 255, g: (x >> 8) & 255, b: x & 255 }
}

export function loadFetchAccentHex(): string {
  try {
    const raw = window.localStorage.getItem(FETCH_ACCENT_STORAGE_KEY)?.trim() ?? ''
    const ok = normalizeAccentHex(raw)
    return ok ?? FETCH_ACCENT_DEFAULT_HEX
  } catch {
    return FETCH_ACCENT_DEFAULT_HEX
  }
}

export function saveFetchAccentHex(hex: string): string {
  const ok = normalizeAccentHex(hex) ?? FETCH_ACCENT_DEFAULT_HEX
  try {
    window.localStorage.setItem(FETCH_ACCENT_STORAGE_KEY, ok)
  } catch {
    /* ignore */
  }
  return ok
}

/** Applies accent to the live document (Safari theme-color, dock chrome, CSS vars). */
export function applyFetchAccentToRoot(hex: string) {
  if (typeof document === 'undefined') return
  const ok = normalizeAccentHex(hex) ?? FETCH_ACCENT_DEFAULT_HEX
  const { r, g, b } = hexToRgb(ok)
  const root = document.documentElement
  root.style.setProperty('--fetch-accent', ok)
  root.style.setProperty('--fetch-accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--fetch-bottom-nav-chrome', ok)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', ok)
}

/** Lighten RGB toward white (0–1). */
export function mixAccentTowardWhite(
  rgb: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const u = Math.max(0, Math.min(1, t))
  return {
    r: clampByte(rgb.r + (255 - rgb.r) * u),
    g: clampByte(rgb.g + (255 - rgb.g) * u),
    b: clampByte(rgb.b + (255 - rgb.b) * u),
  }
}

/** Darken toward black. */
export function mixAccentTowardBlack(
  rgb: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const u = Math.max(0, Math.min(1, t))
  return {
    r: clampByte(rgb.r * (1 - u)),
    g: clampByte(rgb.g * (1 - u)),
    b: clampByte(rgb.b * (1 - u)),
  }
}
