begin;

-- Production-readiness expansion for the MRWD complaint-management system.
-- Keeps the approved scope: Commercial Services + ECMD + Maintenance Personnel + System Administration.
-- Still excludes SLA/response-time tracking, maintenance acceptance, and maintenance before/after evidence.

-- ---------------------------------------------------------------------------
-- 1) Account security / staff lifecycle
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists last_password_changed_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists mfa_required boolean not null default false;

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  event_type text not null,
  success boolean not null default true,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on public.security_events (created_at desc);
create index if not exists security_events_actor_idx on public.security_events (actor_id, created_at desc);
alter table public.security_events enable row level security;
grant select on public.security_events to authenticated;
revoke insert, update, delete on public.security_events from authenticated;
drop policy if exists security_events_supervisor_read on public.security_events;
create policy security_events_supervisor_read on public.security_events for select to authenticated
  using (public.current_user_has_capability('system.audit'));
drop policy if exists security_events_own_insert on public.security_events;

-- Mark System Supervisor accounts as MFA-required by policy. This is an app-level
-- requirement; Supabase Auth performs the actual TOTP enrollment/challenge.
update public.profiles
set mfa_required = true
where role = 'admin' and staff_position in ('manager','supervisor');


-- System Supervisor capabilities require AAL2 when mfa_required is enabled.
-- Department staff capabilities are unchanged.
create or replace function public.current_user_has_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
      when p.role <> 'admin' or p.is_active is false then false
      when p.staff_position in ('manager', 'supervisor') then
        p_capability in ('system.dashboard','system.staff','system.audit','system.approvals','system.departments')
        and (not p.mfa_required or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
      when d.code = 'COMMERCIAL' then p_capability in (
        'commercial.complaints', 'commercial.reports', 'commercial.billing',
        'commercial.announcements', 'commercial.archive_request'
      )
      when d.code = 'ECMD' then p_capability in (
        'ecmd.dispatch', 'ecmd.operations', 'ecmd.maintenance_reports'
      )
      else false
    end
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    where p.id = (select auth.uid())
  ), false);
$$;
revoke all on function public.current_user_has_capability(text) from public, anon;
grant execute on function public.current_user_has_capability(text) to authenticated;

