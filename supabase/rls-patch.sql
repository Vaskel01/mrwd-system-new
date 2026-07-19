-- ═══════════════════════════════════════════════════════════════
-- Row Level Security patch matching YOUR actual schema (resident_id,
-- category_id, maintenance_tasks, etc.) — not the schema in my
-- original migration.sql, which assumed different column names.
--
-- If complaints still fail to save after updating the backend code,
-- it's very likely because a policy here is missing. Safe to re-run:
-- every policy is dropped and recreated.
--
-- This assumes a `current_user_role()` helper already exists (from
-- the original migration.sql). If you never ran that file, run this
-- block first:
-- ═══════════════════════════════════════════════════════════════

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ─────────────────────────────────────────────
-- complaint_categories — everyone signed in can read; admin writes
-- ─────────────────────────────────────────────
alter table public.complaint_categories enable row level security;

drop policy if exists "categories_select_all" on public.complaint_categories;
create policy "categories_select_all" on public.complaint_categories
  for select using (auth.role() = 'authenticated');

drop policy if exists "categories_admin_write" on public.complaint_categories;
create policy "categories_admin_write" on public.complaint_categories
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ─────────────────────────────────────────────
-- complaints
-- ─────────────────────────────────────────────
alter table public.complaints enable row level security;

drop policy if exists "complaints_select" on public.complaints;
create policy "complaints_select" on public.complaints
  for select using (
    resident_id = auth.uid()
    or public.current_user_role() = 'admin'
    or exists (
      select 1 from public.maintenance_tasks t
      where t.complaint_id = complaints.id and t.assigned_staff_id = auth.uid()
    )
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
    or exists (
      select 1 from public.maintenance_tasks t
      where t.complaint_id = complaints.id and t.assigned_staff_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- maintenance_tasks
-- ─────────────────────────────────────────────
alter table public.maintenance_tasks enable row level security;

drop policy if exists "tasks_select" on public.maintenance_tasks;
create policy "tasks_select" on public.maintenance_tasks
  for select using (
    assigned_staff_id = auth.uid()
    or public.current_user_role() = 'admin'
    or exists (
      select 1 from public.complaints c
      where c.id = maintenance_tasks.complaint_id and c.resident_id = auth.uid()
    )
  );

drop policy if exists "tasks_insert_admin" on public.maintenance_tasks;
create policy "tasks_insert_admin" on public.maintenance_tasks
  for insert with check (public.current_user_role() = 'admin');

drop policy if exists "tasks_update_admin_or_assignee" on public.maintenance_tasks;
create policy "tasks_update_admin_or_assignee" on public.maintenance_tasks
  for update using (
    public.current_user_role() = 'admin' or assigned_staff_id = auth.uid()
  );

-- ─────────────────────────────────────────────
-- task_updates — visible to anyone who can see the parent task
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- feedback — the resident who filed the complaint can write, admin can read all
-- ─────────────────────────────────────────────
alter table public.feedback enable row level security;

drop policy if exists "feedback_select" on public.feedback;
create policy "feedback_select" on public.feedback
  for select using (
    resident_id = auth.uid() or public.current_user_role() = 'admin'
  );

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert with check (resident_id = auth.uid());
