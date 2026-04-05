export const THEME_PREFERENCE_KEY = 'fetch.themePreference'

export type ThemePreference = 'system' | 'light' | 'dark'

export type ResolvedFetchTheme = 'light' | 'dark'

export function loadThemePreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_PREFERENCE_KEY)?.trim()
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* ignore */
  }
  return 'system'
}

export function saveThemePreference(pref: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, pref)
  } catch {
    /* ignore */
  }
}

/**
 * Auto schedule for "System": light from 5:00 through 17:59, dark from 18:00–04:59.
 */
export function resolveThemeFromClock(d: Date = new Date()): ResolvedFetchTheme {
  const h = d.getHours()
  if (h >= 5 && h < 18) return 'light'
  return 'dark'
}

export function resolveTheme(
  preference: ThemePreference,
  d: Date = new Date(),
): ResolvedFetchTheme {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return resolveThemeFromClock(d)
}
