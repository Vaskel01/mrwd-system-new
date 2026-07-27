-- ═══════════════════════════════════════════════════════════════
-- MRWD COMPLETE COMPLAINT RESET + MOCK DATA SEED (V3)
-- ═══════════════════════════════════════════════════════════════
-- WARNING: Running this script permanently deletes ALL current complaint
-- records and their related maintenance tasks, task updates, feedback,
-- complaint notifications, and complaint/task audit entries.
--
-- It does NOT delete user accounts, complaint categories, bills, or
-- announcements. It then creates ten comprehensive mock complaints for
-- EVERY active customer account, covering all major categories, statuses,
-- roles, classifier outputs, task workflows, feedback, notifications, and
-- audit-log examples needed for a pre-oral demonstration.
--
-- Requirements before running:
--   • At least one active customer profile
--   • At least one active administrator profile
--   • At least one active maintenance_personnel profile
--   • The final workflow migrations already applied
--
-- Run the ENTIRE file in the Supabase SQL Editor. Use only on your demo/testing project.
-- V3 executes the complete seed inside one DO block so all staging tables
-- remain available until the operation finishes.
-- ═══════════════════════════════════════════════════════════════

do $seed$
begin
  perform set_config('search_path', 'public', true);


-- Remove any staging tables left by a previously interrupted SQL Editor run.
-- The tables are temporary and exist only in the current database session.
drop table if exists
  generated_current_tasks,
  generated_mock_complaints,
  mock_templates,
  active_maintenance,
  active_admins,
  active_customers,
  old_task_ids,
  old_complaint_ids;

-- Ensure the eight categories used by the current classifier exist.
insert into public.complaint_categories (name, description, base_severity_score, is_active)
values
  ('Water Interruption', 'No water supply or extended service interruption.', 40, true),
  ('Water Leak', 'Pipe leaks, visible leakage, flooding, or water loss.', 35, true),
  ('Dirty / Discolored Water', 'Brown, cloudy, foul-smelling, or potentially contaminated water.', 30, true),
  ('Low Water Pressure', 'Weak or insufficient water pressure.', 20, true),
  ('Meter Problem', 'Meter reading, damaged meter, or meter-operation concerns.', 15, true),
  ('New Connection Request', 'Request for a new service connection.', 10, true),
  ('Billing Concern', 'Billing amount, reading, payment, or account concern.', 5, true),
  ('Other', 'Other water-district concerns not covered by the listed categories.', 10, true)
on conflict (name) do update
set description = excluded.description,
    base_severity_score = excluded.base_severity_score,
    is_active = true;

-- Stop before deleting anything when the required demo roles are missing.
  if not exists (select 1 from public.profiles where role = 'customer' and coalesce(is_active, true)) then
    raise exception 'No active customer profile exists. Create a customer account before running this seed.';
  end if;
  if not exists (select 1 from public.profiles where role = 'admin' and coalesce(is_active, true)) then
    raise exception 'No active administrator profile exists. Create or activate an administrator before running this seed.';
  end if;
  if not exists (select 1 from public.profiles where role = 'maintenance_personnel' and coalesce(is_active, true)) then
    raise exception 'No active maintenance_personnel profile exists. Create or activate maintenance personnel before running this seed.';
  end if;

-- Delete all current complaint-related operational records.
-- Direct subqueries are used instead of ON COMMIT DROP staging tables so the
-- script works reliably in the Supabase SQL Editor.
delete from public.audit_logs
where (entity_type in ('complaint', 'complaints') and entity_id in (select id from public.complaints))
   or (
     entity_type in ('task', 'maintenance_task', 'maintenance_tasks')
     and entity_id in (
       select id
       from public.maintenance_tasks
       where complaint_id in (select id from public.complaints)
     )
   )
   or action like 'complaint.%'
   or action like 'task.%';

delete from public.notifications
where related_complaint_id in (select id from public.complaints);

delete from public.feedback
where complaint_id in (select id from public.complaints);

delete from public.task_updates
where task_id in (
  select id
  from public.maintenance_tasks
  where complaint_id in (select id from public.complaints)
);

delete from public.maintenance_tasks
where complaint_id in (select id from public.complaints);

delete from public.complaints;

