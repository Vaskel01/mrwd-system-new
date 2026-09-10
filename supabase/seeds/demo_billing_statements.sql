-- Explicit demo-only data update, not a production migration.
-- Run as database owner after billing_statement_details. Safe to rerun.
-- Preserves the six existing demo bills' financial totals, readings and status.
begin;
do $$
declare demo_id uuid; affected integer;
begin
  select id into strict demo_id from public.profiles where email='customer@demo.com' and role='customer';
  if exists(select 1 from public.customer_account_registry
    where upper(trim(account_number))='DEMO-MRWD-001'
      and (linked_profile_id is distinct from demo_id or registered_name <> 'Demo Customer — FICTIONAL')) then
    raise exception 'Demo account number is already used by a different record; no changes made';
  end if;
  if (select count(*) from public.bills where customer_id=demo_id
      and billing_period in ('February 2026','March 2026','April 2026','May 2026','June 2026','July 2026')
      and (account_number is null or account_number='DEMO-MRWD-001') and amount_due>=10) <> 6 then
    raise exception 'Expected exactly six existing demo bills; no changes made';
  end if;

  insert into public.customer_account_registry(account_number,registered_name,service_address,barangay,meter_number,is_active,linked_profile_id)
    select 'DEMO-MRWD-001','Demo Customer — FICTIONAL','123 Demo Street, Sample Area, Roxas City (fictional address)',
      'Sample Area (demo only)','DEMO-METER-001',true,demo_id
    where not exists(select 1 from public.customer_account_registry where account_number='DEMO-MRWD-001');

  update public.bills set
    account_number='DEMO-MRWD-001',
    source_updated_at=now(),
    statement_details=jsonb_build_object(
      'bill_number','DEMO-'||to_char(due_date - interval '1 month','YYYYMM')||'-001',
      'registered_name','Demo Customer — FICTIONAL',
      'service_address','123 Demo Street, Sample Area, Roxas City (fictional address)',
      'account_type','Residential (demo)',
      'meter_number','DEMO-METER-001',
      'meter_size','1/2 inch',
      'service_period',to_char(date_trunc('month',due_date)-interval '1 month','YYYY-MM-DD')||' to '||to_char(date_trunc('month',due_date)-interval '1 day','YYYY-MM-DD'),
      'reading_date',to_char(date_trunc('month',due_date)-interval '1 day','YYYY-MM-DD'),
      'water_charge',amount_due-10,
      'arrears',0,
      'other_charges',0,
      'meter_maintenance',10,
      'pay_immediately',0,
      'penalty',round((amount_due-10)*0.10,2),
      'amount_after_due',amount_due+round((amount_due-10)*0.10,2)
    )
  where customer_id=demo_id
    and billing_period in ('February 2026','March 2026','April 2026','May 2026','June 2026','July 2026')
    and (account_number is null or account_number='DEMO-MRWD-001');
  get diagnostics affected = row_count;
  if affected<>6 then raise exception 'Unexpected number of demo bills updated'; end if;
  if exists(select 1 from public.bills where customer_id=demo_id and account_number='DEMO-MRWD-001'
    and not public.valid_billing_statement(statement_details,amount_due)) then
    raise exception 'Demo statement validation failed';
  end if;
end $$;
commit;
