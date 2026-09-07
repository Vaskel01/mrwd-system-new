# Remaining-system verification: September 7–8, 2026

Scope: continue the untested checks using supplied demo accounts, labelled synthetic records, and the local frontend/API against the existing Supabase project. This is an engineering test record, not client questionnaire responses or a claim of exhaustive acceptance testing.

## Implemented fixes

- Notifications: use explicit notification types rather than words such as “review” or “assigned” in message text to decide whether an action is required. New notification views default to all updates; saved preferences remain respected.
- Customer complaint details: omit the staff-only priority field instead of displaying “Not set” for intentionally redacted data.
- Sign-in: distinguish provider/network outages (503), rate limits (429), and invalid credentials (401). Security-event reasons match the response.
- Ownership review: with the user's explicit approval, return name, email, and phone only for customer IDs on RLS-visible pending requests to staff with `commercial.billing`. The server-only lookup selects four fields including its internal join ID; only three contact fields reach the client. Customer, Maintenance, ECMD, and System Supervisor roles do not receive this endpoint's billing permission. General profile RLS and database grants are unchanged.
- Account directory: refresh linked-account status after ownership review, without waiting for a subsequent import/page reload. React review emphasized event-driven refresh and a primitive refresh-version dependency.
- Photo persistence: validate image type and the 6 MB standard-upload limit, generate collision-resistant object paths, and reconcile an interrupted save before cleanup. If the record committed despite a lost response, the app recovers it and preserves the referenced photo; if the record is definitively absent, the owner removes the orphan through the Storage API.
- External delivery: added a collision-safe database claim function, Resend email and Twilio SMS adapters, three-attempt retry limits, a secured cron endpoint, manual System Health delivery, failed-item requeue controls, and duplicate-safe handling when a provider receipt cannot be recorded.
- Platform readiness: System Health can report custom Auth SMTP, leaked-password protection, and managed-backup availability through an optional read-only Supabase Management API token. A separate recovery runbook covers isolated restore rehearsals and the configuration that database backups do not restore.

## Executed checks

| Area | Evidence and result |
| --- | --- |
| Account linking | Customer submitted `QA-20260907-BILL`; Commercial saw it pending. Initial missing requester contact information was reproduced, fixed, and verified live. |
| Account import | One-row CSV: preview showed 1 valid / 0 invalid / 1 new; import persisted the labelled registry record. |
| Ownership approval | Commercial recorded a QA-only verification note and approved the synthetic account. Customer subsequently saw Approved and the linked account selector. This is not validation of real MRWD ownership evidence. |
| Billing import | One-row CSV imported 1/1 with 0 failures: amount 123.45, consumption 10, due 2026-09-30. |
| Customer billing | All accounts showed seven bills including the six baseline demo bills. Selecting the QA connection showed exactly one bill and amount due 123.45. |
| Contact access control | Live API: Customer and Maintenance returned 403; unauthenticated request returned 401. Commercial response contained exactly full_name/email/phone for the pending requester. Unit tests also deny ECMD and System Supervisor. |
| Invalid save | Too-short account relationship note returned 400. No success result was asserted. |
| Concurrent submissions | Two simultaneous customer requests for `QA-20260907-RACE` returned the same request ID. |
| Concurrent ownership reviews | Two simultaneous rejections of that synthetic request returned one 200 and one 400, preserving one decision. This is bounded concurrency testing, not a load test of all endpoints. |
| Reports | Commercial created a weekly QA summary through the API and generated a ready manual run with zero matching rows. A different user could not run it (404). |
| Scheduled runner | An isolated local API process used an ephemeral CRON_SECRET. Missing secret returned 401. Only the QA schedule was made due after checking there were no unrelated due schedules. The runner generated a ready report, advanced next_run_at, and an immediate repeat found zero due schedules. A database query confirmed one in-app notification. Hosted timer invocation and external email/SMS were not tested. |
| QA staff creation | User completed the credential/create step in the admin UI. Database confirmed Maintenance Personnel, ECMD/WDLCD, active, and must_change_password=true. |
| QA staff deactivation | Admin UI deactivated only the QA account. Database confirmed inactive, zero sessions, zero assignments. The test did not complete a first-login password change or attempt login with its temporary password. |
| Internal announcement | Admin published a labelled ECMD-only QA notice. Database confirmed audience=ecmd/is_internal=true. Authenticated API checks: ECMD could see it; Customer and Commercial could not. |
| Approval review | Two non-operational approval fixtures were inserted for testing the reviewer, not the request-creation UI. Self-review displayed “A different System Supervisor must review this request” and stayed pending. Independent review became approved with a review timestamp. |
| Stale-record save | After fixture cleanup, submitting a stale displayed approval returned “Approval request not found,” not a false success. |
| Auth outage | Automated HTTP test used a local simulated auth provider returning 503 and verified the application's real login endpoint returns the service-unavailable message. No real provider outage was induced. |
| Photo failure recovery | Seven automated cases covered validation, successful save, lost-response recovery, definitive-save-failure cleanup, failed reconciliation, cleanup failure, and unique owner-scoped paths. A live disposable 1×1 image proved owner upload/removal, cross-user delete denial, and zero object remaining after cleanup. No real complaint was created or changed. |
| First-login password change | A randomly generated temporary staff fixture logged in with `must_change_password=true`. Missing/wrong current password, password reuse, and a weak password returned 400. A valid change cleared the flag, set `last_password_changed_at`, returned a refreshed session, rejected the old password, and accepted the new one. The fixture was deactivated, globally signed out, and deleted; database verification found zero remaining Auth users or profiles. |
| Password-reset privacy | An isolated local Auth-provider simulation confirmed that registered-looking and absent-looking addresses receive the same generic HTTP 200 response. Blank email returns 400. No email was sent. |

