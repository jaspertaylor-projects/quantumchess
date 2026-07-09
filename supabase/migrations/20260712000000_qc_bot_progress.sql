-- Bot ladder progression: one row per (user, bot) first clear. Beating a free
-- bot in a fair game marks it cleared and unlocks that bot's tagline/sayings
-- for the account. This stays in Supabase/Postgres because it is account
-- progression, not realtime relay state.

create table if not exists public.qc_bot_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id text not null,
  cleared_at timestamptz not null default now(),
  unlocked_flavor_at timestamptz not null default now(),
  primary key (user_id, bot_id)
);

create index if not exists qc_bot_progress_user_cleared
  on public.qc_bot_progress (user_id, cleared_at desc);

alter table public.qc_bot_progress enable row level security;

drop policy if exists "qc_bot_progress_select_own" on public.qc_bot_progress;
drop policy if exists "qc_bot_progress_insert_own" on public.qc_bot_progress;
drop policy if exists "qc_bot_progress_update_own" on public.qc_bot_progress;
create policy "qc_bot_progress_select_own" on public.qc_bot_progress
  for select using (auth.uid() = user_id);
create policy "qc_bot_progress_insert_own" on public.qc_bot_progress
  for insert with check (auth.uid() = user_id);
create policy "qc_bot_progress_update_own" on public.qc_bot_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
