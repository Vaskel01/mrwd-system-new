begin;

-- Client-approved display term. Existing classifier synonyms such as
-- "water interruption" remain in the language dataset and map to No Water.
update public.complaint_categories
set name = 'No Water',
    description = 'No water supply to a residence or area.'
where name = 'Water Interruption';

create extension if not exists pgcrypto;

-- Client-confirmed organizational separation. Staff keep their existing
-- authentication role; department and position describe operational scope.
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  responsibilities text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.departments (code, name, responsibilities)
values
  ('COMMERCIAL', 'Commercial Services Department', 'Monitors customer complaints, billing concerns, submissions, and management reports.'),
  ('ECMD', 'Engineering, Construction and Maintenance Department', 'Coordinates field crews, maintenance assignments, equipment, materials, and completion reports.')
on conflict (code) do update
set name = excluded.name,
    responsibilities = excluded.responsibilities,
    updated_at = now();

alter table public.profiles
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists staff_position text,
  add column if not exists supervisor_id uuid references public.profiles(id) on delete set null,
  add column if not exists account_validation_status text not null default 'unverified',
  add column if not exists account_validated_at timestamptz,
  add column if not exists email_notifications_enabled boolean not null default true,
  add column if not exists sms_notifications_enabled boolean not null default false;

alter table public.profiles drop constraint if exists profiles_staff_position_check;
alter table public.profiles add constraint profiles_staff_position_check
  check (staff_position is null or staff_position in ('manager', 'supervisor', 'team_leader', 'crew_member', 'commercial_staff', 'department_staff'));

alter table public.profiles drop constraint if exists profiles_account_validation_status_check;
alter table public.profiles add constraint profiles_account_validation_status_check
  check (account_validation_status in ('unverified', 'pending_review', 'verified', 'mismatch'));

create table if not exists public.maintenance_crews (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  name text not null,
  team_leader_id uuid references public.profiles(id) on delete set null,
  default_manpower integer not null default 1 check (default_manpower > 0),
  contact_note text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, name)
);

create table if not exists public.crew_members (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.maintenance_crews(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  crew_role text not null default 'crew_member' check (crew_role in ('team_leader', 'crew_member', 'driver', 'specialist', 'helper')),
  manpower_units numeric(6,2) not null default 1 check (manpower_units > 0),
  joined_at date not null default current_date,
  left_at date,
  is_active boolean not null default true,
  unique (crew_id, staff_id)
);

create table if not exists public.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  shift_date date not null,
  starts_at time not null,
  ends_at time not null,
  shift_status text not null default 'scheduled' check (shift_status in ('scheduled', 'available', 'busy', 'on_leave', 'off_duty')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, shift_date, starts_at)
);

