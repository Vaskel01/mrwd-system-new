-- ═══════════════════════════════════════════════════════════════
-- Seeds complaint_categories with the exact names the frontend's
-- dropdown uses (src/config/staticData.js → COMPLAINT_TYPES), plus a
-- base_severity_score for each — this is what used to be the
-- "typeScores" table hardcoded in the old scoringConfig.json, now
-- pulled from your database instead.
--
-- Safe to re-run: upserts by name, won't create duplicates.
-- ═══════════════════════════════════════════════════════════════

insert into public.complaint_categories (name, description, base_severity_score, is_active)
values
  ('Water Interruption',        'Complete loss of water supply to a residence or area.',           40, true),
  ('Water Leak',                 'Visible leaking or bursting pipes, meters, or fittings.',           35, true),
  ('Dirty / Discolored Water',   'Water that appears dirty, discolored, or has an unusual smell.',   30, true),
  ('Low Water Pressure',         'Water flow noticeably weaker than usual.',                          20, true),
  ('Meter Problem',              'Faulty, damaged, or inaccurate water meter.',                       15, true),
  ('New Connection Request',     'Request for a new service connection.',                             10, true),
  ('Billing Concern',            'Disputes or questions about a bill or charge.',                      5, true),
  ('Other',                      'Anything that does not fit the categories above.',                  10, true)
on conflict (name) do update
  set base_severity_score = excluded.base_severity_score,
      description = excluded.description,
      is_active = true;

-- The upsert above assumes `name` has a unique constraint. If it
-- doesn't yet, add one first:
-- alter table public.complaint_categories add constraint complaint_categories_name_key unique (name);
