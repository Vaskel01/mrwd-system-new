-- MRWD organizational routing update
-- Commercial Services Department -> NSCCCD -> ECMD/WDLCD -> Maintenance Crew

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  code text not null unique,
  name text not null,
  responsibilities text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, name)
);

insert into public.divisions (department_id, code, name, responsibilities, is_active)
select d.id, 'NSCCCD', 'New Service Connection and Customer Care Division',
       'Receives and reviews customer complaints under the Commercial Services Department before field-related complaints are routed to WDLCD.', true
from public.departments d where d.code = 'COMMERCIAL'
on conflict (code) do update set
  department_id = excluded.department_id,
  name = excluded.name,
  responsibilities = excluded.responsibilities,
  is_active = true,
  updated_at = now();

insert into public.divisions (department_id, code, name, responsibilities, is_active)
select d.id, 'WDLCD', 'Water Distribution and Leakage Control Division',
       'Receives field-related complaints under ECMD, assigns Maintenance Crews or Maintenance Personnel, coordinates field work, and verifies completion.', true
from public.departments d where d.code = 'ECMD'
on conflict (code) do update set
  department_id = excluded.department_id,
  name = excluded.name,
  responsibilities = excluded.responsibilities,
  is_active = true,
  updated_at = now();

alter table public.profiles add column if not exists division_id uuid;
alter table public.maintenance_crews add column if not exists division_id uuid;
alter table public.complaints add column if not exists routed_division_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_division_id_fkey') then
    alter table public.profiles add constraint profiles_division_id_fkey foreign key (division_id) references public.divisions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'maintenance_crews_division_id_fkey') then
    alter table public.maintenance_crews add constraint maintenance_crews_division_id_fkey foreign key (division_id) references public.divisions(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'complaints_routed_division_id_fkey') then
    alter table public.complaints add constraint complaints_routed_division_id_fkey foreign key (routed_division_id) references public.divisions(id) on delete set null;
  end if;
end $$;

update public.profiles p
set division_id = v.id, updated_at = now()
from public.divisions v, public.departments d
where d.id = p.department_id
  and v.department_id = d.id
  and ((d.code = 'COMMERCIAL' and p.staff_position = 'commercial_staff' and v.code = 'NSCCCD')
    or (d.code = 'ECMD' and p.staff_position in ('department_staff','team_leader','crew_member') and v.code = 'WDLCD'))
  and p.division_id is distinct from v.id;

update public.maintenance_crews mc
set division_id = v.id, updated_at = now()
from public.divisions v
join public.departments d on d.id = v.department_id
where mc.department_id = d.id and d.code = 'ECMD' and v.code = 'WDLCD'
  and mc.division_id is distinct from v.id;

update public.complaints c
set routed_division_id = v.id, updated_at = now()
from public.divisions v
where v.code = 'WDLCD'
  and c.routed_division_id is null
  and (
    c.forwarded_to_ecmd_at is not null
    or c.status in ('forwarded','assigned','en_route','in_progress','blocked','awaiting_verification','resolved','completed')
    or exists (select 1 from public.maintenance_tasks mt where mt.complaint_id = c.id)
  );

alter table public.maintenance_crews alter column division_id set not null;

create index if not exists profiles_division_idx on public.profiles (division_id) where division_id is not null;
create index if not exists maintenance_crews_division_idx on public.maintenance_crews (division_id);
create index if not exists complaints_routed_division_idx on public.complaints (routed_division_id) where routed_division_id is not null;
create index if not exists divisions_department_idx on public.divisions (department_id, is_active);

alter table public.divisions enable row level security;
drop policy if exists divisions_authenticated_read on public.divisions;
create policy divisions_authenticated_read on public.divisions for select to authenticated using (true);
drop policy if exists divisions_supervisor_write on public.divisions;
create policy divisions_supervisor_write on public.divisions for all to authenticated
  using (public.current_user_has_capability('system.departments'))
  with check (public.current_user_has_capability('system.departments'));
grant select on public.divisions to authenticated;
grant select, insert, update, delete on public.divisions to service_role;

