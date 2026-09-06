-- Run as database owner; every fixture and audit entry is rolled back.
begin;
create temp table account_test_context as select
  (select id from public.profiles where email='customer@demo.com') customer,
  (select id from public.profiles where email='maintenance@demo.com') outsider,
  (select id from public.profiles where email='commercial1@mrwd.test') reviewer,
  (select id from public.complaint_categories limit 1) category,
  gen_random_uuid() account_id,gen_random_uuid() account_two,
  'QA-'||upper(gen_random_uuid()::text) account_number,
  'QA-'||upper(gen_random_uuid()::text) second_number;
grant select on account_test_context to authenticated;
insert into public.customer_account_registry(id,account_number,registered_name,is_active)
  select account_id,account_number,'TEST ONLY - ROLLBACK',true from account_test_context
  union all select account_two,second_number,'TEST ONLY - ROLLBACK',true from account_test_context;
insert into public.bills(account_number,billing_period,previous_reading,current_reading,consumption,amount_due,due_date)
  select account_number,'2099-01',0,1,1,10,'2099-02-01'::date from account_test_context;
select set_config('request.jwt.claims',jsonb_build_object('sub',customer,'role','authenticated','aal','aal1')::text,true) from account_test_context;
set local role authenticated;
do $$ declare t record; request_id uuid; denied boolean := false; begin
  select * into t from account_test_context;
  if exists(select 1 from public.bills where account_number=t.account_number) then raise exception 'FAIL: unverified bill exposed'; end if;
  request_id := public.request_service_account(t.account_number,'TEST ONLY: account holder');
  if request_id <> public.request_service_account(t.account_number,'TEST ONLY: updated explanation') then raise exception 'FAIL: duplicate request'; end if;
  perform public.validate_my_customer_account(t.account_number);
  if exists(select 1 from public.customer_account_registry where id=t.account_id) then raise exception 'FAIL: old profile RPC claimed account'; end if;
  begin perform public.review_service_account(request_id,true,'TEST ONLY: self approval'); exception when others then denied := true; end;
  if not denied then raise exception 'FAIL: customer self-approved'; end if;
  perform public.request_service_account(t.second_number,'TEST ONLY: second connection');
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated','aal','aal1')::text,true) from account_test_context;
set local role authenticated;
do $$ declare r record; begin
  for r in select id from public.service_account_requests where account_number in (select account_number from account_test_context union select second_number from account_test_context) loop
    perform public.review_service_account(r.id,true,'TEST ONLY: ownership confirmed for rollback test');
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',customer,'role','authenticated','aal','aal1')::text,true) from account_test_context;
set local role authenticated;
do $$ declare t record; c uuid; begin
  select * into t from account_test_context;
  if (select count(*) from public.customer_account_registry where id in (t.account_id,t.account_two))<>2 then raise exception 'FAIL: multiple accounts not accessible'; end if;
  if (select count(*) from public.bills where account_number=t.account_number)<>1 then raise exception 'FAIL: approved owner cannot see bill'; end if;
  insert into public.complaints(resident_id,category_id,description,address_text,reference_number,service_account_id,algorithm_priority_score,status)
    values(t.customer,t.category,'TEST ONLY COMPLAINT FOR ROLLBACK','TEST ONLY LOCATION','QA-'||gen_random_uuid(),t.account_id,0,'pending') returning id into c;
  if (select service_account_number from public.complaints where id=c)<>t.account_number then raise exception 'FAIL: complaint missing account snapshot'; end if;
  insert into public.complaints(resident_id,category_id,description,address_text,reference_number,algorithm_priority_score,status)
    values(t.customer,t.category,'TEST ONLY GENERAL COMPLAINT FOR ROLLBACK','TEST ONLY LOCATION','QA-'||gen_random_uuid(),0,'pending');
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal1')::text,true) from account_test_context;
set local role authenticated;
do $$ declare t record; begin
  select * into t from account_test_context;
  if exists(select 1 from public.bills where account_number=t.account_number) then raise exception 'FAIL: other user can see bill'; end if;
  if exists(select 1 from public.service_account_requests where customer_id=t.customer and account_number=t.account_number) then raise exception 'FAIL: other user can see request'; end if;
end $$;
reset role;
-- Test the guard independently of HTTP validation and RLS.
do $$ declare t record; denied boolean := false; begin
  select * into t from account_test_context;
  begin
    insert into public.complaints(resident_id,category_id,description,address_text,reference_number,service_account_id,algorithm_priority_score,status)
      values(t.outsider,t.category,'TEST ONLY COMPLAINT FOR ROLLBACK','TEST ONLY LOCATION','QA-'||gen_random_uuid(),t.account_id,0,'pending');
  exception when others then
    if sqlerrm like '%verified service account%' then denied := true; else raise; end if;
  end;
  if not denied then raise exception 'FAIL: foreign account accepted'; end if;
end $$;
rollback;
select 'PASS: request, duplicate prevention, legacy claim blocked, self-approval denied, staff approval, multiple accounts, billing isolation, complaint snapshot, general complaint, foreign account denied; fixtures rolled back' as result;
