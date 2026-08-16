begin;

-- Preserve access for existing pre-department management accounts without
-- making every future unassigned Department Staff account a supervisor.
update public.profiles
set staff_position = 'manager', updated_at = now()
where role = 'admin' and department_id is null and staff_position is null;

-- Department membership is authoritative for Department Staff access. Existing
-- pre-department management accounts are explicitly promoted above so deployment
-- cannot cause an accidental lockout; future unassigned accounts stay restricted.
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
      when p.staff_position in ('manager', 'supervisor') then true
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

create or replace function public.active_admin_ids_for_department(p_department_code text)
returns table(id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  where p.role = 'admin'
    and p.is_active = true
    and public.current_user_role() in ('admin', 'maintenance_personnel')
    and (
      p.staff_position in ('manager', 'supervisor')
      or d.code = upper(trim(p_department_code))
    );
$$;

revoke all on function public.active_admin_ids_for_department(text) from public, anon;
grant execute on function public.active_admin_ids_for_department(text) to authenticated;

-- Security-definer RPCs and direct Data API calls both reach table triggers.
-- These guards prevent a broad legacy staff check from bypassing the
-- new department boundaries.
create or replace function public.guard_department_profile_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_department_code text;
begin
  if new.department_id is not null then
    select upper(trim(code)) into new_department_code
    from public.departments
    where id = new.department_id;
  end if;

  if new.staff_position in ('manager', 'supervisor')
     and (new.role <> 'admin' or new.department_id is not null) then
    raise exception 'System Supervisors must use a Department Staff account without a department assignment';
  end if;
  if new.staff_position = 'commercial_staff'
     and (new.role <> 'admin' or new_department_code <> 'COMMERCIAL') then
    raise exception 'Commercial Services Staff must be assigned to the Commercial Services Department';
  end if;
  if new.staff_position = 'department_staff'
     and (new.role <> 'admin' or new_department_code <> 'ECMD') then
    raise exception 'ECMD Staff must be assigned to ECMD';
  end if;
  if new.staff_position in ('team_leader', 'crew_member')
     and (new.role <> 'maintenance_personnel' or new_department_code <> 'ECMD') then
    raise exception 'Team Leaders and Maintenance Crew Members must use a Maintenance Personnel account assigned to ECMD';
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
     and (new.department_id, new.staff_position, new.supervisor_id, new.role, new.is_active)
         is distinct from
         (old.department_id, old.staff_position, old.supervisor_id, old.role, old.is_active)
     and not public.current_user_has_capability('system.staff') then
    raise exception 'Staff access and department assignments are restricted to System Supervisors';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_department_profile_changes on public.profiles;
create trigger guard_department_profile_changes
  before insert or update on public.profiles
  for each row execute function public.guard_department_profile_changes();

-- Replace any legacy permissive profile SELECT policies regardless of their
-- historical name. ECMD may see Maintenance Personnel needed for dispatch;
-- only System Supervisors may enumerate every staff account.
do $$
declare policy_name text;
begin
  for policy_name in
    select pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public' and cls.relname = 'profiles' and pol.polcmd = 'r'
  loop
    execute format('drop policy if exists %I on public.profiles', policy_name);
  end loop;
end $$;

create policy "profiles_department_select" on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or public.current_user_has_capability('system.staff')
    or (public.current_user_has_capability('ecmd.dispatch') and role = 'maintenance_personnel')
  );

create or replace function public.guard_department_complaint_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare old_data jsonb := to_jsonb(old);
declare new_data jsonb := to_jsonb(new);
begin
  if auth.uid() is null or public.current_user_role() <> 'admin' then return new; end if;

  if public.current_user_has_capability('system.dashboard') then return new; end if;

  if public.current_user_has_capability('commercial.complaints') then
    if new.status is distinct from old.status
       and not (
         new.status = 'rejected'
         or (old.status = 'rejected' and new.status in ('pending', 'assigned'))
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
      'classification_reasons','classifier_version','classification_method','updated_at'
    ]) is distinct from (old_data - array[
      'category_id','description','address_text','lat','lng','zone','photo_urls',
      'status','rejection_reason','rejected_at','priority','priority_score',
      'algorithm_priority_score','priority_override_reason','priority_overridden_by',
      'priority_overridden_at','rule_score','sentiment_score','classified_category',
      'classification_confidence','classification_sentiment','classification_mismatch',
      'classification_basis','classification_keywords','classification_negated_keywords',
      'classification_reasons','classifier_version','classification_method','updated_at'
    ]) then
      raise exception 'This complaint change belongs to ECMD or System Administration';
    end if;
    return new;
  end if;

  if public.current_user_has_capability('ecmd.operations') then
    if (new_data - array['status','service_target_due_at','escalated_at','updated_at'])
       is distinct from
       (old_data - array['status','service_target_due_at','escalated_at','updated_at']) then
      raise exception 'ECMD may update only field-workflow information';
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

