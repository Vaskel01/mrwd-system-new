begin;

-- Complaint-only operational workflow expansion for Commercial Services + ECMD.
-- Explicitly excludes SLA/response-time tracking, task acceptance, and completion-photo evidence.

-- ---------------------------------------------------------------------------
-- 1) Workflow fields and statuses
-- ---------------------------------------------------------------------------
alter table public.complaints
  add column if not exists forwarded_to_ecmd_at timestamptz,
  add column if not exists forwarded_to_ecmd_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolution_code text,
  add column if not exists resolution_notes text;

alter table public.complaints drop constraint if exists complaints_status_check;
alter table public.complaints
  add constraint complaints_status_check check (status in (
    'pending', 'forwarded', 'assigned', 'en_route', 'in_progress', 'blocked',
    'awaiting_verification', 'resolved', 'completed', 'rejected', 'cancelled'
  ));

-- Existing completed complaints are considered resolved records in the new workflow,
-- while maintenance-task completion will use awaiting_verification going forward.
update public.complaints
set status = 'resolved',
    verified_at = coalesce(verified_at, updated_at),
    resolution_code = coalesce(resolution_code, 'resolved')
where status = 'completed';

-- ---------------------------------------------------------------------------
-- 2) Structured reason codes used by closure/reassignment/verification flows
-- ---------------------------------------------------------------------------
create table if not exists public.complaint_reason_codes (
  code text primary key,
  label text not null,
  action_type text not null check (action_type in ('resolution','closure','reassignment','return','relation')),
  department_code text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.complaint_reason_codes (code, label, action_type, department_code, sort_order)
values
  ('resolved', 'Resolved', 'resolution', 'ECMD', 10),
  ('duplicate', 'Duplicate complaint', 'closure', 'COMMERCIAL', 20),
  ('invalid', 'Invalid complaint', 'closure', 'COMMERCIAL', 30),
  ('outside_jurisdiction', 'Outside MRWD jurisdiction', 'closure', 'COMMERCIAL', 40),
  ('unable_to_locate', 'Unable to locate issue', 'closure', 'ECMD', 50),
  ('customer_withdrew', 'Customer withdrew complaint', 'closure', 'COMMERCIAL', 60),
  ('personnel_unavailable', 'Personnel unavailable', 'reassignment', 'ECMD', 10),
  ('workload_balancing', 'Workload balancing', 'reassignment', 'ECMD', 20),
  ('different_expertise', 'Requires different expertise', 'reassignment', 'ECMD', 30),
  ('location_reassignment', 'Location reassignment', 'reassignment', 'ECMD', 40),
  ('needs_more_work', 'Needs additional field work', 'return', 'ECMD', 10),
  ('information_incomplete', 'Information incomplete', 'return', 'COMMERCIAL', 20),
  ('same_incident', 'Same operational incident', 'relation', 'ECMD', 10),
  ('possible_duplicate', 'Possible duplicate', 'relation', 'COMMERCIAL', 20)
on conflict (code) do update set
  label = excluded.label,
  action_type = excluded.action_type,
  department_code = excluded.department_code,
  is_active = true,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3) Complete complaint timeline independent of maintenance assignment
-- ---------------------------------------------------------------------------
create table if not exists public.complaint_events (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  department_code text,
  customer_visible boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists complaint_events_complaint_idx on public.complaint_events (complaint_id, created_at desc);

-- Seed a baseline event for historical rows if no event exists yet.
insert into public.complaint_events (complaint_id, event_type, title, message, actor_id, actor_name, customer_visible, created_at)
select c.id, 'submitted', 'Complaint submitted', 'Complaint received by MRWD.', c.resident_id, p.full_name, true, c.submitted_at
from public.complaints c
left join public.profiles p on p.id = c.resident_id
where not exists (select 1 from public.complaint_events e where e.complaint_id = c.id and e.event_type = 'submitted');

-- ---------------------------------------------------------------------------
-- 4) Internal notes and customer communication log
-- ---------------------------------------------------------------------------
create table if not exists public.complaint_internal_notes (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  department_code text not null check (department_code in ('COMMERCIAL','ECMD')),
  note text not null check (char_length(trim(note)) >= 2),
  created_at timestamptz not null default now()
);
create index if not exists complaint_internal_notes_complaint_idx on public.complaint_internal_notes (complaint_id, created_at desc);

