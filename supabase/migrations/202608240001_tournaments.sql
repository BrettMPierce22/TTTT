-- Table Talk tournament center
-- Run once in the Supabase SQL editor before opening the Tournament tab.

create extension if not exists pgcrypto;

create or replace function public.tttt_active_player_id(p_league_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select players.id
  from public.players
  where players.league_id = p_league_id
    and players.user_id = (select auth.uid())
    and players.is_active
  limit 1;
$$;

create or replace function public.tttt_is_league_admin(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where players.league_id = p_league_id
      and players.user_id = (select auth.uid())
      and players.is_active
      and players.member_role = 'admin'
  );
$$;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  created_by_player_id uuid not null references public.players(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 3 and 100),
  description text check (description is null or char_length(description) <= 800),
  format text not null check (
    format in ('single_elimination', 'double_elimination', 'round_robin')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'active', 'complete', 'cancelled')
  ),
  seeding_method text not null default 'rating' check (
    seeding_method in ('rating', 'random', 'manual')
  ),
  best_of smallint not null default 5 check (best_of in (1, 3, 5, 7)),
  include_third_place boolean not null default false,
  grand_final_reset boolean not null default true,
  winner_entry_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid references public.players(id) on delete restrict,
  guest_name text,
  seed integer not null check (seed between 1 and 256),
  status text not null default 'active' check (
    status in ('active', 'eliminated', 'withdrawn', 'champion')
  ),
  final_place integer check (final_place is null or final_place between 1 and 256),
  created_at timestamptz not null default now(),
  check (
    (player_id is not null and guest_name is null)
    or (player_id is null and char_length(trim(guest_name)) between 1 and 80)
  ),
  unique (tournament_id, seed),
  unique (tournament_id, player_id)
);

alter table public.tournaments
  drop constraint if exists tournaments_winner_entry_id_fkey;
alter table public.tournaments
  add constraint tournaments_winner_entry_id_fkey
  foreign key (winner_entry_id) references public.tournament_entries(id) on delete set null;

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  bracket text not null check (
    bracket in ('winners', 'losers', 'grand_final', 'round_robin', 'third_place')
  ),
  round_number integer not null check (round_number between 1 and 32),
  match_number integer not null check (match_number between 1 and 512),
  label text check (label is null or char_length(label) <= 80),
  player_a_entry_id uuid references public.tournament_entries(id) on delete set null,
  player_b_entry_id uuid references public.tournament_entries(id) on delete set null,
  winner_entry_id uuid references public.tournament_entries(id) on delete set null,
  loser_entry_id uuid references public.tournament_entries(id) on delete set null,
  score_a smallint check (score_a is null or score_a between 0 and 99),
  score_b smallint check (score_b is null or score_b between 0 and 99),
  game_scores jsonb not null default '[]'::jsonb,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'complete', 'cancelled')
  ),
  winner_next_match_id uuid references public.tournament_matches(id) on delete set null,
  winner_next_slot text check (winner_next_slot is null or winner_next_slot in ('a', 'b')),
  loser_next_match_id uuid references public.tournament_matches(id) on delete set null,
  loser_next_slot text check (loser_next_slot is null or loser_next_slot in ('a', 'b')),
  scheduled_at timestamptz,
  court_name text check (court_name is null or char_length(court_name) <= 60),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, bracket, round_number, match_number),
  check (score_a is null or score_b is not null),
  check (score_b is null or score_a is not null)
);

create index if not exists tournaments_league_status_idx
  on public.tournaments (league_id, status, created_at desc);
create index if not exists tournament_entries_tournament_seed_idx
  on public.tournament_entries (tournament_id, seed);
create index if not exists tournament_matches_tournament_round_idx
  on public.tournament_matches (tournament_id, bracket, round_number, match_number);

create or replace function public.tttt_can_manage_tournament(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tournaments
    join public.players creator
      on creator.id = tournaments.created_by_player_id
    where tournaments.id = p_tournament_id
      and (
        creator.user_id = (select auth.uid())
        or public.tttt_is_league_admin(tournaments.league_id)
      )
  );
$$;

create or replace function public.tttt_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournaments_set_updated_at on public.tournaments;
create trigger tournaments_set_updated_at
before update on public.tournaments
for each row execute function public.tttt_set_updated_at();

drop trigger if exists tournament_matches_set_updated_at on public.tournament_matches;
create trigger tournament_matches_set_updated_at
before update on public.tournament_matches
for each row execute function public.tttt_set_updated_at();

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_matches enable row level security;

drop policy if exists "League members can view tournaments" on public.tournaments;
create policy "League members can view tournaments"
on public.tournaments for select to authenticated
using (public.tttt_active_player_id(league_id) is not null);

