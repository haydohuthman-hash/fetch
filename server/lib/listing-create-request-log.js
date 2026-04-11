/**
 * Safe, non-sensitive summary of POST /api/listings JSON body for debugging 500s.
 * @param {unknown} body
 */
export function logListingCreateRequestBodyShape(body) {
  const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {}
  const imgs = b.images
  const shape = {
    keys: Object.keys(b).sort(),
    titleType: typeof b.title,
    titleLen: typeof b.title === 'string' ? b.title.length : null,
    priceAudType: typeof b.priceAud,
    imagesRawType: Array.isArray(imgs) ? 'array' : typeof imgs,
    imagesRawLen: Array.isArray(imgs) ? imgs.length : null,
    firstImageKeys:
      Array.isArray(imgs) && imgs[0] && typeof imgs[0] === 'object' && imgs[0] !== null
        ? Object.keys(/** @type {object} */ (imgs[0])).sort()
        : null,
    firstUrlType:
      Array.isArray(imgs) && imgs[0] && typeof imgs[0] === 'object' && imgs[0] !== null
        ? typeof /** @type {{ url?: unknown }} */ (imgs[0]).url
        : null,
    firstUrlPrefix:
      Array.isArray(imgs) && imgs[0] && typeof imgs[0] === 'object' && imgs[0] !== null
        ? String(/** @type {{ url?: unknown }} */ (imgs[0]).url ?? '').slice(0, 48)
        : null,
    hasProfileAuthorId: typeof b.profileAuthorId === 'string' && Boolean(b.profileAuthorId.trim()),
    profileDisplayNameType: typeof b.profileDisplayName,
  }
  console.log('[listings/create] request body shape', JSON.stringify(shape))
}

/**
 * @param {unknown} err
 * @returns {{ reason: string; code?: string; message: string }}
 */
export function classifyListingCreateFailure(err) {
  const message = err instanceof Error ? err.message : String(err)
  const code = err && typeof err === 'object' && 'code' in err ? String(/** @type {{ code?: string }} */ (err).code) : undefined
  let reason = 'unknown'
  if (message.includes('supabase_')) reason = 'supabase'
  else if (message.includes('peer_listings_json_corrupt')) reason = 'store_json_corrupt'
  else if (code === 'EACCES' || code === 'EPERM') reason = 'filesystem_permission'
  else if (code === 'ENOSPC') reason = 'disk_full'
  else if (err instanceof SyntaxError || (err && /** @type {{ name?: string }} */ (err).name === 'SyntaxError'))
    reason = 'json_parse'
  else if (message.includes('ENOENT')) reason = 'filesystem_missing'
  return { reason, code, message: message.slice(0, 400) }
}
