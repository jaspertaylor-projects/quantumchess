-- One-time tip support: a $5 tip turns ads off for 90 days without a
-- subscription. The stripe-webhook Edge Function (service role) is the only
-- writer of ad_free_until — it is deliberately NOT in the authenticated
-- column-update grant (see the billing/tagline/sayings migrations), so
-- clients can read it but never set it.
-- Applied by the Supabase GitHub integration on merge to main; re-runnable.

alter table public.qc_profiles
  add column if not exists ad_free_until timestamptz;

-- Notes:
-- * stripe-checkout creates the session with mode='payment' and
--   metadata.qc_kind='tip'; on checkout.session.completed the webhook
--   extends ad_free_until to greatest(now, ad_free_until) + 90 days, so
--   repeat tips stack rather than overwrite.
-- * The client treats a user as ad-free when tier = 'paid' OR
--   ad_free_until > now() (see frontend/src/account/billing.js isAdFree).