create table if not exists public.customer_contact_log (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  department_code text not null check (department_code in ('COMMERCIAL','ECMD')),
  channel text not null check (channel in ('phone','sms','email','in_system','in_person','other')),
  contact_type text not null check (contact_type in ('outbound','inbound','status_update','information_request','follow_up')),
  summary text not null check (char_length(trim(summary)) >= 2),
  created_at timestamptz not null default now()
);
create index if not exists customer_contact_log_complaint_idx on public.customer_contact_log (complaint_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) Persistent duplicate / related complaint links and incident grouping
-- ---------------------------------------------------------------------------
create table if not exists public.complaint_relations (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  related_complaint_id uuid not null references public.complaints(id) on delete cascade,
  relation_type text not null check (relation_type in ('possible_duplicate','duplicate','related','same_incident')),
  reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (complaint_id <> related_complaint_id)
);
create unique index if not exists complaint_relations_unique_pair
  on public.complaint_relations (least(complaint_id, related_complaint_id), greatest(complaint_id, related_complaint_id), relation_type);
create index if not exists complaint_relations_left_idx on public.complaint_relations (complaint_id);
create index if not exists complaint_relations_right_idx on public.complaint_relations (related_complaint_id);

create table if not exists public.complaint_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location_text text,
  category_id uuid references public.complaint_categories(id) on delete set null,
  status text not null default 'active' check (status in ('active','monitoring','resolved')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaint_incident_members (
  incident_id uuid not null references public.complaint_incidents(id) on delete cascade,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete restrict,
  added_at timestamptz not null default now(),
  primary key (incident_id, complaint_id)
);
create index if not exists complaint_incident_members_complaint_idx on public.complaint_incident_members (complaint_id);

-- ---------------------------------------------------------------------------
-- 6) RLS / grants for new operational tables
-- ---------------------------------------------------------------------------
alter table public.complaint_reason_codes enable row level security;
alter table public.complaint_events enable row level security;
alter table public.complaint_internal_notes enable row level security;
alter table public.customer_contact_log enable row level security;
alter table public.complaint_relations enable row level security;
alter table public.complaint_incidents enable row level security;
alter table public.complaint_incident_members enable row level security;

grant select on public.complaint_reason_codes to authenticated;
grant select, insert on public.complaint_events to authenticated;
grant select, insert on public.complaint_internal_notes to authenticated;
grant select, insert on public.customer_contact_log to authenticated;
grant select, insert, delete on public.complaint_relations to authenticated;
grant select, insert, update, delete on public.complaint_incidents to authenticated;
grant select, insert, delete on public.complaint_incident_members to authenticated;

-- reason codes are reference data
create policy "reason_codes_authenticated_read" on public.complaint_reason_codes
  for select to authenticated using (is_active = true);

-- Timeline: customers see customer-visible events for their complaint; operational staff see all.
create policy "complaint_events_read" on public.complaint_events
  for select to authenticated using (
    public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
    or public.current_user_has_capability('ecmd.dispatch')
    or exists (
      select 1 from public.complaints c
      where c.id = complaint_events.complaint_id
        and c.resident_id = (select auth.uid())
        and complaint_events.customer_visible = true
    )
    or exists (
      select 1 from public.maintenance_tasks mt
      where mt.complaint_id = complaint_events.complaint_id
        and mt.assigned_staff_id = (select auth.uid())
    )
  );

create policy "complaint_events_insert" on public.complaint_events
  for insert to authenticated with check (
    actor_id = (select auth.uid())
    and (
      public.current_user_has_capability('commercial.complaints')
      or public.current_user_has_capability('ecmd.operations')
      or public.current_user_has_capability('ecmd.dispatch')
      or exists (
        select 1 from public.complaints c where c.id = complaint_events.complaint_id and c.resident_id = (select auth.uid())
      )
      or exists (
        select 1 from public.maintenance_tasks mt
        where mt.complaint_id = complaint_events.complaint_id and mt.assigned_staff_id = (select auth.uid())
      )
    )
  );

create policy "internal_notes_operational_read" on public.complaint_internal_notes
  for select to authenticated using (
    public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
    or public.current_user_has_capability('ecmd.dispatch')
  );
create policy "internal_notes_operational_insert" on public.complaint_internal_notes
  for insert to authenticated with check (
    author_id = (select auth.uid()) and (
      (department_code = 'COMMERCIAL' and public.current_user_has_capability('commercial.complaints'))
      or (department_code = 'ECMD' and (public.current_user_has_capability('ecmd.operations') or public.current_user_has_capability('ecmd.dispatch')))
    )
  );

create policy "contact_log_operational_read" on public.customer_contact_log
  for select to authenticated using (
    public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
    or public.current_user_has_capability('ecmd.dispatch')
  );
create policy "contact_log_operational_insert" on public.customer_contact_log
  for insert to authenticated with check (
    staff_id = (select auth.uid()) and (
      (department_code = 'COMMERCIAL' and public.current_user_has_capability('commercial.complaints'))
      or (department_code = 'ECMD' and (public.current_user_has_capability('ecmd.operations') or public.current_user_has_capability('ecmd.dispatch')))
    )
  );

create policy "relations_operational_read" on public.complaint_relations
  for select to authenticated using (
    public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
    or public.current_user_has_capability('ecmd.dispatch')
  );
