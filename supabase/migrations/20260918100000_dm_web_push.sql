-- FRAME — Web Push for DMs (first notification surface to get real push;
-- see 20260912000000_notifications.sql's own comment about a deferred
-- "Milestone 3 APNs" pass for like/comment/follow — that is NOT this. This
-- is a separate, narrower mechanism scoped to dm_messages only.
--
-- Two tables:
--   push_subscriptions — one row per browser/device subscription. Insert is
--   only ever done through register_push_subscription() below (never a
--   direct client insert) because it has to upsert-by-endpoint (a device
--   re-registering, or a different account registering the same browser
--   after a sign-out, must reuse/reassign the row rather than error on a
--   unique-constraint conflict) and because the endpoint host must be
--   checked against a known-push-service allowlist before it's ever
--   persisted — see is_allowed_push_endpoint below for why. Select/delete
--   of your own rows is plain RLS; there's nothing upsert-shaped about
--   either of those.
--
--   push_jobs — the durable outbox. No client access at all (no policy,
--   explicit revoke), same posture as notifications' write side: this is
--   purely an internal delivery queue, and a job row's existence or content
--   (which message, which subscription) is not something either DM
--   participant should be able to read directly.
--
-- Jobs are created by a trigger on dm_messages (enqueue_dm_push_job below),
-- not by the /api/dm/messages route — a direct authenticated insert into
-- dm_messages (which RLS already permits today; the route is a thin
-- convenience wrapper, not the only writer) must still produce a
-- notification job. The trigger is the actual boundary.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select_own on push_subscriptions
  for select using (auth.uid() = user_id);

create policy push_subscriptions_delete_own on push_subscriptions
  for delete using (auth.uid() = user_id);

-- No insert/update grant — see file header. Delete is a plain client-usable
-- action (that's the "disable push on this device" affordance); insert has
-- upsert-by-endpoint + allowlist logic a bare RLS insert policy can't
-- express, so it's RPC-only.
revoke insert, update on table push_subscriptions from authenticated, anon, public;

-- Endpoint SSRF guard: a PushSubscription's endpoint is supplied by the
-- browser at subscribe time, but the value that reaches this function comes
-- from the client's HTTP request body — untrusted input. Without this
-- check, a malicious or compromised client could register an "endpoint"
-- pointing at an internal URL (a cloud metadata address, an internal
-- service), and the worker (which POSTs to whatever endpoint a job's row
-- holds, via the web-push library) would blindly request it with a
-- VAPID-signed payload. Restricting to the actual known push-service hosts
-- — verified against current vendor docs, not guessed — closes that off at
-- the point of storage, not just at send time.
create function is_allowed_push_endpoint(p_endpoint text) returns boolean
language sql
immutable
as $$
  select p_endpoint ~ '^https://fcm\.googleapis\.com/'
      or p_endpoint ~ '^https://updates\.push\.services\.mozilla\.com/'
      or p_endpoint ~ '^https://[a-zA-Z0-9-]+\.push\.apple\.com/';
$$;

create function register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if p_endpoint is null or char_length(p_endpoint) > 1024 or not is_allowed_push_endpoint(p_endpoint) then
    raise exception 'Unsupported push endpoint';
  end if;
  if p_p256dh is null or char_length(p_p256dh) = 0 or char_length(p_p256dh) > 256
     or p_auth is null or char_length(p_auth) = 0 or char_length(p_auth) > 256 then
    raise exception 'Invalid subscription keys';
  end if;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 256))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, -- reassigns to the current caller: a
                                      -- shared device re-subscribing under a
                                      -- different account takes over the row
                                      -- rather than erroring or leaking to
                                      -- the previous owner.
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent,
        last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function register_push_subscription(text, text, text, text) from authenticated, anon, public;
grant execute on function register_push_subscription(text, text, text, text) to authenticated;

create table push_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references dm_messages (id) on delete cascade,
  subscription_id uuid not null references push_subscriptions (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  unique (message_id, subscription_id)
);

-- Claim query filters on (status, attempts); worker cleanup/inspection (not
-- built as a client surface, but useful for a future ops query) filters on
-- recipient_id.
create index push_jobs_pending_idx on push_jobs (status, attempts) where status = 'pending';
create index push_jobs_recipient_idx on push_jobs (recipient_id);

alter table push_jobs enable row level security;
-- No policies at all — default-deny. Explicit revoke as defense-in-depth,
-- matching notifications' posture: only the service-role key (which
-- bypasses RLS and grants both) ever touches this table.
revoke all on table push_jobs from authenticated, anon, public;

-- AFTER INSERT on dm_messages: fan out one push_jobs row per active
-- subscription the recipient (the OTHER thread participant, never the
-- sender) currently has. A trigger, not application code, so this fires
-- for every dm_messages insert regardless of which code path performed it
-- — the /api/dm/messages route is not the only writer RLS permits.
create function enqueue_dm_push_job() returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recipient_id uuid;
begin
  select case when dm_threads.user_a_id = new.sender_id then dm_threads.user_b_id else dm_threads.user_a_id end
  into v_recipient_id
  from dm_threads
  where dm_threads.id = new.thread_id;

  if v_recipient_id is null then
    return new;
  end if;

  insert into push_jobs (message_id, subscription_id, recipient_id)
  select new.id, push_subscriptions.id, v_recipient_id
  from push_subscriptions
  where push_subscriptions.user_id = v_recipient_id
  on conflict (message_id, subscription_id) do nothing;

  return new;
