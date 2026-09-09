-- 2026-09-09: private complaint evidence, verified Storage objects, evidence retention, and FK indexes.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-photos','complaint-photos',false,6291456,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

commit;

begin;

create or replace function app_private.guard_complaint_lifecycle()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare role_name text := public.current_user_role();
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if role_name = 'customer' and (new.resident_id <> auth.uid() or new.status <> 'pending') then
      raise exception 'Customer complaints must start pending review';
    end if;
    return new;
  end if;
  if new.resident_id is distinct from old.resident_id then raise exception 'Complaint ownership cannot be changed'; end if;
  if role_name = 'customer' then
    if new.status is distinct from old.status and not (
      (old.status = 'pending' and new.status = 'cancelled') or
      (old.status in ('resolved','completed') and new.status = 'pending' and length(trim(coalesce(new.reopen_reason,''))) >= 5)
    ) then raise exception 'Customers may only cancel pending complaints or reopen resolved complaints with a reason'; end if;
    if old.status <> 'pending' and new.status = old.status then
      raise exception 'Only pending complaints can be edited by customers';
    end if;
  end if;
  if new.status in ('resolved','completed') and new.status is distinct from old.status then
    if role_name <> 'maintenance_personnel' then raise exception 'Only assigned Maintenance Personnel can complete field work'; end if;
    if not exists(select 1 from public.maintenance_tasks t where t.complaint_id=new.id and t.is_active
      and t.assigned_staff_id=auth.uid() and t.status='completed'
      and length(trim(coalesce(t.completion_notes,'')))>=5
      and coalesce(t.completion_photo_url,'') ~ ('^' || auth.uid()::text || '/completion/[^/]+$')
      and exists (
        select 1 from storage.objects o
        where o.bucket_id='complaint-photos'
          and o.name=t.completion_photo_url
          and o.owner_id=auth.uid()::text
      )) then
      raise exception 'A completed task with notes and a completion proof photo is required';
    end if;
  end if;
  return new;
end $$;

create or replace function app_private.guard_task_completion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if public.current_user_role()='maintenance_personnel' and tg_op='UPDATE' then
    if (to_jsonb(new)-array['status','completed_at','completion_notes','completion_photo_url','materials_used','unable_reason','reassignment_requested_at','reassignment_reason','assistance_requested_at','assistance_reason','updated_at'])
      is distinct from (to_jsonb(old)-array['status','completed_at','completion_notes','completion_photo_url','materials_used','unable_reason','reassignment_requested_at','reassignment_reason','assistance_requested_at','assistance_reason','updated_at']) then
      raise exception 'Maintenance Personnel cannot change task ownership or assignment';
    end if;
    if not old.is_active or old.status not in ('assigned','en_route','in_progress','blocked') then raise exception 'Only active field work can be changed'; end if;
    if new.status not in ('assigned','en_route','in_progress','blocked','completed') then raise exception 'Invalid field-work status'; end if;
  end if;
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if length(trim(coalesce(new.completion_notes,'')))<5 or coalesce(new.completion_photo_url,'') !~ ('^' || auth.uid()::text || '/completion/[^/]+$') then
      raise exception 'Resolution notes and a completion proof photo are required';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id='complaint-photos'
        and o.name=new.completion_photo_url
        and o.owner_id=auth.uid()::text
    ) then
      raise exception 'The completion proof photo was not found in secure storage';
    end if;
  end if;
  return new;
end $$;

create or replace function public.complete_complaint_field_work(p_complaint_id uuid,p_notes text,p_photo_url text,p_materials text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare c public.complaints; t public.maintenance_tasks;
begin
  if auth.uid() is null or public.current_user_role()<>'maintenance_personnel' then raise exception 'Maintenance Personnel access required'; end if;
  select * into c from public.complaints where id=p_complaint_id for update;
  if not found then raise exception 'Complaint not found or not assigned to you'; end if;
  select * into t from public.maintenance_tasks where complaint_id=c.id and is_active order by created_at desc limit 1 for update;
  if not found or t.assigned_staff_id<>auth.uid() then raise exception 'This task is not assigned to you'; end if;
  if t.status='completed' and c.status='resolved' then return true; end if;
  if t.status not in ('assigned','en_route','in_progress','blocked') or c.status not in ('assigned','en_route','in_progress','blocked') then raise exception 'Only active field work can be completed'; end if;
  if length(trim(coalesce(p_notes,'')))<5 or coalesce(trim(p_photo_url),'') !~ ('^' || auth.uid()::text || '/completion/[^/]+$') then raise exception 'Resolution notes and a completion proof photo are required'; end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='complaint-photos'
      and o.name=trim(p_photo_url)
      and o.owner_id=auth.uid()::text
  ) then raise exception 'The completion proof photo was not found in secure storage'; end if;
  update public.maintenance_tasks set status='completed',completed_at=now(),completion_notes=trim(p_notes),completion_photo_url=trim(p_photo_url),
    materials_used=coalesce(nullif(trim(p_materials),''),t.materials_used),unable_reason=null,reassignment_requested_at=null,reassignment_reason=null,assistance_requested_at=null,assistance_reason=null where id=t.id;
  update public.complaints set status='resolved',verified_at=null,verified_by=null,resolution_code='resolved',resolution_notes=trim(p_notes),updated_at=now() where id=c.id;
  return false;