-- New staff accounts must replace their temporary password after first login.
create or replace function public.admin_promote_staff(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result public.profiles;
begin
  if not public.current_user_has_capability('system.staff') then raise exception 'System Supervisor access required'; end if;
  if p_role not in ('admin', 'maintenance_personnel') then raise exception 'Invalid staff role'; end if;

  insert into public.profiles (id, email, full_name, role, is_active, must_change_password)
  values (p_user_id, lower(trim(p_email)), trim(p_full_name), p_role, true, true)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        is_active = true,
        must_change_password = true,
        updated_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.admin_promote_staff(uuid, text, text, text) from public, anon;
grant execute on function public.admin_promote_staff(uuid, text, text, text) to authenticated;

-- Security-state changes use narrow RPCs instead of granting clients direct
-- UPDATE access to sensitive profile columns.
create or replace function public.record_my_login()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare recorded_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles set last_login_at = recorded_at, updated_at = recorded_at where id = auth.uid();
  return recorded_at;
end;
$$;

create or replace function public.record_my_password_change()
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles
  set must_change_password = false,
      last_password_changed_at = now(),
      updated_at = now()
  where id = auth.uid()
  returning * into result;
  return result;
end;
$$;

-- Re-harden the legacy assignment RPC and derive MFA policy from the account
-- type so a Commercial/ECMD Department Staff account cannot manage staff.
create or replace function public.admin_update_staff_assignment(
  p_staff_id uuid,
  p_department_id uuid,
  p_staff_position text,
  p_supervisor_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result public.profiles;
begin
  if not public.current_user_has_capability('system.staff') then raise exception 'System Supervisor access required'; end if;
  if p_staff_position is not null and p_staff_position not in ('manager', 'supervisor', 'team_leader', 'crew_member', 'commercial_staff', 'department_staff') then
    raise exception 'Invalid staff position';
  end if;
  update public.profiles
  set department_id = p_department_id,
      staff_position = p_staff_position,
      supervisor_id = p_supervisor_id,
      mfa_required = p_staff_position in ('manager', 'supervisor'),
      updated_at = now()
  where id = p_staff_id and role in ('admin', 'maintenance_personnel')
  returning * into result;
  if result.id is null then raise exception 'Staff account not found'; end if;
  return result;
end;
$$;

revoke all on function public.record_my_login() from public, anon;
revoke all on function public.record_my_password_change() from public, anon;
revoke all on function public.admin_update_staff_assignment(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.record_my_login() to authenticated;
grant execute on function public.record_my_password_change() to authenticated;
grant execute on function public.admin_update_staff_assignment(uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Personal productivity: saved views, watches, recent complaints
-- ---------------------------------------------------------------------------
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null check (module_key in ('commercial_complaints','ecmd_dispatch','maintenance_tasks','reports')),
  name text not null check (char_length(trim(name)) between 2 and 80),
  filters jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_key, name)
);
create index if not exists saved_views_user_module_idx on public.saved_views (user_id, module_key, updated_at desc);
alter table public.saved_views enable row level security;
grant select, insert, update, delete on public.saved_views to authenticated;
drop policy if exists saved_views_own_all on public.saved_views;
create policy saved_views_own_all on public.saved_views for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.complaint_watches (
  user_id uuid not null references public.profiles(id) on delete cascade,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, complaint_id)
);
alter table public.complaint_watches enable row level security;
grant select, insert, delete on public.complaint_watches to authenticated;
drop policy if exists complaint_watches_own_all on public.complaint_watches;
create policy complaint_watches_own_all on public.complaint_watches for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.recent_complaints (
  user_id uuid not null references public.profiles(id) on delete cascade,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, complaint_id)
);
create index if not exists recent_complaints_user_idx on public.recent_complaints (user_id, viewed_at desc);
alter table public.recent_complaints enable row level security;
grant select, insert, update, delete on public.recent_complaints to authenticated;
drop policy if exists recent_complaints_own_all on public.recent_complaints;
create policy recent_complaints_own_all on public.recent_complaints for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3) Complaint handoff / merge / follow-up
-- ---------------------------------------------------------------------------
alter table public.complaints
  add column if not exists commercial_handoff_note text,
  add column if not exists merged_into_id uuid references public.complaints(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references public.profiles(id) on delete set null,
  add column if not exists merge_reason text;

alter table public.complaints drop constraint if exists complaints_status_check;
alter table public.complaints
  add constraint complaints_status_check check (status in (
    'pending', 'forwarded', 'assigned', 'en_route', 'in_progress', 'completed', 'blocked',
    'awaiting_verification', 'resolved', 'rejected', 'cancelled', 'merged'
  ));

create table if not exists public.complaint_merge_records (
  id uuid primary key default gen_random_uuid(),
  primary_complaint_id uuid not null references public.complaints(id) on delete restrict,
  merged_complaint_id uuid not null references public.complaints(id) on delete restrict,
  merged_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) >= 3),
  created_at timestamptz not null default now(),
  unique (merged_complaint_id),
  check (primary_complaint_id <> merged_complaint_id)
);
alter table public.complaint_merge_records enable row level security;
grant select, insert on public.complaint_merge_records to authenticated;
drop policy if exists complaint_merge_operational_read on public.complaint_merge_records;
create policy complaint_merge_operational_read on public.complaint_merge_records for select to authenticated using (
  public.current_user_has_capability('commercial.complaints') or
  public.current_user_has_capability('ecmd.dispatch') or
  public.current_user_has_capability('ecmd.operations') or
  public.current_user_has_capability('system.audit')
);
drop policy if exists complaint_merge_commercial_insert on public.complaint_merge_records;
create policy complaint_merge_commercial_insert on public.complaint_merge_records for insert to authenticated
  with check (merged_by = (select auth.uid()) and public.current_user_has_capability('commercial.complaints'));

