-- Adds collision-safe claiming and bounded retries for external email/SMS jobs.
alter table public.notification_deliveries
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz;

create index if not exists notification_deliveries_retry_idx
  on public.notification_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create or replace function public.claim_notification_deliveries(
  p_limit integer default 25,
  p_channels text[] default array['email', 'sms']::text[]
)
returns setof public.notification_deliveries
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select d.id
    from public.notification_deliveries d
    where d.channel = any(coalesce(p_channels, array[]::text[]))
      and d.status in ('pending', 'failed')
      and d.attempt_count < 3
      and coalesce(d.next_attempt_at, d.created_at) <= now()
    order by coalesce(d.next_attempt_at, d.created_at), d.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.notification_deliveries d
  set status = 'processing',
      attempt_count = d.attempt_count + 1,
      last_attempt_at = now(),
      next_attempt_at = null,
      last_error = null
  from candidates c
  where d.id = c.id
  returning d.*;
end;
$$;

revoke all on function public.claim_notification_deliveries(integer, text[]) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer, text[]) to service_role;
grant select, update on public.notification_deliveries to service_role;
grant select on public.notifications to service_role;

comment on function public.claim_notification_deliveries(integer, text[]) is
  'Atomically claims due email/SMS notification jobs for the server-side delivery worker.';

notify pgrst, 'reload schema';
