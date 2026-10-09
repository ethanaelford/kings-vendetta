-- Cloud saves: one row per signed-in user. Only that user can read or write their row.
create table if not exists public.kv_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kv_profiles enable row level security;

drop policy if exists "own profile: read" on public.kv_profiles;
drop policy if exists "own profile: insert" on public.kv_profiles;
drop policy if exists "own profile: update" on public.kv_profiles;
create policy "own profile: read"   on public.kv_profiles for select to authenticated using (auth.uid() = user_id);
create policy "own profile: insert" on public.kv_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "own profile: update" on public.kv_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.kv_profiles from anon;
grant select, insert, update on public.kv_profiles to authenticated;
