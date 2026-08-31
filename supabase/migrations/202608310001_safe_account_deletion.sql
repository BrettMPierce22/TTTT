-- DRAFT: not deployed. Requires explicit approval and the existing account
-- deletion/photo migrations. Storage bytes are removed ONLY by the Storage API.
begin;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'prepare_deleted_account_data' and not tgisinternal
      and tgenabled in ('O', 'A')
  ) then
    raise exception 'Apply and verify 202608240005_account_deletion.sql first';
  end if;
end;
$$;

create table public.account_deletion_intents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table public.account_deletion_intents enable row level security;
revoke all on public.account_deletion_intents from public, anon, authenticated;
grant select, insert, delete on public.account_deletion_intents to service_role;

-- Handles modern ownership, legacy ownership, and service-created personal
-- uploads. A personal-looking path never overrides another user's ownership.
create function public.tttt_owns_deletion_asset(
  p_owner_id text, p_legacy_owner text, p_bucket text, p_name text, p_user_id uuid
) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_user_id is not null and (
    coalesce(p_owner_id, p_legacy_owner) = p_user_id::text
    or (coalesce(p_owner_id, p_legacy_owner) is null
      and p_bucket in ('player-avatars', 'table-location-photos')
      and split_part(p_name, '/', 1) = p_user_id::text)
  ), false);
