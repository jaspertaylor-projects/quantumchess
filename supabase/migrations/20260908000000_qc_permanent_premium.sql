-- Two tiers: Free and a permanent Premium unlock. Billing writes remain
-- service-role only; authenticated clients have explicit column grants.
alter table public.qc_profiles
  add column if not exists premium_unlocked_at timestamptz,
  add column if not exists premium_checkout_key uuid,
  add column if not exists premium_checkout_expires_at timestamptz;

-- Honor everyone who previously subscribed or tipped, including expired tips.
update public.qc_profiles
set tier = 'paid', premium_unlocked_at = coalesce(premium_unlocked_at, now())
where tier = 'paid' or ad_free_until is not null;

-- Reserve one checkout attempt per account. Concurrent requests get the same
-- Stripe idempotency key and expiry; a replacement starts only after expiry.
create or replace function public.qc_reserve_premium_checkout(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.qc_profiles%rowtype;
begin
  select * into p from public.qc_profiles where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if p.tier = 'paid' then raise exception 'Premium is already unlocked'; end if;
  if p.premium_checkout_key is null or p.premium_checkout_expires_at <= now() then
    update public.qc_profiles
    set premium_checkout_key = gen_random_uuid(),
        premium_checkout_expires_at = date_trunc('second', now()) + interval '23 hours'
    where id = p_user_id returning * into p;
  end if;
  return jsonb_build_object('key', p.premium_checkout_key,
    'expires_at', extract(epoch from p.premium_checkout_expires_at)::bigint);
end $$;

-- Grant and record fulfillment in one transaction: a failed profile write
-- cannot leave an event marked complete, and concurrent deliveries are safe.
create or replace function public.qc_grant_permanent_premium(
  p_event_id text, p_event_type text, p_user_id uuid, p_customer_id text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.qc_stripe_events(id, type) values(p_event_id, p_event_type)
    on conflict (id) do nothing;
  if not found then return false; end if;
  update public.qc_profiles
  set tier = 'paid', premium_unlocked_at = coalesce(premium_unlocked_at, now()),
      stripe_customer_id = p_customer_id
  where id = p_user_id;
  if not found then raise exception 'Account not found'; end if;
  return true;
end $$;

revoke all on function public.qc_reserve_premium_checkout(uuid) from public, anon, authenticated;
revoke all on function public.qc_grant_permanent_premium(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.qc_reserve_premium_checkout(uuid) to service_role;
grant execute on function public.qc_grant_permanent_premium(text,text,uuid,text) to service_role;
