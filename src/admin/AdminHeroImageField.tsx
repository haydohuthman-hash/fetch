import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { adminUploadProductImage } from '../lib/adminProductsApi'

type AdminHeroImageFieldProps = {
  label: string
  value: string
  onChange: (next: string) => void
  adminKey: string
  disabled?: boolean
  /** Size class for preview box, e.g. h-24 w-36 */
  previewClassName?: string
}

export function AdminHeroImageField({
  label,
  value,
  onChange,
  adminKey,
  disabled = false,
  previewClassName = 'h-24 w-36',
}: AdminHeroImageFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewBroken, setPreviewBroken] = useState(false)
  const trimmed = value.trim()

  useEffect(() => {
    setPreviewBroken(false)
  }, [trimmed])

  const onPickFile = useCallback(() => {
    if (disabled || uploadBusy) return
    fileRef.current?.click()
  }, [disabled, uploadBusy])

  const onFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !adminKey.trim()) return
      setUploadBusy(true)
      setUploadError(null)
      try {
        const url = await adminUploadProductImage(adminKey, file)
        onChange(url)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploadBusy(false)
      }
    },
    [adminKey, onChange],
  )

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold text-zinc-500">{label}</span>
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={`shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 ${previewClassName}`}
        >
          {trimmed && !previewBroken ? (
            <img
              src={trimmed}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setPreviewBroken(true)}
            />
          ) : trimmed && previewBroken ? (
            <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] font-medium text-zinc-500">
              Invalid image URL
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-zinc-400">
              No image
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            type="url"
            className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-[12px]"
            placeholder="https://…"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFileChange} />
            <button
              type="button"
              disabled={disabled || uploadBusy || !adminKey.trim()}
              className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-900 disabled:opacity-40"
              onClick={onPickFile}
            >
              {uploadBusy ? 'Uploading…' : 'Upload image'}
            </button>
          </div>
          {uploadError ? <p className="text-[11px] text-red-600">{uploadError}</p> : null}
        </div>
      </div>
    </div>
  )
}
