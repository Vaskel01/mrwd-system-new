-- Adds an optional display deadline and edit timestamp to announcements.
-- Existing RLS policies remain unchanged: authenticated users can read active
-- announcements through the API and only administrators can mutate records.

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