drop policy if exists "Tournament managers can update tournaments" on public.tournaments;
create policy "Tournament managers can update tournaments"
on public.tournaments for update to authenticated
using (public.tttt_can_manage_tournament(id))
with check (public.tttt_can_manage_tournament(id));

drop policy if exists "Tournament managers can delete tournaments" on public.tournaments;
create policy "Tournament managers can delete tournaments"
on public.tournaments for delete to authenticated
using (public.tttt_can_manage_tournament(id));

drop policy if exists "League members can view tournament entries" on public.tournament_entries;
create policy "League members can view tournament entries"
on public.tournament_entries for select to authenticated
using (
  exists (
    select 1 from public.tournaments
    where tournaments.id = tournament_entries.tournament_id
      and public.tttt_active_player_id(tournaments.league_id) is not null
  )
);

drop policy if exists "Tournament managers can manage entries" on public.tournament_entries;
create policy "Tournament managers can manage entries"
on public.tournament_entries for all to authenticated
using (public.tttt_can_manage_tournament(tournament_id))
with check (public.tttt_can_manage_tournament(tournament_id));

drop policy if exists "League members can view tournament matches" on public.tournament_matches;
create policy "League members can view tournament matches"
on public.tournament_matches for select to authenticated
using (
  exists (
    select 1 from public.tournaments
    where tournaments.id = tournament_matches.tournament_id
      and public.tttt_active_player_id(tournaments.league_id) is not null
  )
);

drop policy if exists "Tournament managers can manage matches" on public.tournament_matches;
create policy "Tournament managers can manage matches"
on public.tournament_matches for all to authenticated
using (public.tttt_can_manage_tournament(tournament_id))
with check (public.tttt_can_manage_tournament(tournament_id));

create or replace function public.create_tournament(
  p_league_id uuid,
  p_name text,
  p_description text,
  p_format text,
  p_seeding_method text,
  p_best_of smallint,
  p_include_third_place boolean,
  p_grand_final_reset boolean,
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_tournament_id uuid;
  v_entry jsonb;
  v_entry_player_id uuid;
  v_guest_name text;
  v_seed integer;
begin
  v_player_id := public.tttt_active_player_id(p_league_id);
  if v_player_id is null then
    raise exception 'You must be an active league member to create a tournament.';
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 3 and 100 then
    raise exception 'Tournament names must be between 3 and 100 characters.';
  end if;
  if p_format not in ('single_elimination', 'double_elimination', 'round_robin') then
    raise exception 'Unsupported tournament format.';
  end if;
  if p_seeding_method not in ('rating', 'random', 'manual') then
    raise exception 'Unsupported seeding method.';
  end if;
  if p_best_of not in (1, 3, 5, 7) then
    raise exception 'Best-of must be 1, 3, 5, or 7.';
  end if;
  if p_entries is null
     or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) < 2 then
    raise exception 'Choose at least two entrants.';
  end if;
  if jsonb_array_length(p_entries) > 128 then
    raise exception 'Tournaments are limited to 128 entrants.';
  end if;
  if p_format = 'double_elimination' and jsonb_array_length(p_entries) < 3 then
    raise exception 'Double elimination needs at least three entrants.';
  end if;

  insert into public.tournaments (
    league_id, created_by_player_id, name, description, format,
    seeding_method, best_of, include_third_place, grand_final_reset
  ) values (
    p_league_id, v_player_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
    p_format, p_seeding_method, p_best_of, coalesce(p_include_third_place, false),
    coalesce(p_grand_final_reset, true)
  ) returning id into v_tournament_id;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    v_entry_player_id := nullif(v_entry->>'player_id', '')::uuid;
    v_guest_name := nullif(trim(coalesce(v_entry->>'guest_name', '')), '');
    v_seed := (v_entry->>'seed')::integer;

    if v_entry_player_id is not null and not exists (
      select 1 from public.players
      where players.id = v_entry_player_id
        and players.league_id = p_league_id
        and players.is_active
    ) then
      raise exception 'Every league entrant must be an active player.';
    end if;
    if v_entry_player_id is null and v_guest_name is null then
      raise exception 'Every entrant needs a league player or guest name.';
    end if;

    insert into public.tournament_entries (
      id, tournament_id, player_id, guest_name, seed
    ) values (
      coalesce(nullif(v_entry->>'id', '')::uuid, gen_random_uuid()),
      v_tournament_id, v_entry_player_id, v_guest_name, v_seed
    );
  end loop;

  return v_tournament_id;
end;
$$;

