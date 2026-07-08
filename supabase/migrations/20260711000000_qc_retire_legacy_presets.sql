-- Retire the legacy 'p#' saying-preset ids. Pre-character builds stored
-- p1..p8 picks; the frontend no longer resolves them (cleanup 2026-07-07,
-- zero users existed), so the trigger stops accepting them too. Sayings
-- values must now be character ids (frontend/src/characters/
-- characterCatalog.js); unknown ids are harmless (clients render the
-- default character's line), but free accounts may only reference the
-- starter roster. Applied by the GitHub integration; re-runnable.

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
