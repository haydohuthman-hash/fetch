-- Run in Supabase SQL editor so clients can read their own rows (and so optional .select() after insert works).
-- Requires column public.drops.user_id to match auth.users.id (uuid).

create policy "Users can read own drops"
on public.drops
for select
to authenticated
using (auth.uid() = user_id);
