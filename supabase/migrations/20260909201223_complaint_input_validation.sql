-- Keep database validation aligned with the customer complaint form and API.
begin;

alter table public.complaints
  drop constraint if exists complaints_description_min_length;

alter table public.complaints
  add constraint complaints_description_min_length
  check (char_length(btrim(description)) between 20 and 1200);

comment on constraint complaints_description_min_length on public.complaints is
  'Complaint descriptions must contain 20 to 1200 characters after trimming.';

commit;
