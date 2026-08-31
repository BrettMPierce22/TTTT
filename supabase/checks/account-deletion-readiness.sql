-- Read-only preflight for an authorized operator. Never apply fixture SQL.
begin read only;

-- Must return zero rows before applying the proposed migration.
with required(table_schema, table_name, column_name) as (values
  ('auth','users','id'),
  ('storage','objects','id'), ('storage','objects','bucket_id'),
  ('storage','objects','name'), ('storage','objects','owner_id'),
  ('public','leagues','id'), ('public','leagues','name'), ('public','leagues','owner_user_id'),
  ('public','leagues','logo_path'), ('public','leagues','logo_url'),
  ('public','leagues','banner_path'), ('public','leagues','banner_url'),
  ('public','account_profiles','user_id'), ('public','account_profiles','avatar_url'),
  ('public','players','user_id'), ('public','players','avatar_url'),
  ('public','table_locations','photo_path'),
  ('public','table_location_photo_submissions','contributor_id'),
  ('public','table_location_photo_submissions','photo_path')
)
select r.* from required r left join information_schema.columns c
  using (table_schema, table_name, column_name)
where c.column_name is null;

select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as definition
from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;

-- Inspect the deployed anonymization implementation, not just its name.
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='prepare_deleted_account_data';

select id, public from storage.buckets
where id in ('player-avatars','table-location-photos','league-assets');

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='storage' and tablename='objects';

-- Check for conflicting function/table names or a previously applied draft.
select to_regclass('public.account_deletion_intents') as existing_intents_table;
select proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'tttt_owns_deletion_asset','get_account_deletion_assets','begin_account_deletion',
  'account_can_upload','guard_deleting_league_owner',
  'prepare_account_deletion_asset_batch','guard_account_deletion_assets'
);

rollback;
