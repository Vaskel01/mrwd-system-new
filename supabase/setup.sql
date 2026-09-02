-- ============================================================================
-- MRWD Complaint Management System - Fresh Database Setup
-- Release snapshot: 2026-08-23
--
-- PURPOSE
--   One-time bootstrap for a NEW Supabase project. This file replaces the old
--   chain of incremental SQL patches for fresh deployments.
--
-- IMPORTANT
--   * Run this only on a fresh/empty MRWD Supabase project.
--   * Do NOT run it over an existing MRWD production database.
--   * The application intentionally has no SLA/response-time workflow,
--     or Maintenance Personnel accept/reject step.
--   * Public SECURITY DEFINER RPCs are hardened at the end of this file.
-- ============================================================================

create extension if not exists pgcrypto;
create schema if not exists app_private;

-- ---------------------------------------------------------------------------
-- Final-state schema bootstrap. The file creates only features used by this release.
-- Historical SLA and acknowledgement artifacts are intentionally absent.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'customer',
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.complaint_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  base_severity_score integer not null default 50 check (base_severity_score between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.complaint_categories(id),
  description text not null,
  address_text text not null,
  zone text,
  lat double precision,
  lng double precision,
  photo_urls text[] default '{}'::text[],
  status text not null default 'pending',
  priority_score integer default 0,
  sentiment_score integer default 0,
  rule_score integer default 0,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  priority text not null default 'medium'
);

create table if not exists public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  assigned_staff_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending',
  notes text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  completion_photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.maintenance_tasks(id) on delete cascade,
  updated_by uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  photo_urls text[] default '{}'::text[],
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Private helper required by the final security-wrapper layer.
create or replace function app_private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1
$$;


-- ===== Reference data: complaint types =====
insert into public.complaint_categories (name, description, base_severity_score, is_active)
values
  ('No Water',        'Complete loss of water supply to a residence or area.',           40, true),
  ('Water Leak',                 'Visible leaking or bursting pipes, meters, or fittings.',           35, true),
  ('Dirty / Discolored Water',   'Water that appears dirty, discolored, or has an unusual smell.',   30, true),
  ('Low Water Pressure',         'Water flow noticeably weaker than usual.',                          20, true),
  ('Meter Problem',              'Faulty, damaged, or inaccurate water meter.',                       15, true),
  ('New Connection Request',     'Request for a new service connection.',                             10, true),
  ('Billing Concern',            'Disputes or questions about a bill or charge.',                      5, true),
  ('Other',                      'Anything that does not fit the categories above.',                  10, true)
on conflict (name) do update
  set base_severity_score = excluded.base_severity_score,
      description = excluded.description,
      is_active = true;

-- ===== Core Row Level Security =====
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_assigned_to_complaint(p_complaint_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.maintenance_tasks
    where complaint_id = p_complaint_id and assigned_staff_id = auth.uid()
  )
$$;

create or replace function public.is_resident_of_complaint(p_complaint_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.complaints
    where id = p_complaint_id and resident_id = auth.uid()
  )
$$;

alter table public.complaint_categories enable row level security;

drop policy if exists "categories_select_all" on public.complaint_categories;
create policy "categories_select_all" on public.complaint_categories
  for select using (auth.role() = 'authenticated');

drop policy if exists "categories_admin_write" on public.complaint_categories;
create policy "categories_admin_write" on public.complaint_categories
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter table public.complaints enable row level security;

drop policy if exists "complaints_select" on public.complaints;
create policy "complaints_select" on public.complaints
  for select using (
    resident_id = auth.uid()
    or public.current_user_role() = 'admin'
    or public.is_assigned_to_complaint(id)
  );

drop policy if exists "complaints_insert_own" on public.complaints;
create policy "complaints_insert_own" on public.complaints
  for insert with check (
    resident_id = auth.uid() and public.current_user_role() = 'customer'
  );

drop policy if exists "complaints_update_admin_or_assignee" on public.complaints;
create policy "complaints_update_admin_or_assignee" on public.complaints
  for update using (
    public.current_user_role() = 'admin'
    or public.is_assigned_to_complaint(id)
  );

alter table public.maintenance_tasks enable row level security;

drop policy if exists "tasks_select" on public.maintenance_tasks;
create policy "tasks_select" on public.maintenance_tasks
  for select using (
    assigned_staff_id = auth.uid()
    or public.current_user_role() = 'admin'
    or public.is_resident_of_complaint(complaint_id)
  );

drop policy if exists "tasks_insert_admin" on public.maintenance_tasks;
create policy "tasks_insert_admin" on public.maintenance_tasks
  for insert with check (public.current_user_role() = 'admin');

drop policy if exists "tasks_update_admin_or_assignee" on public.maintenance_tasks;
create policy "tasks_update_admin_or_assignee" on public.maintenance_tasks
  for update using (
    public.current_user_role() = 'admin' or assigned_staff_id = auth.uid()
  );

alter table public.task_updates enable row level security;

drop policy if exists "task_updates_select" on public.task_updates;
create policy "task_updates_select" on public.task_updates
  for select using (
    exists (
      select 1 from public.maintenance_tasks t
      where t.id = task_updates.task_id
        and (t.assigned_staff_id = auth.uid() or public.current_user_role() = 'admin')
    )
  );

drop policy if exists "task_updates_insert" on public.task_updates;
create policy "task_updates_insert" on public.task_updates
  for insert with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.maintenance_tasks t
      where t.id = task_updates.task_id
        and (t.assigned_staff_id = auth.uid() or public.current_user_role() = 'admin')
    )
  );

alter table public.feedback enable row level security;

drop policy if exists "feedback_select" on public.feedback;
create policy "feedback_select" on public.feedback
  for select using (
    resident_id = auth.uid()
    or public.current_user_role() = 'admin'
    or public.is_assigned_to_complaint(complaint_id)
  );

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert with check (resident_id = auth.uid());

