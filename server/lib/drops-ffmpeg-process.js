/**
 * Optional server-side ffmpeg: trim, mute, rotate. Requires `ffmpeg` on PATH or FFMPEG_PATH.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * @returns {string}
 */
function ffmpegBin() {
  const p = (process.env.FFMPEG_PATH || '').trim()
  return p || 'ffmpeg'
}

/**
 * @returns {Promise<boolean>}
 */
export async function ffmpegAvailable() {
  return new Promise((resolve) => {
    const c = spawn(ffmpegBin(), ['-version'], { stdio: 'ignore' })
    c.on('error', () => resolve(false))
    c.on('close', (code) => resolve(code === 0))
  })
}

/**
 * @param {{ inputPath: string, outputPath: string, mute?: boolean, rotation?: 0|90|180|270, trimStartSec?: number, trimDurationSec?: number }} opts
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function runFfmpegTransform(opts) {
  const { inputPath, outputPath, mute, rotation = 0, trimStartSec = 0, trimDurationSec } = opts
  const args = ['-y']
  if (trimStartSec > 0) args.push('-ss', String(trimStartSec))
  args.push('-i', inputPath)
  if (trimDurationSec != null && trimDurationSec > 0) args.push('-t', String(trimDurationSec))

  const vf = []
  if (rotation === 90) vf.push('transpose=1')
  else if (rotation === 180) vf.push('transpose=1,transpose=1')
  else if (rotation === 270) vf.push('transpose=2')
  if (vf.length) args.push('-vf', vf.join(','))

  if (mute) args.push('-an')
  else args.push('-c:a', 'aac', '-b:a', '128k')

  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-movflags', '+faststart', outputPath)

  return new Promise((resolve) => {
    const c = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    c.stderr?.on('data', (ch) => {
      err += String(ch)
    })
    c.on('error', (e) => resolve({ ok: false, error: e instanceof Error ? e.message : 'ffmpeg_spawn_failed' }))
    c.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: err.slice(-400) || `ffmpeg_exit_${code}` })
    })
  })
}

/**
 * @param {Buffer} inputBuf
 * @param {{ mute?: boolean, rotation?: 0|90|180|270, trimStartSec?: number, trimDurationSec?: number }} opts
 * @returns {Promise<{ ok: true, buffer: Buffer } | { ok: false, error: string }>}
 */
export async function transformVideoBuffer(inputBuf, opts) {
  const ok = await ffmpegAvailable()
  if (!ok) return { ok: false, error: 'ffmpeg_not_available' }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-drop-ff-'))
  const inPath = path.join(dir, 'in.mp4')
  const outPath = path.join(dir, 'out.mp4')
  try {
    await fs.writeFile(inPath, inputBuf)
    const r = await runFfmpegTransform({
      inputPath: inPath,
      outputPath: outPath,
      mute: opts.mute,
      rotation: opts.rotation ?? 0,
      trimStartSec: opts.trimStartSec ?? 0,
      trimDurationSec: opts.trimDurationSec,
    })
    if (!r.ok) return r
    const buffer = await fs.readFile(outPath)
    return { ok: true, buffer }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
