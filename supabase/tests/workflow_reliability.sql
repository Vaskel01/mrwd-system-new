-- Run as owner with demo profiles present. All fixtures roll back, including
-- temporary failure injection. Explicit QA references do not advance numbering.
begin;
create temp table qa_workflow as select
  (select id from public.profiles where email='customer@demo.com') customer,
  (select id from public.profiles where email='commercial1@mrwd.test') commercial,
  (select id from public.profiles where email='ecmd1@mrwd.test') dispatcher,
  (select id from public.profiles where email='maintenance@demo.com') maintenance,
  (select id from public.complaint_categories limit 1) category,
  nullif(current_setting('qa.completion_photo_path', true), '') completion_photo_path,
  gen_random_uuid() complaint_id;
grant select on qa_workflow to authenticated;
-- Normalize only this transaction's demo assignee; preserve the real profile on rollback.
update public.profiles set is_active=true,availability_status='available',department_id=(select id from public.departments where code='ECMD') where id=(select maintenance from qa_workflow);
create function pg_temp.qa_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end $$;
select pg_temp.qa_assert(customer is not null and commercial is not null and dispatcher is not null and maintenance is not null,'demo actors required') from qa_workflow;
select pg_temp.qa_assert(completion_photo_path is not null,'set qa.completion_photo_path to a real Maintenance-owned object under <maintenance UUID>/completion/') from qa_workflow;
select pg_temp.qa_assert(exists(select 1 from storage.objects o where o.bucket_id='complaint-photos' and o.name=w.completion_photo_path and o.owner_id=w.maintenance::text),'completion photo fixture must exist in secure Storage and belong to the demo Maintenance account') from qa_workflow w;

select set_config('request.jwt.claims',jsonb_build_object('sub',customer,'role','authenticated','aal','aal1')::text,true) from qa_workflow;
set local role authenticated;
insert into public.complaints(id,resident_id,category_id,description,address_text,reference_number,algorithm_priority_score,status)
select complaint_id,customer,category,'QA ONLY complaint workflow rollback test','QA ONLY location','QA-'||complaint_id,0,'pending' from qa_workflow;
do $$ begin
  begin
    update public.complaints set status='resolved' where id=(select complaint_id from qa_workflow);
    raise exception 'FAIL: customer resolved own complaint';
  exception when others then if sqlerrm not like 'Customers may only%' then raise; end if; end;
  begin
    insert into public.feedback(complaint_id,resident_id,rating) select complaint_id,customer,5 from qa_workflow;
    raise exception 'FAIL: feedback accepted before resolution';
  exception when others then if sqlerrm not like 'Feedback is allowed only%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',commercial,'role','authenticated','aal','aal1')::text,true) from qa_workflow;
set local role authenticated;
update public.complaints set status='rejected',rejection_reason='QA ONLY invalid report',rejected_at=now() where id=(select complaint_id from qa_workflow);
update public.complaints set status='pending',rejection_reason=null,rejected_at=null where id=(select complaint_id from qa_workflow);
update public.complaints set status='forwarded',forwarded_to_ecmd_at=now(),forwarded_to_ecmd_by=auth.uid() where id=(select complaint_id from qa_workflow);
select pg_temp.qa_assert((select status='forwarded' from public.complaints where id=(select complaint_id from qa_workflow)),'Commercial reject, restore, handoff');
do $$ begin
  begin
    perform public.assign_complaint_task(complaint_id,maintenance,'QA unauthorized') from qa_workflow;
    raise exception 'FAIL: Commercial dispatched';
  exception when others then if sqlerrm not like '%dispatch access required%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',dispatcher,'role','authenticated','aal','aal1')::text,true) from qa_workflow;