$$;
revoke all on function public.tttt_owns_deletion_asset(text,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.tttt_owns_deletion_asset(text,text,text,text,uuid)
  to service_role;

create function public.get_account_deletion_assets(
  p_user_id uuid, p_after_id uuid default null, p_limit integer default 200
) returns table (object_id uuid, bucket_id text, object_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' or p_user_id is null then
    raise exception 'Server access required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'Invalid page size' using errcode = '22023';
  end if;
  return query select o.id, o.bucket_id, o.name
  from storage.objects o
  where public.tttt_owns_deletion_asset(
    o.owner_id, to_jsonb(o)->>'owner', o.bucket_id, o.name, p_user_id)
    and (p_after_id is null or o.id > p_after_id)
  order by o.id limit p_limit;
end;
$$;
revoke all on function public.get_account_deletion_assets(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.get_account_deletion_assets(uuid,uuid,integer)
  to service_role;

create function public.begin_account_deletion(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_leagues jsonb;
begin
  if auth.role() is distinct from 'service_role' or p_user_id is null then
    raise exception 'Server access required' using errcode = '42501';
  end if;
  -- Serializes intent creation against uploads and league-owner assignments.
  perform 1 from auth.users where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id)
    into v_leagues from public.leagues where owner_user_id = p_user_id;
  if v_leagues is not null then
    return jsonb_build_object('code', 'owned_leagues', 'leagues', v_leagues);
  end if;
  insert into public.account_deletion_intents(user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  return jsonb_build_object('started', true);
end;
$$;
revoke all on function public.begin_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_deletion(uuid) to service_role;

create function public.account_can_upload()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return false; end if;
  -- Hold the account row until this upload transaction commits. Deletion takes
  -- the conflicting lock, so a previously authorized upload cannot race past it.
  perform 1 from auth.users where id = v_user_id for key share;
  if not found then return false; end if;
  return not exists (select 1 from public.account_deletion_intents where user_id = v_user_id);
end;
$$;
revoke all on function public.account_can_upload() from public, anon;
grant execute on function public.account_can_upload() to authenticated, service_role;

-- Restrictive policies supplement (never replace) existing ownership policies.
create policy "No new uploads while deleting account" on storage.objects
  as restrictive for insert to authenticated
  with check ((select public.account_can_upload()));
create policy "No replaced uploads while deleting account" on storage.objects
  as restrictive for update to authenticated
  using ((select public.account_can_upload()))
  with check ((select public.account_can_upload()));

create function public.guard_deleting_league_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_user_id is not null then
    perform 1 from auth.users where id = new.owner_user_id for key share;
    if not found or exists (select 1 from public.account_deletion_intents
      where user_id = new.owner_user_id) then
      raise exception 'This account cannot take league ownership while deletion is in progress';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_deleting_league_owner() from public, anon, authenticated;
create trigger guard_deleting_league_owner
  before insert or update of owner_user_id on public.leagues
  for each row execute function public.guard_deleting_league_owner();

create function public.prepare_account_deletion_asset_batch(
  p_user_id uuid, p_bucket_id text, p_object_ids uuid[]
) returns table (object_id uuid, bucket_id text, object_name text)
language plpgsql security definer set search_path = '' as $$
declare v_paths text[];
begin
  if auth.role() is distinct from 'service_role' or p_user_id is null then
    raise exception 'Server access required' using errcode = '42501';
  end if;
  if p_bucket_id is null or p_bucket_id not in ('player-avatars','table-location-photos','league-assets')
    or coalesce(cardinality(p_object_ids), 0) not between 1 and 100 then
    raise exception 'Invalid cleanup batch' using errcode = '22023';
  end if;
  perform 1 from auth.users where id = p_user_id for update;
  if not found or not exists (select 1 from public.account_deletion_intents where user_id = p_user_id) then
    raise exception 'Deletion has not been started';
  end if;
  if exists (select 1 from public.leagues where owner_user_id = p_user_id) then
    raise exception 'Resolve owned leagues first';
  end if;
  -- Reject foreign object IDs before modifying any image reference.
  if exists (select 1 from storage.objects o where o.id = any(p_object_ids)
    and (o.bucket_id <> p_bucket_id or not public.tttt_owns_deletion_asset(
      o.owner_id, to_jsonb(o)->>'owner', o.bucket_id, o.name, p_user_id))) then
    raise exception 'Asset ownership changed' using errcode = '42501';
  end if;
  select array_agg(o.name) into v_paths from storage.objects o
    where o.id = any(p_object_ids) and o.bucket_id = p_bucket_id;
  if v_paths is null then return; end if;

  if p_bucket_id = 'player-avatars' then
    update public.account_profiles set avatar_url = null where user_id = p_user_id;
    update public.players set avatar_url = null where user_id = p_user_id;
  elsif p_bucket_id = 'table-location-photos' then
    update public.table_locations set photo_path = null where photo_path = any(v_paths);
    delete from public.table_location_photo_submissions
      where contributor_id = p_user_id and photo_path = any(v_paths);
  elsif p_bucket_id = 'league-assets' then
    -- Remove the deleting user's uploaded content, not the shared league.
    update public.leagues set logo_path = null, logo_url = null where logo_path = any(v_paths);
    update public.leagues set banner_path = null, banner_url = null where banner_path = any(v_paths);
  end if;
  return query select o.id, o.bucket_id, o.name from storage.objects o
    where o.id = any(p_object_ids) and o.bucket_id = p_bucket_id order by o.id;
end;
$$;
revoke all on function public.prepare_account_deletion_asset_batch(uuid,text,uuid[])
  from public, anon, authenticated;
grant execute on function public.prepare_account_deletion_asset_batch(uuid,text,uuid[])
  to service_role;

create function public.guard_account_deletion_assets()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.leagues where owner_user_id = old.id) then
    raise exception 'Resolve owned leagues before account deletion';
  end if;
  if exists (select 1 from storage.objects o where public.tttt_owns_deletion_asset(
      o.owner_id, to_jsonb(o)->>'owner', o.bucket_id, o.name, old.id)) then
    raise exception 'Remove account uploads through the Storage API before account deletion';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_account_deletion_assets() from public, anon, authenticated;
-- Alphabetically before prepare_deleted_account_data, to fail before cleanup.
create trigger guard_account_deletion_assets before delete on auth.users
  for each row execute function public.guard_account_deletion_assets();

commit;
