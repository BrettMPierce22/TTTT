-- Private, league-scoped player conversations with reporting and blocking.

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_low_id uuid not null references public.players(id) on delete cascade,
  player_high_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_low_id <> player_high_id),
  unique (league_id, player_low_id, player_high_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_player_id uuid not null references public.players(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_player_blocks (
  blocker_player_id uuid not null references public.players(id) on delete cascade,
  blocked_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_player_id, blocked_player_id),
  check (blocker_player_id <> blocked_player_id)
);

create table if not exists public.chat_message_reports (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  reporter_player_id uuid not null references public.players(id) on delete cascade,
  league_message_id uuid references public.league_messages(id) on delete cascade,
  direct_message_id uuid references public.direct_messages(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'spam', 'hate', 'threat', 'other')),
  details text check (details is null or char_length(details) <= 800),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  check ((league_message_id is null) <> (direct_message_id is null))
);

create index if not exists direct_messages_conversation_created_idx
  on public.direct_messages (conversation_id, created_at);
create index if not exists chat_message_reports_league_status_idx
  on public.chat_message_reports (league_id, status, created_at desc);

drop trigger if exists direct_conversations_set_updated_at on public.direct_conversations;
create trigger direct_conversations_set_updated_at
before update on public.direct_conversations
for each row execute function public.tttt_set_updated_at();

create or replace function public.tttt_chat_filter(p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_message, ''), '\m(fuck|fucking|fucker)\M', '****', 'gi'),
        '\m(shit|bullshit)\M', '****', 'gi'
      ),
      '\m(bitch|bitches)\M', '*****', 'gi'
    )
  );
$$;

create or replace function public.tttt_is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.direct_conversations conversations
    where conversations.id = p_conversation_id
      and public.tttt_active_player_id(conversations.league_id)
          in (conversations.player_low_id, conversations.player_high_id)
  );
$$;

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;
alter table public.chat_player_blocks enable row level security;
alter table public.chat_message_reports enable row level security;

drop policy if exists "Conversation members can view conversations" on public.direct_conversations;
create policy "Conversation members can view conversations"
on public.direct_conversations for select to authenticated
using (
  public.tttt_active_player_id(league_id) in (player_low_id, player_high_id)
);

drop policy if exists "Conversation members can view direct messages" on public.direct_messages;
create policy "Conversation members can view direct messages"
on public.direct_messages for select to authenticated
using (public.tttt_is_conversation_member(conversation_id));

drop policy if exists "Players can view their chat blocks" on public.chat_player_blocks;
create policy "Players can view their chat blocks"
on public.chat_player_blocks for select to authenticated
using (
  blocker_player_id in (
    select players.id from public.players
    where players.user_id = (select auth.uid()) and players.is_active
  )
);

drop policy if exists "Players can view their chat reports" on public.chat_message_reports;
create policy "Players can view their chat reports"
on public.chat_message_reports for select to authenticated
using (
  reporter_player_id = public.tttt_active_player_id(league_id)
  or public.tttt_is_league_admin(league_id)
);