create or replace function public.guard_ecmd_table_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if public.current_user_role() = 'admin'
     and not public.current_user_has_capability('ecmd.operations') then
    raise exception 'This record is restricted to ECMD';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'maintenance_tasks','maintenance_crews','crew_members','staff_schedules',
    'service_targets','complaint_escalations','inventory_items',
    'inventory_transactions','task_inventory_usage','task_manpower_records'
  ] loop
    execute format('drop trigger if exists guard_ecmd_changes on public.%I', table_name);
    execute format('create trigger guard_ecmd_changes before insert or update or delete on public.%I for each row execute function public.guard_ecmd_table_changes()', table_name);
  end loop;
end $$;

-- Shared complaint visibility remains available to both operational
-- departments; classifier internals are additionally removed from ECMD API
-- responses by the backend presentation layer.
drop policy if exists "categories_admin_write" on public.complaint_categories;
create policy "categories_supervisor_write" on public.complaint_categories
  for all to authenticated using (public.current_user_has_capability('system.departments'))
  with check (public.current_user_has_capability('system.departments'));

drop policy if exists "complaints_select" on public.complaints;
create policy "complaints_select" on public.complaints
  for select to authenticated using (
    resident_id = (select auth.uid())
    or public.is_assigned_to_complaint(id)
    or public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.dispatch')
  );

drop policy if exists "complaints_update_admin_or_assignee" on public.complaints;
drop policy if exists "complaints_update_admin_assignee_or_owner" on public.complaints;
create policy "complaints_update_department_assignee_or_owner" on public.complaints
  for update to authenticated using (
    resident_id = (select auth.uid())
    or public.is_assigned_to_complaint(id)
    or public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
    or public.current_user_has_capability('system.approvals')
  ) with check (
    resident_id = (select auth.uid())
    or public.is_assigned_to_complaint(id)
    or public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
    or public.current_user_has_capability('system.approvals')
  );

drop policy if exists "tasks_select" on public.maintenance_tasks;
create policy "tasks_select" on public.maintenance_tasks
  for select to authenticated using (
    assigned_staff_id = (select auth.uid())
    or public.is_resident_of_complaint(complaint_id)
    or public.current_user_has_capability('ecmd.operations')
  );
drop policy if exists "tasks_insert_admin" on public.maintenance_tasks;
create policy "tasks_insert_ecmd" on public.maintenance_tasks
  for insert to authenticated with check (public.current_user_has_capability('ecmd.dispatch'));
drop policy if exists "tasks_update_admin_or_assignee" on public.maintenance_tasks;
create policy "tasks_update_ecmd_or_assignee" on public.maintenance_tasks
  for update to authenticated using (
    assigned_staff_id = (select auth.uid()) or public.current_user_has_capability('ecmd.operations')
  ) with check (
    assigned_staff_id = (select auth.uid()) or public.current_user_has_capability('ecmd.operations')
  );

drop policy if exists "task_updates_select" on public.task_updates;
create policy "task_updates_select" on public.task_updates
  for select to authenticated using (exists (
    select 1 from public.maintenance_tasks t where t.id = task_updates.task_id and (
      t.assigned_staff_id = (select auth.uid())
      or public.current_user_has_capability('ecmd.operations')
      or public.is_resident_of_complaint(t.complaint_id)
    )
  ));
drop policy if exists "task_updates_insert" on public.task_updates;
create policy "task_updates_insert" on public.task_updates
  for insert to authenticated with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.maintenance_tasks t where t.id = task_updates.task_id and (
        t.assigned_staff_id = (select auth.uid()) or public.current_user_has_capability('ecmd.operations')
      )
    )
  );

drop policy if exists "feedback_select" on public.feedback;
create policy "feedback_select" on public.feedback
  for select to authenticated using (
    resident_id = (select auth.uid())
    or public.is_assigned_to_complaint(complaint_id)
    or public.current_user_has_capability('commercial.complaints')
  );

