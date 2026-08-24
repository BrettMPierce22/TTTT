-- Secure, application-wide moderation queue.
-- This migration is intentionally safe to commit before it is applied. It does
-- not run against a Supabase project until the normal migration workflow does.

create or replace function public.is_app_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.table_locator_moderators moderators
    where moderators.user_id = (select auth.uid())
  );
$$;

drop policy if exists "App moderators can view chat reports" on public.chat_message_reports;
create policy "App moderators can view chat reports"
on public.chat_message_reports for select to authenticated
using (public.is_app_moderator());

create or replace function public.get_moderator_queue()
returns table (
  item_type text,
  item_id uuid,
  item_status text,
  title text,
  body text,
  reason text,
  details text,
  created_at timestamptz,
  context jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_moderator() then
    raise exception 'Moderator access is required.' using errcode = '42501';
  end if;

  return query
  select
    'location'::text,
    locations.id,
    locations.status,
    locations.name,
    concat_ws(', ', locations.address, locations.city, locations.region),
    null::text,
    locations.notes,
    locations.created_at,
    jsonb_build_object(
      'venueType', locations.venue_type,
      'accessType', locations.access_type,
      'tableCount', locations.table_count,
      'photoPath', locations.photo_path
    )
  from public.table_locations locations
  where locations.status = 'pending'

  union all

  select
    'review'::text,
    reviews.id,
    reviews.status,
    coalesce(nullif(reviews.title, ''), 'Untitled rating'),
    reviews.body,
    null::text,
    null::text,
    reviews.created_at,
    jsonb_build_object(
      'rating', reviews.rating,
      'locationId', reviews.location_id,
      'locationName', locations.name
    )
  from public.table_location_reviews reviews
  join public.table_locations locations on locations.id = reviews.location_id
  where reviews.status = 'pending'

  union all

  select
    'location_report'::text,
    reports.id,
    reports.status,
    case when reports.review_id is null
      then locations.name
      else concat('Review at ', locations.name)
    end,
    coalesce(reviews.body, locations.notes),
    reports.reason,
    reports.details,
    reports.created_at,
    jsonb_build_object(
      'locationId', reports.location_id,
      'reviewId', reports.review_id
    )
  from public.table_location_reports reports
  join public.table_locations locations on locations.id = reports.location_id
  left join public.table_location_reviews reviews on reviews.id = reports.review_id
  where reports.status in ('open', 'reviewing')

  union all

  select
    'chat_report'::text,
    reports.id,
    reports.status,
    coalesce(leagues.name, 'League chat report'),
    coalesce(league_messages.message, direct_messages.message, 'Message no longer available'),
    reports.reason,
    reports.details,
    reports.created_at,
    jsonb_build_object(
      'leagueId', reports.league_id,
      'leagueMessageId', reports.league_message_id,
      'directMessageId', reports.direct_message_id,
      'messageType', case when reports.league_message_id is null then 'direct' else 'league' end
    )
  from public.chat_message_reports reports
  join public.leagues leagues on leagues.id = reports.league_id
  left join public.league_messages league_messages on league_messages.id = reports.league_message_id
  left join public.direct_messages direct_messages on direct_messages.id = reports.direct_message_id
  where reports.status in ('open', 'reviewing')

  order by 8 asc;
end;
$$;

create or replace function public.moderate_queue_item(
  p_item_type text,
  p_item_id uuid,
  p_action text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_changed integer := 0;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_app_moderator() then
    raise exception 'Moderator access is required.' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Moderator notes cannot exceed 500 characters.';
  end if;

  case p_item_type
    when 'location' then
      if p_action not in ('approved', 'rejected') then raise exception 'Invalid location action.'; end if;
      update public.table_locations
      set status = p_action,
          moderation_note = v_note,
          moderated_by = (select auth.uid()),
          moderated_at = v_now,
          last_verified_at = case when p_action = 'approved' then v_now else last_verified_at end
      where id = p_item_id and status = 'pending';
    when 'review' then
      if p_action not in ('approved', 'rejected') then raise exception 'Invalid review action.'; end if;
      update public.table_location_reviews
      set status = p_action,
          moderation_note = v_note,
          moderated_by = (select auth.uid()),
          moderated_at = v_now
      where id = p_item_id and status = 'pending';
    when 'location_report' then
      if p_action not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Invalid report action.'; end if;
      update public.table_location_reports
      set status = p_action,
          resolved_by = case when p_action in ('resolved', 'dismissed') then (select auth.uid()) else null end,
          resolved_at = case when p_action in ('resolved', 'dismissed') then v_now else null end
      where id = p_item_id and status in ('open', 'reviewing');
    when 'chat_report' then
      if p_action not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Invalid report action.'; end if;
      update public.chat_message_reports
      set status = p_action,
          resolved_by = case when p_action in ('resolved', 'dismissed') then (select auth.uid()) else null end,
          resolved_at = case when p_action in ('resolved', 'dismissed') then v_now else null end
      where id = p_item_id and status in ('open', 'reviewing');
    else
      raise exception 'Unknown moderation item type.';
  end case;

  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'This queue item was already handled or no longer exists.';
  end if;
end;
$$;

revoke all on function public.is_app_moderator() from public;
revoke all on function public.get_moderator_queue() from public;
revoke all on function public.moderate_queue_item(text,uuid,text,text) from public;

grant execute on function public.is_app_moderator() to authenticated;
grant execute on function public.get_moderator_queue() to authenticated;
grant execute on function public.moderate_queue_item(text,uuid,text,text) to authenticated;

comment on function public.get_moderator_queue() is
  'Returns pending content and open reports only to trusted application moderators.';
comment on function public.moderate_queue_item(text,uuid,text,text) is
  'Atomically applies an allowed moderation action after checking trusted moderator membership.';
