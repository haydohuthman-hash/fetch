# Marketplace listings → Supabase

## What changed

Peer marketplace data (listings, Connect sellers, listing orders, earnings ledger) is stored in **Supabase Postgres** when the API has:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

If either is missing, the server falls back to **`peer-listings.json`** (or `/tmp` on Vercel), which is **not durable** across instances.

## One-time database setup

1. In the Supabase dashboard, open **SQL Editor**.
2. Run the full script: **`scripts/supabase-marketplace-listings.sql`**  
   It is idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) and upgrades older minimal `marketplace_peer_listings` tables.

## Production checklist

- [ ] Run the SQL migration on the production project.
- [ ] Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the **Express** host (same project as auth).
- [ ] Confirm logs on boot: `[peer-listings] persistence: Supabase/Postgres (durable)`.
- [ ] Listing `user_id` references `auth.users(id)`. Inserts use the signed-in user’s UUID; invalid or unknown UUIDs are stored as `NULL` with `seller_email` for ownership when applicable. Fake user IDs in local dev may hit FK errors until you use the file fallback or real Supabase users.

## Optional: import old JSON data

There is no automatic import. If you have an existing `peer-listings.json`, migrate with a one-off script or manual SQL that maps JSON rows into:

- `marketplace_peer_listings`
- `marketplace_peer_sellers`
- `marketplace_listing_orders`
- `marketplace_peer_ledger`

Column names are **snake_case** in Postgres; the API still returns **camelCase** to clients.

## Files involved

| Area | File |
|------|------|
| Schema | `scripts/supabase-marketplace-listings.sql` |
| Supabase store | `server/lib/peer-listings-supabase.js` |
| JSON fallback | `server/lib/peer-listings-store.js` |
| Wiring | `server/index.js` (chooses Supabase vs JSON) |
| Admin client | `server/lib/supabase-admin.js` |

## RLS

Tables have **RLS enabled** with no policies for the anon key. Only the **service role** (server) can read/write these tables via the Supabase client.
