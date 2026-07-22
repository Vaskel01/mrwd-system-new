-- ═══════════════════════════════════════════════════════════════
-- Fixes "permission denied for table X" errors on announcements
-- and bills.
--
-- Why this happened: tables created through Supabase's Studio UI
-- automatically get baseline privileges granted to the `authenticated`
-- role. Tables created by running raw SQL directly (like
-- create-announcements-and-bills.sql did) skip that step — RLS
-- policies alone aren't enough, since RLS only restricts *which rows*
-- you can see once you already have permission to touch the table at
-- all. Run this once. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.bills to authenticated;

-- Defensive — these were part of your original schema (not created
-- by SQL I gave you), so they very likely already have correct
-- grants. Running this is harmless either way if so.
grant select, insert, update, delete on public.feedback to authenticated;
grant select, insert, update, delete on public.task_updates to authenticated;
grant select, insert, update, delete on public.maintenance_tasks to authenticated;
grant select, insert, update, delete on public.complaint_categories to authenticated;
grant select, insert, update, delete on public.complaints to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
