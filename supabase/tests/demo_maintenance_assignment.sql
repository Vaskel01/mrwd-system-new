-- Rollback-only dispatch/completion test using the real demo account configuration.
-- Does not normalize or modify profile assignments.
begin;
do $fixture$
declare proof_path text := nullif(current_setting('qa.completion_photo_path', true), '');
begin
  if proof_path is null or not exists (
    select 1 from storage.objects o
    join public.profiles p on p.id::text=o.owner_id
    where o.bucket_id='complaint-photos' and o.name=proof_path
      and p.email='maintenance@demo.com' and proof_path like p.id::text || '/completion/%'
  ) then raise exception 'Set qa.completion_photo_path to a real completion image owned by maintenance@demo.com'; end if;
end
$fixture$;
select set_config('qa.complaint_id', gen_random_uuid()::text, true);
insert into public.complaints(id,resident_id,category_id,description,address_text,reference_number,algorithm_priority_score,status)
select current_setting('qa.complaint_id')::uuid,p.id,c.id,
  'QA ONLY assignment repair rollback test','QA ONLY location',
  'QA-' || current_setting('qa.complaint_id'),0,'forwarded'
from public.profiles p cross join lateral (select id from public.complaint_categories limit 1) c
where p.email='customer@demo.com';

select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal1')::text,true)
from public.profiles where email='ecmd1@mrwd.test';
set local role authenticated;
select public.assign_complaint_task(current_setting('qa.complaint_id')::uuid,
  (select id from public.profiles where email='maintenance@demo.com'),'QA ONLY assignment');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal1')::text,true)
from public.profiles where email='maintenance@demo.com';
set local role authenticated;
update public.maintenance_tasks set status='in_progress' where complaint_id=current_setting('qa.complaint_id')::uuid and is_active;
update public.complaints set status='in_progress' where id=current_setting('qa.complaint_id')::uuid;
select public.complete_complaint_field_work(current_setting('qa.complaint_id')::uuid,
  'QA ONLY no real work performed',current_setting('qa.completion_photo_path'),null);
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal1')::text,true)
from public.profiles where email='customer@demo.com';
set local role authenticated;
insert into public.feedback(complaint_id,resident_id,rating,comment)
values(current_setting('qa.complaint_id')::uuid,auth.uid(),5,'QA ONLY rollback test feedback');
reset role;
do $verify$
begin
  if not exists (
    select 1 from public.complaints c
    join public.maintenance_tasks t on t.complaint_id=c.id and t.is_active
    join public.feedback f on f.complaint_id=c.id
    join public.profiles p on p.id=t.assigned_staff_id
    where c.id=current_setting('qa.complaint_id')::uuid
      and c.status='resolved' and c.verified_at is null and t.status='completed'
      and p.email='maintenance@demo.com' and f.rating=5
  ) then raise exception 'FAIL: expected resolved complaint, completed demo task and feedback'; end if;
end
$verify$;
rollback;
select 'PASS: real demo configuration supports WDLCD dispatch, maintenance completion and customer feedback; all test records rolled back' as result;