create table if not exists public.service_targets (
  id uuid primary key default gen_random_uuid(),
  priority text not null unique check (priority in ('low', 'medium', 'high')),
  acknowledgment_hours numeric(8,2) not null check (acknowledgment_hours > 0),
  resolution_hours numeric(8,2) not null check (resolution_hours > 0),
  escalation_hours numeric(8,2) not null check (escalation_hours > 0),
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.service_targets (priority, acknowledgment_hours, resolution_hours, escalation_hours)
values ('high', 2, 24, 4), ('medium', 8, 72, 24), ('low', 24, 168, 72)
on conflict (priority) do nothing;

alter table public.complaints
  add column if not exists service_target_due_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.maintenance_tasks
  add column if not exists assigned_crew_id uuid references public.maintenance_crews(id) on delete set null;

create table if not exists public.complaint_escalations (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  target_id uuid references public.service_targets(id) on delete set null,
  escalation_type text not null check (escalation_type in ('high_priority_overdue', 'acknowledgment_overdue', 'resolution_overdue')),
  severity text not null default 'warning' check (severity in ('warning', 'critical')),
  reason text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists complaint_escalations_one_open_type
  on public.complaint_escalations (complaint_id, escalation_type)
  where status in ('open', 'acknowledged');

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('archive_complaint', 'priority_exception', 'inventory_adjustment', 'service_target_change', 'other')),
  entity_type text not null,
  entity_id uuid,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.archive_records (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  reason text not null,
  archived_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz not null default now()
);

create table if not exists public.customer_account_registry (
  id uuid primary key default gen_random_uuid(),
  account_number text not null unique,
  registered_name text not null,
  service_address text,
  barangay text,
  meter_number text,
  is_active boolean not null default true,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'processing' check (status in ('processing', 'completed', 'completed_with_errors', 'failed')),
  error_summary jsonb not null default '[]'::jsonb,
  imported_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.bills
  add column if not exists account_number text,
  add column if not exists source_batch_id uuid references public.billing_import_batches(id) on delete set null,
  add column if not exists import_row_number integer;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text not null default 'material',
  unit text not null default 'piece',
  quantity_on_hand numeric(12,2) not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric(12,2) not null default 0 check (reorder_level >= 0),
  location text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('stock_in', 'task_usage', 'adjustment', 'return')),
  quantity_delta numeric(12,2) not null check (quantity_delta <> 0),
  balance_after numeric(12,2) not null,
  complaint_id uuid references public.complaints(id) on delete set null,
  maintenance_task_id uuid references public.maintenance_tasks(id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.task_inventory_usage (
  id uuid primary key default gen_random_uuid(),
  maintenance_task_id uuid not null references public.maintenance_tasks(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create table if not exists public.task_manpower_records (
  id uuid primary key default gen_random_uuid(),
  maintenance_task_id uuid not null references public.maintenance_tasks(id) on delete cascade,
  crew_id uuid references public.maintenance_crews(id) on delete set null,
  personnel_count integer not null check (personnel_count > 0),
  hours_worked numeric(8,2) not null default 0 check (hours_worked >= 0),
  work_date date not null default current_date,
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  destination text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count integer not null default 0,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (notification_id, channel)
);

-- Queue requested external channels when an in-app notification is created.
-- Delivery is intentionally left to an approved email/SMS provider worker.
create or replace function public.queue_external_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare recipient public.profiles;
begin
  select * into recipient from public.profiles where id = new.user_id;
  if recipient.email_notifications_enabled and nullif(trim(recipient.email), '') is not null then
    insert into public.notification_deliveries (notification_id, user_id, channel, destination)
    values (new.id, new.user_id, 'email', recipient.email)
    on conflict do nothing;
  end if;
  if recipient.sms_notifications_enabled and nullif(trim(recipient.phone), '') is not null then
    insert into public.notification_deliveries (notification_id, user_id, channel, destination)
    values (new.id, new.user_id, 'sms', recipient.phone)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_notification_delivery on public.notifications;
create trigger queue_notification_delivery
  after insert on public.notifications
  for each row execute function public.queue_external_notification();

revoke all on function public.queue_external_notification() from public, anon, authenticated;

-- Safe inventory deduction with assignment/admin authorization and one
-- transaction boundary for stock, usage, and ledger records.
create or replace function public.record_task_inventory_usage(
  p_task_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_notes text default null
)
returns public.task_inventory_usage
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare task_row public.maintenance_tasks;
declare item_row public.inventory_items;
declare usage_row public.task_inventory_usage;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  select * into task_row from public.maintenance_tasks where id = p_task_id and is_active = true;
  if task_row.id is null then raise exception 'Active maintenance task not found'; end if;
  if public.current_user_role() <> 'admin' and task_row.assigned_staff_id <> auth.uid() then
    raise exception 'You are not assigned to this task';
  end if;

  select * into item_row from public.inventory_items where id = p_inventory_item_id and is_active = true for update;
  if item_row.id is null then raise exception 'Inventory item not found'; end if;
  if item_row.quantity_on_hand < p_quantity then raise exception 'Insufficient inventory stock'; end if;

  update public.inventory_items
  set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now()
  where id = p_inventory_item_id
  returning * into item_row;

  insert into public.task_inventory_usage (maintenance_task_id, inventory_item_id, quantity, notes, recorded_by)
  values (p_task_id, p_inventory_item_id, p_quantity, nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into usage_row;

  insert into public.inventory_transactions (
    inventory_item_id, transaction_type, quantity_delta, balance_after,
    complaint_id, maintenance_task_id, notes, created_by
  ) values (
    p_inventory_item_id, 'task_usage', -p_quantity, item_row.quantity_on_hand,
    task_row.complaint_id, p_task_id, nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  );

  return usage_row;
end;
$$;

revoke all on function public.record_task_inventory_usage(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.record_task_inventory_usage(uuid, uuid, numeric, text) to authenticated;

create or replace function public.adjust_inventory_stock(
  p_inventory_item_id uuid,
  p_quantity_delta numeric,
  p_reason text
)
returns public.inventory_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare item_row public.inventory_items;
declare next_balance numeric;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Administrator access required'; end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then raise exception 'Adjustment quantity cannot be zero'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Adjustment reason is required'; end if;

  select * into item_row
  from public.inventory_items
  where id = p_inventory_item_id and is_active = true
  for update;
  if item_row.id is null then raise exception 'Inventory item not found'; end if;

  next_balance := item_row.quantity_on_hand + p_quantity_delta;
  if next_balance < 0 then raise exception 'Adjustment would make stock negative'; end if;

  update public.inventory_items
  set quantity_on_hand = next_balance, updated_at = now()
  where id = p_inventory_item_id
  returning * into item_row;

  insert into public.inventory_transactions (
    inventory_item_id, transaction_type, quantity_delta, balance_after, notes, created_by
  ) values (
    p_inventory_item_id,
    case when p_quantity_delta > 0 then 'stock_in' else 'adjustment' end,
    p_quantity_delta,
    next_balance,
    trim(p_reason),
    auth.uid()
  );

  return item_row;
end;
$$;

revoke all on function public.adjust_inventory_stock(uuid, numeric, text) from public, anon;
grant execute on function public.adjust_inventory_stock(uuid, numeric, text) to authenticated;

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
  if public.current_user_role() <> 'admin' then raise exception 'Administrator access required'; end if;
  select * into approval_row from public.approval_requests
  where id = p_approval_request_id
    and request_type = 'archive_complaint'
    and entity_id = p_complaint_id
    and status = 'approved';
  if approval_row.id is null then raise exception 'An approved archival request is required'; end if;
  if approval_row.requested_by = approval_row.reviewed_by then raise exception 'A different backup Administrator or Supervisor must approve archival'; end if;

  update public.complaints
  set archived_at = now(), archived_by = auth.uid(), archive_reason = approval_row.reason, updated_at = now()
  where id = p_complaint_id
    and status in ('completed', 'rejected', 'cancelled')
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

create or replace function public.validate_my_customer_account(p_account_number text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare registry_count integer;
declare account_row public.customer_account_registry;
declare normalized text := upper(trim(coalesce(p_account_number, '')));
begin
  if auth.uid() is null or public.current_user_role() <> 'customer' then
    raise exception 'Customer access required';
  end if;
  if normalized = '' then
    update public.profiles
    set account_validation_status = 'unverified', account_validated_at = null
    where id = auth.uid();
    return jsonb_build_object('status', 'unverified', 'message', 'Enter an MRWD account number for validation.');
  end if;

  select count(*) into registry_count from public.customer_account_registry where is_active = true;
  if registry_count = 0 then
    update public.profiles
    set account_validation_status = 'pending_review', account_validated_at = null
    where id = auth.uid();
    return jsonb_build_object('status', 'pending_review', 'message', 'Saved for review. Import the official account registry to enable automatic validation.');
  end if;

  select * into account_row from public.customer_account_registry
  where upper(trim(account_number)) = normalized and is_active = true;
  if account_row.id is null then
    update public.profiles
    set account_validation_status = 'mismatch', account_validated_at = null
    where id = auth.uid();
    return jsonb_build_object('status', 'mismatch', 'message', 'Account number was not found in the active MRWD account registry.');
  end if;

  if account_row.linked_profile_id is not null and account_row.linked_profile_id <> auth.uid() then
    update public.profiles
    set account_validation_status = 'mismatch', account_validated_at = null
    where id = auth.uid();
    return jsonb_build_object('status', 'mismatch', 'message', 'Account number is already linked to another customer profile.');
  end if;

  update public.customer_account_registry set linked_profile_id = auth.uid(), updated_at = now() where id = account_row.id;
  update public.profiles
  set account_validation_status = 'verified', account_validated_at = now()
  where id = auth.uid();
  return jsonb_build_object(
    'status', 'verified',
    'message', 'Account number verified against the MRWD registry.',
    'registered_name', account_row.registered_name,
    'meter_number', account_row.meter_number
  );
end;
$$;

create or replace function public.update_my_notification_preferences(p_email boolean, p_sms boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles
  set email_notifications_enabled = coalesce(p_email, true),
      sms_notifications_enabled = coalesce(p_sms, false),
      updated_at = now()
  where id = auth.uid()
  returning * into result;
  return result;
end;
$$;

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
  if public.current_user_role() <> 'admin' then raise exception 'Administrator access required'; end if;
  if p_staff_position is not null and p_staff_position not in ('manager', 'supervisor', 'team_leader', 'crew_member', 'commercial_staff', 'department_staff') then
    raise exception 'Invalid staff position';
  end if;
  update public.profiles
  set department_id = p_department_id,
      staff_position = p_staff_position,
      supervisor_id = p_supervisor_id,
      updated_at = now()
  where id = p_staff_id and role in ('admin', 'maintenance_personnel')
  returning * into result;
  if result.id is null then raise exception 'Staff account not found'; end if;
  return result;
end;
$$;

revoke all on function public.validate_my_customer_account(text) from public, anon;
revoke all on function public.update_my_notification_preferences(boolean, boolean) from public, anon;
revoke all on function public.admin_update_staff_assignment(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.validate_my_customer_account(text) to authenticated;
grant execute on function public.update_my_notification_preferences(boolean, boolean) to authenticated;
grant execute on function public.admin_update_staff_assignment(uuid, uuid, text, uuid) to authenticated;

-- RLS: public-schema tables remain inaccessible until both grants and row
-- policies allow a request. Staff write operations are performed by the API
-- with the signed-in user's token, never a service-role key.
alter table public.departments enable row level security;
alter table public.maintenance_crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.staff_schedules enable row level security;
alter table public.service_targets enable row level security;
alter table public.complaint_escalations enable row level security;
alter table public.approval_requests enable row level security;
alter table public.archive_records enable row level security;
alter table public.customer_account_registry enable row level security;
alter table public.billing_import_batches enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.task_inventory_usage enable row level security;
alter table public.task_manpower_records enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "departments_authenticated_read" on public.departments for select to authenticated using (true);
create policy "departments_admin_write" on public.departments for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "crews_authenticated_read" on public.maintenance_crews for select to authenticated using (true);
create policy "crews_admin_write" on public.maintenance_crews for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "crew_members_authenticated_read" on public.crew_members for select to authenticated using (true);
create policy "crew_members_admin_write" on public.crew_members for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "schedules_admin_or_self_read" on public.staff_schedules for select to authenticated using (public.current_user_role() = 'admin' or staff_id = (select auth.uid()));
create policy "schedules_admin_write" on public.staff_schedules for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "targets_authenticated_read" on public.service_targets for select to authenticated using (true);
create policy "targets_admin_write" on public.service_targets for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "escalations_admin_all" on public.complaint_escalations for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "approvals_admin_all" on public.approval_requests for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "archives_admin_all" on public.archive_records for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "accounts_admin_all" on public.customer_account_registry for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "billing_batches_admin_all" on public.billing_import_batches for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "inventory_authenticated_read" on public.inventory_items for select to authenticated using (true);
create policy "inventory_admin_write" on public.inventory_items for all to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "inventory_transactions_admin_read" on public.inventory_transactions for select to authenticated using (public.current_user_role() = 'admin');
create policy "inventory_transactions_admin_write" on public.inventory_transactions for insert to authenticated with check (public.current_user_role() = 'admin' and created_by = (select auth.uid()));
create policy "task_usage_admin_or_assignee_read" on public.task_inventory_usage for select to authenticated using (
  public.current_user_role() = 'admin' or exists (
    select 1 from public.maintenance_tasks t where t.id = maintenance_task_id and t.assigned_staff_id = (select auth.uid())
  )
);
create policy "manpower_admin_or_assignee_read" on public.task_manpower_records for select to authenticated using (
  public.current_user_role() = 'admin' or exists (
    select 1 from public.maintenance_tasks t where t.id = maintenance_task_id and t.assigned_staff_id = (select auth.uid())
  )
);
create policy "manpower_admin_or_assignee_insert" on public.task_manpower_records for insert to authenticated with check (
  recorded_by = (select auth.uid()) and (
    public.current_user_role() = 'admin' or exists (
      select 1 from public.maintenance_tasks t where t.id = maintenance_task_id and t.assigned_staff_id = (select auth.uid())
    )
  )
);
create policy "delivery_admin_or_self_read" on public.notification_deliveries for select to authenticated using (public.current_user_role() = 'admin' or user_id = (select auth.uid()));
create policy "delivery_admin_update" on public.notification_deliveries for update to authenticated using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

grant select, insert, update on public.departments, public.maintenance_crews, public.crew_members,
  public.staff_schedules, public.service_targets, public.complaint_escalations, public.approval_requests,
  public.customer_account_registry, public.billing_import_batches, public.inventory_items to authenticated;
grant select, insert on public.archive_records, public.inventory_transactions, public.task_manpower_records to authenticated;
grant select on public.task_inventory_usage to authenticated;
grant select, update on public.notification_deliveries to authenticated;

create index if not exists staff_schedules_staff_date_idx on public.staff_schedules (staff_id, shift_date);
create index if not exists profiles_department_idx on public.profiles (department_id) where department_id is not null;
create index if not exists profiles_supervisor_idx on public.profiles (supervisor_id) where supervisor_id is not null;
create index if not exists maintenance_crews_department_idx on public.maintenance_crews (department_id);
create index if not exists maintenance_crews_leader_idx on public.maintenance_crews (team_leader_id) where team_leader_id is not null;
create index if not exists crew_members_staff_idx on public.crew_members (staff_id);
create index if not exists complaints_active_due_idx on public.complaints (priority, service_target_due_at)
  where archived_at is null and status in ('pending', 'assigned', 'en_route', 'in_progress', 'blocked');
create index if not exists complaints_archived_by_idx on public.complaints (archived_by) where archived_by is not null;
create index if not exists maintenance_tasks_crew_idx on public.maintenance_tasks (assigned_crew_id) where assigned_crew_id is not null;
create index if not exists complaint_escalations_open_idx on public.complaint_escalations (due_at, created_at desc)
  where status in ('open', 'acknowledged');
create index if not exists complaint_escalations_complaint_idx on public.complaint_escalations (complaint_id, created_at desc);
create index if not exists approval_requests_pending_idx on public.approval_requests (created_at desc) where status = 'pending';
create index if not exists approval_requests_entity_idx on public.approval_requests (entity_type, entity_id);
create index if not exists archive_records_approval_idx on public.archive_records (approval_request_id) where approval_request_id is not null;
create index if not exists customer_account_registry_profile_idx on public.customer_account_registry (linked_profile_id) where linked_profile_id is not null;
create index if not exists billing_import_batches_imported_by_idx on public.billing_import_batches (imported_by, created_at desc);
create index if not exists bills_source_batch_idx on public.bills (source_batch_id) where source_batch_id is not null;
create index if not exists inventory_transactions_item_idx on public.inventory_transactions (inventory_item_id, created_at desc);
create index if not exists inventory_transactions_task_idx on public.inventory_transactions (maintenance_task_id) where maintenance_task_id is not null;
create index if not exists task_inventory_usage_task_idx on public.task_inventory_usage (maintenance_task_id, recorded_at);
create index if not exists task_inventory_usage_item_idx on public.task_inventory_usage (inventory_item_id);
create index if not exists task_manpower_task_idx on public.task_manpower_records (maintenance_task_id, work_date);
create index if not exists task_manpower_crew_idx on public.task_manpower_records (crew_id) where crew_id is not null;
create index if not exists notification_deliveries_pending_idx on public.notification_deliveries (created_at) where status = 'pending';
create index if not exists notification_deliveries_user_idx on public.notification_deliveries (user_id, created_at desc);

comment on table public.maintenance_crews is 'ECMD field crews with a designated team leader and default manpower.';
comment on table public.service_targets is 'Administrator-defined acknowledgment, resolution, and escalation targets per priority.';
comment on table public.notification_deliveries is 'Email/SMS delivery queue; requires a separately configured approved provider worker.';
comment on column public.profiles.staff_position is 'Operational position without changing the account authentication role.';

commit;
