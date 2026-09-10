# Complete demo billing account

`supabase/seeds/demo_billing_statements.sql` enriches the six existing February–July 2026 bills belonging only to `customer@demo.com`. It creates the fictional linked service account `DEMO-MRWD-001` and fills all 15 optional statement fields. It does not alter the login profile, passwords, real accounts, or existing bill totals, readings, due dates, and payment statuses.

Run explicitly as database owner after the statement-details migration. This is not an automatic deployment migration. The transaction stops if the demo login, expected six bills, or safe account-number ownership checks fail. Rerunning updates those same six bills without adding duplicates.

All added identity/address values are visibly labeled demo or fictional. The breakdown allocates 10 pesos to mock maintenance and the remaining existing amount to mock water charges. Arrears, other charges, and pay-immediately amounts are explicit zero. The sample penalty is 10% of the mock water charge; this is fixture arithmetic, not an assertion of MRWD's current tariff or penalty policy. Paid bills retain their historical statement totals and paid status. The timestamp records when demo data was refreshed, not an import from an external billing system.

Verify all six bills have 15 statement keys, reconcile their totals with `valid_billing_statement`, and remain visible under the demo customer's authenticated RLS context. No photographs or real account-holder information are copied into this fixture.
