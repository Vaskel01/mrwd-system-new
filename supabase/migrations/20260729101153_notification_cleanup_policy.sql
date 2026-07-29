-- Allow authenticated users to dismiss only notifications addressed to them.
alter table public.notifications enable row level security;

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
on public.notifications
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant delete on public.notifications to authenticated;