-- ===== Auth signup profile provisioning =====
alter table public.profiles enable row level security;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ===== Customer advisories and billing =====
create table if not exists public.announcements (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  content          text not null,
  category         text not null,
  created_by       uuid references public.profiles(id),
  created_by_name  text not null,
  created_at       timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_all" on public.announcements;
create policy "announcements_select_all" on public.announcements
  for select using (auth.role() = 'authenticated');

drop policy if exists "announcements_admin_write" on public.announcements;
create policy "announcements_admin_write" on public.announcements
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create table if not exists public.bills (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.profiles(id),
  billing_period    text not null,
  previous_reading  numeric not null,
  current_reading   numeric not null,
  consumption       numeric not null,
  amount_due        numeric not null,
  due_date          date not null,
  status            text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  issued_at         timestamptz not null default now()
);

alter table public.bills enable row level security;

drop policy if exists "bills_select" on public.bills;
create policy "bills_select" on public.bills
  for select using (
    customer_id = auth.uid() or public.current_user_role() = 'admin'
  );

drop policy if exists "bills_admin_write" on public.bills;
create policy "bills_admin_write" on public.bills
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.bills to authenticated;

-- ===== Complaint workflow statuses and feedback =====
alter table public.complaints drop constraint if exists complaints_status_check;
alter table public.complaints add constraint complaints_status_check
  check (status in ('pending', 'assigned', 'en_route', 'in_progress', 'completed', 'rejected'));

alter table public.maintenance_tasks drop constraint if exists maintenance_tasks_status_check;
alter table public.maintenance_tasks add constraint maintenance_tasks_status_check
  check (status in ('pending', 'assigned', 'en_route', 'in_progress', 'completed'));

drop policy if exists "task_updates_select" on public.task_updates;
create policy "task_updates_select" on public.task_updates
  for select using (
    exists (
      select 1 from public.maintenance_tasks t
      join public.complaints c on c.id = t.complaint_id
      where t.id = task_updates.task_id
        and (
          t.assigned_staff_id = auth.uid()
          or c.resident_id = auth.uid()
          or public.current_user_role() = 'admin'
        )
    )
  );

alter table public.feedback drop constraint if exists feedback_rating_check;
alter table public.feedback add constraint feedback_rating_check
  check (rating >= 1 and rating <= 5);

alter table public.feedback drop constraint if exists feedback_complaint_id_key;
alter table public.feedback add constraint feedback_complaint_id_key unique (complaint_id);

-- ===== Data API grants =====
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.bills to authenticated;

grant select, insert, update, delete on public.feedback to authenticated;
grant select, insert, update, delete on public.task_updates to authenticated;
grant select, insert, update, delete on public.maintenance_tasks to authenticated;
grant select, insert, update, delete on public.complaint_categories to authenticated;
grant select, insert, update, delete on public.complaints to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

-- ===== Rejection and restore fields =====
alter table public.complaints
  add column if not exists rejection_reason text;

alter table public.complaints
  add column if not exists rejected_at timestamptz;

comment on column public.complaints.rejection_reason is
  'Admin-provided explanation shown to the resident when a complaint is rejected.';

comment on column public.complaints.rejected_at is
  'Most recent time the complaint was marked rejected. Cleared when rejection is undone.';

-- ===== Feedback visibility =====
alter table public.feedback enable row level security;

drop policy if exists "feedback_select" on public.feedback;
create policy "feedback_select" on public.feedback
  for select using (
    resident_id = auth.uid()
    or public.current_user_role() = 'admin'
    or public.is_assigned_to_complaint(complaint_id)
  );

-- ===== Classifier persistence =====
alter table public.complaints
  add column if not exists classified_category text,
  add column if not exists classification_confidence numeric(5,2),
  add column if not exists classification_sentiment text,
  add column if not exists classification_mismatch boolean not null default false,
  add column if not exists classification_basis text,
  add column if not exists classification_keywords jsonb not null default '[]'::jsonb,
  add column if not exists classification_negated_keywords jsonb not null default '[]'::jsonb,
  add column if not exists classification_reasons jsonb not null default '[]'::jsonb,
  add column if not exists classifier_version text,
  add column if not exists classification_method text;

alter table public.complaints
  drop constraint if exists complaints_classification_confidence_check;

alter table public.complaints
  add constraint complaints_classification_confidence_check
  check (classification_confidence is null or classification_confidence between 0 and 100);

alter table public.complaints
  drop constraint if exists complaints_classification_sentiment_check;

alter table public.complaints
  add constraint complaints_classification_sentiment_check
  check (classification_sentiment is null or classification_sentiment in ('neutral', 'negative', 'urgent'));

comment on column public.complaints.classified_category is
  'Complaint category predicted from the description by the dataset-backed classifier.';
comment on column public.complaints.classification_confidence is
  'Transparent rule-based confidence percentage for the predicted category.';
comment on column public.complaints.classification_keywords is
  'JSON list of dataset terms matched during text analysis.';
comment on column public.complaints.classification_reasons is
  'Human-readable explanation of the classifier result.';

-- ===== Core workflow, notifications, audit, and staff operations =====

alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists availability_status text not null default 'available',
  add column if not exists availability_note text,
  add column if not exists availability_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_availability_status_check;
alter table public.profiles add constraint profiles_availability_status_check
  check (availability_status in ('available', 'busy', 'on_leave', 'off_duty'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'customer',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.update_my_profile(
  p_full_name text,
  p_availability_status text default null,
  p_availability_note text default null,
  p_availability_until timestamptz default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  current_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'Full name is required'; end if;

  select role into current_role from public.profiles where id = auth.uid();

  update public.profiles
  set full_name = trim(p_full_name),
      availability_status = case
        when current_role = 'maintenance_personnel' and p_availability_status is not null then p_availability_status
        else availability_status
      end,
      availability_note = case
        when current_role = 'maintenance_personnel' then nullif(trim(coalesce(p_availability_note, '')), '')
        else availability_note
      end,
      availability_until = case
        when current_role = 'maintenance_personnel' then p_availability_until
        else availability_until
      end,
      updated_at = now()
  where id = auth.uid()
  returning * into result;

  return result;
end;
$$;

create or replace function public.admin_promote_staff(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Admin access required'; end if;
  if p_role not in ('admin', 'maintenance_personnel') then raise exception 'Invalid staff role'; end if;

  insert into public.profiles (id, email, full_name, role, is_active)
  values (p_user_id, lower(trim(p_email)), trim(p_full_name), p_role, true)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        is_active = true,
        updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.admin_set_staff_active(p_user_id uuid, p_is_active boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Admin access required'; end if;
  if p_user_id = auth.uid() and p_is_active = false then raise exception 'You cannot deactivate your own account'; end if;
  if p_is_active = false and exists (
    select 1
    from public.maintenance_tasks
    where assigned_staff_id = p_user_id
      and coalesce(is_active, true) = true
      and status not in ('completed', 'cancelled', 'reassigned')
  ) then
    raise exception 'Reassign this technician''s active tasks before deactivating the account';
  end if;

  update public.profiles
  set is_active = p_is_active, updated_at = now()
  where id = p_user_id and role in ('admin', 'maintenance_personnel')
  returning * into result;
  if result.id is null then raise exception 'Staff account not found'; end if;
  return result;
end;
$$;

create or replace function public.is_active_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'admin' and is_active = true
  )
$$;

create or replace function public.active_admin_ids()
returns table(id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select p.id from public.profiles p where p.role = 'admin' and p.is_active = true
$$;

revoke all on function public.update_my_profile(text, text, text, timestamptz) from public, anon;
revoke all on function public.admin_promote_staff(uuid, text, text, text) from public, anon;
revoke all on function public.admin_set_staff_active(uuid, boolean) from public, anon;
revoke all on function public.is_active_admin(uuid) from public, anon;
revoke all on function public.active_admin_ids() from public, anon;
grant execute on function public.update_my_profile(text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_promote_staff(uuid, text, text, text) to authenticated;
grant execute on function public.admin_set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.is_active_admin(uuid) to authenticated;
grant execute on function public.active_admin_ids() to authenticated;

alter table public.complaints
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_reason text;

do $$
declare item record;
begin
  for item in
    select conname
    from pg_constraint
    where conrelid = 'public.complaints'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.complaints drop constraint if exists %I', item.conname);
  end loop;
end $$;

alter table public.complaints add constraint complaints_status_check
  check (status in ('pending', 'assigned', 'en_route', 'in_progress', 'completed', 'rejected', 'cancelled', 'blocked'));

drop policy if exists "complaints_update_admin_or_assignee" on public.complaints;
drop policy if exists "complaints_update_admin_assignee_or_owner" on public.complaints;
create policy "complaints_update_admin_assignee_or_owner" on public.complaints
  for update using (
    public.current_user_role() = 'admin'
    or public.is_assigned_to_complaint(id)
    or resident_id = auth.uid()
  )
  with check (
    public.current_user_role() = 'admin'
    or public.is_assigned_to_complaint(id)
    or resident_id = auth.uid()
  );

alter table public.maintenance_tasks
  add column if not exists is_active boolean not null default true,
  add column if not exists completion_notes text,
  add column if not exists completion_photo_url text,
  add column if not exists materials_used text,
  add column if not exists unable_reason text,
  add column if not exists reassignment_requested_at timestamptz,
  add column if not exists reassignment_reason text,
  add column if not exists assistance_requested_at timestamptz,
  add column if not exists assistance_reason text,
  add column if not exists superseded_at timestamptz;

do $$
declare item record;
begin
  for item in
    select conname
    from pg_constraint
    where conrelid = 'public.maintenance_tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.maintenance_tasks drop constraint if exists %I', item.conname);
  end loop;
end $$;

alter table public.maintenance_tasks add constraint maintenance_tasks_status_check
  check (status in ('pending', 'assigned', 'en_route', 'in_progress', 'completed', 'blocked', 'reassigned', 'cancelled', 'reopened'));

with ranked as (
  select id, row_number() over (partition by complaint_id order by created_at desc, id desc) as rn
  from public.maintenance_tasks
)
update public.maintenance_tasks t
set is_active = false,
    superseded_at = coalesce(t.superseded_at, now())
from ranked r
where t.id = r.id and r.rn > 1;

create unique index if not exists maintenance_tasks_one_current_assignment
  on public.maintenance_tasks (complaint_id)
  where is_active = true;

create or replace function public.is_assigned_to_complaint(p_complaint_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.maintenance_tasks
    where complaint_id = p_complaint_id
      and assigned_staff_id = auth.uid()
      and is_active = true
  )
$$;

create or replace function public.assign_complaint_task(
  p_complaint_id uuid,
  p_staff_id uuid,
  p_notes text default null
)
returns public.maintenance_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.maintenance_tasks;
  staff_ok boolean;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Admin access required'; end if;

  select exists (
    select 1 from public.profiles
    where id = p_staff_id
      and role = 'maintenance_personnel'
      and is_active = true
      and availability_status not in ('on_leave', 'off_duty')
  ) into staff_ok;
  if not staff_ok then raise exception 'Selected technician is inactive, unavailable, or invalid'; end if;

  update public.maintenance_tasks
  set is_active = false,
      superseded_at = now(),
      status = case when status = 'completed' then status else 'reassigned' end
  where complaint_id = p_complaint_id and is_active = true;

  insert into public.maintenance_tasks (
    complaint_id, assigned_staff_id, assigned_by, status, notes, is_active
  ) values (
    p_complaint_id, p_staff_id, auth.uid(), 'assigned', nullif(trim(coalesce(p_notes, '')), ''), true
  ) returning * into result;

  update public.complaints
  set status = 'assigned',
      rejection_reason = null,
      rejected_at = null,
      cancellation_reason = null,
      cancelled_at = null,
      updated_at = now()
  where id = p_complaint_id;

  return result;
end;
$$;

revoke all on function public.assign_complaint_task(uuid, uuid, text) from public, anon;
grant execute on function public.assign_complaint_task(uuid, uuid, text) to authenticated;

create or replace function public.visible_profile_names(p_ids uuid[])
returns table(id uuid, full_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id = any(coalesce(p_ids, array[]::uuid[]))
    and (
      public.current_user_role() = 'admin'
      or p.id = auth.uid()
      or (
        public.current_user_role() = 'maintenance_personnel'
        and exists (
          select 1
          from public.maintenance_tasks t
          join public.complaints c on c.id = t.complaint_id
          where t.assigned_staff_id = auth.uid()
            and t.is_active = true
            and c.resident_id = p.id
        )
      )
      or (
        public.current_user_role() = 'customer'
        and exists (
          select 1
          from public.complaints c
          join public.maintenance_tasks t on t.complaint_id = c.id
          where c.resident_id = auth.uid()
            and t.is_active = true
            and t.assigned_staff_id = p.id
        )
      )
    )
$$;

revoke all on function public.visible_profile_names(uuid[]) from public, anon;
grant execute on function public.visible_profile_names(uuid[]) to authenticated;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  message text not null,
  notification_type text not null default 'info',
  related_complaint_id uuid references public.complaints(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_insert_related" on public.notifications;
create policy "notifications_insert_related" on public.notifications
  for insert with check (
    created_by = auth.uid()
    and (
      public.current_user_role() = 'admin'
      or user_id = auth.uid()
      or exists (
        select 1 from public.complaints c
        where c.id = related_complaint_id
          and (
            c.resident_id = auth.uid()
            or public.is_assigned_to_complaint(c.id)
          )
          and (
            user_id = c.resident_id
            or public.is_active_admin(user_id)
            or exists (
              select 1 from public.maintenance_tasks t
              where t.complaint_id = c.id and t.assigned_staff_id = user_id and t.is_active = true
            )
          )
      )
    )
  );

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select" on public.audit_logs
  for select using (public.current_user_role() = 'admin');

drop policy if exists "audit_logs_insert_self" on public.audit_logs;
create policy "audit_logs_insert_self" on public.audit_logs
  for insert with check (actor_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('complaint-photos', 'complaint-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "complaint_photos_public_read" on storage.objects;
create policy "complaint_photos_public_read" on storage.objects
  for select using (bucket_id = 'complaint-photos');

drop policy if exists "complaint_photos_upload_own_folder" on storage.objects;
create policy "complaint_photos_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'complaint-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update, delete on public.maintenance_tasks to authenticated;
grant select, insert, update, delete on public.complaints to authenticated;
drop policy if exists "profiles_insert_own" on public.profiles;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;

comment on table public.notifications is 'In-app role-aware status and assignment notifications.';
comment on table public.audit_logs is 'Immutable application action history visible to administrators.';
comment on column public.maintenance_tasks.is_active is 'True for the current assignment; older reassigned task rows are retained for audit history.';

-- ===== Complaint references and customer profile polish =====
begin;

create sequence if not exists public.complaint_reference_seq;

alter table public.complaints
  add column if not exists reference_number text;

alter table public.complaints
  alter column reference_number set default (
    'MRWD-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.complaint_reference_seq')::text, 6, '0')
  );

update public.complaints
set reference_number =
  'MRWD-' || to_char(coalesce(submitted_at, now()), 'YYYY') || '-' ||
  lpad(nextval('public.complaint_reference_seq')::text, 6, '0')
where reference_number is null or btrim(reference_number) = '';

alter table public.complaints
  alter column reference_number set not null;

create unique index if not exists complaints_reference_number_key
  on public.complaints (reference_number);

grant usage, select on sequence public.complaint_reference_seq
  to authenticated, service_role;

alter table public.profiles
  add column if not exists account_number text,
  add column if not exists phone text,
  add column if not exists service_address text,
  add column if not exists barangay text;

create unique index if not exists profiles_account_number_key
  on public.profiles (account_number)
  where account_number is not null and btrim(account_number) <> '';

drop function if exists public.update_my_profile(
  text, text, text, timestamptz
);

create or replace function public.update_my_profile(
  p_full_name text,
  p_availability_status text default null,
  p_availability_note text default null,
  p_availability_until timestamptz default null,
  p_account_number text default null,
  p_phone text default null,
  p_service_address text default null,
  p_barangay text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.profiles;
  current_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Full name is required';
  end if;

  select role
  into current_role
  from public.profiles
  where id = auth.uid();

  if current_role is null then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      account_number = case
        when current_role = 'customer'
          then nullif(trim(coalesce(p_account_number, '')), '')
        else account_number
      end,
      phone = case
        when current_role = 'customer'
          then nullif(trim(coalesce(p_phone, '')), '')
        else phone
      end,
      service_address = case
        when current_role = 'customer'
          then nullif(trim(coalesce(p_service_address, '')), '')
        else service_address
      end,
      barangay = case
        when current_role = 'customer'
          then nullif(trim(coalesce(p_barangay, '')), '')
        else barangay
      end,
      availability_status = case
        when current_role = 'maintenance_personnel'
             and p_availability_status is not null
          then p_availability_status
        else availability_status
      end,
      availability_note = case
        when current_role = 'maintenance_personnel'
          then nullif(trim(coalesce(p_availability_note, '')), '')
        else availability_note
      end,
      availability_until = case
        when current_role = 'maintenance_personnel'
          then p_availability_until
        else availability_until
      end,
      updated_at = now()
  where id = auth.uid()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.update_my_profile(
  text, text, text, timestamptz, text, text, text, text
) from public, anon;
grant execute on function public.update_my_profile(
  text, text, text, timestamptz, text, text, text, text
) to authenticated;

alter table public.announcements
  add column if not exists is_important boolean not null default false;

alter table public.complaints
  add column if not exists algorithm_priority_score integer,
  add column if not exists priority_override_reason text,
  add column if not exists priority_overridden_by uuid
    references public.profiles(id) on delete set null,
  add column if not exists priority_overridden_at timestamptz;

update public.complaints
set algorithm_priority_score = priority_score
where algorithm_priority_score is null;

alter table public.complaints
  alter column algorithm_priority_score set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'complaints_algorithm_priority_score_check'
      and conrelid = 'public.complaints'::regclass
  ) then
    alter table public.complaints
      add constraint complaints_algorithm_priority_score_check
      check (algorithm_priority_score between 0 and 100);
  end if;
end
$$;

comment on column public.complaints.reference_number is
  'Human-readable complaint identifier shown to users; UUID id remains internal.';
comment on column public.complaints.algorithm_priority_score is
  'Latest classifier-generated score before any administrator override.';
comment on column public.complaints.priority_overridden_at is
  'When set, priority_score and priority contain an administrator override.';

commit;

-- ===== Notification cleanup policy =====
alter table public.notifications enable row level security;

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
on public.notifications
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant delete on public.notifications to authenticated;

-- ===== Announcement lifecycle =====
alter table public.announcements
  add column if not exists active_until timestamptz,
  add column if not exists updated_at timestamptz;

update public.announcements
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.announcements
  alter column updated_at set default now();

create index if not exists announcements_active_until_idx
  on public.announcements (active_until)
  where active_until is not null;

comment on column public.announcements.active_until is
  'Optional deadline after which the notice is hidden from non-administrator users.';

comment on column public.announcements.updated_at is
  'Timestamp of the most recent announcement edit.';

-- ===== Customer profile persistence =====
begin;

create or replace function public.update_my_customer_profile(
  p_full_name text,
  p_account_number text default null,
  p_phone text default null,
  p_service_address text default null,
  p_barangay text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Full name must contain at least 2 characters';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'customer'
      and coalesce(is_active, true) = true
  ) then
    raise exception 'Active customer profile not found';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      account_number = nullif(trim(coalesce(p_account_number, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      service_address = nullif(trim(coalesce(p_service_address, '')), ''),
      barangay = nullif(trim(coalesce(p_barangay, '')), ''),
      updated_at = now()
  where id = auth.uid()
    and role = 'customer'
  returning * into result;

  if result.id is null then
    raise exception 'Customer profile could not be updated';
  end if;

  return result;
end;
$$;

revoke all on function public.update_my_customer_profile(
  text, text, text, text, text
) from public, anon;
grant execute on function public.update_my_customer_profile(
  text, text, text, text, text
) to authenticated;

comment on function public.update_my_customer_profile(
  text, text, text, text, text
) is 'Updates only the authenticated active customer profile contact and service fields.';

notify pgrst, 'reload schema';

commit;

-- ===== Profile update hardening =====
begin;

alter function public.update_my_customer_profile(
  text, text, text, text, text
) security invoker;

alter function public.update_my_profile(
  text, text, text, timestamptz, text, text, text, text
) security invoker;

revoke update on table public.profiles from anon;
grant update (
  full_name,
  account_number,
  phone,
  service_address,
  barangay,
  availability_status,
  availability_note,
  availability_until,
  updated_at
) on table public.profiles to authenticated;

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

notify pgrst, 'reload schema';

commit;

-- ===== Operational support schema =====
begin;

update public.complaint_categories
set name = 'No Water',
    description = 'No water supply to a residence or area.'
where name = 'Water Interruption';


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


alter table public.complaints
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.maintenance_tasks
  add column if not exists assigned_crew_id uuid references public.maintenance_crews(id) on delete set null;


create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('archive_complaint', 'priority_exception', 'inventory_adjustment', 'other')),
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

alter table public.departments enable row level security;
alter table public.maintenance_crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.staff_schedules enable row level security;
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
  public.staff_schedules, public.approval_requests,
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
create index if not exists complaints_active_priority_idx on public.complaints (priority, updated_at desc)
  where archived_at is null and status in ('pending', 'forwarded', 'assigned', 'en_route', 'in_progress', 'blocked');
create index if not exists complaints_archived_by_idx on public.complaints (archived_by) where archived_by is not null;
create index if not exists maintenance_tasks_crew_idx on public.maintenance_tasks (assigned_crew_id) where assigned_crew_id is not null;
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
comment on table public.notification_deliveries is 'Email/SMS delivery queue; requires a separately configured approved provider worker.';
comment on column public.profiles.staff_position is 'Operational position without changing the account authentication role.';

commit;

-- ===== Department capabilities and ownership =====
begin;

update public.profiles
set staff_position = 'manager', updated_at = now()
where role = 'admin' and department_id is null and staff_position is null;

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
    if (new_data - array['status','updated_at'])
       is distinct from
       (old_data - array['status','updated_at']) then
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
    'inventory_items',
    'inventory_transactions','task_inventory_usage','task_manpower_records'
  ] loop
    execute format('drop trigger if exists guard_ecmd_changes on public.%I', table_name);
    execute format('create trigger guard_ecmd_changes before insert or update or delete on public.%I for each row execute function public.guard_ecmd_table_changes()', table_name);
  end loop;
end $$;

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

grant select, insert, update on public.complaints, public.maintenance_tasks, public.task_updates to authenticated;
grant select on public.profiles to authenticated;
grant select on public.feedback, public.audit_logs to authenticated;
grant select, insert, update, delete on public.announcements, public.bills to authenticated;
grant select, insert, update, delete on public.departments, public.maintenance_crews, public.crew_members,
  public.staff_schedules, public.approval_requests,
  public.archive_records, public.customer_account_registry, public.billing_import_batches, public.inventory_items to authenticated;
grant select, insert on public.inventory_transactions, public.task_inventory_usage, public.task_manpower_records to authenticated;
grant select, update on public.notification_deliveries to authenticated;

notify pgrst, 'reload schema';
commit;

-- ===== Separate Commercial / ECMD / System workspaces =====
begin;

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

-- ===== Complaint timeline, dispatch, resolution, and incident operations =====
begin;

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
    'resolved', 'completed', 'rejected', 'cancelled'
  ));

update public.complaints
set status = 'resolved',
    verified_at = null,
    verified_by = null,
    resolution_code = coalesce(resolution_code, 'resolved')
where status = 'completed';

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

insert into public.complaint_events (complaint_id, event_type, title, message, actor_id, actor_name, customer_visible, created_at)
select c.id, 'submitted', 'Complaint submitted', 'Complaint received by MRWD.', c.resident_id, p.full_name, true, c.submitted_at
from public.complaints c
left join public.profiles p on p.id = c.resident_id
where not exists (select 1 from public.complaint_events e where e.complaint_id = c.id and e.event_type = 'submitted');

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

create policy "reason_codes_authenticated_read" on public.complaint_reason_codes
  for select to authenticated using (is_active = true);

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
      raise exception 'ECMD may update only field-workflow, operational priority, and resolution information';
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

-- ===== Production-readiness features =====
begin;

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

update public.profiles
set mfa_required = true
where role = 'admin' and staff_position in ('manager','supervisor');

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
    'resolved', 'rejected', 'cancelled', 'merged'
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

drop policy if exists "complaints_select" on public.complaints;
create policy "complaints_select" on public.complaints
  for select to authenticated using (
    resident_id = (select auth.uid())
    or public.is_assigned_to_complaint(id)
    or public.current_user_has_capability('commercial.complaints')
    or public.current_user_has_capability('ecmd.dispatch')
    or (archived_at is not null and public.current_user_has_capability('system.approvals'))
  );

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
      raise exception 'ECMD may update only field-workflow, operational priority, and resolution information';
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

grant usage on schema public to authenticated;

notify pgrst, 'reload schema';
commit;

-- ===== Privileged RPC security hardening =====
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.current_user_has_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.role <> 'admin' or p.is_active is false then false
      when p.staff_position in ('manager', 'supervisor') then
        p_capability in (
          'system.dashboard','system.staff','system.audit','system.approvals','system.departments'
        )
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

create or replace function app_private.active_admin_ids()
returns table(id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.role = 'admin'
    and p.is_active = true
    and p.staff_position in ('manager', 'supervisor');
$$;

create or replace function app_private.active_admin_ids_for_department(p_department_code text)
returns table(id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  join public.departments d on d.id = p.department_id
  where p.role = 'admin'
    and p.is_active = true
    and d.code = upper(trim(p_department_code));
$$;

create or replace function app_private.adjust_inventory_stock(
  p_inventory_item_id uuid,
  p_quantity_delta numeric,
  p_reason text
)
returns public.inventory_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_row public.inventory_items;
  next_balance numeric;
begin
  if not app_private.current_user_has_capability('ecmd.operations') then
    raise exception 'ECMD operations access required';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Adjustment quantity cannot be zero';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Adjustment reason is required';
  end if;

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

create or replace function app_private.record_task_inventory_usage(
  p_task_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_notes text default null
)
returns public.task_inventory_usage
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_row public.maintenance_tasks;
  item_row public.inventory_items;
  usage_row public.task_inventory_usage;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  select * into task_row
  from public.maintenance_tasks
  where id = p_task_id and is_active = true;
  if task_row.id is null then raise exception 'Active maintenance task not found'; end if;

  if not app_private.current_user_has_capability('ecmd.operations')
     and task_row.assigned_staff_id is distinct from auth.uid() then
    raise exception 'Only ECMD Operations or the assigned Maintenance Personnel may record task inventory usage';
  end if;

  select * into item_row
  from public.inventory_items
  where id = p_inventory_item_id and is_active = true
  for update;
  if item_row.id is null then raise exception 'Inventory item not found'; end if;
  if item_row.quantity_on_hand < p_quantity then raise exception 'Insufficient inventory stock'; end if;

  update public.inventory_items
  set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now()
  where id = p_inventory_item_id
  returning * into item_row;

  insert into public.task_inventory_usage (
    maintenance_task_id, inventory_item_id, quantity, notes, recorded_by
  ) values (
    p_task_id, p_inventory_item_id, p_quantity,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning * into usage_row;

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

create or replace function app_private.admin_promote_staff(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not app_private.current_user_has_capability('system.staff') then
    raise exception 'System Supervisor access required';
  end if;
  if p_role not in ('admin', 'maintenance_personnel') then
    raise exception 'Invalid staff role';
  end if;

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

create or replace function app_private.admin_update_staff_assignment(
  p_staff_id uuid,
  p_department_id uuid,
  p_staff_position text,
  p_supervisor_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not app_private.current_user_has_capability('system.staff') then
    raise exception 'System Supervisor access required';
  end if;
  if p_staff_position is not null
     and p_staff_position not in ('manager','supervisor','team_leader','crew_member','commercial_staff','department_staff') then
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

create or replace function app_private.archive_complaint_with_approval(
  p_complaint_id uuid,
  p_approval_request_id uuid
)
returns public.complaints
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_row public.approval_requests;
  complaint_row public.complaints;
begin
  if not app_private.current_user_has_capability('system.approvals') then
    raise exception 'System Supervisor approval access required';
  end if;

  select * into approval_row
  from public.approval_requests
  where id = p_approval_request_id
    and request_type = 'archive_complaint'
    and entity_id = p_complaint_id
    and status = 'approved';
  if approval_row.id is null then raise exception 'An approved archival request is required'; end if;
  if approval_row.requested_by = approval_row.reviewed_by then
    raise exception 'A different System Supervisor must approve archival';
  end if;

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

create or replace function app_private.assign_complaint_task(
  p_complaint_id uuid,
  p_staff_id uuid,
  p_notes text default null
)
returns public.maintenance_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.maintenance_tasks;
  staff_ok boolean;
  complaint_status text;
begin
  if not app_private.current_user_has_capability('ecmd.dispatch') then
    raise exception 'ECMD dispatch access required';
  end if;

  select status into complaint_status from public.complaints where id = p_complaint_id;
  if complaint_status is null then raise exception 'Complaint not found'; end if;
  if complaint_status not in ('forwarded','assigned','in_progress','blocked') then
    raise exception 'Complaint is not available for dispatch';
  end if;

  select exists (
    select 1
    from public.profiles p
    join public.departments d on d.id = p.department_id
    where p.id = p_staff_id
      and p.role = 'maintenance_personnel'
      and p.is_active = true
      and coalesce(p.availability_status, 'available') not in ('on_leave', 'off_duty')
      and d.code = 'ECMD'
  ) into staff_ok;
  if not staff_ok then
    raise exception 'Selected Maintenance Personnel is inactive, unavailable, or not assigned to ECMD';
  end if;

  update public.maintenance_tasks
  set is_active = false,
      superseded_at = now(),
      status = case when status = 'completed' then status else 'reassigned' end
  where complaint_id = p_complaint_id and is_active = true;

  insert into public.maintenance_tasks (
    complaint_id, assigned_staff_id, assigned_by, status, notes, is_active
  ) values (
    p_complaint_id, p_staff_id, auth.uid(), 'assigned', nullif(trim(coalesce(p_notes, '')), ''), true
  ) returning * into result;

  update public.complaints
  set status = 'assigned', rejection_reason = null, rejected_at = null, updated_at = now()
  where id = p_complaint_id;

  return result;
end;
$$;

create or replace function app_private.record_my_login()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles
  set last_login_at = recorded_at, updated_at = recorded_at
  where id = auth.uid();
  return recorded_at;
end;
$$;

create or replace function app_private.record_my_password_change()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
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

create or replace function app_private.update_my_notification_preferences(
  p_email boolean,
  p_sms boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
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

create or replace function app_private.validate_my_customer_account(p_account_number text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  registry_count integer;
  account_row public.customer_account_registry;
  normalized text := upper(trim(coalesce(p_account_number, '')));
begin
  if auth.uid() is null or app_private.current_user_role() <> 'customer' then
    raise exception 'Customer access required';
  end if;

  if normalized = '' then
    update public.profiles
    set account_validation_status = 'unverified', account_validated_at = null
    where id = auth.uid();
    return jsonb_build_object('status', 'unverified', 'message', 'Enter an MRWD account number for validation.');
  end if;

  select count(*) into registry_count
  from public.customer_account_registry
  where is_active = true;

  if registry_count = 0 then
    update public.profiles
    set account_validation_status = 'pending_review', account_validated_at = null
    where id = auth.uid();
    return jsonb_build_object('status', 'pending_review', 'message', 'Saved for review. Import the official account registry to enable automatic validation.');
  end if;

  select * into account_row
  from public.customer_account_registry
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

  update public.customer_account_registry
  set linked_profile_id = auth.uid(), updated_at = now()
  where id = account_row.id;

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

create or replace function public.current_user_has_capability(p_capability text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select app_private.current_user_has_capability(p_capability) $$;

create or replace function public.active_admin_ids()
returns table(id uuid)
language sql
stable
security invoker
set search_path = ''
as $$ select * from app_private.active_admin_ids() $$;

create or replace function public.active_admin_ids_for_department(p_department_code text)
returns table(id uuid)
language sql
stable
security invoker
set search_path = ''
as $$ select * from app_private.active_admin_ids_for_department(p_department_code) $$;

create or replace function public.adjust_inventory_stock(
  p_inventory_item_id uuid,
  p_quantity_delta numeric,
  p_reason text
)
returns public.inventory_items
language sql
security invoker
set search_path = ''
as $$ select app_private.adjust_inventory_stock(p_inventory_item_id, p_quantity_delta, p_reason) $$;

create or replace function public.admin_promote_staff(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text
)
returns public.profiles
language sql
security invoker
set search_path = ''
as $$ select app_private.admin_promote_staff(p_user_id, p_email, p_full_name, p_role) $$;

create or replace function public.admin_update_staff_assignment(
  p_staff_id uuid,
  p_department_id uuid,
  p_staff_position text,
  p_supervisor_id uuid default null
)
returns public.profiles
language sql
security invoker
set search_path = ''
as $$ select app_private.admin_update_staff_assignment(p_staff_id, p_department_id, p_staff_position, p_supervisor_id) $$;

create or replace function public.archive_complaint_with_approval(
  p_complaint_id uuid,
  p_approval_request_id uuid
)
returns public.complaints
language sql
security invoker
set search_path = ''
as $$ select app_private.archive_complaint_with_approval(p_complaint_id, p_approval_request_id) $$;

create or replace function public.assign_complaint_task(
  p_complaint_id uuid,
  p_staff_id uuid,
  p_notes text default null
)
returns public.maintenance_tasks
language sql
security invoker
set search_path = ''
as $$ select app_private.assign_complaint_task(p_complaint_id, p_staff_id, p_notes) $$;

create or replace function public.record_my_login()
returns timestamptz
language sql
security invoker
set search_path = ''
as $$ select app_private.record_my_login() $$;

create or replace function public.record_my_password_change()
returns public.profiles
language sql
security invoker
set search_path = ''
as $$ select app_private.record_my_password_change() $$;

create or replace function public.record_task_inventory_usage(
  p_task_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_notes text default null
)
returns public.task_inventory_usage
language sql
security invoker
set search_path = ''
as $$ select app_private.record_task_inventory_usage(p_task_id, p_inventory_item_id, p_quantity, p_notes) $$;

create or replace function public.update_my_notification_preferences(
  p_email boolean,
  p_sms boolean
)
returns public.profiles
language sql
security invoker
set search_path = ''
as $$ select app_private.update_my_notification_preferences(p_email, p_sms) $$;

create or replace function public.validate_my_customer_account(p_account_number text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select app_private.validate_my_customer_account(p_account_number) $$;

revoke all on function app_private.current_user_has_capability(text) from public, anon;
revoke all on function app_private.active_admin_ids() from public, anon;
revoke all on function app_private.active_admin_ids_for_department(text) from public, anon;
revoke all on function app_private.adjust_inventory_stock(uuid, numeric, text) from public, anon;
revoke all on function app_private.admin_promote_staff(uuid, text, text, text) from public, anon;
revoke all on function app_private.admin_update_staff_assignment(uuid, uuid, text, uuid) from public, anon;
revoke all on function app_private.archive_complaint_with_approval(uuid, uuid) from public, anon;
revoke all on function app_private.assign_complaint_task(uuid, uuid, text) from public, anon;
revoke all on function app_private.record_my_login() from public, anon;
revoke all on function app_private.record_my_password_change() from public, anon;
revoke all on function app_private.record_task_inventory_usage(uuid, uuid, numeric, text) from public, anon;
revoke all on function app_private.update_my_notification_preferences(boolean, boolean) from public, anon;
revoke all on function app_private.validate_my_customer_account(text) from public, anon;

grant execute on function app_private.current_user_has_capability(text) to authenticated, service_role;
grant execute on function app_private.active_admin_ids() to authenticated, service_role;
grant execute on function app_private.active_admin_ids_for_department(text) to authenticated, service_role;
grant execute on function app_private.adjust_inventory_stock(uuid, numeric, text) to authenticated, service_role;
grant execute on function app_private.admin_promote_staff(uuid, text, text, text) to authenticated, service_role;
grant execute on function app_private.admin_update_staff_assignment(uuid, uuid, text, uuid) to authenticated, service_role;
grant execute on function app_private.archive_complaint_with_approval(uuid, uuid) to authenticated, service_role;
grant execute on function app_private.assign_complaint_task(uuid, uuid, text) to authenticated, service_role;
grant execute on function app_private.record_my_login() to authenticated, service_role;
grant execute on function app_private.record_my_password_change() to authenticated, service_role;
grant execute on function app_private.record_task_inventory_usage(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function app_private.update_my_notification_preferences(boolean, boolean) to authenticated, service_role;
grant execute on function app_private.validate_my_customer_account(text) to authenticated, service_role;

revoke all on function public.current_user_has_capability(text) from public, anon;
revoke all on function public.active_admin_ids() from public, anon;
revoke all on function public.active_admin_ids_for_department(text) from public, anon;
revoke all on function public.adjust_inventory_stock(uuid, numeric, text) from public, anon;
revoke all on function public.admin_promote_staff(uuid, text, text, text) from public, anon;
revoke all on function public.admin_update_staff_assignment(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.archive_complaint_with_approval(uuid, uuid) from public, anon;
revoke all on function public.assign_complaint_task(uuid, uuid, text) from public, anon;
revoke all on function public.record_my_login() from public, anon;
revoke all on function public.record_my_password_change() from public, anon;
revoke all on function public.record_task_inventory_usage(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.update_my_notification_preferences(boolean, boolean) from public, anon;
revoke all on function public.validate_my_customer_account(text) from public, anon;

grant execute on function public.current_user_has_capability(text) to authenticated, service_role;
grant execute on function public.active_admin_ids() to authenticated, service_role;
grant execute on function public.active_admin_ids_for_department(text) to authenticated, service_role;
grant execute on function public.adjust_inventory_stock(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.admin_promote_staff(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.admin_update_staff_assignment(uuid, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.archive_complaint_with_approval(uuid, uuid) to authenticated, service_role;
grant execute on function public.assign_complaint_task(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.record_my_login() to authenticated, service_role;
grant execute on function public.record_my_password_change() to authenticated, service_role;
grant execute on function public.record_task_inventory_usage(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.update_my_notification_preferences(boolean, boolean) to authenticated, service_role;
grant execute on function public.validate_my_customer_account(text) to authenticated, service_role;


-- ============================================================================
-- Final release alignment
-- These helpers mirror the hardened live schema: privileged implementations
-- are private, while public RPC names are SECURITY INVOKER wrappers.
-- ============================================================================

create or replace function app_private.is_active_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'admin' and coalesce(p.is_active, true) = true
  )
$$;

create or replace function app_private.is_assigned_to_complaint(p_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.maintenance_tasks t
    where t.complaint_id = p_complaint_id
      and t.assigned_staff_id = (select auth.uid())
      and coalesce(t.is_active, true) = true
  )
$$;

create or replace function app_private.owns_complaint(p_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.complaints c
    where c.id = p_complaint_id and c.resident_id = (select auth.uid())
  )
$$;

create or replace function app_private.is_resident_of_complaint(p_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select app_private.owns_complaint(p_complaint_id) $$;

create or replace function app_private.visible_profile_names(p_ids uuid[])
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id = any(coalesce(p_ids, array[]::uuid[]))
    and (
      app_private.current_user_role() = 'admin'
      or p.id = (select auth.uid())
      or (
        app_private.current_user_role() = 'maintenance_personnel'
        and exists (
          select 1
          from public.maintenance_tasks t
          join public.complaints c on c.id = t.complaint_id
          where t.assigned_staff_id = (select auth.uid())
            and coalesce(t.is_active, true) = true
            and c.resident_id = p.id
        )
      )
      or (
        app_private.current_user_role() = 'customer'
        and exists (
          select 1
          from public.complaints c
          join public.maintenance_tasks t on t.complaint_id = c.id
          where c.resident_id = (select auth.uid())
            and coalesce(t.is_active, true) = true
            and t.assigned_staff_id = p.id
        )
      )
    )
$$;

create or replace function app_private.admin_set_staff_active(p_user_id uuid, p_is_active boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare result public.profiles;
begin
  if not app_private.current_user_has_capability('system.staff') then
    raise exception 'System Supervisor access required';
  end if;
  if p_user_id = auth.uid() and p_is_active = false then
    raise exception 'You cannot deactivate your own account';
  end if;
  if p_is_active = false and exists (
    select 1 from public.maintenance_tasks t
    where t.assigned_staff_id = p_user_id
      and coalesce(t.is_active, true) = true
      and t.status not in ('completed', 'cancelled', 'reassigned')
  ) then
    raise exception 'Reassign this Maintenance Personnel account''s active tasks before deactivating it';
  end if;
  update public.profiles
  set is_active = p_is_active, updated_at = now()
  where id = p_user_id and role in ('admin', 'maintenance_personnel')
  returning * into result;
  if result.id is null then raise exception 'Staff account not found'; end if;
  return result;
end;
$$;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'customer',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select app_private.current_user_role() $$;

create or replace function public.is_active_admin(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select app_private.is_active_admin(p_user_id) $$;

create or replace function public.is_assigned_to_complaint(p_complaint_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select app_private.is_assigned_to_complaint(p_complaint_id) $$;

create or replace function public.is_resident_of_complaint(p_complaint_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select app_private.is_resident_of_complaint(p_complaint_id) $$;

create or replace function public.visible_profile_names(p_ids uuid[])
returns table(id uuid, full_name text)
language sql
stable
security invoker
set search_path = ''
as $$ select * from app_private.visible_profile_names(p_ids) $$;

create or replace function public.admin_set_staff_active(p_user_id uuid, p_is_active boolean)
returns public.profiles
language sql
security invoker
set search_path = ''
as $$ select r.* from app_private.admin_set_staff_active(p_user_id, p_is_active) r $$;

-- Auth signup trigger uses the non-exposed implementation.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

drop function if exists public.handle_new_user();

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role, supabase_auth_admin;

revoke all on function app_private.current_user_role() from public, anon;
revoke all on function app_private.is_active_admin(uuid) from public, anon;
revoke all on function app_private.is_assigned_to_complaint(uuid) from public, anon;
revoke all on function app_private.is_resident_of_complaint(uuid) from public, anon;
revoke all on function app_private.owns_complaint(uuid) from public, anon;
revoke all on function app_private.visible_profile_names(uuid[]) from public, anon;
revoke all on function app_private.admin_set_staff_active(uuid, boolean) from public, anon;
revoke all on function app_private.handle_new_user() from public, anon, authenticated;

grant execute on function app_private.current_user_role() to authenticated, service_role;
grant execute on function app_private.is_active_admin(uuid) to authenticated, service_role;
grant execute on function app_private.is_assigned_to_complaint(uuid) to authenticated, service_role;
grant execute on function app_private.is_resident_of_complaint(uuid) to authenticated, service_role;
grant execute on function app_private.owns_complaint(uuid) to authenticated, service_role;
grant execute on function app_private.visible_profile_names(uuid[]) to authenticated, service_role;
grant execute on function app_private.admin_set_staff_active(uuid, boolean) to authenticated, service_role;
grant execute on function app_private.handle_new_user() to supabase_auth_admin, postgres;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_active_admin(uuid) to authenticated, service_role;
grant execute on function public.is_assigned_to_complaint(uuid) to authenticated, service_role;
grant execute on function public.is_resident_of_complaint(uuid) to authenticated, service_role;
grant execute on function public.visible_profile_names(uuid[]) to authenticated, service_role;
grant execute on function public.admin_set_staff_active(uuid, boolean) to authenticated, service_role;


-- Ensure fresh complaints never use the obsolete historical default.
alter table public.complaints alter column status set default 'pending';

-- PostgREST schema refresh after the one-time bootstrap.
notify pgrst, 'reload schema';

-- End of fresh database setup.

-- ---------------------------------------------------------------------------
-- Final organizational routing: NSCCCD -> WDLCD -> Maintenance Crew
-- ---------------------------------------------------------------------------
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
       'Receives field-related complaints under ECMD, assigns Maintenance Crews or Maintenance Personnel, and coordinates field work through completion.', true
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
    or c.status in ('forwarded','assigned','en_route','in_progress','blocked','resolved','completed')
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
      raise exception 'WDLCD may update only field-workflow, operational priority, and resolution information';
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
