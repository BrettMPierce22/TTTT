-- Applied to TTTT on 2026-09-03 with explicit user approval; verified against the tested body.
-- Changes function behavior only; no data backfill. See docs/MATCH_TOURNAMENT_RELIABILITY_20260903.md.
create or replace function public.record_tournament_match(
  p_match_id uuid,
  p_score_a smallint,
  p_score_b smallint,
  p_game_scores jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_current_player uuid;
  v_winner uuid;
  v_loser uuid;
  v_needed smallint;
  v_reset_match public.tournament_matches%rowtype;
begin
  select * into v_match from public.tournament_matches
  where id = p_match_id for update;
  if v_match.id is null then raise exception 'Tournament match not found.'; end if;

  select * into v_tournament from public.tournaments
  where id = v_match.tournament_id for update;
  if v_tournament.status <> 'active' then raise exception 'This tournament is not active.'; end if;
  if v_match.status <> 'scheduled' then raise exception 'This match is not scheduled.'; end if;

  if exists (select 1 from public.tournament_matches source
    where (source.winner_next_match_id = v_match.id or source.loser_next_match_id = v_match.id)
      and source.status not in ('complete', 'cancelled')) then
    raise exception 'Wait for earlier matches to finish.';
  end if;

  v_current_player := public.tttt_active_player_id(v_tournament.league_id);
  if not public.tttt_can_manage_tournament(v_tournament.id) and not exists (
    select 1 from public.tournament_entries
    where tournament_entries.id in (v_match.player_a_entry_id, v_match.player_b_entry_id)
      and tournament_entries.player_id = v_current_player
  ) then
    raise exception 'Only a participant or tournament manager can record this score.';
  end if;

  if v_match.player_a_entry_id is null and v_match.player_b_entry_id is null then
    raise exception 'This match has no entrants.';
  elsif v_match.player_a_entry_id is null then
    v_winner := v_match.player_b_entry_id; v_loser := null;
    p_score_a := 0; p_score_b := 0;
  elsif v_match.player_b_entry_id is null then
    v_winner := v_match.player_a_entry_id; v_loser := null;
    p_score_a := 0; p_score_b := 0;
  else
    if p_score_a is null or p_score_b is null or p_score_a = p_score_b then
      raise exception 'Enter a final score with one winner.';
    end if;
    v_needed := (v_tournament.best_of + 1) / 2;
    if least(p_score_a, p_score_b) < 0 or greatest(p_score_a, p_score_b) <> v_needed then
      raise exception 'The winner needs exactly % game wins and scores cannot be negative.', v_needed;
    end if;
    if p_score_a > p_score_b then
      v_winner := v_match.player_a_entry_id; v_loser := v_match.player_b_entry_id;
    else
      v_winner := v_match.player_b_entry_id; v_loser := v_match.player_a_entry_id;
    end if;
  end if;

  update public.tournament_matches set
    winner_entry_id = v_winner, loser_entry_id = v_loser,
    score_a = p_score_a, score_b = p_score_b,
    game_scores = coalesce(p_game_scores, '[]'::jsonb),
    status = 'complete', completed_at = now()
  where id = p_match_id;

  if v_match.winner_next_match_id is not null then
    if v_match.winner_next_slot = 'a' then
      update public.tournament_matches set player_a_entry_id = v_winner
      where id = v_match.winner_next_match_id;
    else
      update public.tournament_matches set player_b_entry_id = v_winner
      where id = v_match.winner_next_match_id;
    end if;
  end if;

  if v_loser is not null and v_match.loser_next_match_id is not null then
    if v_match.loser_next_slot = 'a' then
      update public.tournament_matches set player_a_entry_id = v_loser
      where id = v_match.loser_next_match_id;
    else
      update public.tournament_matches set player_b_entry_id = v_loser
      where id = v_match.loser_next_match_id;
    end if;
  end if;

  if v_tournament.format = 'single_elimination'
     and v_match.bracket = 'winners'
     and v_match.winner_next_match_id is null then
    update public.tournament_entries set status = 'champion', final_place = 1
    where id = v_winner;
    if v_loser is not null then
      update public.tournament_entries set status = 'eliminated', final_place = 2
      where id = v_loser;
    end if;
    if v_tournament.include_third_place and exists (
      select 1 from public.tournament_matches
      where tournament_id = v_tournament.id
        and bracket = 'third_place'
        and status = 'scheduled'
    ) then
      update public.tournaments set winner_entry_id = v_winner
      where id = v_tournament.id;
    else
      update public.tournaments set status = 'complete', winner_entry_id = v_winner, completed_at = now()
      where id = v_tournament.id;
    end if;
  elsif v_tournament.format = 'single_elimination'
     and v_match.bracket = 'third_place' then
    update public.tournament_entries set final_place = 3 where id = v_winner;
    if v_loser is not null then
      update public.tournament_entries set final_place = 4 where id = v_loser;
    end if;
    if v_tournament.winner_entry_id is not null then
      update public.tournaments set status = 'complete', completed_at = now()
      where id = v_tournament.id;
    end if;
  elsif v_tournament.format = 'double_elimination' and v_match.bracket = 'grand_final' then
    if v_match.round_number = 1 and v_tournament.grand_final_reset
       and v_winner = v_match.player_b_entry_id and v_match.winner_next_match_id is not null then
      select * into v_reset_match from public.tournament_matches
      where id = v_match.winner_next_match_id;
      update public.tournament_matches
      set player_a_entry_id = v_match.player_a_entry_id,
          player_b_entry_id = v_match.player_b_entry_id,
          status = 'scheduled'
      where id = v_reset_match.id;
    else
      update public.tournament_entries set status = 'champion', final_place = 1
      where id = v_winner;
      if v_loser is not null then
        update public.tournament_entries set status = 'eliminated', final_place = 2
        where id = v_loser;
      end if;
      if v_match.round_number = 1 and v_match.winner_next_match_id is not null then
        update public.tournament_matches set status = 'cancelled'
        where id = v_match.winner_next_match_id;
      end if;
      update public.tournaments set status = 'complete', winner_entry_id = v_winner, completed_at = now()
      where id = v_tournament.id;
    end if;
  elsif v_tournament.format = 'round_robin' and not exists (
    select 1 from public.tournament_matches
    where tournament_id = v_tournament.id and status = 'scheduled' and id <> p_match_id
  ) then
    select entries.id into v_winner
    from public.tournament_entries entries
    left join public.tournament_matches won
      on won.tournament_id = entries.tournament_id
     and won.winner_entry_id = entries.id
     and won.status = 'complete'
    where entries.tournament_id = v_tournament.id
    group by entries.id
    order by count(won.id) desc, entries.seed asc
    limit 1;
    update public.tournament_entries set status = 'champion', final_place = 1 where id = v_winner;
    update public.tournaments set status = 'complete', winner_entry_id = v_winner, completed_at = now()
    where id = v_tournament.id;
  end if;
end;
$$;
