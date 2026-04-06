-- Phase 3: durable Stripe webhook idempotency + server-verified customer accounts.
-- Tables are also created on startup via `ensureStripeWebhookEventsTable` / `ensureFetchUsersTable`
-- when the Node server runs with Postgres; this file is for operators who apply SQL migrations manually.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);

CREATE TABLE IF NOT EXISTS fetch_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
