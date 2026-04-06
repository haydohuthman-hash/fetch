import { defineConfig, devices } from '@playwright/test'

/**
 * Run against local Vite + API (`npm run dev:all`). Vite proxies `/api` to Express on 8787.
 * Install browsers once: `npx playwright install`
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    /** Alternate ports so `npm run test:e2e` does not fight a normal `dev:all` on 5174/8787. */
    baseURL: 'http://127.0.0.1:5179',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev:e2e-stack',
    url: 'http://127.0.0.1:5179',
    /**
     * Default `false` so Playwright starts a full `dev:all` (Vite + Express). Reusing an existing
     * process is unsafe: a lone Vite instance would make `/api/*` proxy fail. Set `PW_REUSE_DEV_SERVER=1`
     * only when you already have a matching `npm run dev:all` on 5174/8787.
     */
    reuseExistingServer: process.env.PW_REUSE_DEV_SERVER === '1',
    timeout: 120_000,
  },
})
