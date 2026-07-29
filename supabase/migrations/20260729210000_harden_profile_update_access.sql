begin;

-- Profile update functions should execute as the signed-in user. Limit the
-- authenticated role to the exact self-service columns used by My Profile.
alter function public.update_my_customer_profile(
  text, text, text, text, text
) security invoker;

alter function public.update_my_profile(
  text, text, text, timestamptz, text, text, text, text
) security invoker;

revoke update on table public.profiles from anon;
grant update (
  full_name,
  account_number,
  phone,
  service_address,
  barangay,
  availability_status,
  availability_note,
  availability_until,
  updated_at
) on table public.profiles to authenticated;

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

notify pgrst, 'reload schema';

commit;
