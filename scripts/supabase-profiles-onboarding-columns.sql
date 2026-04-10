-- Run in Supabase SQL editor after backing up production.
-- Adds profile fields for Fetch onboarding + display (client uses graceful fallbacks if columns are missing).

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists onboarding_complete boolean;

-- Existing users: treat as already onboarded so they are not forced through the new flow.
update public.profiles
set onboarding_complete = true
where onboarding_complete is null;

-- New rows default to onboarded; the app also sets onboarding_complete explicitly on insert.
alter table public.profiles alter column onboarding_complete set default true;
