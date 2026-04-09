-- Profiles table + RLS
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_url text,
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read"
on public.profiles for select
using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles for update
using (auth.uid() = id);

-- Auto-create profile when auth user is created
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    concat('user_', substring(new.id::text, 1, 6))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Older Postgres images may require instead of the line above:
--   for each row execute procedure public.handle_new_user();

-- Drops storage policies: authenticated only (not anon)
drop policy if exists "drops insert anon" on storage.objects;
drop policy if exists "drops update anon" on storage.objects;
drop policy if exists "drops read anon" on storage.objects;

drop policy if exists "drops read public" on storage.objects;
create policy "drops read public"
on storage.objects for select
using (bucket_id = 'drops');

drop policy if exists "drops upload authenticated" on storage.objects;
create policy "drops upload authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'drops');

drop policy if exists "drops update own authenticated" on storage.objects;
create policy "drops update own authenticated"
on storage.objects for update
to authenticated
using (bucket_id = 'drops' and owner = auth.uid())
with check (bucket_id = 'drops' and owner = auth.uid());
