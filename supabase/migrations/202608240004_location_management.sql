-- Let submitters safely manage their own table listings.
-- Approved edits return to pending review; moderators keep full access.

drop policy if exists "Users can edit their pending locations"
on public.table_locations;

drop policy if exists "Users can edit their own locations"
on public.table_locations;

create policy "Users can edit their own locations"
on public.table_locations for update
to authenticated
using (
  submitted_by = (select auth.uid())
  and status in ('pending', 'approved', 'rejected')
)
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and moderated_by is null
  and moderated_at is null
  and last_verified_at is null
  and (
    photo_path is null
    or photo_path like (select auth.uid())::text || '/' || id::text || '/table.%'
  )
);

drop policy if exists "Users can delete their pending locations"
on public.table_locations;

drop policy if exists "Users can delete their own locations"
on public.table_locations;

create policy "Users can delete their own locations"
on public.table_locations for delete
to authenticated
using (submitted_by = (select auth.uid()));

comment on policy "Users can edit their own locations" on public.table_locations is
  'Submitters may edit their own listing, but every edit is returned to pending review.';

comment on policy "Users can delete their own locations" on public.table_locations is
  'Submitters may permanently remove their own listing; related reviews and reports cascade.';
