-- Quantum Chess account schema.
-- Run once: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Tables are qc_-prefixed so they coexist with your other project.

-- ---------------------------------------------------------------- profiles
create table if not exists public.qc_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  tier text not null default 'free' check (tier in ('free', 'paid')),
  rating integer not null default 1200,
  games_played integer not null default 0,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.qc_profiles enable row level security;

-- Usernames are unique, case-insensitively.
create unique index if not exists qc_profiles_username_unique
  on public.qc_profiles (lower(username));

drop policy if exists "qc_profiles_select_own" on public.qc_profiles;
drop policy if exists "qc_profiles_insert_own" on public.qc_profiles;
drop policy if exists "qc_profiles_update_own" on public.qc_profiles;
create policy "qc_profiles_select_own" on public.qc_profiles
  for select using (auth.uid() = id);
create policy "qc_profiles_insert_own" on public.qc_profiles
  for insert with check (auth.uid() = id);
create policy "qc_profiles_update_own" on public.qc_profiles
  for update using (auth.uid() = id);

-- Pre-signup availability check, callable by anyone. Exposes only a boolean,
-- never profile rows.
create or replace function public.qc_username_available(name text)
returns boolean language sql security definer set search_path = public as $$
  select not exists (
    select 1 from public.qc_profiles where lower(username) = lower(trim(name))
  );
$$;
grant execute on function public.qc_username_available(text) to anon, authenticated;

-- Auto-create a profile at signup. The chosen username arrives in the signup
-- metadata; the email local part is only a fallback, and collisions get a
-- random suffix so signup itself can never fail on uniqueness.
create or replace function public.qc_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(coalesce(new.email, 'player'), '@', 1)
  );
  begin
    insert into public.qc_profiles (id, username)
    values (new.id, uname)
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.qc_profiles (id, username)
    values (new.id, uname || '-' || substr(md5(random()::text), 1, 4))
    on conflict (id) do nothing;
  end;
  return new;
end $$;

drop trigger if exists qc_on_auth_user_created on auth.users;
create trigger qc_on_auth_user_created
  after insert on auth.users
  for each row execute function public.qc_handle_new_user();

-- ------------------------------------------------------------------- games
create table if not exists public.qc_games (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  opponent text,
  opponent_rating integer,
  user_side text check (user_side in ('white', 'black')),
  result text check (result in ('win', 'loss', 'draw')),
  rating_before integer,
  rating_after integer,
  moves jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qc_games_user_created
  on public.qc_games (user_id, created_at desc);

alter table public.qc_games enable row level security;

drop policy if exists "qc_games_select_own" on public.qc_games;
drop policy if exists "qc_games_insert_own" on public.qc_games;
drop policy if exists "qc_games_delete_own" on public.qc_games;
create policy "qc_games_select_own" on public.qc_games
  for select using (auth.uid() = user_id);
create policy "qc_games_insert_own" on public.qc_games
  for insert with check (auth.uid() = user_id);
create policy "qc_games_delete_own" on public.qc_games
  for delete using (auth.uid() = user_id);

-- Retention: keep the newest 10 games (free) or 1000 (paid), enforced in
-- the database so the client cannot dodge it.
create or replace function public.qc_trim_games()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer;
begin
  select case when tier = 'paid' then 1000 else 10 end
    into cap from public.qc_profiles where id = new.user_id;
  if cap is null then cap := 10; end if;
  delete from public.qc_games
  where user_id = new.user_id
    and id not in (
      select id from public.qc_games
      where user_id = new.user_id
      order by created_at desc, id desc
      limit cap
    );
  return new;
end $$;

drop trigger if exists qc_trim_games_after_insert on public.qc_games;
create trigger qc_trim_games_after_insert
  after insert on public.qc_games
  for each row execute function public.qc_trim_games();

-- ------------------------------------------------------- avatars (paid tier)
insert into storage.buckets (id, name, public)
values ('qc-avatars', 'qc-avatars', true)
on conflict (id) do nothing;

drop policy if exists "qc_avatars_public_read" on storage.objects;
drop policy if exists "qc_avatars_paid_insert" on storage.objects;
drop policy if exists "qc_avatars_paid_update" on storage.objects;
create policy "qc_avatars_public_read" on storage.objects
  for select using (bucket_id = 'qc-avatars');

create policy "qc_avatars_paid_insert" on storage.objects
  for insert with check (
    bucket_id = 'qc-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
    and exists (
      select 1 from public.qc_profiles p
      where p.id = auth.uid() and p.tier = 'paid'
    )
  );

create policy "qc_avatars_paid_update" on storage.objects
  for update using (
    bucket_id = 'qc-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'qc-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Notes:
-- * Flip a user to paid manually until Stripe is wired:
--     update public.qc_profiles set tier = 'paid' where id = '<user uuid>';
-- * Ratings are client-reported for bot games (documented tradeoff);
--   move to an Edge Function before adding a public leaderboard.
