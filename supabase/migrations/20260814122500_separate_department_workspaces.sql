begin;

-- Commercial Services, ECMD, and System Administration are separate staff
-- workspaces. Department membership is still stored on profiles, but System
-- Supervisors no longer inherit operational department capabilities.
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
      when p.staff_position in ('manager', 'supervisor') then p_capability in (
        'system.dashboard', 'system.staff', 'system.audit',
        'system.approvals', 'system.departments'
      )
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

-- Department notifications go only to accounts belonging to that department.
-- System Supervisors are intentionally excluded from routine complaint traffic.
create or replace function public.active_admin_ids_for_department(p_department_code text)
returns table(id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  join public.departments d on d.id = p.department_id
  where p.role = 'admin'
    and p.is_active = true
    and d.code = upper(trim(p_department_code));
$$;

revoke all on function public.active_admin_ids_for_department(text) from public, anon;
grant execute on function public.active_admin_ids_for_department(text) to authenticated;

-- General administrator notifications now resolve to System Supervisors only.
create or replace function public.active_admin_ids()
returns table(id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.role = 'admin'
    and p.is_active = true
    and p.staff_position in ('manager', 'supervisor');
$$;

revoke all on function public.active_admin_ids() from public, anon;
grant execute on function public.active_admin_ids() to authenticated;

notify pgrst, 'reload schema';
commit;
