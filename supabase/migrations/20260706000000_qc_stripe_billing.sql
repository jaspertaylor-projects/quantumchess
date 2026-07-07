-- Stripe billing wiring for the premium tier ($3/mo).
-- Applied automatically by the Supabase GitHub integration on merge to main;
-- also safe to paste into the SQL Editor manually (fully re-runnable).

-- ------------------------------------------------- profiles: stripe columns
alter table public.qc_profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists qc_profiles_stripe_customer_unique
  on public.qc_profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- ------------------------------------------- lock tier against self-service
-- The qc_profiles_update_own RLS policy lets a user update their own row,
-- which until now included `tier`. With money attached, tier (and the stripe
-- columns) must only ever be written by the service role (webhook function).
-- Column-level grants compose with RLS: the row must still be their own, AND
-- the column must be in this list.
revoke update on public.qc_profiles from authenticated;
grant update (username, avatar_url, rating, games_played)
  on public.qc_profiles to authenticated;

-- --------------------------------------------- webhook event de-duplication
-- Stripe retries webhooks; processing must be idempotent. The webhook
-- function inserts the event id here and skips events it has already seen.
-- Service-role access only (RLS on, no policies).
create table if not exists public.qc_stripe_events (
  id text primary key,           -- Stripe event id (evt_...)
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.qc_stripe_events enable row level security;

-- Notes:
-- * tier is flipped by the stripe-webhook Edge Function using the service
--   role key: checkout.session.completed -> 'paid',
--   customer.subscription.deleted -> 'free'.
-- * Manual comp still works via the SQL Editor (runs as service role).
