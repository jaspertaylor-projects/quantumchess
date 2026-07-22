-- One authoritative online ranked match, projected into both players' saved
-- game histories. The API service role is the only caller allowed to finalize.

create table if not exists public.qc_ranked_matches (
  id bigint generated always as identity primary key,
  room_id text not null unique,
  white_user_id uuid not null references auth.users(id) on delete cascade,
  black_user_id uuid not null references auth.users(id) on delete cascade,
  white_username text not null,
  black_username text not null,
  result text not null check (result in ('white', 'black', 'draw', 'void')),
  end_reason text not null,
  white_rating_before integer not null,
  white_rating_after integer not null,
  black_rating_before integer not null,
  black_rating_after integer not null,
  moves jsonb not null default '[]'::jsonb,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  check (white_user_id <> black_user_id)
);

alter table public.qc_ranked_matches enable row level security;
revoke all on public.qc_ranked_matches from anon, authenticated;

alter table public.qc_games
  add column if not exists ranked_match_id bigint
    references public.qc_ranked_matches(id) on delete cascade;

create index if not exists qc_games_ranked_match
  on public.qc_games (ranked_match_id)
  where ranked_match_id is not null;

create or replace function public.qc_finalize_ranked_match(
  p_room_id text,
  p_white_user_id uuid,
  p_black_user_id uuid,
  p_result text,
  p_end_reason text,
  p_moves jsonb,
  p_started_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.qc_ranked_matches%rowtype;
  match_id bigint;
  white_before integer;
  black_before integer;
  white_after integer;
  black_after integer;
  white_name text;
  black_name text;
  white_score numeric;
  white_expected numeric;
  delta integer;
  is_rated boolean;
begin
  if p_room_id is null or trim(p_room_id) = '' then
    raise exception 'room_id_required';
  end if;
  if p_white_user_id is null or p_black_user_id is null
     or p_white_user_id = p_black_user_id then
    raise exception 'invalid_players';
  end if;
  if p_result not in ('white', 'black', 'draw', 'void') then
    raise exception 'invalid_result';
  end if;

  -- Makes retries and simultaneous terminal reports idempotent.
  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 0));
  select * into existing
    from public.qc_ranked_matches
   where room_id = p_room_id;
  if found then
    return jsonb_build_object(
      'match_id', existing.id,
      'rated', existing.result <> 'void',
      'white_rating_before', existing.white_rating_before,
      'white_rating_after', existing.white_rating_after,
      'black_rating_before', existing.black_rating_before,
      'black_rating_after', existing.black_rating_after
    );
  end if;

  -- Deterministic row-lock order prevents deadlocks if either player somehow
  -- finishes two rooms at almost the same instant.
  perform 1 from public.qc_profiles
   where id in (p_white_user_id, p_black_user_id)
   order by id
   for update;

  select rating, coalesce(nullif(trim(username), ''), 'Player')
    into white_before, white_name
    from public.qc_profiles where id = p_white_user_id;
  select rating, coalesce(nullif(trim(username), ''), 'Player')
    into black_before, black_name
    from public.qc_profiles where id = p_black_user_id;
  if white_before is null or black_before is null then
    raise exception 'player_profile_missing';
  end if;

  is_rated := p_result <> 'void';
  white_after := white_before;
  black_after := black_before;
  if is_rated then
    white_score := case p_result when 'white' then 1.0 when 'draw' then 0.5 else 0.0 end;
    white_expected := 1.0 / (1.0 + power(10.0, (black_before - white_before)::numeric / 400.0));
    delta := round(32.0 * (white_score - white_expected))::integer;
    white_after := white_before + delta;
    black_after := black_before - delta;

    update public.qc_profiles
       set rating = white_after, games_played = games_played + 1
     where id = p_white_user_id;
    update public.qc_profiles
       set rating = black_after, games_played = games_played + 1
     where id = p_black_user_id;
  end if;

  insert into public.qc_ranked_matches (
    room_id, white_user_id, black_user_id, white_username, black_username,
    result, end_reason, white_rating_before, white_rating_after,
    black_rating_before, black_rating_after, moves, started_at
  ) values (
    p_room_id, p_white_user_id, p_black_user_id, white_name, black_name,
    p_result, left(coalesce(p_end_reason, 'rules'), 64), white_before, white_after,
    black_before, black_after, coalesce(p_moves, '[]'::jsonb), coalesce(p_started_at, now())
  ) returning id into match_id;

  -- Voided rooms are retained for operations/auditing but are not games in a
  -- player's history and do not affect Elo or games_played.
  if is_rated then
    insert into public.qc_games (
      user_id, opponent, opponent_rating, user_side, result,
      rating_before, rating_after, moves, ranked_match_id, created_at
    ) values
    (
      p_white_user_id, black_name, black_before, 'white',
      case p_result when 'white' then 'win' when 'black' then 'loss' else 'draw' end,
      white_before, white_after, null, match_id, now()
    ),
    (
      p_black_user_id, white_name, white_before, 'black',
      case p_result when 'black' then 'win' when 'white' then 'loss' else 'draw' end,
      black_before, black_after, null, match_id, now()
    );
  end if;

  return jsonb_build_object(
    'match_id', match_id,
    'rated', is_rated,
    'white_rating_before', white_before,
    'white_rating_after', white_after,
    'black_rating_before', black_before,
    'black_rating_after', black_after
  );
end;
$$;

revoke all on function public.qc_finalize_ranked_match(text, uuid, uuid, text, text, jsonb, timestamptz) from public;
grant execute on function public.qc_finalize_ranked_match(text, uuid, uuid, text, text, jsonb, timestamptz) to service_role;

-- Owners fetch either ordinary client-saved moves or the canonical ranked
-- move stream through one API.
create or replace function public.qc_get_game_moves(p_game_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(g.moves, m.moves)
    from public.qc_games g
    left join public.qc_ranked_matches m on m.id = g.ranked_match_id
   where g.id = p_game_id and g.user_id = auth.uid()
   limit 1;
$$;

revoke all on function public.qc_get_game_moves(bigint) from public;
grant execute on function public.qc_get_game_moves(bigint) to authenticated;

-- Preserve opt-in share links for both ordinary and canonical ranked games.
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
    coalesce(g.moves, m.moves),
    g.created_at
  from public.qc_games g
  left join public.qc_ranked_matches m on m.id = g.ranked_match_id
  where g.share_token = p_share_token
  limit 1;
$$;

revoke all on function public.qc_get_shared_game(uuid) from public;
grant execute on function public.qc_get_shared_game(uuid) to anon, authenticated;
