import { test, expect } from '@playwright/test'

/** Hits Express through Vite’s `/api` proxy (same as the SPA in dev). */
test('healthz via dev proxy', async ({ request }) => {
  const res = await request.get('/api/healthz')
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { ok?: boolean }
  expect(body.ok).toBe(true)
})

test('home shell loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Fetch/i)
})

test('readyz via dev proxy', async ({ request }) => {
  const res = await request.get('/api/readyz')
  expect([200, 503].includes(res.status())).toBeTruthy()
  const body = (await res.json()) as { ok?: boolean }
  expect(typeof body.ok).toBe('boolean')
})
