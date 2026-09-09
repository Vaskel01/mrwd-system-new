-- 2026-09-09: cover the remaining complaint foreign keys identified by the database advisor.

begin;

create index if not exists fkidx_complaints_forwarded_to_ecmd_by on public.complaints(forwarded_to_ecmd_by);
create index if not exists fkidx_complaints_merged_by on public.complaints(merged_by);
create index if not exists fkidx_complaints_merged_into_id on public.complaints(merged_into_id);
create index if not exists fkidx_complaints_priority_overridden_by on public.complaints(priority_overridden_by);
create index if not exists fkidx_complaints_verified_by on public.complaints(verified_by);

commit;
