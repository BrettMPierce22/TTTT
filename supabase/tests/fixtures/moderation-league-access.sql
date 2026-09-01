-- Synthetic schema for moderator and league-access tests only.
-- Never apply this fixture to a Supabase project.
create role anon;
create role authenticated;
create role service_role bypassrls;

create schema auth;
create schema storage;

create table auth.users (
  id uuid primary key,
  email text unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'email', nullif(current_setting('request.jwt.claim.email', true), '')
  );
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  logo_url text,
  owner_user_id uuid not null references auth.users(id),
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  is_active boolean not null default true,
  member_role text not null default 'player' check (member_role in ('player', 'admin')),
  unique (league_id, user_id)
);

create table public.league_messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

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

create or replace function public.create_league_v2(
  p_league_name text,
  p_join_code text,
  p_player_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  insert into public.leagues (name, owner_user_id, join_code)
  values (trim(p_league_name), (select auth.uid()), upper(trim(p_join_code)))
  returning id into v_league_id;

  insert into public.players (league_id, user_id, name, member_role)
  values (v_league_id, (select auth.uid()), trim(p_player_name), 'admin');

  return v_league_id;
end;
$$;

create or replace function public.join_league_v2(
  p_join_code text,
  p_player_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_player_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select id into v_league_id
  from public.leagues
  where upper(join_code) = upper(trim(p_join_code));

  if v_league_id is null then
    raise exception 'League not found.';
  end if;

  select id into v_player_id
  from public.players
  where league_id = v_league_id and user_id = (select auth.uid())
  for update;

  if v_player_id is null then
    insert into public.players (league_id, user_id, name)
    values (v_league_id, (select auth.uid()), trim(p_player_name))
    returning id into v_player_id;
  else
    update public.players
    set name = trim(p_player_name), is_active = true
    where id = v_player_id;
  end if;

  return v_player_id;
end;
$$;

grant execute on function public.create_league_v2(text,text,text) to authenticated;
grant execute on function public.join_league_v2(text,text) to authenticated;

create table storage.buckets (
  id text primary key,
  name text,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id text
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select regexp_split_to_array(name, '/');
$$;

alter table storage.objects enable row level security;
grant all on all tables in schema public, auth, storage to service_role;
grant select, insert, update, delete on storage.objects to authenticated;

create publication supabase_realtime;