end $$;

commit;

-- ===== Production hardening: private evidence access and FK support indexes =====
begin;

-- Normalize legacy permanent Storage URLs to private object paths before public access is disabled.
update public.complaints set photo_urls = coalesce((select array_agg(regexp_replace(regexp_replace(v, '^https?://[^/]+/storage/v1/object/(public/|sign/|authenticated/)?complaint-photos/', ''), '[?].*$', '')) from unnest(photo_urls) v), array[]::text[]) where exists (select 1 from unnest(photo_urls) v where v ~ '^https?://');
update public.maintenance_tasks set completion_photo_url = regexp_replace(regexp_replace(completion_photo_url, '^https?://[^/]+/storage/v1/object/(public/|sign/|authenticated/)?complaint-photos/', ''), '[?].*$', '') where completion_photo_url ~ '^https?://';
update public.task_updates set photo_urls = coalesce((select array_agg(regexp_replace(regexp_replace(v, '^https?://[^/]+/storage/v1/object/(public/|sign/|authenticated/)?complaint-photos/', ''), '[?].*$', '')) from unnest(photo_urls) v), array[]::text[]) where exists (select 1 from unnest(photo_urls) v where v ~ '^https?://');

drop policy if exists "complaint_photos_owner_read" on storage.objects;
drop policy if exists "complaint_photos_public_read" on storage.objects;
drop policy if exists "complaint_photos_authorized_read" on storage.objects;
create policy "complaint_photos_authorized_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'complaint-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.current_user_has_capability('commercial.complaints')
      or public.current_user_has_capability('ecmd.dispatch')
      or public.current_user_has_capability('ecmd.operations')
      or exists (
        select 1 from public.complaints c
        where name = any(coalesce(c.photo_urls, array[]::text[]))
          and (c.resident_id = (select auth.uid()) or public.is_assigned_to_complaint(c.id))
      )
      or exists (
        select 1 from public.maintenance_tasks t
        where t.completion_photo_url = name
          and (t.assigned_staff_id = (select auth.uid()) or public.is_resident_of_complaint(t.complaint_id))
      )
      or exists (
        select 1 from public.task_updates u
        join public.maintenance_tasks t on t.id = u.task_id
        where name = any(coalesce(u.photo_urls, array[]::text[]))
          and (t.assigned_staff_id = (select auth.uid()) or public.is_resident_of_complaint(t.complaint_id))
      )
    )
  );

drop policy if exists "complaint_photos_delete_own_folder" on storage.objects;
create policy "complaint_photos_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'complaint-photos'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.complaints c where name = any(coalesce(c.photo_urls, array[]::text[])))
    and not exists (select 1 from public.maintenance_tasks t where t.completion_photo_url = name)
    and not exists (select 1 from public.task_updates u where name = any(coalesce(u.photo_urls, array[]::text[])))
  );

