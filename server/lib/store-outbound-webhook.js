import crypto from 'node:crypto'

/**
 * Optional HMAC webhook when a store order is paid (Phase 3).
 * @param {string | undefined} url
 * @param {string | undefined} secret
 * @param {Record<string, unknown>} payload
 */
export async function postStoreOrderWebhook(url, secret, payload) {
  if (!url || !secret) return
  const body = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fetch-Signature': sig,
      },
      body,
    })
    if (!res.ok) {
      console.warn('[store-webhook] non-ok', res.status)
    }
  } catch (e) {
    console.warn('[store-webhook] failed', e)
  }
}
