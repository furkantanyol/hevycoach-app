-- HevyCoach backend tables.
--
-- Only the service role touches any of these: the edge functions authenticate
-- their own callers (a device-computed identity hash, or a shared secret for the
-- Hevy webhook) and there is no Supabase auth in the app. Row level security is
-- therefore enabled everywhere with no policies at all, so a leaked publishable
-- key reads nothing.

-- Fixed-window rate limiting, per identity and per endpoint.
create table public.rate_limits (
  identity_hash text not null,
  endpoint text not null,
  window_start timestamptz not null,
  request_count integer not null,
  primary key (identity_hash, endpoint, window_start)
);

comment on table public.rate_limits is
  'Fixed-window request counts. Rows older than the longest window are disposable.';

create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- One statement, so two concurrent requests cannot both read the same count and
-- both decide they are under the limit. The returned count is the caller's own
-- position in the window, including this request.
create function public.increment_rate_limit(
  p_identity_hash text,
  p_endpoint text,
  p_window_start timestamptz
) returns integer
language sql
as $$
  insert into public.rate_limits (identity_hash, endpoint, window_start, request_count)
  values (p_identity_hash, p_endpoint, p_window_start, 1)
  on conflict (identity_hash, endpoint, window_start)
    do update set request_count = public.rate_limits.request_count + 1
  returning request_count;
$$;

-- Expo push tokens, one per identity.
create table public.push_tokens (
  identity_hash text primary key,
  expo_push_token text not null,
  updated_at timestamptz not null default now()
);

create function public.push_token_for_identity(p_identity_hash text)
returns text
language sql
stable
as $$
  select expo_push_token from public.push_tokens where identity_hash = p_identity_hash;
$$;

-- Every notification actually sent, which is what the two-per-week cap counts.
create table public.notifications_sent (
  id bigint generated always as identity primary key,
  identity_hash text not null,
  kind text not null,
  sent_at timestamptz not null default now()
);

create index notifications_sent_identity_sent_at_idx
  on public.notifications_sent (identity_hash, sent_at desc);

-- One statement again: the row is inserted only while the count inside the
-- window is under the cap, so two concurrent webhooks cannot both take the last
-- slot. The cutoff is passed in rather than computed here, so the window lives
-- in one place in the code.
create function public.claim_notification_slot(
  p_identity_hash text,
  p_kind text,
  p_since timestamptz,
  p_max integer
) returns boolean
language sql
as $$
  with claimed as (
    insert into public.notifications_sent (identity_hash, kind)
    select p_identity_hash, p_kind
    where (
      select count(*) from public.notifications_sent
      where identity_hash = p_identity_hash and sent_at >= p_since
    ) < p_max
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- Hevy webhook deliveries. The primary key is Hevy's own event id, so a replay
-- is recorded once.
create table public.webhook_events (
  id text primary key,
  workout_id text not null,
  received_at timestamptz not null default now()
);

create index webhook_events_received_at_idx on public.webhook_events (received_at desc);

-- Returns true the first time an event id is seen and false for a replay.
create function public.record_webhook_event(p_id text, p_workout_id text)
returns boolean
language sql
as $$
  with recorded as (
    insert into public.webhook_events (id, workout_id)
    values (p_id, p_workout_id)
    on conflict (id) do nothing
    returning 1
  )
  select exists (select 1 from recorded);
$$;

alter table public.rate_limits enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications_sent enable row level security;
alter table public.webhook_events enable row level security;

revoke execute on function public.increment_rate_limit(text, text, timestamptz) from public;
revoke execute on function public.push_token_for_identity(text) from public;
revoke execute on function public.claim_notification_slot(text, text, timestamptz, integer) from public;
revoke execute on function public.record_webhook_event(text, text) from public;

grant execute on function public.increment_rate_limit(text, text, timestamptz) to service_role;
grant execute on function public.push_token_for_identity(text) to service_role;
grant execute on function public.claim_notification_slot(text, text, timestamptz, integer) to service_role;
grant execute on function public.record_webhook_event(text, text) to service_role;