create or replace function public.get_or_create_direct_conversation(
  p_league_id uuid,
  p_other_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_low uuid;
  v_high uuid;
  v_conversation_id uuid;
begin
  v_me := public.tttt_active_player_id(p_league_id);
  if v_me is null then raise exception 'You are not an active member of this league.'; end if;
  if p_other_player_id = v_me then raise exception 'Choose another league player.'; end if;
  if not exists (
    select 1 from public.players
    where players.id = p_other_player_id
      and players.league_id = p_league_id
      and players.is_active
  ) then raise exception 'That player is not active in this league.'; end if;

  if exists (
    select 1 from public.chat_player_blocks
    where (blocker_player_id = v_me and blocked_player_id = p_other_player_id)
       or (blocker_player_id = p_other_player_id and blocked_player_id = v_me)
  ) then raise exception 'This direct conversation is unavailable.'; end if;

  if v_me::text < p_other_player_id::text then
    v_low := v_me; v_high := p_other_player_id;
  else
    v_low := p_other_player_id; v_high := v_me;
  end if;

  insert into public.direct_conversations (league_id, player_low_id, player_high_id)
  values (p_league_id, v_low, v_high)
  on conflict (league_id, player_low_id, player_high_id)
  do update set updated_at = now()
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

create or replace function public.send_direct_message(
  p_conversation_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.direct_conversations%rowtype;
  v_me uuid;
  v_other uuid;
  v_message_id uuid;
  v_clean text;
begin
  select * into v_conversation from public.direct_conversations
  where id = p_conversation_id;
  if v_conversation.id is null then raise exception 'Conversation not found.'; end if;

  v_me := public.tttt_active_player_id(v_conversation.league_id);
  if v_me is null
     or v_me not in (v_conversation.player_low_id, v_conversation.player_high_id) then
    raise exception 'You cannot access this conversation.';
  end if;
  v_other := case when v_me = v_conversation.player_low_id
    then v_conversation.player_high_id else v_conversation.player_low_id end;
  if exists (
    select 1 from public.chat_player_blocks
    where (blocker_player_id = v_me and blocked_player_id = v_other)
       or (blocker_player_id = v_other and blocked_player_id = v_me)
  ) then raise exception 'This direct conversation is unavailable.'; end if;

  v_clean := public.tttt_chat_filter(p_message);
  if char_length(v_clean) not between 1 and 500 then
    raise exception 'Messages must be between 1 and 500 characters.';
  end if;

  insert into public.direct_messages (conversation_id, sender_player_id, message)
  values (p_conversation_id, v_me, v_clean)
  returning id into v_message_id;
  update public.direct_conversations set updated_at = now()
  where id = p_conversation_id;
  return v_message_id;
end;
$$;

create or replace function public.delete_direct_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.direct_messages%rowtype;
  v_conversation public.direct_conversations%rowtype;
  v_me uuid;
begin
  select * into v_message from public.direct_messages where id = p_message_id;
  if v_message.id is null then return; end if;
  select * into v_conversation from public.direct_conversations where id = v_message.conversation_id;
  v_me := public.tttt_active_player_id(v_conversation.league_id);
  if v_me is null then
    raise exception 'You cannot access this conversation.';
  end if;
  if v_message.sender_player_id <> v_me
     and not public.tttt_is_league_admin(v_conversation.league_id) then
    raise exception 'You cannot delete this message.';
  end if;
  delete from public.direct_messages where id = p_message_id;
end;
$$;

create or replace function public.set_chat_player_block(
  p_league_id uuid,
  p_blocked_player_id uuid,
  p_blocked boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
begin
  v_me := public.tttt_active_player_id(p_league_id);
  if v_me is null or v_me = p_blocked_player_id then raise exception 'Invalid block request.'; end if;
  if not exists (
    select 1 from public.players where id = p_blocked_player_id and league_id = p_league_id
  ) then raise exception 'That player is not in this league.'; end if;
  if p_blocked then
    insert into public.chat_player_blocks (blocker_player_id, blocked_player_id)
    values (v_me, p_blocked_player_id) on conflict do nothing;
  else
    delete from public.chat_player_blocks
    where blocker_player_id = v_me and blocked_player_id = p_blocked_player_id;
  end if;
end;
$$;

create or replace function public.report_chat_message(
  p_league_id uuid,
  p_league_message_id uuid,
  p_direct_message_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_report_id uuid;
begin
  v_me := public.tttt_active_player_id(p_league_id);
  if v_me is null then raise exception 'You are not an active league member.'; end if;
  if (p_league_message_id is null) = (p_direct_message_id is null) then
    raise exception 'Choose one message to report.';
  end if;
  if p_reason not in ('harassment', 'spam', 'hate', 'threat', 'other') then
    raise exception 'Choose a valid report reason.';
  end if;
  if p_league_message_id is not null and not exists (
    select 1 from public.league_messages
    where id = p_league_message_id and league_id = p_league_id and player_id <> v_me
  ) then raise exception 'League message not found.'; end if;
  if p_direct_message_id is not null and not exists (
    select 1
    from public.direct_messages messages
    join public.direct_conversations conversations on conversations.id = messages.conversation_id
    where messages.id = p_direct_message_id
      and conversations.league_id = p_league_id
      and messages.sender_player_id <> v_me
      and v_me in (conversations.player_low_id, conversations.player_high_id)
  ) then raise exception 'Direct message not found.'; end if;

  insert into public.chat_message_reports (
    league_id, reporter_player_id, league_message_id, direct_message_id, reason, details
  ) values (
    p_league_id, v_me, p_league_message_id, p_direct_message_id,
    p_reason, nullif(trim(coalesce(p_details, '')), '')
  ) returning id into v_report_id;
  return v_report_id;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;

revoke all on function public.tttt_chat_filter(text) from public;
revoke all on function public.tttt_is_conversation_member(uuid) from public;
revoke all on function public.get_or_create_direct_conversation(uuid,uuid) from public;
revoke all on function public.send_direct_message(uuid,text) from public;
revoke all on function public.delete_direct_message(uuid) from public;
revoke all on function public.set_chat_player_block(uuid,uuid,boolean) from public;
revoke all on function public.report_chat_message(uuid,uuid,uuid,text,text) from public;

grant execute on function public.tttt_is_conversation_member(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid,uuid) to authenticated;
grant execute on function public.send_direct_message(uuid,text) to authenticated;
grant execute on function public.delete_direct_message(uuid) to authenticated;
grant execute on function public.set_chat_player_block(uuid,uuid,boolean) to authenticated;
grant execute on function public.report_chat_message(uuid,uuid,uuid,text,text) to authenticated;

grant select on public.direct_conversations to authenticated;
grant select on public.direct_messages to authenticated;
grant select on public.chat_player_blocks to authenticated;
grant select on public.chat_message_reports to authenticated;

comment on table public.direct_conversations is 'Private one-to-one conversations between two active players in the same league.';
comment on table public.chat_message_reports is 'Member-submitted safety reports for league and direct chat messages.';
