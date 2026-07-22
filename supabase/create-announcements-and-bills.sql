-- ═══════════════════════════════════════════════════════════════
-- Creates the `announcements` and `bills` tables — these never
-- existed in your database (they weren't in your original schema),
-- which is why announcements/billing fail with "Could not find the
-- table" errors. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- announcements
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- bills
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- Baseline grants — RLS policies alone aren't enough. Without this,
-- every request fails with "permission denied for table X" regardless
-- of the RLS policies above, because RLS only restricts which rows
-- you can see once you already have permission to touch the table.
-- ─────────────────────────────────────────────
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.bills to authenticated;

-- ─────────────────────────────────────────────
-- Optional: seed a sample bill so the Billing page isn't empty when
-- you first test it. Replace the email with your actual demo
-- customer account, then uncomment and run just this block.
-- ─────────────────────────────────────────────
-- insert into public.bills (customer_id, billing_period, previous_reading, current_reading, consumption, amount_due, due_date, status)
-- select id, 'July 2026', 120, 138, 18, 486.50, '2026-08-05', 'unpaid'
-- from public.profiles where email = 'customer@demo.com';
