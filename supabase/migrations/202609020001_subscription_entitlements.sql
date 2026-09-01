-- DRAFT: authoritative Free/Plus/Pro entitlement foundation.
-- Do not apply to production without explicit migration approval. This does not
-- create Apple products, charge a user, or enable a paywall by itself.

create table if not exists public.account_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null check (
    entitlement in ('league_plus', 'league_pro')
  ),
  status text not null check (
    status in ('trialing', 'active', 'grace_period', 'expired', 'revoked')
  ),
  provider text not null check (
    provider in ('apple', 'stripe', 'promotional')
  ),
  product_id text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  grace_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement),
  check (product_id is null or char_length(product_id) between 1 and 200),
  check (provider_customer_id is null or char_length(provider_customer_id) between 1 and 300),
  check (provider_subscription_id is null or char_length(provider_subscription_id) between 1 and 300)
);

create table if not exists public.billing_webhook_events (
  provider text not null check (provider in ('revenuecat', 'stripe', 'apple')),
  event_id text not null check (char_length(event_id) between 1 and 300),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

alter table public.account_entitlements enable row level security;
alter table public.billing_webhook_events enable row level security;

-- Provider identifiers and webhook receipts are never client-readable. The app
-- receives an allowlisted summary only through get_my_plan().
revoke all on public.account_entitlements from public, anon, authenticated;
revoke all on public.billing_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.account_entitlements to service_role;
grant select, insert, update, delete on public.billing_webhook_events to service_role;

create or replace function public.has_active_entitlement(p_entitlement text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  if p_entitlement not in ('league_plus', 'league_pro') then
    return false;
  end if;

  return exists (
    select 1
    from public.account_entitlements entitlements
    where entitlements.user_id = (select auth.uid())
      -- Pro includes every Plus capability. Plus never satisfies a Pro check.
      and (
        entitlements.entitlement = p_entitlement
        or (
          p_entitlement = 'league_plus'
          and entitlements.entitlement = 'league_pro'
        )
      )
      and (
        (
          entitlements.status in ('trialing', 'active')
          and (
            entitlements.current_period_end is null
            or entitlements.current_period_end > now()
          )
        )
        or (
          entitlements.status = 'grace_period'
          and entitlements.grace_period_end > now()
        )
      )
  );
end;
$$;

create or replace function public.get_my_plan()
returns table (
  plan text,
  subscription_status text,
  current_period_end timestamptz,
  features jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entitlement public.account_entitlements%rowtype;
  v_plan text := 'free';
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- If provider transitions briefly leave two active rows, always resolve to
  -- the higher plan and never expose provider/customer identifiers.
  select * into v_entitlement
  from public.account_entitlements entitlements
  where entitlements.user_id = (select auth.uid())
    and (
      (
        entitlements.status in ('trialing', 'active')
        and (
          entitlements.current_period_end is null
          or entitlements.current_period_end > now()
        )
      )
      or (
        entitlements.status = 'grace_period'
        and entitlements.grace_period_end > now()
      )
    )
  order by
    case entitlements.entitlement when 'league_pro' then 2 else 1 end desc,
    entitlements.updated_at desc
  limit 1;

  if v_entitlement.user_id is not null then
    v_plan := case
      when v_entitlement.entitlement = 'league_pro' then 'pro'
      else 'plus'
    end;
  else
    -- Preserve a useful expired/revoked status without granting paid access.
    select * into v_entitlement
    from public.account_entitlements entitlements
    where entitlements.user_id = (select auth.uid())
    order by entitlements.updated_at desc
    limit 1;
  end if;

  return query select
    v_plan,
    case
      when v_entitlement.user_id is null then 'not_subscribed'
      else v_entitlement.status
    end,
    v_entitlement.current_period_end,
    case v_plan
      when 'pro' then jsonb_build_object(
        'ownedActiveLeagues', 5,
        'activePlayersPerLeague', 100,
        'activeTournaments', 10,
        'tournamentEntrants', 128,
        'analytics', 'advanced',
        'exports', true,
        'customBranding', true
      )
      when 'plus' then jsonb_build_object(
        'ownedActiveLeagues', 2,
        'activePlayersPerLeague', 32,
        'activeTournaments', 2,
        'tournamentEntrants', 32,
        'analytics', 'expanded',
        'exports', false,
        'customBranding', false
      )
      else jsonb_build_object(
        'ownedActiveLeagues', 1,
        'activePlayersPerLeague', 16,
        'activeTournaments', 1,
        'tournamentEntrants', 16,
        'analytics', 'basic',
        'exports', false,
        'customBranding', false
      )
    end;
end;
$$;

revoke all on function public.has_active_entitlement(text) from public;
revoke all on function public.get_my_plan() from public;
grant execute on function public.has_active_entitlement(text) to authenticated;
grant execute on function public.get_my_plan() to authenticated;

comment on table public.account_entitlements is
  'Server-maintained Plus and Pro entitlements. Provider metadata is private; clients receive only an allowlisted plan summary.';
comment on table public.billing_webhook_events is
  'Idempotency ledger for verified provider webhooks; never exposed to app clients.';
