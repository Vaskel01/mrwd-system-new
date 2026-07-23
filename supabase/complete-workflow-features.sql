-- ═══════════════════════════════════════════════════════════════
-- Complete workflow, security, notifications, and reporting support
-- Run after the earlier MRWD migrations. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- Required by gen_random_uuid() on older projects.
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- 1. Account safety, profile editing, and technician availability
-- ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists availability_status text not null default 'available',
  add column if not exists availability_note text,
  add column if not exists availability_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_availability_status_check;
alter table public.profiles add constraint profiles_availability_status_check
  check (availability_status in ('available', 'busy', 'on_leave', 'off_duty'));

-- Public registration must NEVER be able to choose an elevated role.
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

-- Authenticated users may update only their own safe profile fields.
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

-- Admin-only role promotion used immediately after a staff Auth user is created.
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

-- ─────────────────────────────────────────────
-- 2. Complaint editing, cancellation, and reopening
-- ─────────────────────────────────────────────
alter table public.complaints
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_reason text;

-- Remove old status CHECK constraints without depending on their generated names.
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

-- Customer updates are still validated by the API, but RLS must permit the
-- owner to edit a pending report, cancel it, or reopen a completed report.
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

-- ─────────────────────────────────────────────
-- 3. One current assignment + full maintenance completion report
-- ─────────────────────────────────────────────
alter table public.maintenance_tasks
  add column if not exists is_active boolean not null default true,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists estimated_completion_at timestamptz,
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

-- Keep only the newest task as the current assignment before adding uniqueness.
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

-- Assigned access means the CURRENT assignment, including after completion.
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

-- Transactional assignment/reassignment. The previous task is retained,
-- but only the newly created row remains the current assignment.
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

-- Return only profile display names relevant to the caller. This avoids
-- customer names appearing as “Unknown” for assigned technicians while
-- keeping email addresses and unrelated customer profiles private.
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

-- ─────────────────────────────────────────────
-- 4. Notifications
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 5. Audit log
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 6. Storage for complaint and completion proof photos
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────
grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update, delete on public.maintenance_tasks to authenticated;
grant select, insert, update, delete on public.complaints to authenticated;
-- Profile mutations go through the restricted RPCs above. This prevents a
-- signed-in user from changing their own role through the REST endpoint.
drop policy if exists "profiles_insert_own" on public.profiles;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;

comment on table public.notifications is 'In-app role-aware status and assignment notifications.';
comment on table public.audit_logs is 'Immutable application action history visible to administrators.';
comment on column public.maintenance_tasks.is_active is 'True for the current assignment; older reassigned task rows are retained for audit history.';