-- Index foreign-key columns used by joins and RLS predicates. Existing/unique leading-column indexes are not duplicated.
create index if not exists fkidx_complaints_resident_id on public.complaints(resident_id);
create index if not exists fkidx_complaints_category_id on public.complaints(category_id);
create index if not exists fkidx_maintenance_tasks_assigned_staff_id on public.maintenance_tasks(assigned_staff_id);
create index if not exists fkidx_maintenance_tasks_assigned_by on public.maintenance_tasks(assigned_by);
create index if not exists fkidx_task_updates_task_id on public.task_updates(task_id);
create index if not exists fkidx_task_updates_updated_by on public.task_updates(updated_by);
create index if not exists fkidx_feedback_complaint_id on public.feedback(complaint_id);
create index if not exists fkidx_feedback_resident_id on public.feedback(resident_id);
create index if not exists fkidx_announcements_created_by on public.announcements(created_by);
create index if not exists fkidx_bills_customer_id on public.bills(customer_id);
create index if not exists fkidx_notifications_created_by on public.notifications(created_by);
create index if not exists fkidx_notifications_related_complaint_id on public.notifications(related_complaint_id);
create index if not exists fkidx_audit_logs_actor_id on public.audit_logs(actor_id);
create index if not exists fkidx_maintenance_crews_created_by on public.maintenance_crews(created_by);
create index if not exists fkidx_crew_members_crew_id on public.crew_members(crew_id);
create index if not exists fkidx_staff_schedules_created_by on public.staff_schedules(created_by);
create index if not exists fkidx_approval_requests_requested_by on public.approval_requests(requested_by);
create index if not exists fkidx_approval_requests_reviewed_by on public.approval_requests(reviewed_by);
create index if not exists fkidx_archive_records_archived_by on public.archive_records(archived_by);
create index if not exists fkidx_inventory_items_created_by on public.inventory_items(created_by);
create index if not exists fkidx_inventory_transactions_complaint_id on public.inventory_transactions(complaint_id);
create index if not exists fkidx_inventory_transactions_created_by on public.inventory_transactions(created_by);
create index if not exists fkidx_task_inventory_usage_recorded_by on public.task_inventory_usage(recorded_by);
create index if not exists fkidx_task_manpower_records_recorded_by on public.task_manpower_records(recorded_by);
create index if not exists fkidx_notification_deliveries_notification_id on public.notification_deliveries(notification_id);
create index if not exists fkidx_complaint_events_actor_id on public.complaint_events(actor_id);
create index if not exists fkidx_complaint_internal_notes_author_id on public.complaint_internal_notes(author_id);
create index if not exists fkidx_customer_contact_log_staff_id on public.customer_contact_log(staff_id);
create index if not exists fkidx_complaint_relations_created_by on public.complaint_relations(created_by);
create index if not exists fkidx_complaint_incidents_category_id on public.complaint_incidents(category_id);
create index if not exists fkidx_complaint_incidents_created_by on public.complaint_incidents(created_by);
create index if not exists fkidx_complaint_incidents_resolved_by on public.complaint_incidents(resolved_by);
create index if not exists fkidx_complaint_incident_members_incident_id on public.complaint_incident_members(incident_id);
create index if not exists fkidx_complaint_incident_members_added_by on public.complaint_incident_members(added_by);
create index if not exists fkidx_complaint_watches_user_id on public.complaint_watches(user_id);
create index if not exists fkidx_complaint_watches_complaint_id on public.complaint_watches(complaint_id);
create index if not exists fkidx_recent_complaints_complaint_id on public.recent_complaints(complaint_id);
create index if not exists fkidx_complaint_merge_records_primary_complaint_id on public.complaint_merge_records(primary_complaint_id);
create index if not exists fkidx_complaint_merge_records_merged_complaint_id on public.complaint_merge_records(merged_complaint_id);
create index if not exists fkidx_complaint_merge_records_merged_by on public.complaint_merge_records(merged_by);
create index if not exists fkidx_complaint_followup_requests_requested_by on public.complaint_followup_requests(requested_by);
create index if not exists fkidx_complaint_followup_requests_responded_by on public.complaint_followup_requests(responded_by);
create index if not exists fkidx_crew_substitutions_replaced_staff_id on public.crew_substitutions(replaced_staff_id);
create index if not exists fkidx_crew_substitutions_substitute_staff_id on public.crew_substitutions(substitute_staff_id);
create index if not exists fkidx_crew_substitutions_created_by on public.crew_substitutions(created_by);
create index if not exists fkidx_maintenance_note_templates_created_by on public.maintenance_note_templates(created_by);
create index if not exists fkidx_report_schedules_owner_id on public.report_schedules(owner_id);
create index if not exists fkidx_report_runs_schedule_id on public.report_runs(schedule_id);
create index if not exists fkidx_report_runs_generated_by on public.report_runs(generated_by);
create index if not exists fkidx_system_backup_checks_recorded_by on public.system_backup_checks(recorded_by);
create index if not exists fkidx_service_account_requests_reviewed_by on public.service_account_requests(reviewed_by);

comment on policy "complaint_photos_authorized_read" on storage.objects is 'Private complaint evidence: owner, complaint customer, assigned Maintenance Personnel, or authorized Commercial Services/WDLCD staff only.';
comment on policy "complaint_photos_delete_own_folder" on storage.objects is 'Uploaders may remove only unlinked orphaned evidence; complaint and task records retain referenced photos.';

notify pgrst, 'reload schema';
commit;