create table if not exists public.complaint_followup_requests (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  prompt text not null check (char_length(trim(prompt)) >= 3),
  status text not null default 'open' check (status in ('open','responded','cancelled')),
  response_text text,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references public.profiles(id) on delete set null
);
create index if not exists complaint_followup_complaint_idx on public.complaint_followup_requests (complaint_id, requested_at desc);
alter table public.complaint_followup_requests enable row level security;
grant select, insert on public.complaint_followup_requests to authenticated;
revoke update on table public.complaint_followup_requests from authenticated;
grant update (status, response_text, responded_at, responded_by) on public.complaint_followup_requests to authenticated;
drop policy if exists followup_select on public.complaint_followup_requests;
create policy followup_select on public.complaint_followup_requests for select to authenticated using (
  public.current_user_has_capability('commercial.complaints')
  or public.current_user_has_capability('ecmd.operations')
  or exists (select 1 from public.complaints c where c.id = complaint_id and c.resident_id = (select auth.uid()))
);
drop policy if exists followup_commercial_insert on public.complaint_followup_requests;
create policy followup_commercial_insert on public.complaint_followup_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and public.current_user_has_capability('commercial.complaints'));
drop policy if exists followup_customer_update on public.complaint_followup_requests;
create policy followup_customer_update on public.complaint_followup_requests for update to authenticated
  using (status = 'open' and exists (select 1 from public.complaints c where c.id = complaint_id and c.resident_id = (select auth.uid())))
  with check (responded_by = (select auth.uid()) and status = 'responded');

-- ---------------------------------------------------------------------------
-- 4) Crew operations, substitution calendar, quick completion notes
-- ---------------------------------------------------------------------------
create or replace function public.validate_ecmd_crew_record()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare department_code text; leader_department text;
begin
  select upper(trim(code)) into department_code from public.departments where id = new.department_id and is_active = true;
  if department_code is distinct from 'ECMD' then raise exception 'Maintenance crew must belong to active ECMD'; end if;
  if new.team_leader_id is not null then
    select upper(trim(d.code)) into leader_department
    from public.profiles p left join public.departments d on d.id = p.department_id
    where p.id = new.team_leader_id and p.role = 'maintenance_personnel' and p.is_active = true;
    if leader_department is distinct from 'ECMD' then raise exception 'Crew Team Leader must be active ECMD Maintenance Personnel'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_ecmd_crew_record on public.maintenance_crews;
create trigger validate_ecmd_crew_record before insert or update on public.maintenance_crews
  for each row execute function public.validate_ecmd_crew_record();

create or replace function public.validate_ecmd_crew_member()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare staff_department text;
begin
  if not exists (
    select 1 from public.maintenance_crews mc
    join public.departments d on d.id = mc.department_id
    where mc.id = new.crew_id and mc.is_active = true and upper(trim(d.code)) = 'ECMD'
  ) then raise exception 'Crew member must belong to an active ECMD maintenance crew'; end if;
  select upper(trim(d.code)) into staff_department
  from public.profiles p left join public.departments d on d.id = p.department_id
  where p.id = new.staff_id and p.role = 'maintenance_personnel' and p.is_active = true;
  if staff_department is distinct from 'ECMD' then raise exception 'Crew member must be active ECMD Maintenance Personnel'; end if;
  return new;
end;
$$;
drop trigger if exists validate_ecmd_crew_member on public.crew_members;
create trigger validate_ecmd_crew_member before insert or update on public.crew_members
  for each row execute function public.validate_ecmd_crew_member();

