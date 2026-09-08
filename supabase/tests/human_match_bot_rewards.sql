-- Disposable database only; all fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.qc_profiles (id uuid primary key, tier text);
create table public.qc_bot_unlocks (user_id uuid references auth.users(id), bot_id text, primary key(user_id,bot_id));
create table public.qc_bot_progress (user_id uuid, bot_id text);
create table public.qc_games (user_id uuid, opponent text, result text);
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into qc_profiles values ('00000000-0000-0000-0000-000000000001','free'), ('00000000-0000-0000-0000-000000000002','paid');
insert into qc_bot_progress values ('00000000-0000-0000-0000-000000000001','emmy-menchik');
insert into qc_games values ('00000000-0000-0000-0000-000000000001','boris-bohr','win');
\ir ../migrations/20260908010000_qc_human_match_bot_rewards.sql
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare first_bot text; next_bot text; total integer;
begin
  assert not has_function_privilege('anon','public.qc_award_human_match_bot(text)','execute');
  assert has_function_privilege('authenticated','public.qc_award_human_match_bot(text)','execute');
  assert not has_table_privilege('authenticated','public.qc_human_match_bot_rewards','insert');
  assert (select count(*) from qc_bot_unlocks) = 2, 'Preserve prior clear and legacy win';
  first_bot := qc_award_human_match_bot('online:first');
  assert first_bot = 'galileo-greco', 'Skip an already earned bot';
  assert qc_award_human_match_bot('online:first') = first_bot, 'Duplicate must return original reward';
  assert (select count(*) from qc_bot_unlocks) = 3;
  assert qc_award_human_match_bot('local:second') = 'wolfgang-nimzowitsch';
  assert qc_award_human_match_bot('local:third') = 'marie-lane', 'Skip legacy game win too';
  for total in 4..9 loop
    next_bot := qc_award_human_match_bot('local:' || total);
    assert next_bot is not null;
  end loop;
  assert (select count(*) from qc_bot_unlocks) = 11;
  assert qc_award_human_match_bot('local:exhausted') is null;
  assert qc_award_human_match_bot('local:exhausted') is null;
  assert qc_award_human_match_bot('online:first') = first_bot;
  assert not exists(select 1 from qc_bot_unlocks where bot_id in ('enrico-capablanca','rudolf-einstein'));
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$ begin
  assert qc_award_human_match_bot('online:first') = 'emmy-menchik', 'Premium still earns bots; opponent receives own award for same room';
  assert (select count(*) from qc_bot_unlocks where user_id=auth.uid()) = 1;
  begin
    perform qc_award_human_match_bot('');
    raise exception 'Accepted an empty key';
  exception when raise_exception then assert sqlerrm = 'Invalid match identifier'; end;
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform qc_award_human_match_bot('anonymous');
    raise exception 'Accepted anonymous RPC';
  exception when raise_exception then assert sqlerrm = 'Sign in required'; end;
end $$;
rollback;
