-- Allow the maintenance personnel assigned to a complaint to view the
-- customer's feedback after the complaint is completed.
-- Safe to run more than once.

alter table public.feedback enable row level security;

drop policy if exists "feedback_select" on public.feedback;
create policy "feedback_select" on public.feedback
  for select using (
    resident_id = auth.uid()
    or public.current_user_role() = 'admin'
    or public.is_assigned_to_complaint(complaint_id)
  );
