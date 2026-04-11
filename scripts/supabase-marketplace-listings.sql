-- Marketplace peer store (listings, Stripe sellers, checkout orders, seller ledger).
-- Run in Supabase SQL Editor (or psql). Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- After migration, set on the API host:
--   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
-- The Node server uses the service role client for these tables (bypasses RLS).
--
-- See scripts/MARKETPLACE_SUPABASE_MIGRATION.md for rollout notes.

-- ---------------------------------------------------------------------------
-- Listings (durable replacement for peer-listings.json)
-- ---------------------------------------------------------------------------
create table if not exists public.marketplace_peer_listings (
  id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  seller_email text,
  title text not null,
  description text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  compare_at_cents integer not null default 0 check (compare_at_cents >= 0),
  category text not null default 'general',
  condition text not null default 'used',
  keywords text not null default '',
  suburb text,
  location_label text not null default '',
  images jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  sku text,
  accepts_offers boolean not null default false,
  fetch_delivery boolean not null default true,
  same_day_delivery boolean not null default false,
  profile_author_id text,
  profile_display_name text,
  profile_avatar text,
  sale_mode text not null default 'fixed' check (sale_mode in ('fixed', 'auction')),
  auction_ends_at bigint,
  reserve_cents integer not null default 0,
  min_bid_increment_cents integer not null default 100,
  auction_high_bid_cents integer not null default 0,
  auction_high_bidder_key text,
  auction_closed boolean not null default false,
  bids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.marketplace_peer_listings is
  'Peer marketplace listings; images/bids as JSONB; auction_ends_at is epoch ms.';

-- Upgrades from older minimal schema (omit errors if already present)
alter table public.marketplace_peer_listings add column if not exists seller_email text;
alter table public.marketplace_peer_listings add column if not exists compare_at_cents integer not null default 0;
alter table public.marketplace_peer_listings add column if not exists keywords text not null default '';
alter table public.marketplace_peer_listings add column if not exists location_label text not null default '';
alter table public.marketplace_peer_listings add column if not exists sku text;
alter table public.marketplace_peer_listings add column if not exists accepts_offers boolean not null default false;
alter table public.marketplace_peer_listings add column if not exists fetch_delivery boolean not null default true;
alter table public.marketplace_peer_listings add column if not exists same_day_delivery boolean not null default false;
alter table public.marketplace_peer_listings add column if not exists profile_author_id text;
alter table public.marketplace_peer_listings add column if not exists profile_display_name text;
alter table public.marketplace_peer_listings add column if not exists profile_avatar text;
alter table public.marketplace_peer_listings add column if not exists sale_mode text not null default 'fixed';
alter table public.marketplace_peer_listings add column if not exists auction_ends_at bigint;
alter table public.marketplace_peer_listings add column if not exists reserve_cents integer not null default 0;
alter table public.marketplace_peer_listings add column if not exists min_bid_increment_cents integer not null default 100;
alter table public.marketplace_peer_listings add column if not exists auction_high_bid_cents integer not null default 0;
alter table public.marketplace_peer_listings add column if not exists auction_high_bidder_key text;
alter table public.marketplace_peer_listings add column if not exists auction_closed boolean not null default false;
alter table public.marketplace_peer_listings add column if not exists bids jsonb not null default '[]'::jsonb;

alter table public.marketplace_peer_listings alter column user_id drop not null;

create index if not exists idx_marketplace_peer_listings_status_updated
  on public.marketplace_peer_listings (status, updated_at desc);

create index if not exists idx_marketplace_peer_listings_profile
  on public.marketplace_peer_listings (profile_author_id)
  where profile_author_id is not null;

create index if not exists idx_marketplace_peer_listings_user_created
  on public.marketplace_peer_listings (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Stripe Connect sellers (was JSON "sellers" array)
-- ---------------------------------------------------------------------------
create table if not exists public.marketplace_peer_sellers (
  user_key text primary key,
  stripe_account_id text not null,
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketplace_peer_sellers_stripe
  on public.marketplace_peer_sellers (stripe_account_id);

-- ---------------------------------------------------------------------------
-- Listing checkout orders (was JSON listingOrders)
-- ---------------------------------------------------------------------------
create table if not exists public.marketplace_listing_orders (
  id text primary key,
  created_at timestamptz not null default now(),
  listing_id text not null,
  seller_key text not null,
  buyer_user_id text,
  buyer_email text,
  price_cents integer not null,
  platform_fee_cents integer not null default 0,
  seller_net_cents integer not null default 0,
  status text not null,
  payment_intent_id text,
  stripe_payment_intent_id text,
  last_error text,
  webhook_confirmed_at timestamptz
);

create index if not exists idx_marketplace_listing_orders_listing
  on public.marketplace_listing_orders (listing_id);

create index if not exists idx_marketplace_listing_orders_pi
  on public.marketplace_listing_orders (payment_intent_id)
  where payment_intent_id is not null;

create index if not exists idx_marketplace_listing_orders_stripe_pi
  on public.marketplace_listing_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- ---------------------------------------------------------------------------
-- Seller earnings ledger (was JSON ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.marketplace_peer_ledger (
  id text primary key,
  created_at timestamptz not null default now(),
  seller_key text not null,
  type text not null,
  listing_order_id text,
  listing_id text,
  gross_cents integer not null default 0,
  fee_cents integer not null default 0,
  net_cents integer not null default 0,
  currency text not null default 'aud',
  stripe_charge_id text
);

create index if not exists idx_marketplace_peer_ledger_seller_created
  on public.marketplace_peer_ledger (seller_key, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger (listings)
-- ---------------------------------------------------------------------------
create or replace function public.touch_marketplace_peer_listings_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_marketplace_peer_listings_updated on public.marketplace_peer_listings;
create trigger trg_marketplace_peer_listings_updated
  before update on public.marketplace_peer_listings
  for each row execute procedure public.touch_marketplace_peer_listings_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: block direct anon/authenticated API access; server uses service role only
-- ---------------------------------------------------------------------------
alter table public.marketplace_peer_listings enable row level security;
alter table public.marketplace_peer_sellers enable row level security;
alter table public.marketplace_listing_orders enable row level security;
alter table public.marketplace_peer_ledger enable row level security;
