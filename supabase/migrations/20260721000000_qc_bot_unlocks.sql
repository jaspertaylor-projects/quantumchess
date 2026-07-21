-- Branching bot progression: one row per opponent a player chooses after a
-- bot win. Clears remain in qc_bot_progress; access tier remains on the
-- account. Keeping these three concerns separate lets a win offer a paid bot
-- without silently granting the paid entitlement.

create table if not exists public.qc_bot_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, bot_id)
);

create index if not exists qc_bot_unlocks_user_unlocked
  on public.qc_bot_unlocks (user_id, unlocked_at desc);

alter table public.qc_bot_unlocks enable row level security;

drop policy if exists "qc_bot_unlocks_select_own" on public.qc_bot_unlocks;
drop policy if exists "qc_bot_unlocks_insert_own" on public.qc_bot_unlocks;
create policy "qc_bot_unlocks_select_own" on public.qc_bot_unlocks
  for select using (auth.uid() = user_id);
create policy "qc_bot_unlocks_insert_own" on public.qc_bot_unlocks
  for insert with check (auth.uid() = user_id);
