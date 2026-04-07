/**
 * Generate transparent-background product PNGs for the marketplace supplies catalog.
 *
 * Usage (from repo root):
 *   OPENAI_API_KEY=sk-... npm run generate:supply-images
 *
 * Optional:
 *   OPENAI_IMAGE_MODEL=gpt-image-1-mini   (default: gpt-image-1)
 *   --only=sup-clean-pro-kit              (single SKU id)
 *
 * Writes to public/supplies/{id}.png — uses OpenAI Images API with background: "transparent"
 * (GPT Image models only; see https://platform.openai.com/docs/api-reference/images/create).
 */

import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SupplyProduct } from '../src/lib/suppliesCatalog'
import { SUPPLY_PRODUCTS } from '../src/lib/suppliesCatalog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/supplies')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function buildPrompt(p: SupplyProduct): string {
  const lane =
    p.categoryId === 'drinks'
      ? 'bottled and canned beverages for home'
      : p.categoryId === 'cleaning'
      ? 'professional cleaning supplies'
      : p.categoryId === 'packing'
        ? 'moving / packing supplies'
        : p.categoryId === 'kitchen'
          ? 'kitchen and cookware for a new home'
          : p.categoryId === 'bedroom'
            ? 'bedroom linens and sleep essentials'
            : p.categoryId === 'bathroom'
              ? 'bathroom accessories and textiles'
              : p.categoryId === 'livingRoom'
                ? 'living room lighting and decor'
                : p.categoryId === 'laundry'
                  ? 'laundry room essentials'
                  : 'home storage and organisation'
  return [
    `E-commerce hero product photo for ${lane}.`,
    `Product: ${p.title}.`,
    `Includes or suggests: ${p.subtitle}.`,
    `Context: ${p.description}`,
    'Single product or coherent product set as one focal subject, centered, fills most of the square frame.',
    'Photorealistic, sharp focus, soft studio lighting on the product only.',
    'Background: fully transparent (alpha), no backdrop, no floor, no horizon, no gradient fill behind the subject.',
    'No text, logos, watermarks, or people.',
  ].join(' ')
}

async function generatePngB64(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: '1024x1024',
      background: 'transparent',
      output_format: 'png',
      quality: 'medium',
    }),
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`OpenAI images ${res.status}: ${raw.slice(0, 800)}`)
  }

  let json: { data?: Array<{ b64_json?: string }> }
  try {
    json = JSON.parse(raw) as { data?: Array<{ b64_json?: string }> }
  } catch {
    throw new Error(`Invalid JSON from OpenAI: ${raw.slice(0, 200)}`)
  }

  const b64 = json.data?.[0]?.b64_json
  if (!b64) {
    throw new Error(`No b64_json in response: ${raw.slice(0, 500)}`)
  }
  return b64
}

async function main(): Promise<void> {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY (set in env or .env).')
    process.exit(1)
  }

  const model = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))
  const onlyId = onlyArg?.slice('--only='.length).trim() || ''

  const list = onlyId
    ? SUPPLY_PRODUCTS.filter((p) => p.id === onlyId)
    : [...SUPPLY_PRODUCTS]

  if (onlyId && list.length === 0) {
    console.error(`No product with id "${onlyId}".`)
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })

  console.log(`Model: ${model} · ${list.length} image(s) → ${OUT_DIR}`)

  for (let i = 0; i < list.length; i++) {
    const p = list[i]!
    const prompt = buildPrompt(p)
    process.stdout.write(`[${i + 1}/${list.length}] ${p.id} … `)
    const b64 = await generatePngB64(apiKey, model, prompt)
    const path = join(OUT_DIR, `${p.id}.png`)
    writeFileSync(path, Buffer.from(b64, 'base64'))
    console.log('ok')
    if (i < list.length - 1) await sleep(2500)
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