-- Reusable role lists for round-robin mock assignment.
create temp table active_customers as
select id, full_name, email,
       row_number() over (order by created_at, id) as customer_no
from public.profiles
where role = 'customer' and coalesce(is_active, true);

create temp table active_admins as
select id, full_name,
       row_number() over (order by created_at, id) as admin_no
from public.profiles
where role = 'admin' and coalesce(is_active, true);

create temp table active_maintenance as
select id, full_name,
       row_number() over (order by created_at, id) as staff_no
from public.profiles
where role = 'maintenance_personnel' and coalesce(is_active, true);

-- Ten templates per active customer. Together they demonstrate every major
-- complaint category and workflow state, including reopen, rejection,
-- cancellation, blocking, completion, classifier details, and feedback.
create temp table mock_templates (
  template_no integer primary key,
  category_name text not null,
  description text not null,
  address_text text not null,
  zone text,
  lat float8,
  lng float8,
  has_photo boolean not null,
  status text not null,
  priority text not null,
  priority_score int4 not null,
  rule_score int4 not null,
  sentiment_score int4 not null,
  classified_category text not null,
  classification_confidence numeric,
  classification_sentiment text not null,
  classification_mismatch boolean not null,
  classification_basis text,
  classification_keywords jsonb not null,
  classification_negated_keywords jsonb not null,
  classification_reasons jsonb not null,
  classifier_version text,
  classification_method text,
  rejection_reason text,
  cancellation_reason text,
  reopen_reason text,
  creates_task boolean not null,
  task_status text,
  feedback_rating int4,
  feedback_comment text
);

