-- Preserve league history without retaining personal data when an Auth user
-- permanently deletes their account.

alter table public.players
  alter column user_id drop not null;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'players'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name in (
        select constraint_name
        from information_schema.key_column_usage
        where table_schema = 'public'
          and table_name = 'players'
          and column_name = 'user_id'
      )
  loop
    execute format(
      'alter table public.players drop constraint %I',
      constraint_record.constraint_name
    );
  end loop;

  alter table public.players
    add constraint players_user_id_fkey
    foreign key (user_id) references auth.users(id)
    on delete set null;
end;
$$;

create or replace function public.prepare_deleted_account_data()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_player_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[])
    into deleted_player_ids
  from public.players
  where user_id = old.id;

  if array_length(deleted_player_ids, 1) is not null then
    delete from public.league_messages
    where player_id = any(deleted_player_ids);

    delete from public.direct_messages
    where sender_player_id = any(deleted_player_ids);

    update public.players
    set
      user_id = null,
      name = 'Deleted Player',
      avatar_url = null,
      is_active = false,
      removed_at = coalesce(removed_at, now()),
      profile_description = '',
      height_text = '',
      avg_ball_velocity = null,
      play_status = 'idle'
    where id = any(deleted_player_ids);
  end if;

  delete from public.account_profiles where user_id = old.id;
  return old;
end;
$$;

drop trigger if exists prepare_deleted_account_data
on auth.users;

create trigger prepare_deleted_account_data
before delete on auth.users
for each row execute function public.prepare_deleted_account_data();

revoke all on function public.prepare_deleted_account_data() from public;

comment on function public.prepare_deleted_account_data() is
  'Removes user-authored chat and anonymizes historical player records before permanent Auth account deletion.';
