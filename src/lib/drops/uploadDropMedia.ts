import { getSupabaseBrowserClient } from '../supabase/client'
import { resolveObjectPathInBucket, sanitizeFileName } from './uploadDropMediaPaths'

export type UploadDropMediaResult = {
  videoUrl?: string
  imageUrls?: string[]
}

export class UploadDropMediaError extends Error {
  status: number
  body?: { error?: string; detail?: string; storageCode?: string }

  constructor(
    message: string,
    status: number,
    body?: { error?: string; detail?: string; storageCode?: string },
  ) {
    super(message)
    this.name = 'UploadDropMediaError'
    this.status = status
    this.body = body
  }
}

const DROP_VIDEO_MAX_BYTES = 100 * 1024 * 1024
const DROP_IMAGE_MAX_BYTES = 12 * 1024 * 1024
const DROP_MAX_IMAGE_COUNT = 12

function dropBucketName(): string {
  return import.meta.env.VITE_SUPABASE_DROP_BUCKET?.trim() || 'drops'
}

function buildDropFilePath(userId: string, file: File): string {
  return `${userId}/${Date.now()}-${sanitizeFileName(file.name)}`
}

function supabaseEnvForLogs(): { supabaseUrl: string; supabaseAnonKeyConfigured: boolean } {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() || '',
    supabaseAnonKeyConfigured: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()),
  }
}

/** Pull Storage API code / name from @supabase/storage-js errors. */
function storageFailureFields(err: { message: string; name?: string; statusCode?: string; status?: number }) {
  const code = err.statusCode?.trim() || err.name?.trim() || 'unknown'
  const http = typeof err.status === 'number' && Number.isFinite(err.status) ? err.status : undefined
  return { code, http }
}

function throwStorageUploadFailed(
  err: { message: string; name?: string; statusCode?: string; status?: number },
  bucket: string,
  supabaseUrl: string,
  supabaseClientCreated: boolean,
) {
  const { code, http } = storageFailureFields(err)
  const msg = err.message?.trim() || '(no message)'
  console.error('[drops/upload] Supabase Storage upload failed', {
    bucket,
    supabaseUrl: supabaseUrl || '(missing)',
    supabaseClientCreated,
    storageMessage: msg,
    storageCode: code,
    storageHttpStatus: http,
  })
  const userFacing = `[${code}] ${msg}`
  const status = http && http >= 400 && http < 600 ? http : 502
  throw new UploadDropMediaError(userFacing, status, {
    error: 'storage_upload_failed',
    detail: msg,
    storageCode: code,
  })
}

function videoMimeOk(mime: string): boolean {
  return /^video\/(mp4|webm|quicktime)$/i.test(mime || '')
}

/** Browsers often leave `file.type` empty or use `application/octet-stream` for .mov / .mp4. */
function inferVideoMimeForUpload(file: File): { validatedMime: string; storageContentType: string } {
  const raw = (file.type || '').trim().toLowerCase()
  const ext = (file.name.split(/[./]/).pop() || '').toLowerCase()
  const fromExt =
    ext === 'mov' || ext === 'qt'
      ? 'video/quicktime'
      : ext === 'webm'
        ? 'video/webm'
        : ext === 'm4v' || ext === 'mp4'
          ? 'video/mp4'
          : ''
  if (raw && videoMimeOk(raw)) {
    return { validatedMime: raw, storageContentType: raw }
  }
  if (fromExt && videoMimeOk(fromExt)) {
    return { validatedMime: fromExt, storageContentType: fromExt }
  }
  if (raw.startsWith('video/')) {
    return { validatedMime: raw, storageContentType: raw }
  }
  return { validatedMime: 'video/mp4', storageContentType: 'video/mp4' }
}

function imageMimeOk(mime: string): boolean {
  return /^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime || '')
}

/**
 * Uploads Drops reel media from the browser straight to Supabase Storage (no API upload hop).
 *
 * Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Bucket defaults to `drops`; override with
 * `VITE_SUPABASE_DROP_BUCKET`. Create the bucket and Storage policies so anon (or your auth role)
 * can `insert` and the public URL can be read for playback.
 */