create or replace function public.validate_ecmd_staff_schedule()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare staff_department text;
begin
  select upper(trim(d.code)) into staff_department
  from public.profiles p left join public.departments d on d.id = p.department_id
  where p.id = new.staff_id and p.role = 'maintenance_personnel' and p.is_active = true;
  if staff_department is distinct from 'ECMD' then raise exception 'Schedule must belong to active ECMD Maintenance Personnel'; end if;
  return new;
end;
$$;
drop trigger if exists validate_ecmd_staff_schedule on public.staff_schedules;
create trigger validate_ecmd_staff_schedule before insert or update on public.staff_schedules
  for each row execute function public.validate_ecmd_staff_schedule();

create table if not exists public.crew_substitutions (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.maintenance_crews(id) on delete cascade,
  replaced_staff_id uuid not null references public.profiles(id) on delete restrict,
  substitute_staff_id uuid not null references public.profiles(id) on delete restrict,
  starts_on date not null default current_date,
  ends_on date,
  reason text not null check (char_length(trim(reason)) >= 3),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (replaced_staff_id <> substitute_staff_id),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists crew_substitutions_active_idx on public.crew_substitutions (crew_id, is_active, starts_on desc);
create unique index if not exists crew_substitutions_one_active_replacement_idx
  on public.crew_substitutions (crew_id, replaced_staff_id) where is_active = true;

create or replace function public.validate_crew_substitution()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare substitute_department text;
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    if new.is_active = false then return new; end if;
  end if;
  if new.replaced_staff_id = new.substitute_staff_id then raise exception 'Substitute must be different from replaced staff'; end if;
  if not exists (
    select 1 from public.maintenance_crews mc
    where mc.id = new.crew_id and mc.is_active = true
  ) then raise exception 'Maintenance crew must be active'; end if;
  if not exists (
    select 1 from public.crew_members cm
    where cm.crew_id = new.crew_id and cm.staff_id = new.replaced_staff_id and cm.is_active = true
  ) then raise exception 'Replaced staff must be an active member of the crew'; end if;
  select upper(trim(d.code)) into substitute_department
  from public.profiles p left join public.departments d on d.id = p.department_id
  where p.id = new.substitute_staff_id and p.role = 'maintenance_personnel' and p.is_active = true;
  if substitute_department is distinct from 'ECMD' then raise exception 'Substitute must be active ECMD Maintenance Personnel'; end if;
  return new;
end;
$$;
drop trigger if exists validate_crew_substitution on public.crew_substitutions;
create trigger validate_crew_substitution before insert or update on public.crew_substitutions
  for each row execute function public.validate_crew_substitution();
alter table public.crew_substitutions enable row level security;
grant select, insert, update on public.crew_substitutions to authenticated;
drop policy if exists crew_substitutions_read on public.crew_substitutions;
create policy crew_substitutions_read on public.crew_substitutions for select to authenticated using (
  public.current_user_has_capability('ecmd.operations') or public.current_user_role() = 'maintenance_personnel'
);
drop policy if exists crew_substitutions_ecmd_write on public.crew_substitutions;
drop policy if exists crew_substitutions_ecmd_insert on public.crew_substitutions;
drop policy if exists crew_substitutions_ecmd_update on public.crew_substitutions;
create policy crew_substitutions_ecmd_insert on public.crew_substitutions for insert to authenticated
  with check (created_by = (select auth.uid()) and public.current_user_has_capability('ecmd.operations'));
create policy crew_substitutions_ecmd_update on public.crew_substitutions for update to authenticated
  using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));

create table if not exists public.maintenance_note_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  content text not null check (char_length(trim(content)) >= 3),
  category text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.maintenance_note_templates (label, content, category)
values
  ('Leak repaired', 'Leak repaired and water service restored.', 'Water Leak'),
  ('Valve inspected', 'Valve inspected and operational condition recorded.', 'Valve'),
  ('Connection restored', 'Service connection restored and tested.', 'No Water'),
  ('No issue found', 'Site inspected; no active issue was found at the reported location.', 'Inspection')
