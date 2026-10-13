-- Web push subscriptions for "your turn" notifications. Locked table: only the functions below and the
-- `notify` edge function (service role) can touch it.
create table if not exists public.kv_push (
  client_id    text primary key check (char_length(client_id) between 8 and 40),
  secret_hash  text not null,
  subscription jsonb not null,
  last_sent    timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.kv_push enable row level security;
revoke all on public.kv_push from anon, authenticated;

-- Register (or refresh) this device's push subscription. The device secret must match on updates.
create or replace function public.kv_push_register(p_client_id text, p_secret text, p_subscription jsonb)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare existing kv_push%rowtype;
begin
  if p_secret is null or char_length(p_secret) < 16 or p_subscription->>'endpoint' is null then return false; end if;
  select * into existing from kv_push where client_id = p_client_id;
  if not found then
    insert into kv_push (client_id, secret_hash, subscription) values (p_client_id, crypt(p_secret, gen_salt('bf')), p_subscription);
    return true;
  end if;
  if existing.secret_hash <> crypt(p_secret, existing.secret_hash) then return false; end if;
  update kv_push set subscription = p_subscription, updated_at = now() where client_id = p_client_id;
  return true;
end;
$$;

create or replace function public.kv_push_unregister(p_client_id text, p_secret text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare existing kv_push%rowtype;
begin
  select * into existing from kv_push where client_id = p_client_id;
  if not found then return true; end if;
  if existing.secret_hash <> crypt(p_secret, existing.secret_hash) then return false; end if;
  delete from kv_push where client_id = p_client_id;
  return true;
end;
$$;

revoke all on function public.kv_push_register(text, text, jsonb) from public;
revoke all on function public.kv_push_unregister(text, text) from public;
grant execute on function public.kv_push_register(text, text, jsonb) to anon, authenticated;
grant execute on function public.kv_push_unregister(text, text) to anon, authenticated;
