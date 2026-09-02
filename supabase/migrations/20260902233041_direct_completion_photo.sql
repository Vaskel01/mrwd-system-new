begin;

alter table public.maintenance_tasks
  add column if not exists completion_photo_url text;

-- Preserve already-finished legacy work while removing the obsolete
-- WDLCD verification queue from existing installations.
update public.maintenance_tasks
set status = 'completed',
    completed_at = coalesce(completed_at, now())
where complaint_id in (
  select id
  from public.complaints
  where status = 'awaiting_verification'
);

update public.complaints
set status = 'resolved',
    resolution_code = coalesce(resolution_code, 'resolved'),
    updated_at = now()
where status = 'awaiting_verification';

alter table public.complaints
  drop constraint if exists complaints_status_check;

alter table public.complaints
  add constraint complaints_status_check check (status in (
    'pending', 'forwarded', 'assigned', 'en_route', 'in_progress', 'completed', 'blocked',
    'resolved', 'rejected', 'cancelled', 'merged'
  ));

drop index if exists public.complaints_active_priority_idx;
create index complaints_active_priority_idx
  on public.complaints (priority, updated_at desc)
  where archived_at is null
    and status in ('pending', 'forwarded', 'assigned', 'en_route', 'in_progress', 'blocked');

update public.divisions
set responsibilities = 'Receives field-related complaints under ECMD, assigns Maintenance Crews or Maintenance Personnel, and coordinates field work through completion.'
where code = 'WDLCD';

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maintenance_tasks'
      and column_name = 'completion_photo_url'
  ) then
    raise exception 'completion_photo_url migration did not apply';
  end if;

  if exists (select 1 from public.complaints where status = 'awaiting_verification') then
    raise exception 'legacy verification complaints remain after migration';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
