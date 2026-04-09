/**
 * Pure helpers for Drops → Supabase Storage paths (unit-tested; used by uploadDropMedia).
 */

export function sanitizeFileName(name: string): string {
  const last = (name || 'file').split(/[\\/]/).pop() || 'file'
  const safe = last.replace(/[^a-zA-Z0-9._-]/g, '_')
  return safe.slice(0, 180) || 'file'
}

/** Same style as app account ids: normalized email → stable segment; `anon` when missing. */
export function userIdFromEmail(email: string | null | undefined): string {
  const e = email?.trim().toLowerCase()
  if (!e) return 'anon'
  const id = e.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64)
  return id || 'anon'
}

export function resolveObjectPathInBucket(
  bucket: string,
  uploadData: { path?: string; fullPath?: string } | null | undefined,
  fallbackPath: string,
): string {
  if (uploadData?.path) return uploadData.path
  if (uploadData?.fullPath) {
    return uploadData.fullPath.replace(new RegExp(`^${bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), '')
  }
  return fallbackPath
}
