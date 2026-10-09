-- Shared King's Vendetta leaderboard.
-- The table is locked (RLS on, no policies): clients can only read and write through the two functions below.
-- Each device has a random secret; only the device that created a row can update it.

create extension if not exists pgcrypto;

create table if not exists public.kv_players (
  client_id    text primary key check (char_length(client_id) between 8 and 40),
  secret_hash  text not null,
  name         text not null check (char_length(name) between 1 and 16),
  rating       int  not null default 1000,
  wins         int  not null default 0,
  losses       int  not null default 0,
  draws        int  not null default 0,
  ranked_games int  not null default 0,
  updated_at   timestamptz not null default now()
);

alter table public.kv_players enable row level security;
revoke all on public.kv_players from anon, authenticated;

-- Top players by rating (only players with at least one ranked game)
create or replace function public.kv_leaderboard(p_limit int default 50)
returns table (client_id text, name text, rating int, wins int, losses int, draws int, ranked_games int, updated_at timestamptz)
language sql security definer set search_path = public
as $$
  select client_id, name, rating, wins, losses, draws, ranked_games, updated_at
  from kv_players
  where ranked_games > 0
  order by rating desc, ranked_games desc, updated_at asc
  limit least(greatest(p_limit, 1), 200);
$$;

-- Create or update my row. Sanity limits: rating 0..4000, a single update may move rating by at most 64.
create or replace function public.kv_submit(
  p_client_id text, p_secret text, p_name text, p_rating int,
  p_wins int, p_losses int, p_draws int, p_ranked_games int)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare
  existing kv_players%rowtype;
  clean_name text := left(regexp_replace(coalesce(p_name, 'Player'), '[^[:alnum:] ._''-]', '', 'g'), 16);
begin
  if p_secret is null or char_length(p_secret) < 16 then return false; end if;
  if p_rating < 0 or p_rating > 4000 then return false; end if;
  if clean_name = '' then clean_name := 'Player'; end if;

  select * into existing from kv_players where client_id = p_client_id;
  if not found then
    insert into kv_players (client_id, secret_hash, name, rating, wins, losses, draws, ranked_games)
    values (p_client_id, crypt(p_secret, gen_salt('bf')), clean_name, p_rating,
            greatest(p_wins, 0), greatest(p_losses, 0), greatest(p_draws, 0), greatest(p_ranked_games, 0));
    return true;
  end if;

  if existing.secret_hash <> crypt(p_secret, existing.secret_hash) then return false; end if;
  if abs(p_rating - existing.rating) > 64 * greatest(p_ranked_games - existing.ranked_games, 1) then return false; end if;

  update kv_players set
    name = clean_name, rating = p_rating,
    wins = greatest(p_wins, 0), losses = greatest(p_losses, 0), draws = greatest(p_draws, 0),
    ranked_games = greatest(p_ranked_games, 0), updated_at = now()
  where client_id = p_client_id;
  return true;
end;
$$;

revoke all on function public.kv_leaderboard(int) from public;
revoke all on function public.kv_submit(text, text, text, int, int, int, int, int) from public;
grant execute on function public.kv_leaderboard(int) to anon, authenticated;
grant execute on function public.kv_submit(text, text, text, int, int, int, int, int) to anon, authenticated;
