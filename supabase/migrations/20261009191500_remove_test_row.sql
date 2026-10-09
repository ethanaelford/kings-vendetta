-- remove the row created while testing the leaderboard
delete from public.kv_players where client_id = 'testclient01';
