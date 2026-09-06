-- Approved one-account data repair; not a schema migration or general seed.
-- Run only against the intended demo database using an authorized SQL connection.
begin;
do $repair$
declare
  target public.profiles%rowtype;
  department uuid;
  division uuid;
begin
  select * into strict target from public.profiles
  where email = 'maintenance@demo.com' for update;
  if target.role <> 'maintenance_personnel' then
    raise exception 'Refusing to change an account that is not Maintenance Personnel';
  end if;
  select d.id, v.id into strict department, division
  from public.departments d join public.divisions v on v.department_id = d.id
  where d.code = 'ECMD' and v.code = 'WDLCD' and d.is_active and v.is_active;

  if target.department_id = department and target.division_id = division then
    return; -- Safe repeat: already corrected.
  end if;
  if target.department_id is not null or target.division_id is not null then
    raise exception 'Existing assignment differs; review before changing it';
  end if;
  update public.profiles set department_id = department, division_id = division
  where id = target.id;
  -- Preserve role, position, supervisor, availability, active flag, and credentials.
end
$repair$;
commit;