on conflict (label) do nothing;
alter table public.maintenance_note_templates enable row level security;
grant select, insert, update, delete on public.maintenance_note_templates to authenticated;
drop policy if exists maintenance_templates_read on public.maintenance_note_templates;
create policy maintenance_templates_read on public.maintenance_note_templates for select to authenticated using (
  public.current_user_role() = 'maintenance_personnel' or public.current_user_has_capability('ecmd.operations')
);
drop policy if exists maintenance_templates_ecmd_write on public.maintenance_note_templates;
create policy maintenance_templates_ecmd_write on public.maintenance_note_templates for all to authenticated
  using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));

-- ---------------------------------------------------------------------------
-- 5) Scheduled report definitions / generated run archive
-- ---------------------------------------------------------------------------
create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  department_code text not null check (department_code in ('COMMERCIAL','ECMD','SYSTEM')),
  name text not null,
  report_type text not null check (report_type in ('complaint_summary','complaint_export','maintenance_workload','customer_satisfaction','audit_summary')),
  cadence text not null check (cadence in ('weekly','monthly')),
  filters jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists report_schedules_due_idx on public.report_schedules (is_active, next_run_at);
create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.report_schedules(id) on delete set null,
  generated_by uuid references public.profiles(id) on delete set null,
  report_type text not null,
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  status text not null default 'ready' check (status in ('ready','failed')),
  summary jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);
alter table public.report_schedules enable row level security;
alter table public.report_runs enable row level security;
grant select, insert, update, delete on public.report_schedules to authenticated;
grant select, insert on public.report_runs to authenticated;
drop policy if exists report_schedules_owner_all on public.report_schedules;
create policy report_schedules_owner_all on public.report_schedules for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid()) and (
      (department_code = 'COMMERCIAL' and report_type in ('complaint_summary','complaint_export','customer_satisfaction') and public.current_user_has_capability('commercial.reports'))
      or (department_code = 'ECMD' and report_type = 'maintenance_workload' and public.current_user_has_capability('ecmd.maintenance_reports'))
      or (department_code = 'SYSTEM' and report_type = 'audit_summary' and public.current_user_has_capability('system.audit'))
    )
  );
