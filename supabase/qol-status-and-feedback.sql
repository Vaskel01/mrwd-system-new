-- ═══════════════════════════════════════════════════════════════
-- QoL batch: status milestones, crew comments, customer feedback.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Expanded status vocabulary
-- Old: pending → in_progress → completed (+ rejected)
-- New: pending → assigned → en_route → in_progress → completed (+ rejected)
-- "in_progress" is kept as the internal value for "on site" (was
-- already used everywhere in the app) — only the *label* changed to
-- "On Site" in the UI, not the stored value, so this only ADDS two
-- new intermediate values rather than renaming an existing one.
-- ─────────────────────────────────────────────
alter table public.complaints drop constraint if exists complaints_status_check;
alter table public.complaints add constraint complaints_status_check
  check (status in ('pending', 'assigned', 'en_route', 'in_progress', 'completed', 'rejected'));

alter table public.maintenance_tasks drop constraint if exists maintenance_tasks_status_check;
alter table public.maintenance_tasks add constraint maintenance_tasks_status_check
  check (status in ('pending', 'assigned', 'en_route', 'in_progress', 'completed'));

-- ─────────────────────────────────────────────
-- 2. Let residents see the task timeline for their OWN complaints too
-- (the original policy only allowed the assigned staff member or an
-- admin to see task_updates — residents need this now for the
-- progress timeline on "My Reports").
-- ─────────────────────────────────────────────
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

-- task_updates_insert already allows the assigned staff member or an
-- admin to post — that's unchanged, residents still can't post to it,
-- only read it.

-- ─────────────────────────────────────────────
-- 3. Feedback integrity — one submission per complaint, rating 1-5.
-- (RLS policies for feedback already exist from rls-patch.sql —
-- residents can insert/read their own, admin reads all. Unchanged here.)
-- ─────────────────────────────────────────────
alter table public.feedback drop constraint if exists feedback_rating_check;
alter table public.feedback add constraint feedback_rating_check
  check (rating >= 1 and rating <= 5);

alter table public.feedback drop constraint if exists feedback_complaint_id_key;
alter table public.feedback add constraint feedback_complaint_id_key unique (complaint_id);
