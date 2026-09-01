-- Synthetic subscription schema only. Never apply this fixture to Supabase.
create role anon;
create role authenticated;
create role service_role bypassrls;

create schema auth;
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

grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

