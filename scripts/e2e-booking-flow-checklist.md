# Manual E2E: booking completion and driver jobs

Run API and app (`npm run dev:all`). Optional: two browsers (customer + driver).

## Customer: book and dispatch

1. Complete a job through pickup/dropoff, quote, and **Book now**.
  - **Demo server** (no `STRIPE_SECRET_KEY`): uses saved card from Account (demo storage).
  - **Stripe server** (`STRIPE_SECRET_KEY` set): **Book now** opens Stripe Elements; pay, then ensure webhooks update the server before dispatch when `FETCH_REQUIRE_STRIPE_WEBHOOK=1`.
2. Confirm the sheet shows **searching** copy (pool vs sequential depends on `VITE_BOOKING_MATCHING_MODE`).
3. **Customer session**
  - **Legacy (default):** after local sign-in, the app calls `POST /api/auth/customer-session` with email; the server sets an httpOnly `fetch_session` cookie. `GET /api/marketplace/bookings` filters by `customerEmail` when the cookie is present.
  - **Server accounts:** set server `FETCH_AUTH_USERS_DB=1` with Postgres (`DATABASE_URL`), and client `VITE_FETCH_AUTH_USERS_DB=1`. Use `POST /api/auth/register` and `POST /api/auth/login` (password ≥ 8). The cookie includes `userId`; new bookings get `customerUserId` from the session. `POST /api/auth/customer-session` is **rejected** in this mode. Optional `FETCH_STRICT_CUSTOMER_AUTH=1` tightens booking access checks (email + `customerUserId` when present).
  - For local tools only, set `FETCH_ALLOW_HEADER_AUTH=1` to also honor `X-Fetch-User-Email` / `X-Fetch-Driver-Id`.

## Driver: accept and progress

1. Open `/?driver=1` (or use the in-app driver entry).
2. Set a **driver id** distinct from other testers; toggle **online**.
3. Allow location so **postDriverPresence** sends GPS (sequential matching ranks by distance).
4. Confirm the new job appears; optional **card_reveal** haptic when the count increases.
5. **Accept job** → booking **matched**; advance **en route → arrived → in progress → completed** as appropriate.
6. Customer should see status updates via polling (and SSE on the home flow when a booking is active).

## Customer: rating

1. After **completed**, submit a **star rating** (and optional note).

## Env toggles (server)


| Variable                                 | Effect                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `FETCH_DEFAULT_MATCHING_MODE=sequential` | Default dispatch uses timed offers (unless client overrides).                                                                          |
| `FETCH_MARKETPLACE_STORE=sqlite`         | Persist marketplace in SQLite (`FETCH_SQLITE_PATH`, Node 22.5+ `node:sqlite`).                                                         |
| `FETCH_MARKETPLACE_STORE=postgres`       | Persist marketplace in Postgres (`DATABASE_URL`); table `marketplace_entities` (see `server/migrations/001_marketplace_entities.sql`). |
| `DATABASE_URL`                           | Required when `FETCH_MARKETPLACE_STORE=postgres`.                                                                                      |
| `FETCH_SESSION_SECRET`                   | HMAC secret for `fetch_session` cookie (defaults to an insecure dev value if unset).                                                   |
| `FETCH_ALLOW_HEADER_AUTH=1`              | Trust `X-Fetch-User-Email` / `X-Fetch-Driver-Id` when no valid session cookie (dev/tests).                                             |
| `FETCH_REQUIRE_STRIPE_WEBHOOK=1`         | Dispatch requires `paymentIntent.webhookConfirmedAt` when `provider === 'stripe'`.                                                     |
| `STRIPE_SECRET_KEY`                      | Creates real `PaymentIntent`s on `POST /api/payments/intents` (AUD, metadata `bookingId` when set).                                    |
| `STRIPE_WEBHOOK_SECRET`                  | Verifies `POST /api/payments/webhook` (requires `STRIPE_SECRET_KEY` too).                                                              |
| `FETCH_AUTH_USERS_DB=1`                  | Enables `fetch_users` table, register/login, and password-backed customer sessions (requires `DATABASE_URL` + shared pool).            |
| `FETCH_STRICT_CUSTOMER_AUTH=1`           | Stricter `assertCustomerCanAccessBooking` (requires authenticated customer; matches `customerUserId` when stored on the booking).      |


Structured marketplace logs: JSON lines with `"svc":"fetch-marketplace"` on key mutations (upsert booking, dispatch, status patch, offer upsert).

## Client toggles


| Variable                                | Effect                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `VITE_BOOKING_MATCHING_MODE=sequential` | `dispatchBooking` sends `{ matchingMode: 'sequential' }`.                                  |
| `VITE_STRIPE_PUBLISHABLE_KEY`           | Loads Stripe.js + Payment Element when the server returns `provider: 'stripe'`.            |
| `VITE_FETCH_AUTH_USERS_DB=1`            | Account UI uses server register/login instead of local-only registry + `customer-session`. |


## Operations

- `**GET /healthz`** and `**GET /api/healthz**` — process up (JSON `{ ok: true }`). The `/api/*` paths match the Vite dev proxy prefix.
- `**GET /readyz**` and `**GET /api/readyz**` — when Postgres is configured, pings the pool; `503` if the DB is unreachable.
- **Graceful shutdown:** local Node server closes the HTTP server and calls `pool.end()` on `SIGTERM` / `SIGINT`.
- **Rate limits:** `express-rate-limit` on `/api/auth/`* and `POST /api/payments/intents`.
- **Production:** set a strong `FETCH_SESSION_SECRET` (not the dev default); the server logs a warning if missing or default in `NODE_ENV=production`.
- **Stripe webhooks:** with Postgres available, webhook event ids are stored in `stripe_webhook_events` for idempotent processing across restarts/instances (see `server/migrations/002_phase3_stripe_events_and_users.sql`).

## Stripe CLI (local webhooks)

```bash
stripe listen --forward-to localhost:8787/api/payments/webhook
```

Use the signing secret from the CLI as `STRIPE_WEBHOOK_SECRET`. Poll `GET /api/payments/intents/:id` after Elements confirm until `webhookConfirmedAt` is set.

## SSE

- `GET /api/marketplace/stream` emits `id:` lines, `event: ping`, and `event: marketplace` on store writes. Clients may reconnect with the `**Last-Event-ID**` header (native `EventSource`) or `**?lastEventId=**` (manual reconnect). The app uses exponential backoff between reconnects.
- Driver UI and customer home (active booking) subscribe for faster refresh alongside polling.

## Automated E2E (Playwright)

- **Run:** `npx playwright install` once, then `npm run test:e2e`. Playwright starts `**npm run dev:e2e-stack`** on **Vite 5179** + **API 8792** so it does not collide with a normal `dev:all` on 5174/8787. To reuse an existing stack instead, run `dev:e2e-stack` yourself and set `PW_REUSE_DEV_SERVER=1`.
- **Smoke tests:** `e2e/smoke.spec.ts` calls `/api/healthz` and `/api/readyz` through the dev proxy and loads the SPA.
- **Full book → pay → driver flow:** extend specs when you have stable selectors; keep using the manual steps above for exploratory QA.

### Stripe in CI

- Prefer **Stripe test mode** keys scoped to CI, or **mock webhooks** (POST signed test payloads) instead of live Elements unless you run a headed browser with test clocks.
- Document any job that runs `stripe listen` or uses **Stripe test clocks** next to the workflow file so secrets and timing expectations stay obvious.

