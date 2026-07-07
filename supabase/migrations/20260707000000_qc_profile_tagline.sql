-- Premium profile customization: tagline column + server-side enforcement
-- that avatar/tagline edits are paid-tier only (the qc-avatars bucket already
-- enforces paid on upload; this covers the profile columns themselves).
-- Applied by the Supabase GitHub integration on merge to main; re-runnable.

alter table public.qc_profiles
  add column if not exists tagline text;

-- Keep taglines short enough for the player bar.
alter table public.qc_profiles
  drop constraint if exists qc_profiles_tagline_len;
alter table public.qc_profiles
  add constraint qc_profiles_tagline_len check (tagline is null or char_length(tagline) <= 80);

-- Column grants: the billing migration revoked blanket update; re-grant the
-- client-editable set, now including tagline (tier/stripe ids stay locked).
grant update (username, avatar_url, tagline, rating, games_played)
  on public.qc_profiles to authenticated;

-- Paid-only enforcement for avatar_url/tagline. Runs for regular users;
-- the service role bypasses it via the OLD-tier check only when the row is
-- already paid — comps via SQL Editor (service role) set tier first.
create or replace function public.qc_enforce_premium_profile_fields()
returns trigger language plpgsql as $$
begin
  if (new.tagline is distinct from old.tagline
      or new.avatar_url is distinct from old.avatar_url)
     and old.tier <> 'paid' then
    raise exception 'Custom profile pic and tagline are premium features.';
  end if;
  return new;
end $$;

drop trigger if exists qc_premium_profile_fields on public.qc_profiles;
create trigger qc_premium_profile_fields
  before update on public.qc_profiles
  for each row execute function public.qc_enforce_premium_profile_fields();