end;
$$;

create trigger dm_messages_enqueue_push
  after insert on dm_messages
  for each row execute function enqueue_dm_push_job();

-- Claims up to p_limit pending jobs (`for update skip locked` — the same
-- concurrency guarantee as claim_and_notify_due_parties: two overlapping
-- worker invocations can never claim the same job). Rechecks, at claim
-- time rather than trusting the state the job was enqueued with:
--   - the subscription still exists (join, not a stale copy)
--   - sender/recipient are not now a blocked pair (blocking can happen
--     after the message was sent but before the job is processed)
--   - the recipient hasn't already read the message (their thread
--     last_read_at is at or after the message's created_at)
-- Any of those true -> the job is marked 'skipped' (terminal, not
-- retried) instead of being handed to the caller to send. Only jobs that
-- pass every recheck are returned, with status flipped to 'processing' and
-- attempts incremented so a crash mid-send still bounds future retries.
create function claim_push_jobs(p_limit integer default 25)
returns table (
  job_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  recipient_id uuid,
  thread_id uuid
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_job record;
  v_sender_id uuid;
  v_thread_id uuid;
  v_message_created_at timestamptz;
  v_recipient_last_read timestamptz;
  v_subscription record;
begin
  for v_job in
    select push_jobs.id, push_jobs.message_id, push_jobs.subscription_id, push_jobs.recipient_id
    from push_jobs
    where push_jobs.status = 'pending' and push_jobs.attempts < 5
    order by push_jobs.created_at
    limit p_limit
    for update skip locked
  loop
    select dm_messages.sender_id, dm_messages.thread_id, dm_messages.created_at
    into v_sender_id, v_thread_id, v_message_created_at
    from dm_messages where dm_messages.id = v_job.message_id;

    select push_subscriptions.endpoint, push_subscriptions.p256dh, push_subscriptions.auth_key
    into v_subscription
    from push_subscriptions where push_subscriptions.id = v_job.subscription_id;

    select case when dm_threads.user_a_id = v_job.recipient_id then dm_threads.user_a_last_read_at else dm_threads.user_b_last_read_at end
    into v_recipient_last_read
    from dm_threads where dm_threads.id = v_thread_id;

    if v_subscription is null
       or is_blocked_pair(v_sender_id, v_job.recipient_id)
       or (v_recipient_last_read is not null and v_recipient_last_read >= v_message_created_at)
    then
      update push_jobs set status = 'skipped', completed_at = now() where push_jobs.id = v_job.id;
      continue;
    end if;

    update push_jobs
    set status = 'processing', attempts = push_jobs.attempts + 1, claimed_at = now()
    where push_jobs.id = v_job.id;

    job_id := v_job.id;
    subscription_id := v_job.subscription_id;
    endpoint := v_subscription.endpoint;
    p256dh := v_subscription.p256dh;
    auth_key := v_subscription.auth_key;
    recipient_id := v_job.recipient_id;
    thread_id := v_thread_id;
    return next;
  end loop;
end;
$$;

revoke execute on function claim_push_jobs(integer) from authenticated, anon, public;

create function mark_push_job_sent(p_job_id uuid) returns void
language sql
security definer set search_path = public
as $$
  update push_jobs set status = 'sent', completed_at = now() where id = p_job_id;
$$;

revoke execute on function mark_push_job_sent(uuid) from authenticated, anon, public;

-- p_expired: the push service returned 404/410 for this subscription's
-- endpoint (permanently gone — revoked permission, uninstalled, browser
-- data cleared). Deletes the subscription row outright (cascades to any
-- other still-pending jobs for it) instead of just failing this one job,
-- so a dead device stops being retried forever. Otherwise: bounded retry —
-- attempts was already incremented at claim time, so this just leaves the
-- job 'pending' again (if under the cap the claim query already enforces)
-- or the next claim pass naturally excludes it once attempts >= 5, at
-- which point it's marked 'dead' here instead of retried indefinitely.
create function mark_push_job_failed(p_job_id uuid, p_error text, p_expired boolean default false) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_subscription_id uuid;
  v_attempts integer;
begin
  select subscription_id, attempts into v_subscription_id, v_attempts from push_jobs where id = p_job_id;

  if p_expired then
    -- Update this job's status first: deleting the subscription cascades
    -- and removes every push_jobs row referencing it (this one included),
    -- so doing the update after the delete would be a silent no-op.
    update push_jobs set status = 'dead', last_error = left(p_error, 500), completed_at = now() where id = p_job_id;
    delete from push_subscriptions where id = v_subscription_id;
  elsif v_attempts >= 5 then
    update push_jobs set status = 'dead', last_error = left(p_error, 500), completed_at = now() where id = p_job_id;
  else
    update push_jobs set status = 'pending', last_error = left(p_error, 500) where id = p_job_id;
  end if;
end;
$$;

revoke execute on function mark_push_job_failed(uuid, text, boolean) from authenticated, anon, public;
