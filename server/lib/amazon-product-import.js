/**
 * Lightweight Amazon product URL → admin import draft.
 *
 * FUTURE: Replace with Amazon Product Advertising API (PA-API) or a supplier feed
 * for reliable titles, images, and pricing. This module is intentionally small and
 * resilient to HTML changes (og tags + optional JSON-LD).
 */

/** @typedef {{ ok: true, asin: string, originalUrl: string, fetchUrl: string } | { ok: false, error: string }} ParsedAmazonUrl */

const ASIN_IN_PATH = /(?:\/dp\/|\/gp\/product\/|\/d\/)([A-Z0-9]{10})(?:[/?]|$)/i

export const AMAZON_AFFILIATE_TAG = (process.env.AMAZON_AFFILIATE_TAG || 'fetchitapp-20').trim()
export const AMAZON_DP_HOST = 'www.amazon.com.au'

/**
 * @param {string} raw
 * @returns {ParsedAmazonUrl}
 */
export function parseAmazonProductUrl(raw) {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return { ok: false, error: 'url_required' }
  let url
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return { ok: false, error: 'invalid_url' }
  }
  const host = url.hostname.toLowerCase()
  if (!host.includes('amazon.')) {
    return { ok: false, error: 'not_amazon_url' }
  }
  let asin = null
  const pathMatch = url.pathname.match(ASIN_IN_PATH)
  if (pathMatch) asin = pathMatch[1].toUpperCase()
  if (!asin) {
    const q = url.searchParams.get('asin')
    if (q && /^[A-Z0-9]{10}$/i.test(q)) asin = q.toUpperCase()
  }
  if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
    return { ok: false, error: 'asin_not_found' }
  }
  const fetchUrl = `https://${AMAZON_DP_HOST}/dp/${asin}`
  return { ok: true, asin, originalUrl: s, fetchUrl }
}

/**
 * Canonical affiliate deeplink (AU storefront + tag).
 * @param {string} asin
 */
export function buildAmazonAffiliateUrl(asin) {
  const a = typeof asin === 'string' ? asin.trim().toUpperCase() : ''
  if (!/^[A-Z0-9]{10}$/.test(a)) return ''
  const tag = encodeURIComponent(AMAZON_AFFILIATE_TAG)
  return `https://${AMAZON_DP_HOST}/dp/${a}?tag=${tag}`
}

/**
 * Shorten noisy marketplace titles for Fetch-style display.
 * @param {string} raw
 */
export function cleanAmazonListingTitle(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let t = raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .trim()
  t = t.replace(/^Amazon\s*(\.[a-z.]+)?\s*:\s*/i, '').trim()
  const first = t.split(/[,|–—]/).map((x) => x.trim())[0] ?? t
  t = first.trim()
  if (t.length > 88) t = `${t.slice(0, 85).trim()}…`
  return t
}

/**
 * @param {string} html
 */
function parseOg(html, prop) {
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let m = html.match(new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']*)["']`, 'i'))
  if (!m) m = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${esc}["']`, 'i'))
  return m ? m[1] : ''
}

/**
 * @param {string} html
 */
function parseAmazonHtmlMeta(html) {
  const ogTitle = parseOg(html, 'og:title')
  const ogImage = parseOg(html, 'og:image')
  let priceAud = null

  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const m of scripts) {
    try {
      const j = JSON.parse(m[1])
      const nodes = Array.isArray(j) ? j : [j]
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        const types = [node['@type']].flat().map((x) => String(x).toLowerCase())
        if (!types.includes('product')) continue
        const offers = node.offers
        const o = Array.isArray(offers) ? offers[0] : offers
        const price = o?.price
        const cur = String(o?.priceCurrency ?? '').toUpperCase()
        if (price != null && (cur === 'AUD' || cur === '')) {
          const n = Math.round(Number(price))
          if (Number.isFinite(n) && n >= 0) priceAud = n
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }

  if (priceAud == null) {
    const aud = html.match(/AUD\s*\$?\s*([\d][\d,]*)/i)
    if (aud) {
      const n = Math.round(Number(aud[1].replace(/,/g, '')))
      if (Number.isFinite(n) && n >= 0) priceAud = n
    }
  }

  return {
    ok: Boolean(ogTitle || ogImage || priceAud != null),
    title: ogTitle ? cleanAmazonListingTitle(ogTitle) : '',
    imageUrl: ogImage ? ogImage.split(',')[0].trim().slice(0, 2048) : '',
    priceAud,
  }
}

/**
 * @param {string} pageUrl
 * @param {number} [timeoutMs]
 */
export async function tryFetchAmazonProductMeta(pageUrl, timeoutMs = 10000) {
  const url = typeof pageUrl === 'string' ? pageUrl.trim() : ''
  if (!url) return { ok: false, title: '', imageUrl: '', priceAud: null }
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; FetchCatalogBot/1.0; +https://fetch.com.au) AppleWebKit/537.36 (KHTML, like Gecko)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    })
    clearTimeout(tid)
    if (!res.ok) return { ok: false, title: '', imageUrl: '', priceAud: null }
    const html = await res.text()
    const meta = parseAmazonHtmlMeta(html)
    return { ok: meta.ok, ...meta }
  } catch {
    clearTimeout(tid)
    return { ok: false, title: '', imageUrl: '', priceAud: null }
  }
}

/**
 * Build admin import draft (never throws).
 * @param {string} rawUrl
 */
export async function importProductFromUrl(rawUrl) {
  const parsed = parseAmazonProductUrl(rawUrl)
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      draft: null,
    }
  }

  const { asin, fetchUrl } = parsed
  const affiliateUrl = buildAmazonAffiliateUrl(asin)
  const meta = await tryFetchAmazonProductMeta(fetchUrl)

  let title = meta.title || `Amazon · ${asin}`
  title = cleanAmazonListingTitle(title) || `Amazon · ${asin}`

  const subtitle = 'Available on Amazon'
  const imageUrl = meta.imageUrl || ''
  const priceAud = meta.priceAud != null && Number.isFinite(meta.priceAud) ? meta.priceAud : null

  const metaFetched = Boolean(meta.title || meta.imageUrl || meta.priceAud != null)
  const warning = metaFetched
    ? undefined
    : "Couldn't fetch product details — you can still add it manually."

  return {
    ok: true,
    draft: {
      asin,
      affiliateUrl,
      title,
      subtitle,
      imageUrl,
      priceAud,
      productSource: 'amazon',
      external: true,
      metaFetched,
      warning,
    },
  }
}