create or replace function app_private.current_user_has_capability(p_capability text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.role <> 'admin' or p.is_active is false then false
      when p.staff_position in ('manager', 'supervisor') then
        p_capability in ('system.dashboard','system.staff','system.audit','system.approvals','system.departments')
        and (not p.mfa_required or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
      when d.code = 'COMMERCIAL' and v.code = 'NSCCCD' then p_capability in (
        'commercial.complaints', 'commercial.reports', 'commercial.billing',
        'commercial.announcements', 'commercial.archive_request'
      )
      when d.code = 'ECMD' and v.code = 'WDLCD' then p_capability in (
        'ecmd.dispatch', 'ecmd.operations', 'ecmd.maintenance_reports'
      )
      else false
    end
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    left join public.divisions v on v.id = p.division_id and v.department_id = p.department_id and v.is_active = true
    where p.id = (select auth.uid())
  ), false);
$$;

create or replace function public.guard_department_profile_changes()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  new_department_code text;
  new_division_code text;
  new_division_department_id uuid;
begin
  if new.department_id is not null then
    select upper(trim(code)) into new_department_code from public.departments where id = new.department_id;
  end if;

  -- Backward-compatible automatic division assignment for existing clients.
  if new.division_id is null and new.staff_position = 'commercial_staff' and new_department_code = 'COMMERCIAL' then
    select id into new.division_id from public.divisions where code = 'NSCCCD' and department_id = new.department_id and is_active = true limit 1;
  elsif new.division_id is null and new.staff_position in ('department_staff','team_leader','crew_member') and new_department_code = 'ECMD' then
    select id into new.division_id from public.divisions where code = 'WDLCD' and department_id = new.department_id and is_active = true limit 1;
  end if;

  if new.division_id is not null then
    select upper(trim(code)), department_id into new_division_code, new_division_department_id
    from public.divisions where id = new.division_id and is_active = true;
    if new_division_department_id is distinct from new.department_id then
      raise exception 'The selected division does not belong to the selected department';
    end if;
  end if;

  if new.staff_position in ('manager', 'supervisor')
     and (new.role <> 'admin' or new.department_id is not null or new.division_id is not null) then
    raise exception 'System Supervisors must not have a department or division assignment';
  end if;
  if new.staff_position = 'commercial_staff'
     and (new.role <> 'admin' or new_department_code <> 'COMMERCIAL' or new_division_code <> 'NSCCCD') then
    raise exception 'Commercial Services Staff must be assigned to NSCCCD under the Commercial Services Department';
  end if;
  if new.staff_position = 'department_staff'
     and (new.role <> 'admin' or new_department_code <> 'ECMD' or new_division_code <> 'WDLCD') then
    raise exception 'ECMD Staff must be assigned to WDLCD under ECMD';
  end if;
  if new.staff_position in ('team_leader', 'crew_member')
     and (new.role <> 'maintenance_personnel' or new_department_code <> 'ECMD' or new_division_code <> 'WDLCD') then
    raise exception 'Maintenance Personnel must be assigned to WDLCD under ECMD';
  end if;

  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.role in ('admin', 'maintenance_personnel')
       and not public.current_user_has_capability('system.staff') then
      raise exception 'Staff-account creation is restricted to System Supervisors';
    end if;
    return new;
  end if;
  if public.current_user_role() = 'admin'
     and (new.department_id, new.division_id, new.staff_position, new.supervisor_id, new.role, new.is_active)
         is distinct from
         (old.department_id, old.division_id, old.staff_position, old.supervisor_id, old.role, old.is_active)
     and not public.current_user_has_capability('system.staff') then
    raise exception 'Staff access, department, and division assignments are restricted to System Supervisors';
  end if;
  return new;
end;
$$;

create or replace function public.guard_maintenance_crew_division()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  department_code text;
  division_code text;
  division_department_id uuid;
