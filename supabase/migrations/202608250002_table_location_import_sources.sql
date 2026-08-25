-- Adds provenance and deduplication support for reviewed public data imports.
-- This file is prepared only; do not apply it to live Supabase without approval.

alter table public.table_locations
  add column if not exists source_name text not null default 'community',
  add column if not exists source_external_id text,
  add column if not exists source_url text,
  add column if not exists source_license text,
  add column if not exists source_observed_at timestamptz;

alter table public.table_locations
  alter column submitted_by drop not null;

alter table public.table_locations
  drop constraint if exists table_locations_source_name_check;

alter table public.table_locations
  add constraint table_locations_source_name_check check (
    source_name in ('community', 'openstreetmap')
  );

alter table public.table_locations
  drop constraint if exists table_locations_source_metadata_check;

alter table public.table_locations
  add constraint table_locations_source_metadata_check check (
    (
      source_name = 'community'
      and submitted_by is not null
      and source_external_id is null
    )
    or
    (
      source_name = 'openstreetmap'
      and submitted_by is null
      and source_external_id is not null
      and source_url ~ '^https://www\.openstreetmap\.org/'
      and source_license = 'ODbL-1.0'
    )
  );

create unique index if not exists table_locations_source_identity_idx
  on public.table_locations (source_name, source_external_id)
  where source_external_id is not null;

comment on column public.table_locations.source_name is
  'Origin of the listing: a community submission or an approved open-data import.';
comment on column public.table_locations.source_external_id is
  'Stable source identity used to make imports idempotent and prevent duplicates.';
comment on column public.table_locations.source_url is
  'Public link to the individual source record.';
comment on column public.table_locations.source_license is
  'License identifier retained for imported records and attribution compliance.';
comment on column public.table_locations.source_observed_at is
  'Timestamp of the source snapshot used for the latest import.';
