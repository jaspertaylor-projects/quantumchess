-- Append four earned bots without resetting unlocks or reopening old reward claims.
create or replace function public.qc_award_human_match_bot(p_match_key text)
returns text language plpgsql security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
  awarded_bot text;
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if p_match_key is null or length(p_match_key) not between 1 and 200 then
    raise exception 'Invalid match identifier';
  end if;
  -- Serialize both different matches and duplicate requests for this player.
  perform 1 from public.qc_profiles where id = caller for update;
  if not found then raise exception 'Account not found'; end if;
  select bot_id into awarded_bot from public.qc_human_match_bot_rewards
    where user_id = caller and match_key = p_match_key;
  if found then return awarded_bot; end if;

  select candidate.id into awarded_bot
  from unnest(array['emmy-menchik','galileo-greco','wolfgang-nimzowitsch','boris-bohr','marie-lane','freeman-morphy','david-feynman','edith-franklin','savielly-dirac','james-euwe','stephen-reti','vera-graf','efim-faraday','cecilia-chigorin','ernest-smyslov'])
    with ordinality as candidate(id, position)
  where not exists (select 1 from public.qc_bot_unlocks u where u.user_id = caller and u.bot_id = candidate.id)
    and not exists (select 1 from public.qc_bot_progress p where p.user_id = caller and p.bot_id = candidate.id)
  order by candidate.position limit 1;

  if awarded_bot is not null then
    insert into public.qc_bot_unlocks(user_id, bot_id) values (caller, awarded_bot)
      on conflict do nothing;
  end if;
  insert into public.qc_human_match_bot_rewards(user_id, match_key, bot_id)
    values(caller, p_match_key, awarded_bot);
  return awarded_bot;
end $$;
revoke all on function public.qc_award_human_match_bot(text) from public, anon;
grant execute on function public.qc_award_human_match_bot(text) to authenticated;
