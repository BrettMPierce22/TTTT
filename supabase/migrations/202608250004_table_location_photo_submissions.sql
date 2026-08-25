-- Private photo suggestions for existing table listings.
-- Prepared locally only. Do not apply to a live project without user approval.

alter table public.table_locations
  drop constraint if exists table_locations_photo_path_check;

alter table public.table_locations
  add constraint table_locations_photo_path_check check (
    photo_path is null
    or (
      char_length(photo_path) <= 220
      and photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(table|[0-9a-f-]{36})\.(jpg|png|webp)$'
    )
  );

create table if not exists public.table_location_photo_submissions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.table_locations(id) on delete cascade,
  contributor_id uuid not null references auth.users(id) on delete cascade,
  photo_path text not null,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  moderation_note text check (
    moderation_note is null or char_length(moderation_note) <= 500
  ),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint table_location_photo_submission_path_check check (
    photo_path = contributor_id::text || '/' || location_id::text || '/' || id::text || '.jpg'
    or photo_path = contributor_id::text || '/' || location_id::text || '/' || id::text || '.png'
    or photo_path = contributor_id::text || '/' || location_id::text || '/' || id::text || '.webp'
  )
);

create index if not exists table_location_photo_submissions_queue_idx
  on public.table_location_photo_submissions (status, created_at asc);

create unique index if not exists table_location_photo_submissions_one_pending_idx
  on public.table_location_photo_submissions (location_id, contributor_id)
  where status = 'pending';

alter table public.table_location_photo_submissions enable row level security;

drop policy if exists "Users submit their own table photo suggestions"
  on public.table_location_photo_submissions;
create policy "Users submit their own table photo suggestions"
on public.table_location_photo_submissions for insert
to authenticated
with check (
  contributor_id = (select auth.uid())
  and status = 'pending'
  and moderated_by is null
  and moderated_at is null
);

drop policy if exists "Users see their own table photo suggestions"
  on public.table_location_photo_submissions;
create policy "Users see their own table photo suggestions"
on public.table_location_photo_submissions for select
to authenticated
using (
  contributor_id = (select auth.uid())
  or public.is_table_locator_moderator()
);

drop policy if exists "Moderators manage table photo suggestions"
  on public.table_location_photo_submissions;
create policy "Moderators manage table photo suggestions"
on public.table_location_photo_submissions for all
to authenticated
using (public.is_table_locator_moderator())
with check (public.is_table_locator_moderator());

-- Published and submitted images are immutable to their uploader. This closes
-- the gap where an already-approved image could otherwise be silently replaced.
drop policy if exists "Users update their own table photos" on storage.objects;
drop policy if exists "Users update unsubmitted table photos" on storage.objects;
create policy "Users update unsubmitted table photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'table-location-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
    from public.table_locations locations
    where locations.photo_path = storage.objects.name
      and locations.status = 'approved'
  )
  and not exists (
    select 1
    from public.table_location_photo_submissions submissions
    where submissions.photo_path = storage.objects.name
  )
)
with check (
  bucket_id = 'table-location-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users remove their own table photos" on storage.objects;
drop policy if exists "Users remove unsubmitted table photos" on storage.objects;
create policy "Users remove unsubmitted table photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'table-location-photos'
  and (
    public.is_table_locator_moderator()
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and not exists (
        select 1
        from public.table_locations locations
        where locations.photo_path = storage.objects.name
          and locations.status = 'approved'
      )
      and not exists (
        select 1
        from public.table_location_photo_submissions submissions
        where submissions.photo_path = storage.objects.name
      )
    )
  )
);

create or replace function public.moderate_table_location_photo_submission(
  p_submission_id uuid,
  p_action text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.table_location_photo_submissions%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_now timestamptz := now();
begin
  if not public.is_table_locator_moderator() then
    raise exception 'Moderator access is required.' using errcode = '42501';
  end if;
  if p_action not in ('approved', 'rejected') then
    raise exception 'Invalid photo moderation action.';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Moderator notes cannot exceed 500 characters.';
  end if;

  select * into v_submission
  from public.table_location_photo_submissions
  where id = p_submission_id and status = 'pending'
  for update;

  if not found then
    raise exception 'This photo was already handled or no longer exists.';
  end if;

  if p_action = 'approved' then
    update public.table_locations
    set photo_path = v_submission.photo_path,
        updated_at = v_now
    where id = v_submission.location_id;

    if not found then
      raise exception 'The table listing no longer exists.';
    end if;

    update public.table_location_photo_submissions
    set status = 'rejected',
        moderation_note = 'Another photo was selected.',
        moderated_by = (select auth.uid()),
        moderated_at = v_now
    where location_id = v_submission.location_id
      and status = 'pending'
      and id <> v_submission.id;
  end if;

  update public.table_location_photo_submissions
  set status = p_action,
      moderation_note = v_note,
      moderated_by = (select auth.uid()),
      moderated_at = v_now
  where id = v_submission.id;
end;
$$;

revoke all on function public.moderate_table_location_photo_submission(uuid,text,text)
  from public;
grant execute on function public.moderate_table_location_photo_submission(uuid,text,text)
  to authenticated;

grant select, insert on public.table_location_photo_submissions to authenticated;

comment on table public.table_location_photo_submissions is
  'Private, immutable photo suggestions that require moderator approval before becoming visible.';
comment on function public.moderate_table_location_photo_submission(uuid,text,text) is
  'Securely approves or rejects a private table photo suggestion.';
