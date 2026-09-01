-- Read-only verification for the moderator hardening and league-access release.
-- Run after the approved migrations are applied.

do $$
declare
  v_chat_report_qual text;
begin
  if to_regprocedure('public.get_moderator_queue()') is null
     or to_regprocedure('public.moderate_queue_item(text,uuid,text,text)') is null
     or to_regprocedure('public.apply_table_location_edit_suggestion(uuid)') is null
     or to_regprocedure('public.prevent_self_moderation()') is null then
    raise exception 'Moderator queue hardening functions are incomplete.';
  end if;

  if to_regclass('public.league_join_requests') is null
     or to_regclass('public.league_invitations') is null
     or to_regprocedure('public.request_or_join_league(uuid,text)') is null
     or to_regprocedure('public.review_league_join_request(uuid,boolean)') is null
     or to_regprocedure('public.update_league_access_type(uuid,text)') is null then
    raise exception 'League access objects are incomplete.';
  end if;

  if (
    select count(*)
    from pg_trigger
    where not tgisinternal
      and tgname = 'prevent_self_moderation'
      and tgrelid in (
        'public.table_locations'::regclass,
        'public.table_location_reviews'::regclass,
        'public.table_location_photo_submissions'::regclass,
        'public.table_location_reports'::regclass,
        'public.chat_message_reports'::regclass
      )
  ) <> 5 then
    raise exception 'Independent-review triggers are incomplete.';
  end if;

  select qual into v_chat_report_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'chat_message_reports'
    and policyname = 'Players can view their chat reports';

  if v_chat_report_qual is null
     or v_chat_report_qual like '%tttt_is_league_admin%' then
    raise exception 'League admins still have unintended chat-report access.';
  end if;

  if has_table_privilege('authenticated', 'public.league_join_requests', 'SELECT')
     or has_table_privilege('authenticated', 'public.league_join_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.league_invitations', 'SELECT')
     or has_table_privilege('authenticated', 'public.league_invitations', 'INSERT') then
    raise exception 'League workflow tables have direct client privileges.';
  end if;

  if has_function_privilege('authenticated', 'public.join_league_v2(text,text)', 'EXECUTE') then
    raise exception 'The legacy join function can bypass league access rules.';
  end if;

  if not has_function_privilege('authenticated', 'public.request_or_join_league(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_moderator_queue()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.apply_table_location_edit_suggestion(uuid)', 'EXECUTE') then
    raise exception 'Required guarded client functions are unavailable.';
  end if;
end;
$$;

select
  (select count(*) from public.leagues) as leagues,
  (select count(*) from public.league_join_requests) as join_requests,
  (select count(*) from public.league_invitations) as invitations,
  (select count(*) from public.table_locations where status = 'pending') as pending_locations,
  (select count(*) from public.table_location_reviews where status = 'pending') as pending_reviews,
  (select count(*) from public.table_location_photo_submissions where status = 'pending') as pending_photos,
  (select count(*) from public.table_location_reports where status in ('open', 'reviewing')) as open_location_reports,
  (select count(*) from public.chat_message_reports where status in ('open', 'reviewing')) as open_chat_reports;
