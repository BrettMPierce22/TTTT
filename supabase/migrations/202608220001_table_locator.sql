-- Table Talk Table Tennis: moderated public table locator
-- Run through the Supabase migration workflow before enabling the UI in production.

create extension if not exists pgcrypto;

create table if not exists public.table_locator_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_table_locator_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.table_locator_moderators
    where user_id = (select auth.uid())
  );
$$;

create table if not exists public.table_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 120),
  address text not null check (char_length(trim(address)) between 5 and 200),
  city text not null check (char_length(trim(city)) between 2 and 100),
  region text not null check (char_length(trim(region)) between 2 and 100),
  postal_code text check (postal_code is null or char_length(trim(postal_code)) <= 20),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  venue_type text not null default 'other' check (
    venue_type in ('park', 'community_center', 'club', 'bar_restaurant', 'school', 'other')
  ),
  access_type text not null default 'unknown' check (
    access_type in ('free', 'paid', 'members', 'unknown')
  ),
  indoor boolean not null default false,
  table_count integer not null default 1 check (table_count between 1 and 50),
  hours_text text check (hours_text is null or char_length(hours_text) <= 300),
  notes text check (notes is null or char_length(notes) <= 1200),
  website_url text check (
    website_url is null
    or (
      char_length(website_url) <= 500
      and website_url ~* '^https://'
    )
  ),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'archived')
  ),
  moderation_note text check (
    moderation_note is null or char_length(moderation_note) <= 500
  ),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.table_location_reviews (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.table_locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 100),
  body text check (body is null or char_length(body) <= 1000),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'removed')
  ),
  moderation_note text check (
    moderation_note is null or char_length(moderation_note) <= 500
  ),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, user_id)
);

create table if not exists public.table_location_reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.table_locations(id) on delete cascade,
  review_id uuid references public.table_location_reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (
    reason in ('closed', 'private_property', 'unsafe', 'incorrect', 'abusive', 'other')
  ),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (
    status in ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.table_locator_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id)
);

create index if not exists table_locations_status_created_idx
  on public.table_locations (status, created_at desc);
create index if not exists table_locations_coordinates_idx
  on public.table_locations (latitude, longitude);
create index if not exists table_location_reviews_location_status_idx
  on public.table_location_reviews (location_id, status, created_at desc);
create index if not exists table_location_reports_status_created_idx
  on public.table_location_reports (status, created_at desc);

create or replace function public.table_locator_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists table_locations_set_updated_at on public.table_locations;
create trigger table_locations_set_updated_at
before update on public.table_locations
for each row execute function public.table_locator_set_updated_at();

drop trigger if exists table_location_reviews_set_updated_at on public.table_location_reviews;
create trigger table_location_reviews_set_updated_at
before update on public.table_location_reviews
for each row execute function public.table_locator_set_updated_at();

alter table public.table_locator_moderators enable row level security;
alter table public.table_locations enable row level security;
alter table public.table_location_reviews enable row level security;
alter table public.table_location_reports enable row level security;
alter table public.table_locator_blocks enable row level security;

drop policy if exists "Moderators can see their role" on public.table_locator_moderators;
create policy "Moderators can see their role"
on public.table_locator_moderators for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Approved locations are visible" on public.table_locations;
create policy "Approved locations are visible"
on public.table_locations for select
to anon, authenticated
using (
  status = 'approved'
  or submitted_by = (select auth.uid())
  or public.is_table_locator_moderator()
);

drop policy if exists "Users can submit pending locations" on public.table_locations;
create policy "Users can submit pending locations"
on public.table_locations for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and moderated_by is null
  and moderated_at is null
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
);

drop policy if exists "Users can delete their pending locations" on public.table_locations;
create policy "Users can delete their pending locations"
on public.table_locations for delete
to authenticated
using (
  submitted_by = (select auth.uid())
  and status = 'pending'
);

drop policy if exists "Moderators manage locations" on public.table_locations;
create policy "Moderators manage locations"
on public.table_locations for all
to authenticated
using (public.is_table_locator_moderator())
with check (public.is_table_locator_moderator());

drop policy if exists "Approved reviews are visible" on public.table_location_reviews;
create policy "Approved reviews are visible"
on public.table_location_reviews for select
to anon, authenticated
using (
  (
    status = 'approved'
    and not exists (
      select 1
      from public.table_locator_blocks blocks
      where blocks.blocker_id = (select auth.uid())
        and blocks.blocked_user_id = table_location_reviews.user_id
    )
  )
  or user_id = (select auth.uid())
  or public.is_table_locator_moderator()
);

drop policy if exists "Users can submit pending reviews" on public.table_location_reviews;
create policy "Users can submit pending reviews"
on public.table_location_reviews for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and moderated_by is null
  and moderated_at is null
  and exists (
    select 1
    from public.table_locations locations
    where locations.id = location_id
      and locations.status = 'approved'
  )
);

drop policy if exists "Users can edit their pending reviews" on public.table_location_reviews;
create policy "Users can edit their pending reviews"
on public.table_location_reviews for update
to authenticated
using (
  user_id = (select auth.uid())
  and status = 'pending'
)
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and moderated_by is null
  and moderated_at is null
);

drop policy if exists "Users can delete their reviews" on public.table_location_reviews;
create policy "Users can delete their reviews"
on public.table_location_reviews for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Moderators manage reviews" on public.table_location_reviews;
create policy "Moderators manage reviews"
on public.table_location_reviews for all
to authenticated
using (public.is_table_locator_moderator())
with check (public.is_table_locator_moderator());

drop policy if exists "Users can file reports" on public.table_location_reports;
create policy "Users can file reports"
on public.table_location_reports for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and status = 'open'
  and resolved_by is null
  and resolved_at is null
);

drop policy if exists "Users can see their reports" on public.table_location_reports;
create policy "Users can see their reports"
on public.table_location_reports for select
to authenticated
using (
  reporter_id = (select auth.uid())
  or public.is_table_locator_moderator()
);

drop policy if exists "Moderators manage reports" on public.table_location_reports;
create policy "Moderators manage reports"
on public.table_location_reports for all
to authenticated
using (public.is_table_locator_moderator())
with check (public.is_table_locator_moderator());

drop policy if exists "Users manage their block list" on public.table_locator_blocks;
create policy "Users manage their block list"
on public.table_locator_blocks for all
to authenticated
using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()));

revoke all on function public.is_table_locator_moderator() from public;
grant execute on function public.is_table_locator_moderator() to anon, authenticated;

grant select on public.table_locations to anon;
grant select, insert, update, delete on public.table_locations to authenticated;
grant select on public.table_location_reviews to anon;
grant select, insert, update, delete on public.table_location_reviews to authenticated;
grant select, insert, update on public.table_location_reports to authenticated;
grant select, insert, delete on public.table_locator_blocks to authenticated;
grant select on public.table_locator_moderators to authenticated;

comment on table public.table_locations is
  'Moderated public ping-pong table locations. User submissions remain pending until approved.';
comment on table public.table_location_reviews is
  'Moderated one-per-user ratings and reviews for approved table locations.';
comment on table public.table_location_reports is
  'Safety and accuracy reports for table locations and reviews.';
