import { uploadDropMedia, type UploadDropMediaResult } from './uploadDropMedia'

export type UploadDropsMediaForPublishResult = UploadDropMediaResult

/**
 * Drops server-publish media step (before `POST /api/publish`):
 *
 * 1. User selects video or images in the wizard.
 * 2. This uploads files directly to Supabase Storage (bucket `drops`, or `VITE_SUPABASE_DROP_BUCKET`).
 * 3. Returns public object URLs from `getPublicUrl`.
 * 4. The wizard sends those URLs in the JSON body to `/api/publish`.
 * 5. The API persists `drops` / `drop_media` in Postgres (requires `DATABASE_URL`, session cookie).
 *
 * Does not call the API for bytes — only Supabase from the browser.
 */
export async function uploadDropsMediaForPublish(params: {
  video?: File | null
  images?: File[]
}): Promise<UploadDropsMediaForPublishResult> {
  return uploadDropMedia({ video: params.video ?? null, images: params.images })
}
