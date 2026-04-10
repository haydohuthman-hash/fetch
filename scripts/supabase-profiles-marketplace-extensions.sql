-- Optional: extends public.profiles for marketplace seller profile UI + wallet display.
-- Run after supabase-profiles-onboarding-columns.sql. Safe to re-run (IF NOT EXISTS).

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists location_label text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists seller_rating numeric(3, 2) default 5.0;
alter table public.profiles add column if not exists followers_count integer default 0 not null;
alter table public.profiles add column if not exists following_count integer default 0 not null;
alter table public.profiles add column if not exists credits_balance_cents integer default 0 not null;

update public.profiles
set seller_rating = 5.0
where seller_rating is null;

alter table public.profiles alter column seller_rating set default 5.0;
