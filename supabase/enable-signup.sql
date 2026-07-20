-- ═══════════════════════════════════════════════════════════════
-- Enables account self-registration (customer signup + admin-created
-- staff accounts). Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Two things, working together as a belt-and-suspenders pair:
--   1. A policy letting a brand-new user insert their OWN profile row
--      (id = auth.uid()) — used when the backend can act immediately
--      after signup (i.e. your project doesn't require email confirmation).
--   2. A trigger on auth.users that creates the profile row automatically
--      — used as a fallback for when email confirmation IS required, since
--      there's no session/token yet at signup time to act with directly.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

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

-- Note: this does NOT change your existing profiles_select policy —
-- login already works today, so a select policy must already exist.
-- If you ever can't see a newly-created profile right after signup,
-- that's the policy to check next.