drop policy if exists report_runs_visible on public.report_runs;
create policy report_runs_visible on public.report_runs for select to authenticated using (
  generated_by = (select auth.uid()) or exists (select 1 from public.report_schedules s where s.id = schedule_id and s.owner_id = (select auth.uid()))
);
drop policy if exists report_runs_insert on public.report_runs;
create policy report_runs_insert on public.report_runs for insert to authenticated
  with check (
    generated_by = (select auth.uid()) and (
      (report_type in ('complaint_summary','complaint_export','customer_satisfaction') and public.current_user_has_capability('commercial.reports'))
      or (report_type = 'maintenance_workload' and public.current_user_has_capability('ecmd.maintenance_reports'))
      or (report_type = 'audit_summary' and public.current_user_has_capability('system.audit'))
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Internal announcements and audiences
-- ---------------------------------------------------------------------------
alter table public.announcements
  add column if not exists audience text not null default 'customer',
  add column if not exists is_internal boolean not null default false;
alter table public.announcements drop constraint if exists announcements_audience_check;
alter table public.announcements add constraint announcements_audience_check
  check (audience in ('customer','commercial','ecmd','maintenance','all_staff','all'));

update public.announcements set audience = 'customer', is_internal = false where audience is null;

drop policy if exists announcements_select_all on public.announcements;
drop policy if exists announcements_commercial_write on public.announcements;
drop policy if exists announcements_admin_write on public.announcements;
drop policy if exists announcements_visible_by_audience on public.announcements;
create policy announcements_visible_by_audience on public.announcements for select to authenticated using (
  audience = 'all'
  or (public.current_user_role() = 'customer' and audience = 'customer')
  or (public.current_user_role() = 'maintenance_personnel' and audience in ('maintenance','all_staff'))
  or (public.current_user_has_capability('commercial.announcements') and audience in ('customer','commercial','all_staff'))
  or (public.current_user_has_capability('ecmd.operations') and audience in ('ecmd','maintenance','all_staff'))
  or (public.current_user_has_capability('system.dashboard') and audience in ('commercial','ecmd','maintenance','all_staff','customer'))
);
drop policy if exists announcements_department_write on public.announcements;
create policy announcements_department_write on public.announcements for all to authenticated
  using (
    (public.current_user_has_capability('commercial.announcements') and audience = 'customer')
    or public.current_user_has_capability('system.dashboard')
  )
  with check (
    (public.current_user_has_capability('commercial.announcements') and audience = 'customer' and is_internal = false)
    or public.current_user_has_capability('system.dashboard')
  );

-- System Administration remains non-operational, but it needs read access to
-- already archived complaint records for governance restore/recovery actions.
drop policy if exists "complaints_select" on public.complaints;
create policy "complaints_select" on public.complaints
  for select to authenticated using (
    resident_id = (select auth.uid())
    or public.is_assigned_to_complaint(id)
    or public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.dispatch')
    or (archived_at is not null and public.current_user_has_capability('system.approvals'))
  );

-- Archive approval must recognize the current resolved status and remain
-- System Administration-only under the separated department model.
create or replace function public.archive_complaint_with_approval(
  p_complaint_id uuid,
  p_approval_request_id uuid
)
returns public.complaints
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare approval_row public.approval_requests;
declare complaint_row public.complaints;
begin
  if not public.current_user_has_capability('system.approvals') then raise exception 'System Supervisor approval access required'; end if;
  select * into approval_row from public.approval_requests
  where id = p_approval_request_id
    and request_type = 'archive_complaint'
    and entity_id = p_complaint_id
    and status = 'approved';
  if approval_row.id is null then raise exception 'An approved archival request is required'; end if;
  if approval_row.requested_by = approval_row.reviewed_by then raise exception 'A different System Supervisor must approve archival'; end if;

  update public.complaints
  set archived_at = now(), archived_by = auth.uid(), archive_reason = approval_row.reason, updated_at = now()
  where id = p_complaint_id
    and status in ('resolved', 'completed', 'rejected', 'cancelled')
    and archived_at is null
  returning * into complaint_row;
  if complaint_row.id is null then raise exception 'Only closed, unarchived complaints can be archived'; end if;

  insert into public.archive_records (entity_type, entity_id, approval_request_id, reason, archived_by)
  values ('complaint', p_complaint_id, p_approval_request_id, approval_row.reason, auth.uid());
  return complaint_row;
end;
$$;
revoke all on function public.archive_complaint_with_approval(uuid, uuid) from public, anon;
grant execute on function public.archive_complaint_with_approval(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Backup verification register / production readiness status
-- ---------------------------------------------------------------------------
create table if not exists public.system_backup_checks (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null check (backup_type in ('supabase_managed','logical_export','restore_test','other')),
  status text not null check (status in ('verified','warning','failed')),
  checked_at timestamptz not null default now(),
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.system_backup_checks enable row level security;
grant select, insert on public.system_backup_checks to authenticated;
drop policy if exists system_backup_checks_supervisor on public.system_backup_checks;
create policy system_backup_checks_supervisor on public.system_backup_checks for all to authenticated
  using (public.current_user_has_capability('system.dashboard'))
  with check (recorded_by = (select auth.uid()) and public.current_user_has_capability('system.dashboard'));

-- ---------------------------------------------------------------------------
-- 8) Department complaint-change guard updated for handoff notes and merge
-- ---------------------------------------------------------------------------
create or replace function public.guard_department_complaint_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  old_data jsonb := to_jsonb(old);
  new_data jsonb := to_jsonb(new);
begin
  if auth.uid() is null or public.current_user_role() <> 'admin' then return new; end if;

  if public.current_user_has_capability('commercial.complaints') then
    if new.status = 'merged' and new.status is distinct from old.status then
      if old.status not in ('pending', 'forwarded') then raise exception 'Only complaints without field work may be merged'; end if;
      if new.merged_into_id is null or new.merged_into_id = new.id then raise exception 'A different primary complaint is required for merge'; end if;
      if exists (select 1 from public.maintenance_tasks mt where mt.complaint_id = new.id and mt.is_active = true) then
        raise exception 'Complaint with an active maintenance task cannot be merged';
      end if;
      if not exists (select 1 from public.complaints primary_complaint where primary_complaint.id = new.merged_into_id and primary_complaint.status not in ('resolved','completed','rejected','cancelled','merged')) then
        raise exception 'Primary complaint must be active';
      end if;
    end if;
    if new.status is distinct from old.status
       and not (
         new.status in ('rejected','forwarded','merged')
         or (old.status = 'rejected' and new.status in ('pending','forwarded'))
       ) then
      raise exception 'Field-work status changes are restricted to ECMD';
    end if;
    if (new_data - array[
      'category_id','description','address_text','lat','lng','zone','photo_urls',
      'status','rejection_reason','rejected_at','priority','priority_score',
      'algorithm_priority_score','priority_override_reason','priority_overridden_by',
      'priority_overridden_at','rule_score','sentiment_score','classified_category',
      'classification_confidence','classification_sentiment','classification_mismatch',
      'classification_basis','classification_keywords','classification_negated_keywords',
      'classification_reasons','classifier_version','classification_method','updated_at',
      'forwarded_to_ecmd_at','forwarded_to_ecmd_by','commercial_handoff_note',
      'merged_into_id','merged_at','merged_by','merge_reason'
    ]) is distinct from (old_data - array[
      'category_id','description','address_text','lat','lng','zone','photo_urls',
      'status','rejection_reason','rejected_at','priority','priority_score',
      'algorithm_priority_score','priority_override_reason','priority_overridden_by',
      'priority_overridden_at','rule_score','sentiment_score','classified_category',
      'classification_confidence','classification_sentiment','classification_mismatch',
      'classification_basis','classification_keywords','classification_negated_keywords',
      'classification_reasons','classifier_version','classification_method','updated_at',
      'forwarded_to_ecmd_at','forwarded_to_ecmd_by','commercial_handoff_note',
      'merged_into_id','merged_at','merged_by','merge_reason'
    ]) then
      raise exception 'This complaint change belongs to ECMD or System Administration';
    end if;
    return new;
  end if;

  if public.current_user_has_capability('ecmd.operations') or public.current_user_has_capability('ecmd.dispatch') then
    if (new_data - array[
      'status','updated_at','verified_at','verified_by','resolution_code','resolution_notes',
      'priority','priority_score','priority_override_reason','priority_overridden_by','priority_overridden_at'
    ]) is distinct from (old_data - array[
      'status','updated_at','verified_at','verified_by','resolution_code','resolution_notes',
      'priority','priority_score','priority_override_reason','priority_overridden_by','priority_overridden_at'
    ]) then
      raise exception 'ECMD may update only field-workflow, operational priority, and verification information';
    end if;
    return new;
  end if;

  if public.current_user_has_capability('system.approvals') then
    if (new_data - array['archived_at','archived_by','archive_reason','updated_at'])
       is distinct from
       (old_data - array['archived_at','archived_by','archive_reason','updated_at']) then
      raise exception 'System Administration may update only governance and archival information';
    end if;
    return new;
  end if;

  raise exception 'Department Staff account has no authorized complaint module';
end;
$$;

drop trigger if exists guard_department_complaint_changes on public.complaints;
create trigger guard_department_complaint_changes
  before update on public.complaints
  for each row execute function public.guard_department_complaint_changes();

-- New tables are intentionally granted explicitly because Supabase no longer
-- guarantees automatic Data API exposure for newly created public tables.
grant usage on schema public to authenticated;

notify pgrst, 'reload schema';
commit;
