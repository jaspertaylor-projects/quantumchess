-- Run only in a disposable PostgreSQL database. Fixtures and roles roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.qc_profiles (
  id uuid primary key, username text, tier text not null default 'free',
  stripe_customer_id text unique, stripe_subscription_id text, ad_free_until timestamptz
);
create table public.qc_stripe_events (id text primary key, type text not null, received_at timestamptz default now());
grant select on public.qc_profiles to authenticated;
revoke update on public.qc_profiles from authenticated;
grant update(username) on public.qc_profiles to authenticated;
insert into public.qc_profiles(id,tier,ad_free_until) values
 ('00000000-0000-0000-0000-000000000001','paid',null),
 ('00000000-0000-0000-0000-000000000002','free','2020-01-01'),
 ('00000000-0000-0000-0000-000000000003','free',null);
\ir ../migrations/20260908000000_qc_permanent_premium.sql

do $$
declare first_attempt jsonb; second_attempt jsonb; original_time timestamptz;
begin
  assert (select count(*) from public.qc_profiles where tier='paid' and premium_unlocked_at is not null) = 2,
    'Existing subscribers and expired tippers must retain access';
  assert not has_function_privilege('authenticated','public.qc_reserve_premium_checkout(uuid)','execute');
  assert not has_function_privilege('anon','public.qc_grant_permanent_premium(text,text,uuid,text)','execute');
  assert not has_column_privilege('authenticated','public.qc_profiles','premium_unlocked_at','update');
  assert not has_column_privilege('authenticated','public.qc_profiles','premium_checkout_key','update');
  first_attempt := public.qc_reserve_premium_checkout('00000000-0000-0000-0000-000000000003');
  second_attempt := public.qc_reserve_premium_checkout('00000000-0000-0000-0000-000000000003');
  assert first_attempt = second_attempt, 'Repeat requests must reuse the payment attempt';
  update public.qc_profiles set premium_checkout_expires_at=now()-interval '1 second' where id='00000000-0000-0000-0000-000000000003';
  second_attempt := public.qc_reserve_premium_checkout('00000000-0000-0000-0000-000000000003');
  assert first_attempt->>'key' <> second_attempt->>'key', 'Expired sessions get a new attempt';
  assert public.qc_grant_permanent_premium('evt_test','checkout.session.completed','00000000-0000-0000-0000-000000000003','cus_test');
  select premium_unlocked_at into original_time from public.qc_profiles where id='00000000-0000-0000-0000-000000000003';
  assert original_time is not null;
  assert not public.qc_grant_permanent_premium('evt_test','checkout.session.completed','00000000-0000-0000-0000-000000000003','cus_test');
  assert public.qc_grant_permanent_premium('evt_async','checkout.session.async_payment_succeeded','00000000-0000-0000-0000-000000000003','cus_test');
  assert (select premium_unlocked_at from public.qc_profiles where id='00000000-0000-0000-0000-000000000003') = original_time;
  begin
    perform public.qc_reserve_premium_checkout('00000000-0000-0000-0000-000000000003');
    raise exception 'Paid account was offered another checkout';
  exception when raise_exception then
    assert sqlerrm = 'Premium is already unlocked';
  end;
  begin
    perform public.qc_grant_permanent_premium('evt_missing','checkout.session.completed','00000000-0000-0000-0000-000000000004','cus_missing');
    raise exception 'Missing account incorrectly fulfilled';
  exception when raise_exception then
    assert sqlerrm = 'Account not found';
  end;
  assert not exists(select 1 from public.qc_stripe_events where id='evt_missing'), 'Failed grants must remain retryable';
end $$;
rollback;
