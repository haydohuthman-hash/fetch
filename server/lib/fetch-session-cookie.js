import { createHmac, timingSafeEqual } from 'node:crypto'

export const FETCH_SESSION_COOKIE_NAME = 'fetch_session'

function base64UrlJson(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
}

/**
 * @param {Record<string, unknown>} payload Must include numeric `exp` (unix seconds).
 * @param {string} secret
 */
export function signFetchSessionCookie(payload, secret) {
  const body = base64UrlJson(payload)
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {Record<string, unknown> | null}
 */
export function verifyFetchSessionCookie(token, secret) {
  if (!token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  try {
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null
    }
  } catch {
    return null
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload || typeof payload !== 'object') return null
    const exp = payload.exp
    if (typeof exp !== 'number' || exp < Date.now() / 1000) return null
    return payload
  } catch {
    return null
  }
}

/** @param {import('express').Request} req */
export function readCookieFromRequest(req, name) {
  const raw = req.headers.cookie
  if (!raw || typeof raw !== 'string') return null
  const parts = raw.split(';')
  for (const p of parts) {
    const idx = p.indexOf('=')
    if (idx === -1) continue
    const k = p.slice(0, idx).trim()
    if (k !== name) continue
    return decodeURIComponent(p.slice(idx + 1).trim())
  }
  return null
}
