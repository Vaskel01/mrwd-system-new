-- ═══════════════════════════════════════════════════════════════
-- Metro Roxas Water District CMS — Database Migration
-- Run this in your Supabase project's SQL Editor (Dashboard →
-- SQL Editor → New Query → paste → Run).
--
-- Safe to run on a project that already has some of these objects:
-- every statement uses IF NOT EXISTS / OR REPLACE / DROP-then-CREATE
-- for policies. Review it once before running if you already have
-- tables with different column names — this will NOT drop or alter
-- existing columns, only add what's missing.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. PROFILES (one row per auth.users row)
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null,
  role       text not null check (role in ('customer', 'admin', 'maintenance')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
-- Expects full_name and role to be passed as user metadata at signUp time:
--   supabase.auth.signUp({ email, password, options: { data: { full_name, role } } })
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

-- Helper used by RLS policies below to check the caller's role
-- without recursive-select issues (SECURITY DEFINER bypasses RLS
-- inside the function body only).
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- ─────────────────────────────────────────────
-- 2. COMPLAINTS
-- ─────────────────────────────────────────────
create table if not exists public.complaints (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.profiles(id),
  complaint_type  text not null,
  description     text not null,
  address         text not null,
  gps             jsonb,                 -- { lat, lng, accuracy } or null
  photo_url       text,
  status          text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  priority        text not null check (priority in ('low', 'medium', 'high')),
  priority_score  int  not null,
  priority_reasons jsonb,
  assigned_to     uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.complaints enable row level security;

drop policy if exists "complaints_select" on public.complaints;
create policy "complaints_select" on public.complaints
  for select using (
    customer_id = auth.uid()
    or assigned_to = auth.uid()
    or public.current_user_role() = 'admin'
  );

drop policy if exists "complaints_insert_own" on public.complaints;
create policy "complaints_insert_own" on public.complaints
  for insert with check (
    customer_id = auth.uid() and public.current_user_role() = 'customer'
  );

drop policy if exists "complaints_update_admin_or_assignee" on public.complaints;
create policy "complaints_update_admin_or_assignee" on public.complaints
  for update using (
    public.current_user_role() = 'admin'
    or assigned_to = auth.uid()
  );

-- ─────────────────────────────────────────────
-- 3. BILLS
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
-- 4. ANNOUNCEMENTS
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
-- 5. STORAGE — complaint photo uploads
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('complaint-photos', 'complaint-photos', true)
on conflict (id) do nothing;

drop policy if exists "complaint_photos_upload_own" on storage.objects;
create policy "complaint_photos_upload_own" on storage.objects
  for insert with check (
    bucket_id = 'complaint-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "complaint_photos_read_all" on storage.objects;
create policy "complaint_photos_read_all" on storage.objects
  for select using (bucket_id = 'complaint-photos');

-- ─────────────────────────────────────────────
-- 6. Seed demo accounts (optional)
-- ─────────────────────────────────────────────
-- Supabase Auth users can't be created via plain SQL (passwords need
-- to go through the Auth API). After running this migration, create
-- your three demo accounts from the Dashboard → Authentication →
-- Add User (or via supabase.auth.signUp on the frontend once), using:
--   customer@demo.com     / demo1234   → user_metadata: { full_name: "Juan dela Cruz",  role: "customer" }
--   admin@demo.com        / demo1234   → user_metadata: { full_name: "Maria Santos",     role: "admin" }
--   maintenance@demo.com  / demo1234   → user_metadata: { full_name: "Pedro Reyes",      role: "maintenance" }
-- The trigger above will automatically create the matching profiles row.
