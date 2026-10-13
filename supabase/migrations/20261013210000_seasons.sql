-- Monthly seasons: the leaderboard shows the current season only.
alter table public.kv_players add column if not exists season text not null default '';
alter table public.kv_players add column if not exists season_games int not null default 0;

-- Season-aware submit (the old 8-argument version stays for older app builds).
-- A new season allows the soft reset (rating moving back toward 1000).
create or replace function public.kv_submit(
  p_client_id text, p_secret text, p_name text, p_rating int,
  p_wins int, p_losses int, p_draws int, p_ranked_games int, p_season text, p_season_games int)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare
  existing kv_players%rowtype;
  clean_name text := left(regexp_replace(coalesce(p_name, 'Player'), '[^[:alnum:] ._''-]', '', 'g'), 16);
begin
  if p_secret is null or char_length(p_secret) < 16 then return false; end if;
  if p_rating < 0 or p_rating > 4000 then return false; end if;
  if p_season is null or p_season !~ '^[0-9]{4}-[0-9]{2}$' then return false; end if;
  if clean_name = '' then clean_name := 'Player'; end if;

  select * into existing from kv_players where client_id = p_client_id;
  if not found then
    insert into kv_players (client_id, secret_hash, name, rating, wins, losses, draws, ranked_games, season, season_games)
    values (p_client_id, crypt(p_secret, gen_salt('bf')), clean_name, p_rating,
            greatest(p_wins, 0), greatest(p_losses, 0), greatest(p_draws, 0), greatest(p_ranked_games, 0), p_season, greatest(p_season_games, 0));
    return true;
  end if;

  if existing.secret_hash <> crypt(p_secret, existing.secret_hash) then return false; end if;
  if existing.season = p_season then
    if abs(p_rating - existing.rating) > 64 * greatest(p_ranked_games - existing.ranked_games, 1) then return false; end if;
  else
    -- new season: only allow moving toward 1000 (soft reset), plus normal play since
    if abs(p_rating - 1000) > abs(existing.rating - 1000) + 64 * greatest(p_season_games, 1) then return false; end if;
  end if;

  update kv_players set
    name = clean_name, rating = p_rating,
    wins = greatest(p_wins, 0), losses = greatest(p_losses, 0), draws = greatest(p_draws, 0),
    ranked_games = greatest(p_ranked_games, 0), season = p_season, season_games = greatest(p_season_games, 0), updated_at = now()
  where client_id = p_client_id;
  return true;
end;
$$;

create or replace function public.kv_leaderboard_season(p_season text, p_limit int default 100)
returns table (client_id text, name text, rating int, wins int, losses int, draws int, ranked_games int, season_games int, updated_at timestamptz)
language sql security definer set search_path = public
as $$
  select client_id, name, rating, wins, losses, draws, ranked_games, season_games, updated_at
  from kv_players
  where season = p_season and season_games > 0
  order by rating desc, season_games desc, updated_at asc
  limit least(greatest(p_limit, 1), 200);
$$;

create or replace function public.kv_rank_season(p_client_id text, p_season text)
returns int
language sql security definer set search_path = public
as $$
  select case when me.client_id is null then null else (
    select count(*)::int + 1 from kv_players o
    where o.season = p_season and o.season_games > 0
      and (o.rating > me.rating or (o.rating = me.rating and o.season_games > me.season_games)
        or (o.rating = me.rating and o.season_games = me.season_games and o.updated_at < me.updated_at))
  ) end
  from (select * from kv_players where client_id = p_client_id and season = p_season and season_games > 0) me
  right join (select 1) dummy on true;
$$;

revoke all on function public.kv_submit(text, text, text, int, int, int, int, int, text, int) from public;
revoke all on function public.kv_leaderboard_season(text, int) from public;
revoke all on function public.kv_rank_season(text, text) from public;
grant execute on function public.kv_submit(text, text, text, int, int, int, int, int, text, int) to anon, authenticated;
grant execute on function public.kv_leaderboard_season(text, int) to anon, authenticated;
grant execute on function public.kv_rank_season(text, text) to anon, authenticated;