insert into mock_templates values
  (1, 'Water Interruption', 'There has been no water supply in our area for two days. This is urgent because several households have no drinking water.', 'Mabini Street, Roxas City', 'Zone I', 11.5854, 122.7512, true, 'pending', 'high', 100, 40, 10, 'Water Interruption', 64, 'urgent', false, 'matched keyword dataset', '[{"id":"KW-098","term":"for two days","match_type":"phrase","complaint_category":null,"category_weight":0,"priority_weight":12,"severity":"high","sentiment":"urgent","context":"duration"},{"id":"KW-002","term":"no water","match_type":"phrase","complaint_category":"Water Interruption","category_weight":9,"priority_weight":18,"severity":"high","sentiment":"urgent","context":"issue"},{"id":"KW-106","term":"urgent","match_type":"word","complaint_category":null,"category_weight":0,"priority_weight":12,"severity":"high","sentiment":"urgent","context":"urgency"}]'::jsonb, '[]'::jsonb, '["Selected category base severity (+40)","Dataset terms: \"for two days, no water, urgent\" (+42)","Text classified as Water Interruption (64% confidence)","Sentiment adjustment (urgent, +10)","Photo evidence (+10)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, null, null, false, null, null, null),
  (2, 'Water Leak', 'A major pipe leak is flooding the road and wasting a large amount of water. Please respond immediately.', 'Arnaldo Boulevard, Roxas City', 'Zone II', 11.5881, 122.7486, true, 'assigned', 'high', 77, 35, 10, 'Water Leak', 72, 'urgent', false, 'matched keyword dataset', '[{"id":"KW-022","term":"flooding","match_type":"word","complaint_category":"Water Leak","category_weight":7,"priority_weight":15,"severity":"high","sentiment":"urgent","context":"safety"},{"id":"KW-024","term":"leak","match_type":"word","complaint_category":"Water Leak","category_weight":6,"priority_weight":7,"severity":"medium","sentiment":"negative","context":"issue"}]'::jsonb, '[]'::jsonb, '["Selected category base severity (+35)","Dataset terms: \"flooding, leak\" (+22)","Text classified as Water Leak (72% confidence)","Sentiment adjustment (urgent, +10)","Photo evidence (+10)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, null, null, true, 'assigned', null, null),
  (3, 'Dirty / Discolored Water', 'The water coming from our faucet is brown and has a bad smell. We are worried it may be contaminated.', 'Roxas Avenue, Roxas City', 'Zone III', 11.5819, 122.754, true, 'en_route', 'high', 72, 30, 10, 'Dirty / Discolored Water', 74, 'urgent', false, 'matched keyword dataset', '[{"id":"KW-037","term":"bad smell","match_type":"phrase","complaint_category":"Dirty / Discolored Water","category_weight":6,"priority_weight":7,"severity":"medium","sentiment":"negative","context":"quality"},{"id":"KW-040","term":"contaminate","match_type":"word","complaint_category":"Dirty / Discolored Water","category_weight":8,"priority_weight":15,"severity":"high","sentiment":"urgent","context":"health"}]'::jsonb, '[]'::jsonb, '["Selected category base severity (+30)","Dataset terms: \"bad smell, contaminate\" (+22)","Text classified as Dirty / Discolored Water (74% confidence)","Sentiment adjustment (urgent, +10)","Photo evidence (+10)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, null, null, true, 'en_route', null, null),
  (4, 'Low Water Pressure', 'Water pressure has been very low since this morning, especially on the second floor.', 'Legaspi Street, Roxas City', 'Zone IV', 11.5832, 122.7465, false, 'in_progress', 'low', 29, 20, 5, 'Low Water Pressure', 50, 'negative', false, 'matched keyword dataset', '[{"id":"KW-051","term":"pressure","match_type":"word","complaint_category":"Low Water Pressure","category_weight":5,"priority_weight":4,"severity":"low","sentiment":"negative","context":"issue"}]'::jsonb, '[]'::jsonb, '["Selected category base severity (+20)","Dataset terms: \"pressure\" (+4)","Text classified as Low Water Pressure (50% confidence)","Sentiment adjustment (negative, +5)","No photo evidence (+0)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, null, null, true, 'in_progress', null, null),
  (5, 'Meter Problem', 'Our water meter appears stuck and the reading has not changed even though we are using water.', 'San Roque Extension, Roxas City', 'Zone V', 11.5902, 122.7571, true, 'blocked', 'low', 27, 15, 0, 'Meter Problem', 62, 'neutral', false, 'matched keyword dataset', '[{"id":"KW-062","term":"water meter","match_type":"phrase","complaint_category":"Meter Problem","category_weight":6,"priority_weight":2,"severity":"low","sentiment":"neutral","context":"meter"},{"id":"KW-064","term":"reading","match_type":"word","complaint_category":"Meter Problem","category_weight":2,"priority_weight":0,"severity":"low","sentiment":"neutral","context":"meter"}]'::jsonb, '[]'::jsonb, '["Selected category base severity (+15)","Dataset terms: \"water meter, reading\" (+2)","Text classified as Meter Problem (62% confidence)","Sentiment adjustment (neutral, +0)","Photo evidence (+10)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, null, null, true, 'blocked', null, null),
  (6, 'Billing Concern', 'My latest bill is much higher than usual and I would like the charges reviewed.', 'Washington Street, Roxas City', 'Zone VI', 11.5798, 122.7501, false, 'completed', 'low', 5, 5, 0, 'Billing Concern', 50, 'neutral', false, 'matched keyword dataset', '[{"id":"KW-076","term":"bill","match_type":"word","complaint_category":"Billing Concern","category_weight":5,"priority_weight":0,"severity":"low","sentiment":"neutral","context":"billing"}]'::jsonb, '[]'::jsonb, '["Selected category base severity (+5)","Dataset terms: \"bill\" (+0)","Text classified as Billing Concern (50% confidence)","Sentiment adjustment (neutral, +0)","No photo evidence (+0)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, null, null, false, null, 5, 'The billing concern was explained clearly and resolved quickly.'),
  (7, 'New Connection Request', 'I would like to request a new water service connection for our newly constructed house.', 'Pueblo de Panay, Roxas City', 'Zone VII', 11.601, 122.744, false, 'rejected', 'low', 10, 10, 0, 'New Connection Request', 62, 'neutral', false, 'matched keyword dataset', '[{"id":"KW-085","term":"service connection","match_type":"phrase","complaint_category":"New Connection Request","category_weight":8,"priority_weight":2,"severity":"low","sentiment":"neutral","context":"request"},{"id":"KW-128","term":"request","match_type":"word","complaint_category":null,"category_weight":0,"priority_weight":-2,"severity":"low","sentiment":"neutral","context":"request"}]'::jsonb, '[]'::jsonb, '["Selected category base severity (+10)","Dataset terms: \"service connection, request\" (+0)","Text classified as New Connection Request (62% confidence)","Sentiment adjustment (neutral, +0)","No photo evidence (+0)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', 'The submitted address is outside the current service-connection validation area. Please contact the new connections desk with the property documents.', null, null, false, null, null, null),
  (8, 'Other', 'Please check the loose utility cover near our street because it may cause an accident.', 'Sacred Heart of Jesus Avenue, Roxas City', 'Zone VIII', 11.5762, 122.7588, true, 'cancelled', 'low', 20, 10, 0, 'Other', 25, 'neutral', false, 'selected-category fallback', '[]'::jsonb, '[]'::jsonb, '["Selected category base severity (+10)","No dataset keyword matched; selected category used as fallback","Text classified as Other (25% confidence)","Sentiment adjustment (neutral, +0)","Photo evidence (+10)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, 'The customer cancelled the report after the loose cover was secured by the property owner.', null, false, null, null, null),
  (9, 'Water Leak', 'There is no leak anymore. The issue stopped before the crew arrived.', 'Fuentes Drive, Roxas City', 'Zone IX', 11.5924, 122.7524, false, 'completed', 'medium', 35, 35, 0, 'Water Leak', 25, 'neutral', false, 'selected-category fallback', '[]'::jsonb, '["leak"]'::jsonb, '["Selected category base severity (+35)","No dataset keyword matched; selected category used as fallback","Text classified as Water Leak (25% confidence)","Negated terms ignored: \"leak\"","Sentiment adjustment (neutral, +0)","No photo evidence (+0)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, null, null, true, 'completed', 4, 'The crew checked the location and confirmed that the leak had already stopped.'),
  (10, 'Water Interruption', 'Water service was restored, but we are submitting this record for documentation.', 'Banica Road, Roxas City', 'Zone X', 11.5741, 122.7457, false, 'pending', 'medium', 40, 40, 0, 'Water Interruption', 25, 'neutral', false, 'selected-category fallback', '[]'::jsonb, '[]'::jsonb, '["Selected category base severity (+40)","No dataset keyword matched; selected category used as fallback","Text classified as Water Interruption (25% confidence)","Sentiment adjustment (neutral, +0)","No photo evidence (+0)"]'::jsonb, 'hybrid-sentiment-v1.1.0', 'Hybrid sentiment-aware dataset-backed priority scoring algorithm', null, null, 'The customer reopened the complaint because the service interruption happened again after the previous completion.', false, null, null, null);

create temp table generated_mock_complaints as
select
  gen_random_uuid() as id,
  c.id as resident_id,
  c.full_name as customer_name,
  c.customer_no,
  t.*,
  now()
    - (t.template_no * interval '2 days')
    - ((c.customer_no - 1) * interval '6 hours') as submitted_at,
  ((c.customer_no - 1) * 10 + t.template_no) as global_no
from active_customers c
cross join mock_templates t;

-- Insert the mock complaints with classifier values matching the current
-- hybrid-sentiment-v1.1.0 configuration.
insert into public.complaints (
  id, resident_id, category_id, description, address_text, zone, lat, lng,
  photo_urls, status, priority_score, sentiment_score, rule_score,
  submitted_at, updated_at, priority, rejection_reason, rejected_at,
  classified_category, classification_confidence, classification_sentiment,
  classification_mismatch, classification_basis, classification_keywords,
  classification_negated_keywords, classification_reasons, classifier_version,
  classification_method, cancelled_at, cancellation_reason, reopened_at,
  reopen_reason
)
select
  g.id,
  g.resident_id,
  cc.id,
  g.description,
  g.address_text,
  g.zone,
  g.lat,
  g.lng,
  case when g.has_photo then array['data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHJlY3QgeD0iMzAiIHk9IjMwIiB3aWR0aD0iNzQwIiBoZWlnaHQ9IjQ0MCIgZmlsbD0iI2Y4ZmFmYyIgc3Ryb2tlPSIjNjQ3NDhiIiBzdHJva2Utd2lkdGg9IjQiLz48dGV4dCB4PSI0MDAiIHk9IjIyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjQ2IiBmaWxsPSIjMGYxNzJhIj5NUldEIE1PQ0sgRVZJREVOQ0U8L3RleHQ+PHRleHQgeD0iNDAwIiB5PSIyODUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNiIgZmlsbD0iIzQ3NTU2OSI+Rm9yIHByZS1vcmFsIGRlbW9uc3RyYXRpb24gb25seTwvdGV4dD48L3N2Zz4=']::text[] else array[]::text[] end,
  g.status,
  g.priority_score,
  g.sentiment_score,
  g.rule_score,
  g.submitted_at,
  case
    when g.status = 'completed' then g.submitted_at + interval '2 days'
    when g.status = 'rejected' then g.submitted_at + interval '4 hours'
    when g.status = 'cancelled' then g.submitted_at + interval '2 hours'
    else g.submitted_at + interval '45 minutes'
  end,
  g.priority,
  g.rejection_reason,
  case when g.status = 'rejected' then g.submitted_at + interval '4 hours' end,
  g.classified_category,
  g.classification_confidence,
  g.classification_sentiment,
  g.classification_mismatch,
  g.classification_basis,
  g.classification_keywords,
  g.classification_negated_keywords,
  g.classification_reasons,
  g.classifier_version,
  g.classification_method,
  case when g.status = 'cancelled' then g.submitted_at + interval '2 hours' end,
  g.cancellation_reason,
  case when g.reopen_reason is not null then g.submitted_at + interval '7 days' end,
  g.reopen_reason
from generated_mock_complaints g
join public.complaint_categories cc on cc.name = g.category_name;

-- Current maintenance assignments are created round-robin for templates
-- requiring field work. Billing completion is intentionally admin-side and
-- therefore has no maintenance task.
create temp table generated_current_tasks as
select
  gen_random_uuid() as id,
  g.id as complaint_id,
  m.id as assigned_staff_id,
  m.full_name as assigned_staff_name,
  a.id as assigned_by,
  a.full_name as admin_name,
  g.task_status as status,
  g.template_no,
  g.submitted_at,
  g.global_no
from generated_mock_complaints g
join active_maintenance m
  on m.staff_no = ((g.global_no - 1) % (select count(*) from active_maintenance)) + 1
cross join (select id, full_name from active_admins order by admin_no limit 1) a
where g.creates_task;

insert into public.maintenance_tasks (
  id, complaint_id, assigned_staff_id, assigned_by, status, notes,
  scheduled_at, completed_at, created_at, is_active, acknowledged_at,
  estimated_completion_at, completion_notes, completion_photo_url,
  materials_used, unable_reason, reassignment_requested_at,
  reassignment_reason, assistance_requested_at, assistance_reason,
  superseded_at
)
select
  t.id,
  t.complaint_id,
  t.assigned_staff_id,
  t.assigned_by,
  t.status,
  case t.template_no
    when 2 then 'Inspect the reported major leak and secure the affected road area.'
    when 3 then 'Inspect the reported water-quality concern and collect observations.'
    when 4 then 'Check pressure levels and inspect the nearest service line.'
    when 5 then 'Inspect the meter and determine whether replacement equipment is required.'
    when 9 then 'Verify that the previously reported leak has stopped and document the site.'
  end,
  t.submitted_at + interval '2 hours',
  case when t.status = 'completed' then t.submitted_at + interval '1 day 5 hours' end,
  t.submitted_at + interval '1 hour',
  true,
  case when t.status in ('en_route', 'in_progress', 'blocked', 'completed') then t.submitted_at + interval '1 hour 20 minutes' end,
  case
    when t.status = 'assigned' then t.submitted_at + interval '8 hours'
    when t.status = 'en_route' then t.submitted_at + interval '5 hours'
    when t.status = 'in_progress' then t.submitted_at + interval '7 hours'
    when t.status = 'blocked' then t.submitted_at + interval '1 day'
    when t.status = 'completed' then t.submitted_at + interval '1 day 5 hours'
  end,
  case when t.status = 'completed' then 'The area was inspected, the line was checked, and no active leakage remained at completion.' end,
  case when t.status = 'completed' then 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHJlY3QgeD0iMzAiIHk9IjMwIiB3aWR0aD0iNzQwIiBoZWlnaHQ9IjQ0MCIgZmlsbD0iI2Y4ZmFmYyIgc3Ryb2tlPSIjNjQ3NDhiIiBzdHJva2Utd2lkdGg9IjQiLz48dGV4dCB4PSI0MDAiIHk9IjIyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjQ2IiBmaWxsPSIjMGYxNzJhIj5NUldEIE1PQ0sgRVZJREVOQ0U8L3RleHQ+PHRleHQgeD0iNDAwIiB5PSIyODUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNiIgZmlsbD0iIzQ3NTU2OSI+Rm9yIHByZS1vcmFsIGRlbW9uc3RyYXRpb24gb25seTwvdGV4dD48L3N2Zz4=' end,
  case
    when t.status = 'in_progress' then 'Pressure gauge, pipe wrench, replacement coupling'
    when t.status = 'blocked' then 'Replacement meter assembly pending'
    when t.status = 'completed' then 'Sealant, hand tools, safety markers'
  end,
  case when t.status = 'blocked' then 'The required replacement meter is not currently available in the field kit.' end,
  case when t.status = 'blocked' then t.submitted_at + interval '5 hours' end,
  case when t.status = 'blocked' then 'Reassignment requested if another crew has the required replacement meter.' end,
  case when t.status = 'blocked' then t.submitted_at + interval '4 hours 30 minutes' end,
  case when t.status = 'blocked' then 'Additional equipment and one technician are required to continue the work.' end,
  null
from generated_current_tasks t;

-- Add an inactive historical assignment to every in-progress pressure case
-- so the reassignment history is visible while only one task stays active.
insert into public.maintenance_tasks (
  complaint_id, assigned_staff_id, assigned_by, status, notes, scheduled_at,
  created_at, is_active, superseded_at, reassignment_reason
)
select
  g.id,
  old_staff.id,
  a.id,
  'reassigned',
  'Original mock assignment retained for reassignment-history demonstration.',
  g.submitted_at + interval '90 minutes',
  g.submitted_at + interval '30 minutes',
  false,
  g.submitted_at + interval '2 hours',
  'Task reassigned to balance active workload.'
from generated_mock_complaints g
join active_maintenance old_staff
  on old_staff.staff_no = ((g.global_no) % (select count(*) from active_maintenance)) + 1
cross join (select id from active_admins order by admin_no limit 1) a
where g.template_no = 4;

-- Add an inactive previous task for reopened complaints.
insert into public.maintenance_tasks (
  complaint_id, assigned_staff_id, assigned_by, status, notes, completed_at,
  created_at, is_active, acknowledged_at, completion_notes,
  completion_photo_url, materials_used, superseded_at
)
select
  g.id,
  m.id,
  a.id,
  'reopened',
  'Previous service action before the customer reopened the complaint.',
  g.submitted_at + interval '4 days',
  g.submitted_at + interval '2 hours',
  false,
  g.submitted_at + interval '3 hours',
  'Initial service was restored, but the customer later reported that the interruption returned.',
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHJlY3QgeD0iMzAiIHk9IjMwIiB3aWR0aD0iNzQwIiBoZWlnaHQ9IjQ0MCIgZmlsbD0iI2Y4ZmFmYyIgc3Ryb2tlPSIjNjQ3NDhiIiBzdHJva2Utd2lkdGg9IjQiLz48dGV4dCB4PSI0MDAiIHk9IjIyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjQ2IiBmaWxsPSIjMGYxNzJhIj5NUldEIE1PQ0sgRVZJREVOQ0U8L3RleHQ+PHRleHQgeD0iNDAwIiB5PSIyODUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNiIgZmlsbD0iIzQ3NTU2OSI+Rm9yIHByZS1vcmFsIGRlbW9uc3RyYXRpb24gb25seTwvdGV4dD48L3N2Zz4=',
  'Valve tools and service-line inspection kit',
  g.submitted_at + interval '7 days'
from generated_mock_complaints g
join active_maintenance m
  on m.staff_no = ((g.global_no - 1) % (select count(*) from active_maintenance)) + 1
cross join (select id from active_admins order by admin_no limit 1) a
where g.template_no = 10;

-- Task progress entries for the visible field workflow.
insert into public.task_updates (task_id, updated_by, message, photo_urls, created_at)
select id, assigned_staff_id, 'Assignment acknowledged by the assigned maintenance personnel.', array[]::text[], submitted_at + interval '1 hour 20 minutes'
from generated_current_tasks where status in ('en_route', 'in_progress', 'blocked', 'completed');

insert into public.task_updates (task_id, updated_by, message, photo_urls, created_at)
select id, assigned_staff_id,
  case status
    when 'en_route' then 'The crew is en route to the geotagged complaint location.'
    when 'in_progress' then 'The crew arrived on site and started inspection and corrective work.'
    when 'blocked' then 'Work is temporarily blocked while the required equipment and assistance are requested.'
    when 'completed' then 'The site inspection and service work were completed and documented.'
  end,
  case when status = 'completed' then array['data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTVlN2ViIi8+PHJlY3QgeD0iMzAiIHk9IjMwIiB3aWR0aD0iNzQwIiBoZWlnaHQ9IjQ0MCIgZmlsbD0iI2Y4ZmFmYyIgc3Ryb2tlPSIjNjQ3NDhiIiBzdHJva2Utd2lkdGg9IjQiLz48dGV4dCB4PSI0MDAiIHk9IjIyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjQ2IiBmaWxsPSIjMGYxNzJhIj5NUldEIE1PQ0sgRVZJREVOQ0U8L3RleHQ+PHRleHQgeD0iNDAwIiB5PSIyODUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNiIgZmlsbD0iIzQ3NTU2OSI+Rm9yIHByZS1vcmFsIGRlbW9uc3RyYXRpb24gb25seTwvdGV4dD48L3N2Zz4=']::text[] else array[]::text[] end,
  case status
    when 'en_route' then submitted_at + interval '2 hours'
    when 'in_progress' then submitted_at + interval '3 hours'
    when 'blocked' then submitted_at + interval '4 hours'
    when 'completed' then submitted_at + interval '1 day 5 hours'
  end
from generated_current_tasks where status in ('en_route', 'in_progress', 'blocked', 'completed');

insert into public.task_updates (task_id, updated_by, message, photo_urls, created_at)
select id, assigned_staff_id, 'Pressure testing is ongoing. The affected service line is being checked section by section.', array[]::text[], submitted_at + interval '5 hours'
from generated_current_tasks where status = 'in_progress';

-- Customer feedback for both an administratively resolved billing concern
-- and a completed maintenance inspection.
insert into public.feedback (complaint_id, resident_id, rating, comment, created_at)
select
  g.id,
  g.resident_id,
  g.feedback_rating,
  g.feedback_comment,
  case when g.template_no = 9 then g.submitted_at + interval '2 days' else g.submitted_at + interval '1 day' end
from generated_mock_complaints g
where g.feedback_rating is not null;

-- Status notifications for every customer complaint.
insert into public.notifications (
  user_id, created_by, title, message, notification_type,
  related_complaint_id, read_at, created_at
)
select
  g.resident_id,
  a.id,
  case g.status
    when 'pending' then case when g.reopen_reason is not null then 'Complaint reopened' else 'Complaint received' end
    when 'assigned' then 'Maintenance task assigned'
    when 'en_route' then 'Maintenance crew en route'
    when 'in_progress' then 'Work in progress'
    when 'blocked' then 'Task update: assistance required'
    when 'completed' then 'Complaint completed'
    when 'rejected' then 'Complaint requires correction'
    when 'cancelled' then 'Complaint cancelled'
  end,
  case g.status
    when 'pending' then case when g.reopen_reason is not null
      then 'Your complaint was reopened and returned to the review queue.'
      else 'Your complaint was received and is queued for administrative review.' end
    when 'assigned' then 'Your complaint has been assigned to Maintenance Personnel.'
    when 'en_route' then 'The assigned crew is travelling to the reported location.'
    when 'in_progress' then 'The assigned crew is currently working on the reported concern.'
    when 'blocked' then 'The task is temporarily blocked while additional equipment or assistance is arranged.'
    when 'completed' then 'The complaint has been marked completed. You may review the result and submit feedback.'
    when 'rejected' then 'The complaint could not be processed. Open it to review the reason and required correction.'
    when 'cancelled' then 'The complaint was cancelled according to the recorded customer request.'
  end,
  g.status,
  g.id,
  case when g.template_no % 2 = 0 then g.submitted_at + interval '1 day' end,
  g.submitted_at + interval '50 minutes'
from generated_mock_complaints g
cross join (select id from active_admins order by admin_no limit 1) a;

-- Assignment notifications for Maintenance Personnel.
insert into public.notifications (
  user_id, created_by, title, message, notification_type,
  related_complaint_id, read_at, created_at
)
select
  t.assigned_staff_id,
  t.assigned_by,
  'New maintenance assignment',
  'A mock ' || g.category_name || ' complaint was assigned to you for the pre-oral demonstration.',
  'assignment',
  t.complaint_id,
  case when t.status <> 'assigned' then t.submitted_at + interval '2 hours' end,
  t.submitted_at + interval '1 hour 5 minutes'
from generated_current_tasks t
join generated_mock_complaints g on g.id = t.complaint_id;

-- New-complaint notifications for every active administrator.
insert into public.notifications (
  user_id, created_by, title, message, notification_type,
  related_complaint_id, read_at, created_at
)
select
  a.id,
  g.resident_id,
  'New complaint filed',
  g.customer_name || ' submitted a mock ' || g.category_name || ' complaint.',
  'new',
  g.id,
  case when g.template_no > 2 then g.submitted_at + interval '3 hours' end,
  g.submitted_at + interval '5 minutes'
from generated_mock_complaints g
cross join active_admins a
where g.template_no in (1, 2);

-- Readable audit-log history for complaint creation and workflow actions.
insert into public.audit_logs (
  actor_id, actor_name, action, entity_type, entity_id, details, created_at
)
select
  g.resident_id,
  g.customer_name,
  'complaint.created',
  'complaint',
  g.id,
  jsonb_build_object(
    'complaint_type', g.category_name,
    'mock_data', true,
    'reference_status', g.status,
    'priority', g.priority
  ),
  g.submitted_at
from generated_mock_complaints g;

insert into public.audit_logs (
  actor_id, actor_name, action, entity_type, entity_id, details, created_at
)
select
  t.assigned_by,
  t.admin_name,
  'task.assigned',
  'maintenance_task',
  t.id,
  jsonb_build_object(
    'complaint_id', t.complaint_id,
    'assigned_to', t.assigned_staff_name,
    'status', t.status,
    'mock_data', true
  ),
  t.submitted_at + interval '1 hour'
from generated_current_tasks t;

insert into public.audit_logs (
  actor_id, actor_name, action, entity_type, entity_id, details, created_at
)
select
  g.resident_id,
  g.customer_name,
  'complaint.reopened',
  'complaint',
  g.id,
  jsonb_build_object('reason', g.reopen_reason, 'mock_data', true),
  g.submitted_at + interval '7 days'
from generated_mock_complaints g
where g.reopen_reason is not null;

-- Explicitly remove all temporary staging tables before completing the seed.
drop table if exists
  generated_current_tasks,
  generated_mock_complaints,
  mock_templates,
  active_maintenance,
  active_admins,
  active_customers,
  old_task_ids,
  old_complaint_ids;

  raise notice 'MRWD mock complaint reset and seed completed successfully.';
end
$seed$;

-- Verification summary. Each active customer should have ten complaints.
select
  p.full_name as customer,
  count(*) as complaint_count,
  count(*) filter (where c.status = 'pending') as pending,
  count(*) filter (where c.status = 'assigned') as assigned,
  count(*) filter (where c.status = 'en_route') as en_route,
  count(*) filter (where c.status = 'in_progress') as in_progress,
  count(*) filter (where c.status = 'blocked') as blocked,
  count(*) filter (where c.status = 'completed') as completed,
  count(*) filter (where c.status = 'rejected') as rejected,
  count(*) filter (where c.status = 'cancelled') as cancelled
from public.complaints c
join public.profiles p on p.id = c.resident_id
group by p.id, p.full_name
order by p.full_name;

select status, priority, count(*)
from public.complaints
group by status, priority
order by status, priority;
