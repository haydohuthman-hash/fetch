import { useCallback, useEffect, useRef, useState } from 'react'

export type DropsVideoRecorderProps = {
  open: boolean
  onClose: () => void
  /** Called with the recorded file when the user taps Use video. */
  onComplete: (file: File) => void
  /** Skip camera and open the post wizard library flow instead. */
  onPickFromLibrary?: () => void
}

const DURATION_OPTIONS = [
  { sec: 15, label: '15 sec' },
  { sec: 60, label: '1 min' },
  { sec: 600, label: '10 min' },
] as const

function pickRecorderMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export function DropsVideoRecorder({ open, onClose, onComplete, onPickFromLibrary }: DropsVideoRecorderProps) {
  const [maxSec, setMaxSec] = useState<(typeof DURATION_OPTIONS)[number]['sec']>(60)
  const [facing, setFacing] = useState<'user' | 'environment'>('environment')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraErr, setCameraErr] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const mimeRef = useRef('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const supportsPause =
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.prototype.pause === 'function' &&
    typeof MediaRecorder.prototype.resume === 'function'

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraErr(null)
    stopStream()
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true,
      })
      streamRef.current = s
      setStream(s)
    } catch {
      setCameraErr('Allow camera and microphone to record.')
    }
  }, [facing, stopStream])

  useEffect(() => {
    if (!open) return
    setPreviewBlob(null)
    setRecording(false)
    setPaused(false)
    setElapsedMs(0)
    void startCamera()
    return () => {
      recorderRef.current = null
      stopStream()
    }
  }, [open, facing, startCamera, stopStream])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !stream) return
    v.srcObject = stream
    void v.play().catch(() => {})
  }, [stream])

  const previewUrl = previewBlob ? URL.createObjectURL(previewBlob) : null
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    const v = previewVideoRef.current
    if (!v || !previewUrl) return
    v.src = previewUrl
    void v.play().catch(() => {})
  }, [previewUrl])

  const finalizeRecordingStop = useCallback(() => {
    const mr = recorderRef.current
    if (!mr || mr.state === 'inactive') {
      setRecording(false)
      setPaused(false)
      return
    }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'video/webm' })
      setPreviewBlob(blob)
      setRecording(false)
      setPaused(false)
      recorderRef.current = null
    }
    try {
      mr.stop()
    } catch {
      setRecording(false)
      setPaused(false)
    }
  }, [])

  useEffect(() => {
    if (!recording || paused || !open) return
    const id = window.setInterval(() => {
      setElapsedMs((e) => {
        const next = e + 100
        if (next >= maxSec * 1000) {
          window.setTimeout(() => finalizeRecordingStop(), 0)
          return maxSec * 1000
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [recording, paused, open, maxSec, finalizeRecordingStop])

  const toggleRecord = useCallback(() => {
    if (previewBlob) return
    const s = streamRef.current
    if (!s) return

    if (!recording) {
      const mime = pickRecorderMime()
      mimeRef.current = mime || 'video/webm'
      chunksRef.current = []
      try {
        const mr = mime
          ? new MediaRecorder(s, { mimeType: mime })
          : new MediaRecorder(s)
        recorderRef.current = mr
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        mr.start(250)
        setRecording(true)
        setPaused(false)
        setElapsedMs(0)
      } catch {
        setCameraErr('Recording is not supported in this browser.')
      }
      return
    }

    finalizeRecordingStop()
  }, [previewBlob, recording, finalizeRecordingStop])

  const togglePause = useCallback(() => {
    const mr = recorderRef.current
    if (!mr || !supportsPause) return
    if (mr.state === 'recording') {
      mr.pause()
      setPaused(true)
    } else if (mr.state === 'paused') {
      mr.resume()
      setPaused(false)
    }
  }, [supportsPause])

  const handleClose = useCallback(() => {
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.onstop = () => {
        recorderRef.current = null
        setRecording(false)
        setPaused(false)
      }
      try {
        mr.stop()
      } catch {
        recorderRef.current = null
        setRecording(false)
        setPaused(false)
      }
    } else {
      recorderRef.current = null
    }
    stopStream()
    onClose()
  }, [onClose, stopStream])

  const retake = useCallback(() => {
    setPreviewBlob(null)
    setElapsedMs(0)
    setRecording(false)
    setPaused(false)
    chunksRef.current = []
    void startCamera()
  }, [startCamera])

  const useVideo = useCallback(() => {
    if (!previewBlob) return
    const ext = previewBlob.type.includes('mp4') ? 'mp4' : 'webm'
    const file = new File([previewBlob], `fetch-recording-${Date.now()}.${ext}`, {
      type: previewBlob.type || 'video/webm',
    })
    stopStream()
    onComplete(file)
  }, [previewBlob, onComplete, stopStream])

  if (!open) return null

  const mm = Math.floor(elapsedMs / 60000)
  const ss = Math.floor((elapsedMs % 60000) / 1000)
  const cs = Math.floor((elapsedMs % 1000) / 100)
  const timerLabel = `${mm}:${String(ss).padStart(2, '0')}.${cs}`

  return (
    <div className="fixed inset-0 z-[93] flex flex-col bg-black text-white">
      {!previewBlob ? (
        <>
          <div className="flex shrink-0 items-start justify-between gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={handleClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-[20px] font-semibold backdrop-blur-md"
              aria-label="Close"
            >
              ×
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex flex-wrap justify-center gap-1.5">
                {DURATION_OPTIONS.map((o) => (
                  <button
                    key={o.sec}
                    type="button"
                    disabled={recording}
                    onClick={() => setMaxSec(o.sec)}
                    className={[
                      'rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors',
                      maxSec === o.sec
                        ? 'bg-white text-zinc-900'
                        : 'bg-white/15 text-white/90 hover:bg-white/25',
                      recording ? 'opacity-40' : '',
                    ].join(' ')}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {recording ? (
                <p className="font-mono text-[15px] font-semibold tabular-nums text-white/90">
                  <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-fetch-red" />
                  {timerLabel}
                  <span className="ml-2 text-[11px] font-medium text-white/50">
                    / {maxSec >= 60 ? `${Math.floor(maxSec / 60)} min` : `${maxSec}s`}
                  </span>
                </p>
              ) : (
                <p className="text-[11px] font-medium text-white/50">Max clip length · tap red to record</p>
              )}
            </div>
            <button
              type="button"
              disabled={recording}
              onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-[11px] font-bold uppercase tracking-wide backdrop-blur-md disabled:opacity-35"
            >
              Flip
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            {cameraErr ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-[15px] font-medium text-white/85">{cameraErr}</p>
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-zinc-900"
                >
                  Try again
                </button>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-4 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            {supportsPause && recording ? (
              <button
                type="button"
                onClick={togglePause}
                className="rounded-full bg-white/20 px-6 py-2 text-[13px] font-bold uppercase tracking-wide backdrop-blur-md"
              >
                {paused ? 'Resume' : 'Pause'}
              </button>
            ) : null}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={toggleRecord}
                disabled={Boolean(cameraErr) || !stream}
                aria-label={recording ? 'Stop recording' : 'Start recording'}
                className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-[4px] border-white transition-transform active:scale-95 disabled:opacity-40"
              >
                {recording ? (
                  <span className="h-[2rem] w-[2rem] rounded-[0.35rem] bg-fetch-red shadow-[0_0_24px_rgba(225,25,45,0.55)]" />
                ) : (
                  <span className="h-[3.25rem] w-[3.25rem] rounded-full bg-fetch-red shadow-[0_0_28px_rgba(225,25,45,0.5)]" />
                )}
              </button>
            </div>
            <p className="text-center text-[12px] font-medium text-white/45">
              {recording
                ? paused
                  ? 'Paused — tap Resume or stop with the button above'
                  : 'Tap the red control to stop'
                : 'Tap the red button to start'}
            </p>
            {onPickFromLibrary && !recording ? (
              <button
                type="button"
                onClick={() => {
                  handleClose()
                  onPickFromLibrary()
                }}
                className="text-[13px] font-semibold text-white/55 underline decoration-white/35 underline-offset-2"
              >
                Upload from library instead
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full bg-white/15 px-4 py-2 text-[14px] font-semibold"
            >
              Cancel
            </button>
            <p className="text-[14px] font-bold">Preview</p>
            <span className="w-[4.5rem]" aria-hidden />
          </div>
          <div className="min-h-0 flex-1 px-2 pb-2">
            <video
              ref={previewVideoRef}
              controls
              playsInline
              className="h-full max-h-[min(72dvh,32rem)] w-full rounded-xl bg-black object-contain"
            />
          </div>
          <div className="flex shrink-0 gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
            <button
              type="button"
              onClick={retake}
              className="flex-1 rounded-full border-2 border-white/40 py-3.5 text-[15px] font-bold text-white"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={useVideo}
              className="flex-1 rounded-full bg-emerald-600 py-3.5 text-[15px] font-bold text-white shadow-lg"
            >
              Use video
            </button>
          </div>
        </>
      )}
    </div>
  )
}
