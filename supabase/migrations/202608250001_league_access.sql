-- Public, private, and invite-only league discovery and membership flows.
-- This file is safe to commit before approval. It changes nothing in the live
-- Supabase project until it is explicitly applied through the migration flow.

create extension if not exists pgcrypto;

alter table public.leagues
  add column if not exists access_type text not null default 'private';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leagues'::regclass
      and conname = 'leagues_access_type_check'
  ) then
    alter table public.leagues
      add constraint leagues_access_type_check
      check (access_type in ('public', 'private', 'invite_only'));
  end if;
end;
$$;

create index if not exists leagues_access_type_created_idx
  on public.leagues (access_type, created_at desc);

create table if not exists public.league_join_requests (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null check (char_length(trim(player_name)) between 1 and 80),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'cancelled', 'joined')
  ),
  reviewed_by_player_id uuid references public.players(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists league_join_requests_open_idx
  on public.league_join_requests (league_id, user_id)
  where status in ('pending', 'approved');
create index if not exists league_join_requests_admin_queue_idx
  on public.league_join_requests (league_id, status, created_at);

create table if not exists public.league_invitations (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  invited_user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  created_by_player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'revoked', 'expired')
  ),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    invited_user_id is not null
    or char_length(trim(coalesce(invited_email, ''))) between 3 and 320
  )
);

create unique index if not exists league_invitations_pending_email_idx
  on public.league_invitations (league_id, lower(invited_email))
  where status = 'pending' and invited_email is not null;
create unique index if not exists league_invitations_pending_user_idx
  on public.league_invitations (league_id, invited_user_id)
  where status = 'pending' and invited_user_id is not null;

alter table public.league_join_requests enable row level security;
alter table public.league_invitations enable row level security;

-- No direct table policies are created. All access goes through the checked
-- security-definer functions below so users cannot approve themselves, read
-- another league's queue, or manufacture an invitation.

