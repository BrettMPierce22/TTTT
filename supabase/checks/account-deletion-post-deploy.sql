-- Read-only production verification. Does not start or complete any deletion.
begin read only;

select 'row_counts' as check_name, jsonb_build_object(
  'accounts', (select count(*) from auth.users),
  'players', (select count(*) from public.players),
  'leagues', (select count(*) from public.leagues),
  'tables', (select count(*) from public.table_locations),
  'photo_submissions', (select count(*) from public.table_location_photo_submissions),
  'storage_objects', (select count(*) from storage.objects),
  'deletion_intents', (select count(*) from public.account_deletion_intents)
)::text as result
union all
select 'intent_table_security', jsonb_build_object(
  'rls', relrowsecurity,
  'anon_select', has_table_privilege('anon', oid, 'SELECT'),
  'authenticated_select', has_table_privilege('authenticated', oid, 'SELECT'),
  'authenticated_insert', has_table_privilege('authenticated', oid, 'INSERT'),
  'service_insert', has_table_privilege('service_role', oid, 'INSERT')
)::text from pg_class where oid = 'public.account_deletion_intents'::regclass
union all
select 'function_security', jsonb_build_object(
  'name', p.proname,
  'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
  'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
  'service_execute', has_function_privilege('service_role', p.oid, 'EXECUTE'),
  'security_definer', p.prosecdef,
  'settings', p.proconfig,
  'body_md5', md5(p.prosrc)
)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'tttt_owns_deletion_asset', 'get_account_deletion_assets', 'begin_account_deletion',
  'account_can_upload', 'guard_deleting_league_owner',
  'prepare_account_deletion_asset_batch', 'guard_account_deletion_assets'
)
union all
select 'upload_policy', jsonb_build_object(
  'name', policyname, 'permissive', permissive, 'roles', roles,
  'command', cmd, 'using', qual, 'with_check', with_check
)::text from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('No new uploads while deleting account', 'No replaced uploads while deleting account')
union all
select 'guard_trigger', jsonb_build_object(
  'name', tgname, 'enabled', tgenabled, 'definition', pg_get_triggerdef(oid)
)::text from pg_trigger where not tgisinternal and (
  (tgrelid = 'auth.users'::regclass and tgname in ('guard_account_deletion_assets', 'prepare_deleted_account_data'))
  or (tgrelid = 'public.leagues'::regclass and tgname = 'guard_deleting_league_owner')
);

rollback;
