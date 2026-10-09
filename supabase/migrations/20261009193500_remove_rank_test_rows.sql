-- remove rows created while testing ranks
delete from public.kv_players where client_id like 'zztest_%';