create or replace function public.create_league_v3(
  p_league_name text,
  p_join_code text,
  p_player_name text,
  p_access_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
begin
  if p_access_type not in ('public', 'private', 'invite_only') then
    raise exception 'Choose public, private, or invite only.';
  end if;

  v_league_id := public.create_league_v2(
    p_league_name,
    p_join_code,
    p_player_name
  );

  update public.leagues
  set access_type = p_access_type
  where id = v_league_id
    and owner_user_id = (select auth.uid());

  if not found then
    raise exception 'The new league could not be configured.';
  end if;

  return v_league_id;
end;
$$;

create or replace function public.get_discoverable_leagues()
returns table (
  league_id uuid,
  league_name text,
  league_description text,
  logo_url text,
  access_type text,
  active_player_count bigint,
  is_member boolean,
  request_status text,
  has_invitation boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    leagues.id,
    leagues.name,
    leagues.description,
    leagues.logo_url,
    leagues.access_type,
    count(players.id) filter (where players.is_active),
    exists (
      select 1
      from public.players mine
      where mine.league_id = leagues.id
        and mine.user_id = (select auth.uid())
        and mine.is_active
    ),
    (
      select requests.status
      from public.league_join_requests requests
      where requests.league_id = leagues.id
        and requests.user_id = (select auth.uid())
      order by requests.created_at desc
      limit 1
    ),
    exists (
      select 1
      from public.league_invitations invitations
      where invitations.league_id = leagues.id
        and invitations.status = 'pending'
        and invitations.expires_at > now()
        and (
          invitations.invited_user_id = (select auth.uid())
          or lower(invitations.invited_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
  from public.leagues leagues
  left join public.players players on players.league_id = leagues.id
  group by leagues.id;
$$;

create or replace function public.request_or_join_league(
  p_league_id uuid,
  p_player_name text
)
returns table (result text, player_id uuid, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_type text;
  v_join_code text;
  v_player_id uuid;
  v_request_id uuid;
  v_request_status text;
  v_invitation_id uuid;
begin
  if char_length(trim(coalesce(p_player_name, ''))) not between 1 and 80 then
    raise exception 'Enter a player name.';
  end if;

  select leagues.access_type, leagues.join_code
  into v_access_type, v_join_code
  from public.leagues leagues
  where leagues.id = p_league_id;

  if not found then
    raise exception 'League not found.';
  end if;

  select players.id into v_player_id
  from public.players players
  where players.league_id = p_league_id
    and players.user_id = (select auth.uid())
    and players.is_active
  limit 1;

  if v_player_id is not null then
    return query select 'joined'::text, v_player_id, null::uuid;
    return;
  end if;

  if v_access_type = 'public' then
    v_player_id := public.join_league_v2(v_join_code, trim(p_player_name));
    return query select 'joined'::text, v_player_id, null::uuid;
    return;
  end if;

  if v_access_type = 'invite_only' then
    select invitations.id into v_invitation_id
    from public.league_invitations invitations
    where invitations.league_id = p_league_id
      and invitations.status = 'pending'
      and invitations.expires_at > now()
      and (
        invitations.invited_user_id = (select auth.uid())
        or lower(invitations.invited_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
    order by invitations.created_at desc
    limit 1
    for update;

    if v_invitation_id is null then
      raise exception 'This league is invite only.' using errcode = '42501';
    end if;

    v_player_id := public.join_league_v2(v_join_code, trim(p_player_name));
    update public.league_invitations
    set status = 'accepted', accepted_at = now()
    where id = v_invitation_id;
    return query select 'joined'::text, v_player_id, null::uuid;
    return;
  end if;

  select requests.id, requests.status into v_request_id, v_request_status
  from public.league_join_requests requests
  where requests.league_id = p_league_id
    and requests.user_id = (select auth.uid())
    and requests.status in ('pending', 'approved')
  order by requests.created_at desc
  limit 1;

  if v_request_id is null then
    insert into public.league_join_requests (league_id, user_id, player_name)
    values (p_league_id, (select auth.uid()), trim(p_player_name))
    returning id into v_request_id;
  end if;

  if v_request_status = 'approved' then
    v_player_id := public.join_league_v2(v_join_code, trim(p_player_name));
    update public.league_join_requests
    set status = 'joined', updated_at = now()
    where id = v_request_id;
    return query select 'joined'::text, v_player_id, v_request_id;
    return;
  end if;

  return query select 'pending'::text, null::uuid, v_request_id;
end;
$$;

-- Keep the familiar league-code form, but pass it through the same access
-- checks. Direct authenticated access to the legacy join function is revoked
-- below so private and invite-only leagues cannot be bypassed with an old app.
create or replace function public.request_or_join_league_by_code(
  p_join_code text,
  p_player_name text
)
returns table (result text, player_id uuid, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
begin
  select leagues.id into v_league_id
  from public.leagues leagues
  where upper(leagues.join_code) = upper(trim(coalesce(p_join_code, '')))
  limit 1;

  if v_league_id is null then
    raise exception 'League not found.';
  end if;

  return query
  select *
  from public.request_or_join_league(v_league_id, p_player_name);
end;
$$;

create or replace function public.get_pending_league_join_requests(p_league_id uuid)
returns table (
  request_id uuid,
  user_id uuid,
  player_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tttt_is_league_admin(p_league_id) then
    raise exception 'League admin access is required.' using errcode = '42501';
  end if;

  return query
  select requests.id, requests.user_id, requests.player_name, requests.created_at
  from public.league_join_requests requests
  where requests.league_id = p_league_id
    and requests.status = 'pending'
  order by requests.created_at;
end;
$$;

create or replace function public.review_league_join_request(
  p_request_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_reviewer_player_id uuid;
begin
  select requests.league_id into v_league_id
  from public.league_join_requests requests
  where requests.id = p_request_id
    and requests.status = 'pending'
  for update;

  if v_league_id is null or not public.tttt_is_league_admin(v_league_id) then
    raise exception 'League admin access is required.' using errcode = '42501';
  end if;

  select public.tttt_active_player_id(v_league_id) into v_reviewer_player_id;

  update public.league_join_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by_player_id = v_reviewer_player_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.complete_approved_league_join(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.league_join_requests%rowtype;
  v_join_code text;
  v_player_id uuid;
begin
  select * into v_request
  from public.league_join_requests requests
  where requests.id = p_request_id
    and requests.user_id = (select auth.uid())
    and requests.status = 'approved'
  for update;

  if v_request.id is null then
    raise exception 'No approved request was found.' using errcode = '42501';
  end if;

  select leagues.join_code into v_join_code
  from public.leagues leagues
  where leagues.id = v_request.league_id;

  v_player_id := public.join_league_v2(v_join_code, v_request.player_name);

  update public.league_join_requests
  set status = 'joined', updated_at = now()
  where id = v_request.id;

  return v_player_id;
end;
$$;

create or replace function public.invite_to_league(
  p_league_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator_player_id uuid;
  v_invitation_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.tttt_is_league_admin(p_league_id) then
    raise exception 'League admin access is required.' using errcode = '42501';
  end if;
  if char_length(v_email) not between 3 and 320 or position('@' in v_email) < 2 then
    raise exception 'Enter a valid email address.';
  end if;

  select public.tttt_active_player_id(p_league_id) into v_creator_player_id;

  insert into public.league_invitations (
    league_id,
    invited_email,
    created_by_player_id
  ) values (
    p_league_id,
    v_email,
    v_creator_player_id
  )
  on conflict (league_id, lower(invited_email))
    where status = 'pending' and invited_email is not null
  do update set expires_at = now() + interval '30 days'
  returning id into v_invitation_id;

  return v_invitation_id;
end;
$$;

create or replace function public.update_league_access_type(
  p_league_id uuid,
  p_access_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tttt_is_league_admin(p_league_id) then
    raise exception 'League admin access is required.' using errcode = '42501';
  end if;
  if p_access_type not in ('public', 'private', 'invite_only') then
    raise exception 'Choose public, private, or invite only.';
  end if;

  update public.leagues set access_type = p_access_type where id = p_league_id;
end;
$$;

revoke all on table public.league_join_requests from anon, authenticated;
revoke all on table public.league_invitations from anon, authenticated;

revoke all on function public.create_league_v3(text,text,text,text) from public;
revoke all on function public.get_discoverable_leagues() from public;
revoke all on function public.request_or_join_league(uuid,text) from public;
revoke all on function public.request_or_join_league_by_code(text,text) from public;
revoke all on function public.get_pending_league_join_requests(uuid) from public;
revoke all on function public.review_league_join_request(uuid,boolean) from public;
revoke all on function public.complete_approved_league_join(uuid) from public;
revoke all on function public.invite_to_league(uuid,text) from public;
revoke all on function public.update_league_access_type(uuid,text) from public;

grant execute on function public.create_league_v3(text,text,text,text) to authenticated;
grant execute on function public.get_discoverable_leagues() to authenticated;
grant execute on function public.request_or_join_league(uuid,text) to authenticated;
grant execute on function public.request_or_join_league_by_code(text,text) to authenticated;
grant execute on function public.get_pending_league_join_requests(uuid) to authenticated;
grant execute on function public.review_league_join_request(uuid,boolean) to authenticated;
grant execute on function public.complete_approved_league_join(uuid) to authenticated;
grant execute on function public.invite_to_league(uuid,text) to authenticated;
grant execute on function public.update_league_access_type(uuid,text) to authenticated;

-- All supported clients use the guarded functions above after this migration.
-- The security-definer functions can still call the legacy helper internally.
revoke execute on function public.join_league_v2(text,text) from public, anon, authenticated;

comment on column public.leagues.access_type is
  'Public joins immediately, private requires admin approval, and invite_only requires an invitation.';
