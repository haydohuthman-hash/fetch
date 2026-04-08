/**
 * Mux Live → recorded asset → Drops `live_replay` media (provider abstraction v1).
 * Set MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SIGNING_SECRET for production.
 */

import crypto from 'node:crypto'

const MUX_API = 'https://api.mux.com/video/v1'

/**
 * @param {string} dropId uuid
 * @param {string} [title]
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string, detail?: string }>}
 */
export async function muxCreateLiveStreamForDrop(dropId, title) {
  const id = (process.env.MUX_TOKEN_ID || '').trim()
  const secret = (process.env.MUX_TOKEN_SECRET || '').trim()
  if (!id || !secret) {
    return { ok: false, error: 'mux_not_configured', detail: 'Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.' }
  }
  const auth = Buffer.from(`${id}:${secret}`).toString('base64')
  const passthrough = String(dropId).slice(0, 240)
  const body = {
    playback_policy: ['public'],
    passthrough,
    reconnect_window: 60,
    new_asset_settings: {
      playback_policy: ['public'],
      passthrough,
    },
  }
  void title
  const res = await fetch(`${MUX_API}/live-streams`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = typeof data?.error?.messages?.[0] === 'string' ? data.error.messages[0] : res.statusText
    return { ok: false, error: 'mux_live_create_failed', detail: msg?.slice?.(0, 400) || String(res.status) }
  }
  return { ok: true, data }
}

/**
 * @param {Buffer|string} rawBody
 * @param {string|undefined} muxSignatureHeader
 * @returns {boolean}
 */
export function verifyMuxWebhookSignature(rawBody, muxSignatureHeader) {
  const signingSecret = (process.env.MUX_WEBHOOK_SIGNING_SECRET || '').trim()
  if (!signingSecret || !muxSignatureHeader) return false
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8')
  const parts = String(muxSignatureHeader).split(',')
  let ts = ''
  let v1 = ''
  for (const p of parts) {
    const [k, v] = p.split('=')
    if (k?.trim() === 't') ts = (v || '').trim()
    if (k?.trim() === 'v1') v1 = (v || '').trim()
  }
  if (!ts || !v1) return false
  const payload = `${ts}.${raw.toString('utf8')}`
  const expected = crypto.createHmac('sha256', signingSecret).update(payload, 'utf8').digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/**
 * @param {unknown} event parsed JSON
 * @returns {{ type: string, passthrough: string, playbackId: string, assetId: string } | null}
 */
export function muxExtractReplayAsset(event) {
  if (!event || typeof event !== 'object') return null
  const o = /** @type {Record<string, unknown>} */ (event)
  const type = typeof o.type === 'string' ? o.type : ''
  const data = o.data && typeof o.data === 'object' ? /** @type {Record<string, unknown>} */ (o.data) : null
  if (!data) return null
  if (type !== 'video.asset.ready') return null
  const passthrough = typeof data.passthrough === 'string' ? data.passthrough.trim() : ''
  const assetId = typeof data.id === 'string' ? data.id : ''
  const pids = data.playback_ids
  let playbackId = ''
  if (Array.isArray(pids) && pids.length && typeof pids[0] === 'object' && pids[0] && 'id' in pids[0]) {
    playbackId = String(/** @type {{ id?: string }} */ (pids[0]).id || '')
  }
  if (!passthrough || !playbackId) return null
  return { type, passthrough, playbackId, assetId }
}

export function muxPlaybackUrl(playbackId) {
  return `https://stream.mux.com/${playbackId}.m3u8`
}
