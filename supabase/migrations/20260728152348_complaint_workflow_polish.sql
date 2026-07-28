begin;

-- Human-readable complaint references. The UUID remains the internal primary
-- key; this value is the identifier shown to users and used in searches.
create sequence if not exists public.complaint_reference_seq;

alter table public.complaints
  add column if not exists reference_number text;

alter table public.complaints
  alter column reference_number set default (
    'MRWD-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.complaint_reference_seq')::text, 6, '0')
  );

update public.complaints
set reference_number =
  'MRWD-' || to_char(coalesce(submitted_at, now()), 'YYYY') || '-' ||
  lpad(nextval('public.complaint_reference_seq')::text, 6, '0')
where reference_number is null or btrim(reference_number) = '';

alter table public.complaints
  alter column reference_number set not null;

create unique index if not exists complaints_reference_number_key
  on public.complaints (reference_number);

grant usage, select on sequence public.complaint_reference_seq
  to authenticated, service_role;

-- Customer profile information displayed and edited in My Profile.
alter table public.profiles
  add column if not exists account_number text,
  add column if not exists phone text,
  add column if not exists service_address text,
  add column if not exists barangay text;

create unique index if not exists profiles_account_number_key
  on public.profiles (account_number)
  where account_number is not null and btrim(account_number) <> '';

drop function if exists public.update_my_profile(
  text, text, text, timestamptz
);

create or replace function public.update_my_profile(
  p_full_name text,
  p_availability_status text default null,
  p_availability_note text default null,
  p_availability_until timestamptz default null,
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
  current_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Full name is required';
  end if;

  select role
  into current_role
  from public.profiles
  where id = auth.uid();

  if current_role is null then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      account_number = case
        when current_role = 'customer'
          then nullif(trim(coalesce(p_account_number, '')), '')
        else account_number
      end,
      phone = case
        when current_role = 'customer'
          then nullif(trim(coalesce(p_phone, '')), '')
        else phone
      end,
      service_address = case
        when current_role = 'customer'
          then nullif(trim(coalesce(p_service_address, '')), '')
        else service_address
      end,
      barangay = case
        when current_role = 'customer'
          then nullif(trim(coalesce(p_barangay, '')), '')
        else barangay
      end,
      availability_status = case
        when current_role = 'maintenance_personnel'
             and p_availability_status is not null
          then p_availability_status
        else availability_status
      end,
      availability_note = case
        when current_role = 'maintenance_personnel'
          then nullif(trim(coalesce(p_availability_note, '')), '')
        else availability_note
      end,
      availability_until = case
        when current_role = 'maintenance_personnel'
          then p_availability_until
        else availability_until
      end,
      updated_at = now()
  where id = auth.uid()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.update_my_profile(
  text, text, text, timestamptz, text, text, text, text
) from public, anon;
grant execute on function public.update_my_profile(
  text, text, text, timestamptz, text, text, text, text
) to authenticated;

-- Important announcements replace the previous implicit "latest is pinned"
-- behavior. Any number of announcements can be explicitly marked important.
alter table public.announcements
  add column if not exists is_important boolean not null default false;

-- Preserve the algorithm's recommendation whenever an administrator applies a
-- manual priority override. The current priority_score/priority columns remain
-- the operational values used for ordering and dispatch.
alter table public.complaints
  add column if not exists algorithm_priority_score integer,
  add column if not exists priority_override_reason text,
  add column if not exists priority_overridden_by uuid
    references public.profiles(id) on delete set null,
  add column if not exists priority_overridden_at timestamptz,
  add column if not exists customer_acknowledged_at timestamptz,
  add column if not exists customer_acknowledgment_note text;

update public.complaints
set algorithm_priority_score = priority_score
where algorithm_priority_score is null;

alter table public.complaints
  alter column algorithm_priority_score set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'complaints_algorithm_priority_score_check'
      and conrelid = 'public.complaints'::regclass
  ) then
    alter table public.complaints
      add constraint complaints_algorithm_priority_score_check
      check (algorithm_priority_score between 0 and 100);
  end if;
end
$$;

comment on column public.complaints.reference_number is
  'Human-readable complaint identifier shown to users; UUID id remains internal.';
comment on column public.complaints.algorithm_priority_score is
  'Latest classifier-generated score before any administrator override.';
comment on column public.complaints.priority_overridden_at is
  'When set, priority_score and priority contain an administrator override.';
comment on column public.complaints.customer_acknowledged_at is
  'Customer confirmation that the completion report was reviewed.';

commit;