drop policy if exists "announcements_admin_write" on public.announcements;
create policy "announcements_commercial_write" on public.announcements
  for all to authenticated using (public.current_user_has_capability('commercial.announcements'))
  with check (public.current_user_has_capability('commercial.announcements'));

drop policy if exists "bills_select" on public.bills;
create policy "bills_select" on public.bills
  for select to authenticated using (
    customer_id = (select auth.uid()) or public.current_user_has_capability('commercial.billing')
  );
drop policy if exists "bills_admin_write" on public.bills;
create policy "bills_commercial_write" on public.bills
  for all to authenticated using (public.current_user_has_capability('commercial.billing'))
  with check (public.current_user_has_capability('commercial.billing'));

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_supervisor_select" on public.audit_logs
  for select to authenticated using (public.current_user_has_capability('system.audit'));

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notifications_insert_related" on public.notifications;
create policy "notifications_insert_related" on public.notifications
  for insert to authenticated with check (
    created_by = (select auth.uid()) and (
      user_id = (select auth.uid())
      or public.current_user_has_capability('system.audit')
      or (
        related_complaint_id is not null and (
          public.is_resident_of_complaint(related_complaint_id)
          or public.is_assigned_to_complaint(related_complaint_id)
          or public.current_user_has_capability('commercial.complaints')
          or public.current_user_has_capability('ecmd.operations')
        )
      )
    )
  );

-- Replace the broad staff policies introduced by the previous
-- operations migration.
drop policy if exists "departments_authenticated_read" on public.departments;
drop policy if exists "departments_admin_write" on public.departments;
create policy "departments_staff_read" on public.departments for select to authenticated using (
  public.current_user_role() in ('admin', 'maintenance_personnel')
);
create policy "departments_supervisor_write" on public.departments for all to authenticated
  using (public.current_user_has_capability('system.departments'))
  with check (public.current_user_has_capability('system.departments'));

drop policy if exists "crews_authenticated_read" on public.maintenance_crews;
drop policy if exists "crews_admin_write" on public.maintenance_crews;
create policy "crews_ecmd_read" on public.maintenance_crews for select to authenticated using (
  public.current_user_has_capability('ecmd.operations')
  or exists (select 1 from public.crew_members cm where cm.crew_id = id and cm.staff_id = (select auth.uid()) and cm.is_active)
);
create policy "crews_ecmd_write" on public.maintenance_crews for all to authenticated
  using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));

drop policy if exists "crew_members_authenticated_read" on public.crew_members;
drop policy if exists "crew_members_admin_write" on public.crew_members;
create policy "crew_members_ecmd_read" on public.crew_members for select to authenticated using (
  staff_id = (select auth.uid()) or public.current_user_has_capability('ecmd.operations')
);
create policy "crew_members_ecmd_write" on public.crew_members for all to authenticated
  using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));

drop policy if exists "schedules_admin_or_self_read" on public.staff_schedules;
drop policy if exists "schedules_admin_write" on public.staff_schedules;
create policy "schedules_ecmd_or_self_read" on public.staff_schedules for select to authenticated using (
  staff_id = (select auth.uid()) or public.current_user_has_capability('ecmd.operations')
);
create policy "schedules_ecmd_write" on public.staff_schedules for all to authenticated
  using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));

drop policy if exists "targets_authenticated_read" on public.service_targets;
drop policy if exists "targets_admin_write" on public.service_targets;
create policy "targets_ecmd_read" on public.service_targets for select to authenticated using (
  public.current_user_has_capability('ecmd.operations') or public.current_user_role() = 'maintenance_personnel'
);
create policy "targets_ecmd_write" on public.service_targets for all to authenticated
  using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));

drop policy if exists "escalations_admin_all" on public.complaint_escalations;
create policy "escalations_ecmd_all" on public.complaint_escalations for all to authenticated
  using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));

drop policy if exists "approvals_admin_all" on public.approval_requests;
create policy "approvals_supervisor_or_requester" on public.approval_requests for select to authenticated using (
  requested_by = (select auth.uid()) or public.current_user_has_capability('system.approvals')
);
create policy "approvals_requester_insert" on public.approval_requests for insert to authenticated with check (
  requested_by = (select auth.uid()) and (
    public.current_user_has_capability('commercial.archive_request') or public.current_user_has_capability('system.approvals')
  )
);
create policy "approvals_supervisor_update" on public.approval_requests for update to authenticated
  using (public.current_user_has_capability('system.approvals'))
  with check (public.current_user_has_capability('system.approvals'));