export async function uploadDropMedia(params: {
  video?: File | null
  images?: File[]
}): Promise<UploadDropMediaResult> {
  const bucket = dropBucketName()
  const { supabaseUrl, supabaseAnonKeyConfigured } = supabaseEnvForLogs()
  console.log('[drops/upload] start', {
    bucket,
    supabaseUrl: supabaseUrl || '(missing)',
    supabaseAnonKeyConfigured,
  })

  const sb = getSupabaseBrowserClient()
  const supabaseClientCreated = Boolean(sb)
  console.log('[drops/upload] client', {
    supabaseClientCreated,
    bucket,
    supabaseUrl: supabaseUrl || '(missing)',
  })

  if (!sb) {
    throw new UploadDropMediaError(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      503,
      { error: 'supabase_not_configured' },
    )
  }
  console.log('[publish-upload] step 1: function start', {
    hasVideo: Boolean(params.video),
    imageCount: params.images?.length ?? 0,
    bucket,
  })
  console.log('[publish-upload] step 2: before auth.getSession')
  const {
    data: { session },
  } = await sb.auth.getSession()
  console.log('[publish-upload] step 3: after auth.getSession', { hasToken: Boolean(session?.access_token) })
  console.log('[publish-upload] step 4: before auth.getUser')
  const {
    data: { user },
  } = await sb.auth.getUser()
  console.log('[publish-upload] step 5: after auth.getUser', { hasUserId: Boolean(user?.id) })
  const uid = user?.id?.trim() || ''
  if (!session?.access_token || !uid) {
    throw new UploadDropMediaError('You must be logged in', 401, { error: 'auth_required' })
  }
  const hasVideo = Boolean(params.video)
  const images = params.images ?? []

  if (hasVideo && images.length) {
    throw new UploadDropMediaError('Send either one video or images, not both.', 400, {
      error: 'video_or_images_not_both',
    })
  }
  if (!hasVideo && images.length === 0) {
    throw new UploadDropMediaError('Add a video or at least one image.', 400, { error: 'no_media' })
  }
  if (images.length > DROP_MAX_IMAGE_COUNT) {
    throw new UploadDropMediaError(`At most ${DROP_MAX_IMAGE_COUNT} images.`, 400, {
      error: 'too_many_images',
    })
  }

  if (params.video) {
    const file = params.video
    const { validatedMime, storageContentType } = inferVideoMimeForUpload(file)
    if (!videoMimeOk(validatedMime)) {
      throw new UploadDropMediaError('Unsupported video type (use MP4, WebM, or QuickTime).', 400, {
        error: 'invalid_video_type',
        detail: `${file.type || '(empty)'}; inferred=${validatedMime}`,
      })
    }
    if (file.size > DROP_VIDEO_MAX_BYTES) {
      throw new UploadDropMediaError('Video is too large (max 100MB).', 413, { error: 'invalid_video_size' })
    }
    const filePath = buildDropFilePath(uid, file)
    console.log('[publish-upload] step 6: before supabase.storage upload (video)', {
      filePath,
      bytes: file.size,
      fileType: file.type || '(empty)',
      validatedMime,
      storageContentType,
    })
    const { data, error } = await sb.storage.from(bucket).upload(filePath, file, {
      upsert: true,
      cacheControl: '3600',
      contentType: storageContentType,
    })
    console.log('[publish-upload] step 7: after supabase.storage upload (video)', {
      ok: !error,
      path: data?.path,
      error: error?.message,
    })
    if (error) {
      throwStorageUploadFailed(error, bucket, supabaseUrl, true)
    }
    const objectPath = resolveObjectPathInBucket(bucket, data, filePath)
    console.log('[publish-upload] step 8: before public url generation (video)', { objectPath })
    const { data: pub } = sb.storage.from(bucket).getPublicUrl(objectPath)
    console.log('[publish-upload] step 9: after public url generation (video)', {
      hasUrl: Boolean(pub.publicUrl),
    })
    const out = { videoUrl: pub.publicUrl }
    console.log('[publish-upload] step 10: function return (video)', out)
    return out
  }

  const urls: string[] = []
  for (const file of images) {
    const mime = file.type || 'image/jpeg'
    if (!imageMimeOk(mime)) {
      throw new UploadDropMediaError('Unsupported image type.', 400, { error: 'invalid_image_type', detail: mime })
    }
    if (file.size > DROP_IMAGE_MAX_BYTES) {
      throw new UploadDropMediaError('Each image must be 12MB or less.', 413, { error: 'invalid_image_size' })
    }
    const filePath = buildDropFilePath(uid, file)
    console.log('[publish-upload] step 6: before supabase.storage upload (image)', {
      filePath,
      bytes: file.size,
      mime,
    })
    const { data, error } = await sb.storage.from(bucket).upload(filePath, file, {
      upsert: true,
      cacheControl: '3600',
      contentType: file.type || undefined,
    })
    console.log('[publish-upload] step 7: after supabase.storage upload (image)', {
      ok: !error,
      path: data?.path,
      error: error?.message,
    })
    if (error) {
      throwStorageUploadFailed(error, bucket, supabaseUrl, true)
    }
    const objectPath = resolveObjectPathInBucket(bucket, data, filePath)
    console.log('[publish-upload] step 8: before public url generation (image)', { objectPath })
    const { data: pub } = sb.storage.from(bucket).getPublicUrl(objectPath)
    console.log('[publish-upload] step 9: after public url generation (image)', {
      hasUrl: Boolean(pub.publicUrl),
    })
    urls.push(pub.publicUrl)
  }
  const out = { imageUrls: urls }
  console.log('[publish-upload] step 10: function return (images)', { count: urls.length })
  return out
}