begin
  select upper(trim(code)) into department_code from public.departments where id = new.department_id;
  if new.division_id is null and department_code = 'ECMD' then
    select id into new.division_id from public.divisions where code = 'WDLCD' and department_id = new.department_id and is_active = true limit 1;
  end if;
  select upper(trim(code)), department_id into division_code, division_department_id
  from public.divisions where id = new.division_id and is_active = true;
  if department_code <> 'ECMD' or division_code <> 'WDLCD' or division_department_id is distinct from new.department_id then
    raise exception 'Maintenance Crews must belong to WDLCD under ECMD';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_maintenance_crew_division on public.maintenance_crews;
create trigger guard_maintenance_crew_division before insert or update on public.maintenance_crews
for each row execute function public.guard_maintenance_crew_division();

create or replace function public.route_field_complaint_to_wdlcd()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  wdlcd_id uuid;
  routed_code text;
begin
  if new.status = 'forwarded' and (tg_op = 'INSERT' or old.status is distinct from new.status) and new.routed_division_id is null then
    select id into wdlcd_id from public.divisions where code = 'WDLCD' and is_active = true limit 1;
    if wdlcd_id is null then raise exception 'WDLCD division is not configured'; end if;
    new.routed_division_id := wdlcd_id;
  end if;
  if new.routed_division_id is not null then
    select upper(trim(code)) into routed_code from public.divisions where id = new.routed_division_id and is_active = true;
    if routed_code is distinct from 'WDLCD' then raise exception 'Field-related complaints must be routed to WDLCD'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists route_field_complaint_to_wdlcd on public.complaints;
create trigger route_field_complaint_to_wdlcd before insert or update on public.complaints
for each row execute function public.route_field_complaint_to_wdlcd();

-- Allow Commercial Services to set the explicit WDLCD route as part of the handoff.
create or replace function public.guard_department_complaint_changes()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
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
      if exists (select 1 from public.maintenance_tasks mt where mt.complaint_id = new.id and mt.is_active = true) then raise exception 'Complaint with an active maintenance task cannot be merged'; end if;
      if not exists (select 1 from public.complaints primary_complaint where primary_complaint.id = new.merged_into_id and primary_complaint.status not in ('resolved','completed','rejected','cancelled','merged')) then raise exception 'Primary complaint must be active'; end if;
    end if;
    if new.status is distinct from old.status
       and not (new.status in ('rejected','forwarded','merged') or (old.status = 'rejected' and new.status in ('pending','forwarded'))) then
      raise exception 'Field-work status changes are restricted to WDLCD';
    end if;
    if (new_data - array[
      'category_id','description','address_text','lat','lng','zone','photo_urls',
      'status','rejection_reason','rejected_at','priority','priority_score',
      'algorithm_priority_score','priority_override_reason','priority_overridden_by',
      'priority_overridden_at','rule_score','sentiment_score','classified_category',
      'classification_confidence','classification_sentiment','classification_mismatch',
      'classification_basis','classification_keywords','classification_negated_keywords',
      'classification_reasons','classifier_version','classification_method','updated_at',
      'forwarded_to_ecmd_at','forwarded_to_ecmd_by','commercial_handoff_note','routed_division_id',
      'merged_into_id','merged_at','merged_by','merge_reason'
    ]) is distinct from (old_data - array[
      'category_id','description','address_text','lat','lng','zone','photo_urls',
      'status','rejection_reason','rejected_at','priority','priority_score',
      'algorithm_priority_score','priority_override_reason','priority_overridden_by',
      'priority_overridden_at','rule_score','sentiment_score','classified_category',
      'classification_confidence','classification_sentiment','classification_mismatch',
      'classification_basis','classification_keywords','classification_negated_keywords',
      'classification_reasons','classifier_version','classification_method','updated_at',
      'forwarded_to_ecmd_at','forwarded_to_ecmd_by','commercial_handoff_note','routed_division_id',
      'merged_into_id','merged_at','merged_by','merge_reason'
    ]) then
      raise exception 'This complaint change belongs to WDLCD or System Administration';
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
      raise exception 'WDLCD may update only field-workflow, operational priority, and verification information';
    end if;
    return new;
  end if;

  if public.current_user_has_capability('system.approvals') then
    if (new_data - array['archived_at','archived_by','archive_reason','updated_at'])
       is distinct from (old_data - array['archived_at','archived_by','archive_reason','updated_at']) then
      raise exception 'System Administration may update only governance and archival information';
    end if;
    return new;
  end if;
  raise exception 'Department Staff account has no authorized complaint module';
