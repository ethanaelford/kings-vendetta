-- My global position among ranked players (1 = best). Null if I have no ranked games yet.
create or replace function public.kv_rank(p_client_id text)
returns int
language sql security definer set search_path = public
as $$
  select case when me.client_id is null then null else (
    select count(*)::int + 1 from kv_players o
    where o.ranked_games > 0 and (o.rating > me.rating or (o.rating = me.rating and o.ranked_games > me.ranked_games)
      or (o.rating = me.rating and o.ranked_games = me.ranked_games and o.updated_at < me.updated_at))
  ) end
  from (select * from kv_players where client_id = p_client_id and ranked_games > 0) me
  right join (select 1) dummy on true;
$$;

revoke all on function public.kv_rank(text) from public;
grant execute on function public.kv_rank(text) to anon, authenticated;
