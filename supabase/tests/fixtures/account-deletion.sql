-- Synthetic schema for local tests only; never apply to a real project.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create table storage.buckets (id text primary key, public boolean default false);
insert into storage.buckets(id) values ('player-avatars'),('table-location-photos'),('league-assets');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
create table public.leagues (
  id uuid primary key, name text, owner_user_id uuid references auth.users(id),
  logo_path text, logo_url text, banner_path text, banner_url text
);
create table public.players (
  id uuid primary key, user_id uuid not null references auth.users(id),
  name text, avatar_url text, is_active boolean default true,
  removed_at timestamptz, profile_description text, height_text text,
  avg_ball_velocity numeric, play_status text
);
create table public.account_profiles (user_id uuid primary key references auth.users(id) on delete cascade, avatar_url text);
create table public.league_messages (id uuid primary key, player_id uuid references public.players(id));
create table public.direct_messages (id uuid primary key, sender_player_id uuid references public.players(id));
create table public.matches (id uuid primary key, winner_player_id uuid references public.players(id));
create table public.table_locations (
  id uuid primary key, submitted_by uuid references auth.users(id) on delete cascade, photo_path text
);
create table public.table_location_photo_submissions (
  id uuid primary key, contributor_id uuid references auth.users(id) on delete cascade, photo_path text
);
create table public.table_location_reviews (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert, update on storage.objects to authenticated;
grant all on all tables in schema public, auth, storage to service_role;
create policy "Fixture owned inserts" on storage.objects for insert to authenticated with check (owner_id = auth.uid()::text);
create policy "Fixture owned reads" on storage.objects for select to authenticated using (owner_id = auth.uid()::text);
create policy "Fixture owned updates" on storage.objects for update to authenticated using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);