set local role authenticated;
select public.assign_complaint_task(complaint_id,maintenance,'QA ONLY assignment') from qa_workflow;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',maintenance,'role','authenticated','aal','aal1')::text,true) from qa_workflow;
set local role authenticated;
update public.maintenance_tasks set status='in_progress' where complaint_id=(select complaint_id from qa_workflow) and is_active;
update public.complaints set status='in_progress' where id=(select complaint_id from qa_workflow);
update public.maintenance_tasks set status='blocked',unable_reason='QA ONLY missing materials' where complaint_id=(select complaint_id from qa_workflow) and is_active;
update public.complaints set status='blocked' where id=(select complaint_id from qa_workflow);
do $$ begin
  begin
    update public.maintenance_tasks set status='completed' where complaint_id=(select complaint_id from qa_workflow) and is_active;
    raise exception 'FAIL: completion accepted without photo';
  exception when others then if sqlerrm not like '%completion proof photo are required%' then raise; end if; end;
  begin
    update public.maintenance_tasks set assigned_staff_id=(select commercial from qa_workflow) where complaint_id=(select complaint_id from qa_workflow) and is_active;
    raise exception 'FAIL: Maintenance changed assignment';
  exception when others then if sqlerrm not like '%cannot change task ownership%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',dispatcher,'role','authenticated','aal','aal1')::text,true) from qa_workflow;
set local role authenticated;
select public.assign_complaint_task(complaint_id,maintenance,'QA ONLY redispatch') from qa_workflow;
select pg_temp.qa_assert((select count(*)=1 from public.maintenance_tasks where complaint_id=(select complaint_id from qa_workflow) and is_active),'one current assignment after redispatch');
reset role;

-- Inject a failure on the second write, proving that the task write rolls back.
create function pg_temp.qa_fail_completion() returns trigger language plpgsql as $$
begin
  if new.status='resolved' and current_setting('qa.fail_completion',true)='yes' then raise exception 'QA simulated complaint write failure'; end if;
  return new;
end $$;
create trigger zz_qa_fail_completion before update on public.complaints for each row execute function pg_temp.qa_fail_completion();
select set_config('request.jwt.claims',jsonb_build_object('sub',maintenance,'role','authenticated','aal','aal1')::text,true) from qa_workflow;
set local role authenticated;
select set_config('qa.fail_completion','yes',true);
do $$ begin
  begin
    perform public.complete_complaint_field_work(complaint_id,'QA ONLY work restored',(select completion_photo_path from qa_workflow),null) from qa_workflow;
    raise exception 'FAIL: simulated failure not triggered';
  exception when others then if sqlerrm<>'QA simulated complaint write failure' then raise; end if; end;
end $$;
select pg_temp.qa_assert((select status='assigned' and completion_photo_url is null from public.maintenance_tasks where complaint_id=(select complaint_id from qa_workflow) and is_active),'failed completion rolls back task');
select pg_temp.qa_assert((select status='assigned' from public.complaints where id=(select complaint_id from qa_workflow)),'failed completion preserves complaint');
select set_config('qa.fail_completion','no',true);
select pg_temp.qa_assert(not public.complete_complaint_field_work(complaint_id,'QA ONLY work restored',(select completion_photo_path from qa_workflow),'QA coupling'),'first completion writes') from qa_workflow;
select pg_temp.qa_assert(public.complete_complaint_field_work(complaint_id,'QA ONLY work restored',(select completion_photo_path from qa_workflow),'QA coupling'),'repeated completion is idempotent') from qa_workflow;
select pg_temp.qa_assert((select status='resolved' and verified_at is null from public.complaints where id=(select complaint_id from qa_workflow)),'direct resolution without WDLCD verification');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',customer,'role','authenticated','aal','aal1')::text,true) from qa_workflow;
set local role authenticated;
insert into public.feedback(complaint_id,resident_id,rating,comment) select complaint_id,customer,5,'QA ONLY resolved feedback' from qa_workflow;
update public.complaints set status='pending',reopen_reason='QA ONLY water stopped again',reopened_at=now() where id=(select complaint_id from qa_workflow);
select pg_temp.qa_assert((select count(*)=0 from public.maintenance_tasks where complaint_id=(select complaint_id from qa_workflow) and is_active),'reopen retires old task');
reset role;
rollback;
select 'PASS: customer bypass blocked; premature feedback blocked; rejection/restore/handoff; role separation; dispatch/start/block/redispatch; required notes and photo; assignment protection; atomic rollback; direct completion; idempotent retry; feedback; reopen; fixtures rolled back' result;
