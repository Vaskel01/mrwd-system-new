# Reliability audit — September 6, 2026

Scope: current complaint workflow, service-account access, billing imports, connection failures, and four non-MFA demo workspaces. This is an engineering test record, not questionnaire results or client acceptance.

## Changes and evidence

| Severity | Finding | Correction and evidence |
| --- | --- | --- |
| High | Direct customer database updates could resolve a complaint without field work or a photo, bypassing the API. | Reproduced in a rollback-only fixture. Database lifecycle trigger now rejects customer self-resolution and requires a completed assigned task with notes and a photo URL for resolution. |
| High | Completion wrote the task and complaint separately; a second-write failure could leave inconsistent states. | Atomic `complete_complaint_field_work` RPC locks and updates both rows. Injected second-write failure leaves both unchanged. Repeated completion returns the saved outcome without rewriting it. |
| High | Customer reopen attempted a maintenance-task update without customer update permission, ignored its result, and could leave an old assignment active. | Narrowly scoped private trigger retires the assignment within the customer's reopen transaction. Tested current assignment count becomes zero. |
| Medium | Feedback ownership/status and task-assignment boundaries were enforced incompletely by direct database writes. | Database rejects premature/foreign feedback, maintenance assignment changes, and completion without notes/photo URL. HTTP rating validation now requires whole stars. |
| Medium | Impossible billing dates could pass preview; active flags such as `no` could silently activate an account. | Shared import validator checks real YYYY-MM-DD dates, explicit true/false flags, malformed rows, account-number length, and normalizes whitespace. Regression tests also cover duplicates, unknown accounts, negative amounts, and batch limits. |
| Medium | An HTML response with HTTP 200 was treated as an empty successful JSON response. | Shared response reader rejects malformed/non-object responses. Connection-error copy tells users to check whether a write saved before retrying; writes are not automatically retried. |

## Automated records

- `npm test`: 37 passed, 0 failed (29 existing + 8 reliability tests).
- `npm run lint`: passed.
- `npm run build`: passed.
- `scripts/qa-http.mjs`: passed against the restarted local API. All four demo roles can read their complaint list and are denied the tested out-of-role endpoint; anonymous complaint access is denied; Commercial billing preview rejects February 30. Only normal authentication/session/audit metadata may change; no operational records are submitted.
- `git diff --check`: passed; Windows CRLF normalization warnings are not test failures.
- `npm run check:source`: blocked by the pre-existing local `.env` and `server/.env` files and their JWT-like contents. Credentials were not printed, committed, removed, or changed.
- `supabase/tests/workflow_reliability.sql`: passed against the connected database, with all fixtures rolled back. Covers submission, rejected/restore/forwarded states, Commercial/dispatch separation, assignment/start/block/redispatch, notes/photo requirements, assignment protection, simulated atomic failure, completion, repeat completion, feedback, and reopening.
- `supabase/tests/service_accounts.sql`: passed again after the lifecycle migration. Covers account requests/approval, multiple accounts, bill isolation, complaint snapshots, and foreign-account denial.
- Database migration applied: `enforce_complaint_lifecycle_and_atomic_completion`. Reproducible definitions are appended to the canonical `supabase/setup.sql`; do not rerun the entire installer against an existing production database just to deploy this change.

## Browser evidence

The repeatable script is `scripts/qa-browser.mjs`. It uses separate browser contexts, the four supplied demo accounts, and a local API/site. Screenshot and JSON evidence are saved outside the repository for this run.

Pages checked at 1440px/light, 768px/dark, and 390px/dark:

- Customer: My Complaints, Submit Complaint, Billing, Notifications.
- Commercial: Dashboard, Complaint Review, Reports, Accounts and Billing.
- WDLCD/ECMD: Dashboard, Dispatch, Field Operations.
- Maintenance: My Tasks, Notifications, Profile.

These are page-load, navigation, overflow, screenshot, and quick-find keyboard checks. They are not a claim that every control on every page has been tested. Maintenance detail-form tests use an explicitly intercepted QA complaint, not a real submitted complaint; the Storage failure is also intercepted, so no image is uploaded to the live bucket. The first form-test attempt had an incomplete mock resources response; this was a test fixture error, not evidence of a real production failure.

Final browser results: 14 pages across 3 viewport/theme combinations passed; quick-find typing/space/Escape passed for all 4 roles. The Maintenance completion dialog passed typing/focus, required-photo, simulated upload failure, and saved-note retention checks. A duplicate desktop/mobile action selector in the harness was scoped before its successful rerun. The consolidated record is `outputs/reliability-audit/verified-results.json` in the Codex artifact workspace; corrected Maintenance details are under `outputs/reliability-audit/maintenance-detail/`.

Run with Node, an available Playwright installation, and `QA_DEMO_PASSWORD`. Optional settings: `QA_PLAYWRIGHT_PATH` (module file path), `QA_BROWSER_PATH` (Chrome executable), `QA_BASE_URL`, `QA_OUTPUT_DIR`, and `QA_ROLE`. No passwords or session tokens are written to the result record. Default local output `qa-output/` is gitignored.

## Limits and remaining checks

- This is a layered check: live read-only pages, rollback database workflow tests, and mocked form faults. A single live browser-to-API-to-Storage completion journey was deliberately not performed on the client database.
- System Supervisor/admin MFA screens still require the account holder for an authenticated review; MFA was not bypassed.
- Real email/SMS delivery and recipient receipt remain unverified. Core state changes are atomic, but notification/audit side effects are not part of the completion RPC transaction.
- Photo presence checks require notes and a nonempty HTTP(S) photo URL. This does not establish that the photo depicts completed work or validate object ownership/content; those remain separate evidence-validation concerns.
- A broader review of legacy overlapping RLS policies and column-level write permissions is still warranted. This patch addresses the reproduced lifecycle bypass; it is not a full security certification.
- Supabase's security advisor reports the existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No authentication configuration was changed.
- No real MRWD account data or billing imports were fabricated. No questionnaire findings were generated. No hosted application deployment or Git push was performed.
- Final database count check: 0 complaints, 0 maintenance tasks, 0 feedback, 0 service-account requests, 0 registered service accounts. Demo assignee availability used by the SQL fixture is restored by rollback.

## Deployment note

Database safeguards are already live. Deploy the committed application code to use the atomic completion RPC and the new import/connection handling on the hosted website. Keep the existing tested workflow stable while questionnaires are in progress.
