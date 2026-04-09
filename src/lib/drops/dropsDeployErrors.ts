/**
 * User-facing copy when Drops persistence or Supabase Storage uploads fail.
 * Uploads are browser → Supabase Storage only; publish uses `/api/publish` + Postgres.
 */

export function dropsUploadApiErrorMessage(
  error: string | undefined,
  httpStatus: number,
  opts?: { detail?: string; storageCode?: string },
): string {
  if (error === 'auth_required' || httpStatus === 401) {
    return 'You must be logged in to upload media.'
  }
  if (error === 'supabase_not_configured') {
    return 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the app, create a public `drops` bucket (or set VITE_SUPABASE_DROP_BUCKET), and allow uploads for your policies. You can use Done for a local-only post.'
  }
  if (error === 'storage_upload_failed') {
    const d = opts?.detail?.trim()
    if (d) {
      const c = opts?.storageCode?.trim()
      return c && c !== 'unknown' ? `[${c}] ${d}` : d
    }
    return 'Storage upload failed (no message from Supabase).'
  }
  if (error === 'drops_db_not_configured') {
    return 'Drops database is not configured on this server (admin: set DATABASE_URL on the API).'
  }
  if (typeof error === 'string' && error) {
    return error.replace(/_/g, ' ')
  }
  return httpStatus === 413
    ? 'File too large for upload.'
    : 'Upload failed. Check your connection or try Done for a local-only post.'
}

export function dropsPublishApiErrorMessage(error: string | undefined, httpStatus: number): string {
  if (error === 'auth_required') {
    return 'You must be logged in to publish.'
  }
  if (error === 'rate_limited' || httpStatus === 429) {
    return 'Too many uploads. Max 5 per minute.'
  }
  if (
    error === 'publish_unavailable' ||
    error === 'drops_db_not_configured' ||
    (httpStatus === 503 && (!error || error === 'drops_db_not_configured'))
  ) {
    return 'Server Drops are unavailable (admin: set DATABASE_URL on the API). Try again later or use Done for a local-only post.'
  }
  if (error === 'supabase_not_configured' || error === 'storage_upload_failed') {
    return dropsUploadApiErrorMessage(error, httpStatus)
  }
  if (typeof error === 'string' && error) {
    return error.replace(/_/g, ' ')
  }
  return 'Publish failed. Try again or use Done for a local-only post.'
}
