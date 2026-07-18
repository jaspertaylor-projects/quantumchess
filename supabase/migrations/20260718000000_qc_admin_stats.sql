-- Admin account level + site stats tables.
-- Applied automatically by the Supabase GitHub integration on merge to main;
-- also safe to paste into the SQL Editor manually (fully re-runnable).
--
-- Admin is a boolean on the profile, independent of tier, so an admin can
-- also be a paying subscriber. Nothing client-side grants it; promote by
-- hand in the SQL Editor:
--   update public.qc_profiles set is_admin = true
--   where lower(username) = lower('<your username>');

-- ------------------------------------------------------------------ admin flag
alter table public.qc_profiles
  add column if not exists is_admin boolean not null default false;

-- True iff the calling user's profile is flagged admin. SECURITY DEFINER so
-- policies on OTHER tables can consult qc_profiles without tripping its RLS.
create or replace function public.qc_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.qc_profiles where id = auth.uid()),
    false
  );
$$;
grant execute on function public.qc_is_admin() to authenticated;

-- Admins can read every profile (for account counts on the stats dashboard).
-- Regular users keep the existing select-own policy; policies are OR-ed.
drop policy if exists "qc_profiles_select_admin" on public.qc_profiles;
create policy "qc_profiles_select_admin" on public.qc_profiles
  for select using (public.qc_is_admin());

-- --------------------------------------------------------- concurrency samples
-- One row per sampler tick (backend writes via the service role, which
-- bypasses RLS; there is deliberately NO insert/update/delete policy).
-- players_online counts distinct live matchmaking clients; active_games is
-- rooms with both seats filled. Peaks over a window are derived with max().
create table if not exists public.qc_stat_snapshots (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  queued integer not null default 0,
  rooms integer not null default 0,
  open_rooms integer not null default 0,
  active_games integer not null default 0,
  players_online integer not null default 0
);

create index if not exists qc_stat_snapshots_at on public.qc_stat_snapshots (at desc);

alter table public.qc_stat_snapshots enable row level security;

drop policy if exists "qc_stat_snapshots_select_admin" on public.qc_stat_snapshots;
create policy "qc_stat_snapshots_select_admin" on public.qc_stat_snapshots
  for select using (public.qc_is_admin());

-- ------------------------------------------------------------- finished games
-- Every finished game, bot and online. Online rows come from the relay's
-- exactly-once game-over broadcast; bot rows from a client ping (best-effort
-- and unauthenticated, so treat bot counts as approximate). Service-role
-- writes only; admin reads only.
create table if not exists public.qc_finished_games (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  mode text not null check (mode in ('online', 'bot')),
  -- online: 'white' | 'black' | 'draw' | 'void'; bot: 'win' | 'loss' | 'draw' | 'unknown'
  result text not null,
  end_reason text,
  move_count integer not null default 0,
  bot_id text,
  bot_tier text
);

create index if not exists qc_finished_games_at on public.qc_finished_games (at desc);
create index if not exists qc_finished_games_mode_at on public.qc_finished_games (mode, at desc);

alter table public.qc_finished_games enable row level security;

drop policy if exists "qc_finished_games_select_admin" on public.qc_finished_games;
create policy "qc_finished_games_select_admin" on public.qc_finished_games
  for select using (public.qc_is_admin());
