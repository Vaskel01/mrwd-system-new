-- Additive optional statement snapshot; existing rows and RLS policies are unchanged.
alter table public.bills add column if not exists statement_details jsonb;

create or replace function public.valid_billing_statement(details jsonb, total numeric)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item record; amount numeric;
begin
  if details is null then return true; end if;
  if jsonb_typeof(details) <> 'object' then return false; end if;
  for item in select * from jsonb_each(details) loop
    if item.key = any(array['water_charge','arrears','other_charges','meter_maintenance','pay_immediately','penalty','amount_after_due']) then
      if jsonb_typeof(item.value) <> 'number' then return false; end if;
      amount := item.value::text::numeric;
      if amount < 0 or amount > 999999999 or amount <> round(amount, 2) then return false; end if;
    elsif item.key = any(array['bill_number','registered_name','service_address','account_type','meter_number','meter_size','service_period','reading_date']) then
      if jsonb_typeof(item.value) <> 'string' or length(item.value #>> '{}') > 300 then return false; end if;
      if item.key = 'reading_date' then
        if (item.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
        perform (item.value #>> '{}')::date;
      end if;
    else return false;
    end if;
  end loop;
  if details ?& array['water_charge','arrears','other_charges','meter_maintenance'] and
    (details->>'water_charge')::numeric + (details->>'arrears')::numeric +
    (details->>'other_charges')::numeric + (details->>'meter_maintenance')::numeric <> total then return false; end if;
  if details ? 'amount_after_due' then
    if (details->>'amount_after_due')::numeric < total then return false; end if;
    if details ? 'penalty' and (details->>'amount_after_due')::numeric <> total + (details->>'penalty')::numeric then return false; end if;
  end if;
  return true;
exception when others then return false;
end;
$$;

alter table public.bills add constraint bills_statement_details_valid
  check (public.valid_billing_statement(statement_details, amount_due));
comment on column public.bills.statement_details is 'Optional imported official statement snapshot. Missing fields are unknown, never assumed zero; amount_due is the on-or-before-due-date total.';
