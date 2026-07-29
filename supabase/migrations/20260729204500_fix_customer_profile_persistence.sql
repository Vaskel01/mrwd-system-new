begin;

-- Use a dedicated RPC for customer-owned contact and service information.
-- This avoids ambiguity with the older overloaded update_my_profile function
-- while keeping privileged fields such as role and account status immutable.
create or replace function public.update_my_customer_profile(
  p_full_name text,
  p_account_number text default null,
  p_phone text default null,
  p_service_address text default null,
  p_barangay text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Full name must contain at least 2 characters';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'customer'
      and coalesce(is_active, true) = true
  ) then
    raise exception 'Active customer profile not found';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      account_number = nullif(trim(coalesce(p_account_number, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      service_address = nullif(trim(coalesce(p_service_address, '')), ''),
      barangay = nullif(trim(coalesce(p_barangay, '')), ''),
      updated_at = now()
  where id = auth.uid()
    and role = 'customer'
  returning * into result;

  if result.id is null then
    raise exception 'Customer profile could not be updated';
  end if;

  return result;
end;
$$;

revoke all on function public.update_my_customer_profile(
  text, text, text, text, text
) from public, anon;
grant execute on function public.update_my_customer_profile(
  text, text, text, text, text
) to authenticated;

comment on function public.update_my_customer_profile(
  text, text, text, text, text
) is 'Updates only the authenticated active customer profile contact and service fields.';

-- Ensure PostgREST sees the new function immediately after this migration.
notify pgrst, 'reload schema';

commit;