create policy "relations_operational_insert" on public.complaint_relations
  for insert to authenticated with check (
    created_by = (select auth.uid()) and (
      public.current_user_has_capability('commercial.complaints')
      or public.current_user_has_capability('ecmd.operations')
      or public.current_user_has_capability('ecmd.dispatch')
    )
  );
create policy "relations_operational_delete" on public.complaint_relations
  for delete to authenticated using (
    public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
  );

create policy "incidents_operational_read" on public.complaint_incidents
  for select to authenticated using (
    public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
    or public.current_user_has_capability('ecmd.dispatch')
  );
create policy "incidents_ecmd_insert" on public.complaint_incidents
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.current_user_has_capability('ecmd.operations')
  );
create policy "incidents_ecmd_update" on public.complaint_incidents
  for update to authenticated using (public.current_user_has_capability('ecmd.operations'))
  with check (public.current_user_has_capability('ecmd.operations'));
create policy "incidents_ecmd_delete" on public.complaint_incidents
  for delete to authenticated using (public.current_user_has_capability('ecmd.operations'));

create policy "incident_members_operational_read" on public.complaint_incident_members
  for select to authenticated using (
    public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.operations')
    or public.current_user_has_capability('ecmd.dispatch')
  );
create policy "incident_members_ecmd_insert" on public.complaint_incident_members
  for insert to authenticated with check (
    added_by = (select auth.uid()) and public.current_user_has_capability('ecmd.operations')
  );
create policy "incident_members_ecmd_delete" on public.complaint_incident_members
  for delete to authenticated using (public.current_user_has_capability('ecmd.operations'));

-- ---------------------------------------------------------------------------
-- 7) Department guard: explicit Commercial -> ECMD handoff and ECMD verification
-- ---------------------------------------------------------------------------
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

  if public.current_user_has_capability('commercial.complaints') then
    if new.status is distinct from old.status
       and not (
         new.status in ('rejected','forwarded')
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
      'forwarded_to_ecmd_at','forwarded_to_ecmd_by'
    ]) is distinct from (old_data - array[
      'category_id','description','address_text','lat','lng','zone','photo_urls',
      'status','rejection_reason','rejected_at','priority','priority_score',
      'algorithm_priority_score','priority_override_reason','priority_overridden_by',
      'priority_overridden_at','rule_score','sentiment_score','classified_category',
      'classification_confidence','classification_sentiment','classification_mismatch',
      'classification_basis','classification_keywords','classification_negated_keywords',
      'classification_reasons','classifier_version','classification_method','updated_at',
      'forwarded_to_ecmd_at','forwarded_to_ecmd_by'
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

-- Remove stale target timestamps from active records; target tables remain for migration
-- compatibility but are no longer used by the complaint workflow/UI.
update public.complaints set service_target_due_at = null, escalated_at = null
where service_target_due_at is not null or escalated_at is not null;


-- Dispatch RPC now belongs strictly to ECMD and supports the forwarded workflow.
create or replace function public.assign_complaint_task(
  p_complaint_id uuid,
  p_staff_id uuid,
  p_notes text default null
)
returns public.maintenance_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.maintenance_tasks;
  staff_ok boolean;
  complaint_status text;
begin
  if not public.current_user_has_capability('ecmd.dispatch') then
    raise exception 'ECMD dispatch access required';
  end if;

  select status into complaint_status from public.complaints where id = p_complaint_id;
  if complaint_status is null then raise exception 'Complaint not found'; end if;
  if complaint_status not in ('forwarded','assigned','in_progress','blocked') then
    raise exception 'Complaint is not available for dispatch';
  end if;

  select exists (
    select 1 from public.profiles p
    join public.departments d on d.id = p.department_id
    where p.id = p_staff_id
      and p.role = 'maintenance_personnel'
      and p.is_active = true
      and coalesce(p.availability_status, 'available') not in ('on_leave', 'off_duty')
      and d.code = 'ECMD'
  ) into staff_ok;
  if not staff_ok then raise exception 'Selected Maintenance Personnel is inactive, unavailable, or not assigned to ECMD'; end if;

  update public.maintenance_tasks
  set is_active = false, superseded_at = now(), status = case when status = 'completed' then status else 'reassigned' end
  where complaint_id = p_complaint_id and is_active = true;

  insert into public.maintenance_tasks (complaint_id, assigned_staff_id, assigned_by, status, notes, is_active)
  values (p_complaint_id, p_staff_id, auth.uid(), 'assigned', nullif(trim(coalesce(p_notes, '')), ''), true)
  returning * into result;

  update public.complaints
  set status = 'assigned', rejection_reason = null, rejected_at = null, updated_at = now()
  where id = p_complaint_id;

  return result;
end;
$$;

revoke all on function public.assign_complaint_task(uuid, uuid, text) from public, anon;
grant execute on function public.assign_complaint_task(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
