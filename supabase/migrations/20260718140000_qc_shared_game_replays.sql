-- Public saved-game replays without opening qc_games to anonymous reads.
-- Owners explicitly opt one game into sharing; the UUID is the capability.

alter table public.qc_games
  add column if not exists share_token uuid unique,
  add column if not exists shared_at timestamptz;

create or replace function public.qc_share_game(p_game_id bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  token uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  update public.qc_games
     set share_token = gen_random_uuid(),
           shared_at = now()
   where id = p_game_id
     and user_id = auth.uid()
     and share_token is null
  returning share_token into token;

  -- Idempotent and race-safe: a repeat request (or the loser of two
  -- simultaneous requests) receives the token already stored on the row.
  if token is null then
    select g.share_token
      into token
      from public.qc_games g
     where g.id = p_game_id
       and g.user_id = auth.uid();
  end if;

  if token is null then
    raise exception 'game_not_found';
  end if;

  return token;
end;
$$;

revoke all on function public.qc_share_game(bigint) from public;
grant execute on function public.qc_share_game(bigint) to authenticated;

-- Return only replay-safe fields. Email, user id, subscription state, and
-- every other game owned by the player remain protected by RLS.
create or replace function public.qc_get_shared_game(p_share_token uuid)
returns table (
  id bigint,
  opponent text,
  opponent_rating integer,
  user_side text,
  result text,
  rating_before integer,
  rating_after integer,
  moves jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.opponent,
    g.opponent_rating,
    g.user_side,
    g.result,
    g.rating_before,
    g.rating_after,
    g.moves,
    g.created_at
  from public.qc_games g
  where g.share_token = p_share_token
  limit 1;
$$;

revoke all on function public.qc_get_shared_game(uuid) from public;
grant execute on function public.qc_get_shared_game(uuid) to anon, authenticated;