drop policy if exists "archives_admin_all" on public.archive_records;
create policy "archives_supervisor_all" on public.archive_records for all to authenticated
  using (public.current_user_has_capability('system.approvals'))
  with check (public.current_user_has_capability('system.approvals'));

drop policy if exists "accounts_admin_all" on public.customer_account_registry;
create policy "accounts_commercial_all" on public.customer_account_registry for all to authenticated
  using (public.current_user_has_capability('commercial.billing'))
  with check (public.current_user_has_capability('commercial.billing'));
drop policy if exists "billing_batches_admin_all" on public.billing_import_batches;
create policy "billing_batches_commercial_all" on public.billing_import_batches for all to authenticated
  using (public.current_user_has_capability('commercial.billing'))
  with check (public.current_user_has_capability('commercial.billing'));

drop policy if exists "inventory_authenticated_read" on public.inventory_items;
drop policy if exists "inventory_admin_write" on public.inventory_items;
create policy "inventory_ecmd_read" on public.inventory_items for select to authenticated using (
  public.current_user_has_capability('ecmd.operations') or public.current_user_role() = 'maintenance_personnel'
);
create policy "inventory_ecmd_write" on public.inventory_items for all to authenticated
  using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));

drop policy if exists "inventory_transactions_admin_read" on public.inventory_transactions;
drop policy if exists "inventory_transactions_admin_write" on public.inventory_transactions;
create policy "inventory_transactions_ecmd_read" on public.inventory_transactions for select to authenticated
  using (public.current_user_has_capability('ecmd.operations'));
create policy "inventory_transactions_ecmd_write" on public.inventory_transactions for insert to authenticated
  with check (public.current_user_has_capability('ecmd.operations') and created_by = (select auth.uid()));

drop policy if exists "task_usage_admin_or_assignee_read" on public.task_inventory_usage;
create policy "task_usage_ecmd_or_assignee_read" on public.task_inventory_usage for select to authenticated using (
  public.current_user_has_capability('ecmd.operations') or exists (
    select 1 from public.maintenance_tasks t where t.id = maintenance_task_id and t.assigned_staff_id = (select auth.uid())
  )
);
drop policy if exists "manpower_admin_or_assignee_read" on public.task_manpower_records;
drop policy if exists "manpower_admin_or_assignee_insert" on public.task_manpower_records;
create policy "manpower_ecmd_or_assignee_read" on public.task_manpower_records for select to authenticated using (
  public.current_user_has_capability('ecmd.operations') or exists (
    select 1 from public.maintenance_tasks t where t.id = maintenance_task_id and t.assigned_staff_id = (select auth.uid())
  )
);
create policy "manpower_ecmd_or_assignee_insert" on public.task_manpower_records for insert to authenticated with check (
  recorded_by = (select auth.uid()) and (
    public.current_user_has_capability('ecmd.operations') or exists (
      select 1 from public.maintenance_tasks t where t.id = maintenance_task_id and t.assigned_staff_id = (select auth.uid())
    )
  )
);

drop policy if exists "delivery_admin_or_self_read" on public.notification_deliveries;
drop policy if exists "delivery_admin_update" on public.notification_deliveries;
create policy "delivery_supervisor_or_self_read" on public.notification_deliveries for select to authenticated using (
  user_id = (select auth.uid()) or public.current_user_has_capability('system.audit')
);
create policy "delivery_supervisor_update" on public.notification_deliveries for update to authenticated
  using (public.current_user_has_capability('system.audit'))
  with check (public.current_user_has_capability('system.audit'));

-- Keep explicit Data API grants; RLS supplies the department-specific rows and
-- operations. This also handles Supabase projects using the newer private-by-
-- default Data API behavior.
grant select, insert, update on public.complaints, public.maintenance_tasks, public.task_updates to authenticated;
grant select on public.profiles to authenticated;
grant select on public.feedback, public.audit_logs to authenticated;
grant select, insert, update, delete on public.announcements, public.bills to authenticated;
grant select, insert, update, delete on public.departments, public.maintenance_crews, public.crew_members,
  public.staff_schedules, public.service_targets, public.complaint_escalations, public.approval_requests,
  public.archive_records, public.customer_account_registry, public.billing_import_batches, public.inventory_items to authenticated;
grant select, insert on public.inventory_transactions, public.task_inventory_usage, public.task_manpower_records to authenticated;
grant select, update on public.notification_deliveries to authenticated;

notify pgrst, 'reload schema';
commit;
