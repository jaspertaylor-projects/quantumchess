-- Event-triggered sayings on player profiles.
-- Shape: { "win": "p2", "loss": "p1", "draw": "p4", "capture": "p1",
--          "collapse": "custom text (premium only)" }
-- Values are either preset ids (p1..p99, allowed for everyone) or free-form
-- custom text (premium only). Applied by the GitHub integration; re-runnable.

alter table public.qc_profiles
  add column if not exists sayings jsonb;

grant update (username, avatar_url, tagline, rating, games_played, sayings)
  on public.qc_profiles to authenticated;

-- Extends the premium-fields trigger from 20260707000000: avatar/tagline
-- stay paid-only, and sayings get structural validation for everyone plus
-- a custom-text restriction for free tier.
create or replace function public.qc_enforce_premium_profile_fields()
returns trigger language plpgsql as $$
declare
  entry record;
begin
  if (new.tagline is distinct from old.tagline
      or new.avatar_url is distinct from old.avatar_url)
     and old.tier <> 'paid' then
    raise exception 'Custom profile pic and tagline are premium features.';
  end if;

  if new.sayings is distinct from old.sayings and new.sayings is not null then
    if jsonb_typeof(new.sayings) <> 'object' then
      raise exception 'sayings must be an object';
    end if;
    for entry in select key, value from jsonb_each(new.sayings) loop
      if entry.key not in ('win', 'loss', 'draw', 'capture', 'collapse') then
        raise exception 'unknown sayings event: %', entry.key;
      end if;
      if jsonb_typeof(entry.value) <> 'string' then
        raise exception 'sayings values must be strings';
      end if;
      if char_length(entry.value #>> '{}') > 120 then
        raise exception 'sayings are capped at 120 characters';
      end if;
      if old.tier <> 'paid' and (entry.value #>> '{}') !~ '^p[0-9]{1,2}$' then
        raise exception 'Custom sayings are a premium feature.';
      end if;
    end loop;
  end if;

  return new;
end $$;

-- Trigger already exists from the previous migration; recreate to be safe.
drop trigger if exists qc_premium_profile_fields on public.qc_profiles;
create trigger qc_premium_profile_fields
  before update on public.qc_profiles
  for each row execute function public.qc_enforce_premium_profile_fields();