## Test-harness correction

The first report test script tried to SELECT notifications and DELETE QA rows through the runtime service role. Those permissions are deliberately absent; the verification/cleanup portion exited unsuccessfully. This was not proof that notification delivery failed. A read-only database connector query confirmed both report runs, next_run_at, and the notification. Exact teardown was then completed through the authorized connector, without expanding runtime grants. The local harness was corrected to inspect notifications as the report owner and to explicitly hand off exact IDs for connector cleanup; that revised harness was not rerun during this pass.

## Cleanup

Removed only the labelled QA account registry row, linked bill/import batch, ownership requests, report schedule/runs/notification, two approval fixtures, internal notice, and temporary Auth staff account. The temporary staff account had no sessions or assignments before removal. Normal audit/security history was retained.

Baseline customer billing count was verified back at six. These QA deletions are permanent test teardown, not changes to real customer/staff operational records.

## Build and test evidence

- `npm test`: **64 passed, zero failed** after adding provider request, phone normalization, bounded retry, duplicate-safe receipt-recording failure, and safe platform-summary coverage.
- `npm run lint`: passed.
- `npm run build`: passed; existing >500 kB main-chunk warning remains.
- `git diff --check`: passed.
- Combined `npm run verify` stopped at the source-integrity gate because pre-existing `.env` and `server/.env` files are present locally. Those files were not deleted, printed, or staged. Lint/build/tests were executed separately; do not label the combined command as passing.
- Unrelated deletions of `.env.example` / `server/.env.example` and edits to server package manifests remain untouched and excluded from this change.

## Still not verified / setup required

1. **Real email/SMS delivery:** the provider-backed worker, cron route, retry controls, and health UI are implemented. Provider credentials and a user-controlled test recipient are still required; no real external message was sent.
2. **Actual backup restoration:** no isolated restore destination or available pg_dump/pg_restore/psql/docker runtime was identified. Never restore over this live project for a test. Requires a dedicated non-production target and backup artifact, then schema/data/storage/auth recovery checks.
3. **Hosted latest-code verification:** Vercel inspection on September 7 showed production at `54f9bf07e724e943ca541a74870f4fe95dc57357` and a newer ready preview at `77077d2f9dda37e5f5f9ae6d5ac1ed14fa422611`. Neither contains all current local fixes. No push, promotion, or deployment was performed.
4. **Production scheduling:** local report runner/in-app notice passed, and both report and notification cron routes are configured in `vercel.json`; real hosted timed invocations and production `CRON_SECRET` configuration remain unverified.
5. **Failure coverage limits:** deterministic interrupted-save recovery and live Storage authorization passed, but no physical mobile-network interruption, recovery from a partially transferred Storage object, sustained load test, or exhaustive race testing of every mutable endpoint was executed.
6. **Credential workflows:** first-login password change and password-reset response privacy passed. Real password-reset email receipt still requires a controlled mailbox and approved delivery test.

## Source reference for security review

The lookup design preserves the existing general table access restrictions and keeps privileged credentials server-side, consistent with [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Photo cleanup uses the Storage API rather than direct SQL deletion and grants DELETE only when the authenticated owner ID and first path segment both match, consistent with [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) and [Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design).

The password tests follow Supabase's current guidance for current-password validation, refreshed sessions, and password-recovery links: [Password security](https://supabase.com/docs/guides/auth/password-security) and [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

The external-delivery migration was applied on September 8, 2026. Verification confirmed the claim function is `SECURITY INVOKER`, executable by `service_role`, and not executable by `anon` or `authenticated`. The post-migration Supabase security advisor reported one pre-existing warning: leaked-password protection is disabled. The new migration introduced no additional security-advisor finding.
