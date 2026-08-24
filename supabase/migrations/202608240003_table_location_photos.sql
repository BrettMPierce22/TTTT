-- Private, moderated photos for community table locations.

alter table public.table_locations
  add column if not exists photo_path text;

alter table public.table_locations
  drop constraint if exists table_locations_photo_path_check;

alter table public.table_locations
  add constraint table_locations_photo_path_check check (
    photo_path is null
    or (
      char_length(photo_path) <= 160
      and photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/table\.(jpg|png|webp)$'
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'table-location-photos',
  'table-location-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can submit pending locations" on public.table_locations;
create policy "Users can submit pending locations"
on public.table_locations for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and moderated_by is null
  and moderated_at is null
  and (
    photo_path is null
    or photo_path like (select auth.uid())::text || '/' || id::text || '/table.%'
  )
);

drop policy if exists "Users can edit their pending locations" on public.table_locations;
create policy "Users can edit their pending locations"
on public.table_locations for update
to authenticated
using (
  submitted_by = (select auth.uid())
  and status = 'pending'
)
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and moderated_by is null
  and moderated_at is null
  and (
    photo_path is null
    or photo_path like (select auth.uid())::text || '/' || id::text || '/table.%'
  )
);

drop policy if exists "Users upload their own table photos" on storage.objects;
create policy "Users upload their own table photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'table-location-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users update their own table photos" on storage.objects;
create policy "Users update their own table photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'table-location-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'table-location-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users remove their own table photos" on storage.objects;
create policy "Users remove their own table photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'table-location-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_table_locator_moderator()
  )
);

drop policy if exists "Visible table photos can be read" on storage.objects;
create policy "Visible table photos can be read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'table-location-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_table_locator_moderator()
    or exists (
      select 1
      from public.table_locations locations
      where locations.photo_path = storage.objects.name
        and locations.status = 'approved'
    )
  )
);
