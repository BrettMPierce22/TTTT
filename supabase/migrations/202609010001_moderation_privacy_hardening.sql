-- Require independent review and keep chat reports private from league admins.
-- This migration is safe to commit before approval and changes nothing in the
-- live Supabase project until it is explicitly applied.

drop policy if exists "Players can view their chat reports"
  on public.chat_message_reports;
create policy "Players can view their chat reports"
on public.chat_message_reports for select
to authenticated
using (
  reporter_player_id = public.tttt_active_player_id(league_id)
);

create or replace function public.prevent_self_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_submitter uuid;
  v_is_moderation_action boolean := false;
begin
  if v_actor is null then
    return new;
  end if;

  case tg_table_name
    when 'table_locations' then
      v_submitter := old.submitted_by;
      v_is_moderation_action :=
        old.status = 'pending'
        and new.status in ('approved', 'rejected', 'archived')
        and new.status is distinct from old.status;
    when 'table_location_reviews' then
      v_submitter := old.user_id;
      v_is_moderation_action :=
        old.status = 'pending'
        and new.status in ('approved', 'rejected', 'removed')
        and new.status is distinct from old.status;
    when 'table_location_photo_submissions' then
      v_submitter := old.contributor_id;
      v_is_moderation_action :=
        old.status = 'pending'
        and new.status in ('approved', 'rejected')
        and new.status is distinct from old.status;
    when 'table_location_reports' then
      v_submitter := old.reporter_id;
      v_is_moderation_action :=
        new.status in ('reviewing', 'resolved', 'dismissed')
        and new.status is distinct from old.status;
    when 'chat_message_reports' then
      select players.user_id into v_submitter
      from public.players
      where players.id = old.reporter_player_id;
      v_is_moderation_action :=
        new.status in ('reviewing', 'resolved', 'dismissed')
        and new.status is distinct from old.status;
  end case;

  if v_is_moderation_action and v_submitter = v_actor then
    raise exception 'A different moderator must review your submission or report.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_self_moderation on public.table_locations;
create trigger prevent_self_moderation
before update on public.table_locations
for each row execute function public.prevent_self_moderation();

drop trigger if exists prevent_self_moderation on public.table_location_reviews;
create trigger prevent_self_moderation
before update on public.table_location_reviews
for each row execute function public.prevent_self_moderation();

drop trigger if exists prevent_self_moderation on public.table_location_photo_submissions;
create trigger prevent_self_moderation
before update on public.table_location_photo_submissions
for each row execute function public.prevent_self_moderation();

drop trigger if exists prevent_self_moderation on public.table_location_reports;
create trigger prevent_self_moderation
before update on public.table_location_reports
for each row execute function public.prevent_self_moderation();

drop trigger if exists prevent_self_moderation on public.chat_message_reports;
create trigger prevent_self_moderation
before update on public.chat_message_reports
for each row execute function public.prevent_self_moderation();

revoke all on function public.prevent_self_moderation() from public;

create or replace function public.apply_table_location_edit_suggestion(
  p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix constant text := 'TTTT_EDIT_SUGGESTION_V1:';
  v_report public.table_location_reports%rowtype;
  v_changes jsonb;
  v_unknown_key text;
begin
  if not public.is_app_moderator() then
    raise exception 'Moderator access is required.' using errcode = '42501';
  end if;

  select * into v_report
  from public.table_location_reports reports
  where reports.id = p_report_id
    and reports.review_id is null
    and reports.status in ('open', 'reviewing')
    and reports.reason = 'incorrect'
  for update;

  if v_report.id is null
     or left(coalesce(v_report.details, ''), char_length(v_prefix)) <> v_prefix then
    raise exception 'This edit suggestion is unavailable.';
  end if;

  begin
    v_changes := substring(v_report.details from char_length(v_prefix) + 1)::jsonb -> 'changes';
  exception when others then
    raise exception 'This edit suggestion is invalid.';
  end;

  if jsonb_typeof(v_changes) <> 'object' or v_changes = '{}'::jsonb then
    raise exception 'This edit suggestion is invalid.';
  end if;

  select keys.key into v_unknown_key
  from jsonb_object_keys(v_changes) keys(key)
  where keys.key not in (
    'name', 'address', 'city', 'region', 'postalCode', 'venueType',
    'accessType', 'indoor', 'tableCount', 'hoursText', 'notes', 'websiteUrl'
  )
  limit 1;

  if v_unknown_key is not null then
    raise exception 'This edit suggestion contains an unsupported field.';
  end if;

  update public.table_locations locations
  set name = case when v_changes ? 'name' then trim(v_changes ->> 'name') else locations.name end,
      address = case when v_changes ? 'address' then trim(v_changes ->> 'address') else locations.address end,
      city = case when v_changes ? 'city' then trim(v_changes ->> 'city') else locations.city end,
      region = case when v_changes ? 'region' then trim(v_changes ->> 'region') else locations.region end,
      postal_code = case when v_changes ? 'postalCode' then nullif(trim(v_changes ->> 'postalCode'), '') else locations.postal_code end,
      venue_type = case when v_changes ? 'venueType' then trim(v_changes ->> 'venueType') else locations.venue_type end,
      access_type = case when v_changes ? 'accessType' then trim(v_changes ->> 'accessType') else locations.access_type end,
      indoor = case when v_changes ? 'indoor' then (v_changes ->> 'indoor')::boolean else locations.indoor end,
      table_count = case when v_changes ? 'tableCount' then (v_changes ->> 'tableCount')::integer else locations.table_count end,
      hours_text = case when v_changes ? 'hoursText' then nullif(trim(v_changes ->> 'hoursText'), '') else locations.hours_text end,
      notes = case when v_changes ? 'notes' then nullif(trim(v_changes ->> 'notes'), '') else locations.notes end,
      website_url = case when v_changes ? 'websiteUrl' then nullif(trim(v_changes ->> 'websiteUrl'), '') else locations.website_url end,
      last_verified_at = now()
  where locations.id = v_report.location_id;

  if not found then
    raise exception 'The table listing no longer exists.';
  end if;

  update public.table_location_reports
  set status = 'resolved',
      resolved_by = (select auth.uid()),
      resolved_at = now()
  where id = v_report.id;
end;
$$;

revoke all on function public.apply_table_location_edit_suggestion(uuid) from public;
grant execute on function public.apply_table_location_edit_suggestion(uuid) to authenticated;

comment on function public.prevent_self_moderation() is
  'Requires community submissions and reports to be handled by a different moderator.';
comment on function public.apply_table_location_edit_suggestion(uuid) is
  'Atomically validates and applies a structured table edit, then resolves its independently reviewed report.';
