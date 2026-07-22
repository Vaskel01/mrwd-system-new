-- ═══════════════════════════════════════════════════════════════
-- Rejection reason + undo support
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

alter table public.complaints
  add column if not exists rejection_reason text;

alter table public.complaints
  add column if not exists rejected_at timestamptz;

comment on column public.complaints.rejection_reason is
  'Admin-provided explanation shown to the resident when a complaint is rejected.';

comment on column public.complaints.rejected_at is
  'Most recent time the complaint was marked rejected. Cleared when rejection is undone.';