create or replace function public.start_tournament(
  p_tournament_id uuid,
  p_matches jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_match jsonb;
begin
  if not public.tttt_can_manage_tournament(p_tournament_id) then
    raise exception 'Only the tournament organizer or a league admin can start it.';
  end if;

  select status into v_status
  from public.tournaments where id = p_tournament_id for update;
  if v_status <> 'draft' then
    raise exception 'Only draft tournaments can be started.';
  end if;
  if p_matches is null
     or jsonb_typeof(p_matches) <> 'array'
     or jsonb_array_length(p_matches) = 0 then
    raise exception 'The bracket contains no matches.';
  end if;

  delete from public.tournament_matches where tournament_id = p_tournament_id;

  for v_match in select value from jsonb_array_elements(p_matches)
  loop
    insert into public.tournament_matches (
      id, tournament_id, bracket, round_number, match_number, label,
      player_a_entry_id, player_b_entry_id, winner_entry_id, loser_entry_id,
      score_a, score_b, status, game_scores
    ) values (
      (v_match->>'id')::uuid, p_tournament_id, v_match->>'bracket',
      (v_match->>'round_number')::integer, (v_match->>'match_number')::integer,
      nullif(v_match->>'label', ''), nullif(v_match->>'player_a_entry_id', '')::uuid,
      nullif(v_match->>'player_b_entry_id', '')::uuid,
      nullif(v_match->>'winner_entry_id', '')::uuid,
      nullif(v_match->>'loser_entry_id', '')::uuid,
      nullif(v_match->>'score_a', '')::smallint,
      nullif(v_match->>'score_b', '')::smallint,
      coalesce(nullif(v_match->>'status', ''), 'scheduled'),
      coalesce(v_match->'game_scores', '[]'::jsonb)
    );
  end loop;

  for v_match in select value from jsonb_array_elements(p_matches)
  loop
    update public.tournament_matches set
      winner_next_match_id = nullif(v_match->>'winner_next_match_id', '')::uuid,
      winner_next_slot = nullif(v_match->>'winner_next_slot', ''),
      loser_next_match_id = nullif(v_match->>'loser_next_match_id', '')::uuid,
      loser_next_slot = nullif(v_match->>'loser_next_slot', '')
    where id = (v_match->>'id')::uuid
      and tournament_id = p_tournament_id;
  end loop;

  update public.tournaments
  set status = 'active', started_at = now(), completed_at = null, winner_entry_id = null
  where id = p_tournament_id;
end;
$$;

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
  if v_match.status = 'complete' then raise exception 'This match is already complete.'; end if;

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
    if greatest(p_score_a, p_score_b) < v_needed then
      raise exception 'The winner needs at least % game wins.', v_needed;
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

create or replace function public.cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tttt_can_manage_tournament(p_tournament_id) then
    raise exception 'Only the tournament organizer or a league admin can cancel it.';
  end if;
  update public.tournaments set status = 'cancelled'
  where id = p_tournament_id and status in ('draft', 'active');
end;
$$;

revoke all on function public.tttt_active_player_id(uuid) from public;
revoke all on function public.tttt_is_league_admin(uuid) from public;
revoke all on function public.tttt_can_manage_tournament(uuid) from public;
revoke all on function public.create_tournament(uuid,text,text,text,text,smallint,boolean,boolean,jsonb) from public;
revoke all on function public.start_tournament(uuid,jsonb) from public;
revoke all on function public.record_tournament_match(uuid,smallint,smallint,jsonb) from public;
revoke all on function public.cancel_tournament(uuid) from public;

grant execute on function public.tttt_active_player_id(uuid) to authenticated;
grant execute on function public.tttt_is_league_admin(uuid) to authenticated;
grant execute on function public.tttt_can_manage_tournament(uuid) to authenticated;
grant execute on function public.create_tournament(uuid,text,text,text,text,smallint,boolean,boolean,jsonb) to authenticated;
grant execute on function public.start_tournament(uuid,jsonb) to authenticated;
grant execute on function public.record_tournament_match(uuid,smallint,smallint,jsonb) to authenticated;
grant execute on function public.cancel_tournament(uuid) to authenticated;

-- Client writes flow through the validated RPCs above. The one direct write is
-- deleting a draft/cancelled tournament, which is still protected by RLS.
grant select, delete on public.tournaments to authenticated;
grant select on public.tournament_entries to authenticated;
grant select on public.tournament_matches to authenticated;

comment on table public.tournaments is 'League-scoped Table Talk tournaments and bracket settings.';
comment on table public.tournament_matches is 'Generated bracket and round-robin matches with winner and loser advancement paths.';
