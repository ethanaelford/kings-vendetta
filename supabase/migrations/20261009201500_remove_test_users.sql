-- remove accounts created while testing sign-in (their cloud saves cascade)
delete from auth.users where email like 'zztest%@players.kingsvendetta.app';
