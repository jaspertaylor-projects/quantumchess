-- Character-roster sayings: profile sayings are picked from the character
-- catalog (frontend/src/characters/characterCatalog.js), never typed.
-- Values are character ids; legacy preset ids (p1..p99) stay valid for old
-- saves. Free tier is limited to the starter roster; premium may pick any
-- character. Free-form custom text is retired for ALL tiers (a paid
-- account writing prose via the API now fails validation too — the client
-- only renders catalog lines regardless). Tagline stays premium-only and
-- free-text at the DB layer for now: the client constrains it to catalog
-- taglines, and hardening it to ids needs a qc_characters table (planned
-- alongside quest unlocks). Applied by the GitHub integration; re-runnable.

create or replace function public.qc_enforce_premium_profile_fields()
returns trigger language plpgsql as $$
declare
  entry record;
  v text;
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
      v := entry.value #>> '{}';
      -- Legacy presets from pre-character builds remain valid for everyone.
      if v ~ '^p[0-9]{1,2}$' then
        continue;
      end if;
      -- Otherwise the value must look like a character id. Unknown ids are
      -- harmless (clients render the default character's line), but free
      -- accounts may only reference the starter roster.
      if v !~ '^[a-z0-9-]{2,64}$' then
        raise exception 'sayings must reference a character';
      end if;
      if old.tier <> 'paid' and v not in (
        'human-01','human-02','human-03','human-04','human-05',
        'human-06','human-07','human-08','human-09','human-10',
        'pawn','knight','bishop','rook','queen','king'
      ) then
        raise exception 'That character is a premium unlock.';
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
