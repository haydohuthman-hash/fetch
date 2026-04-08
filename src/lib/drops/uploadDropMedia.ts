import { fetchApiAbsoluteUrl } from '../fetchApiBase'

export type UploadDropMediaResult = {
  videoUrl?: string
  imageUrls?: string[]
}

export class UploadDropMediaError extends Error {
  status: number
  body?: { error?: string; detail?: string }

  constructor(message: string, status: number, body?: { error?: string; detail?: string }) {
    super(message)
    this.name = 'UploadDropMediaError'
    this.status = status
    this.body = body
  }
}

/**
 * Uploads reel media for the home Drops composer. Returns Cloudinary `secure_url`s
 * (or `/listing-uploads/...` when running locally without Cloudinary).
 */
export async function uploadDropMedia(params: {
  video?: File | null
  images?: File[]
}): Promise<UploadDropMediaResult> {
  const fd = new FormData()
  if (params.video) fd.append('video', params.video)
  for (const f of params.images ?? []) fd.append('images', f)

  const res = await fetch(fetchApiAbsoluteUrl('/api/drops/upload-media'), {
    method: 'POST',
    body: fd,
  })

  const text = await res.text()
  let json: {
    error?: string
    detail?: string
    videoUrl?: string
    imageUrls?: string[]
  } = {}
  try {
    json = text ? (JSON.parse(text) as typeof json) : {}
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const msg = (json.detail || json.error || res.statusText || 'Upload failed').trim()
    throw new UploadDropMediaError(msg, res.status, json)
  }

  return {
    videoUrl: json.videoUrl,
    imageUrls: json.imageUrls,
  }
}