end;
$$;

create or replace function app_private.active_admin_ids_for_division(p_division_code text)
returns table(id uuid)
language sql stable security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  join public.divisions v on v.id = p.division_id
  where p.role = 'admin' and p.is_active = true and v.is_active = true
    and v.code = upper(trim(p_division_code));
$$;
create or replace function public.active_admin_ids_for_division(p_division_code text)
returns table(id uuid)
language sql stable
set search_path = ''
as $$ select * from app_private.active_admin_ids_for_division(p_division_code) $$;
revoke all on function public.active_admin_ids_for_division(text) from public, anon;
grant execute on function public.active_admin_ids_for_division(text) to authenticated, service_role;
grant execute on function app_private.active_admin_ids_for_division(text) to authenticated, service_role;

create or replace function app_private.admin_update_staff_assignment(
  p_staff_id uuid, p_department_id uuid, p_division_id uuid, p_staff_position text, p_supervisor_id uuid default null
)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare result public.profiles;
begin
  if not app_private.current_user_has_capability('system.staff') then raise exception 'System Supervisor access required'; end if;
  if p_staff_position is not null and p_staff_position not in ('manager','supervisor','team_leader','crew_member','commercial_staff','department_staff') then raise exception 'Invalid staff position'; end if;
  update public.profiles
  set department_id = p_department_id, division_id = p_division_id, staff_position = p_staff_position,
      supervisor_id = p_supervisor_id, mfa_required = p_staff_position in ('manager','supervisor'), updated_at = now()
  where id = p_staff_id and role in ('admin','maintenance_personnel') returning * into result;
  if result.id is null then raise exception 'Staff account not found'; end if;
  return result;
end;
$$;

create or replace function public.admin_update_staff_assignment(
  p_staff_id uuid, p_department_id uuid, p_division_id uuid, p_staff_position text, p_supervisor_id uuid default null
)
returns public.profiles
language sql
set search_path = ''
as $$ select app_private.admin_update_staff_assignment(p_staff_id, p_department_id, p_division_id, p_staff_position, p_supervisor_id) $$;

-- Keep the old RPC signature during rolling deployment. It derives the required division automatically.
create or replace function app_private.admin_update_staff_assignment(
  p_staff_id uuid, p_department_id uuid, p_staff_position text, p_supervisor_id uuid default null
)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare derived_division_id uuid;
begin
  if p_staff_position = 'commercial_staff' then
    select id into derived_division_id from public.divisions where code='NSCCCD' and department_id=p_department_id and is_active=true limit 1;
  elsif p_staff_position in ('department_staff','team_leader','crew_member') then
    select id into derived_division_id from public.divisions where code='WDLCD' and department_id=p_department_id and is_active=true limit 1;
  end if;
  return app_private.admin_update_staff_assignment(p_staff_id, p_department_id, derived_division_id, p_staff_position, p_supervisor_id);
end;
$$;

revoke all on function public.admin_update_staff_assignment(uuid,uuid,uuid,text,uuid) from public, anon;
grant execute on function public.admin_update_staff_assignment(uuid,uuid,uuid,text,uuid) to authenticated, service_role;
grant execute on function app_private.admin_update_staff_assignment(uuid,uuid,uuid,text,uuid) to authenticated, service_role;

comment on table public.divisions is 'Organizational divisions under MRWD departments. Complaint routing currently uses NSCCCD and WDLCD.';
comment on column public.profiles.division_id is 'Operational division assignment for staff accounts.';
comment on column public.complaints.routed_division_id is 'Division responsible for field routing; field-related complaints are routed to WDLCD.';
comment on column public.maintenance_crews.division_id is 'Owning operational division; MRWD maintenance crews belong to WDLCD.';
