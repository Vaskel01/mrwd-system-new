-- ═══════════════════════════════════════════════════════════════
-- MRWD demo billing data
-- ═══════════════════════════════════════════════════════════════
-- Adds six realistic monthly billing records to every active customer
-- profile. This is intended only for demonstrations, screenshots, and
-- pre-oral testing. Run this AFTER customer accounts already exist.
--
-- Safe to re-run: an existing customer + billing_period combination is
-- skipped, so the script does not duplicate the same demo month.
--
-- To remove only the rows created by this seed, run the cleanup query at
-- the bottom after reviewing it.
-- ═══════════════════════════════════════════════════════════════

with mock_billing_rows as (
  select *
  from (values
    -- month_offset, previous_reading, current_reading, consumption,
    -- amount_due, status
    (0, 204::numeric, 222::numeric, 18::numeric, 486.50::numeric, 'unpaid'::text),
    (1, 187::numeric, 204::numeric, 17::numeric, 459.00::numeric, 'paid'::text),
    (2, 169::numeric, 187::numeric, 18::numeric, 486.50::numeric, 'paid'::text),
    (3, 154::numeric, 169::numeric, 15::numeric, 405.00::numeric, 'paid'::text),
    (4, 138::numeric, 154::numeric, 16::numeric, 432.00::numeric, 'paid'::text),
    (5, 123::numeric, 138::numeric, 15::numeric, 405.00::numeric, 'paid'::text)
  ) as mock(
    month_offset,
    previous_reading,
    current_reading,
    consumption,
    amount_due,
    status
  )
),
prepared_rows as (
  select
    p.id as customer_id,
    to_char(
      date_trunc('month', current_date)
        - (m.month_offset || ' months')::interval,
      'FMMonth YYYY'
    ) as billing_period,
    m.previous_reading,
    m.current_reading,
    m.consumption,
    m.amount_due,
    (
      date_trunc('month', current_date)
        - (m.month_offset || ' months')::interval
        + interval '1 month 5 days'
    )::date as due_date,
    m.status,
    (
      date_trunc('month', current_date)
        - (m.month_offset || ' months')::interval
        + interval '2 days'
    )::timestamptz as issued_at
  from public.profiles p
  cross join mock_billing_rows m
  where p.role = 'customer'
    and coalesce(p.is_active, true) = true
)
insert into public.bills (
  customer_id,
  billing_period,
  previous_reading,
  current_reading,
  consumption,
  amount_due,
  due_date,
  status,
  issued_at
)
select
  r.customer_id,
  r.billing_period,
  r.previous_reading,
  r.current_reading,
  r.consumption,
  r.amount_due,
  r.due_date,
  r.status,
  r.issued_at
from prepared_rows r
where not exists (
  select 1
  from public.bills b
  where b.customer_id = r.customer_id
    and b.billing_period = r.billing_period
);

-- Verify the inserted demo records.
select
  p.full_name,
  p.email,
  b.billing_period,
  b.previous_reading,
  b.current_reading,
  b.consumption,
  b.amount_due,
  b.due_date,
  b.status
from public.bills b
join public.profiles p on p.id = b.customer_id
where p.role = 'customer'
order by p.email, b.issued_at desc;

-- Optional cleanup. Review before running, then remove the leading "--"
-- from each line. This deletes bills matching the exact six demo readings.
-- delete from public.bills
-- where (previous_reading, current_reading, consumption, amount_due) in (
--   (204, 222, 18, 486.50),
--   (187, 204, 17, 459.00),
--   (169, 187, 18, 486.50),
--   (154, 169, 15, 405.00),
--   (138, 154, 16, 432.00),
--   (123, 138, 15, 405.00)
-- );
