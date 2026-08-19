# MRWD Complaint System — Production Runbook

## Scope

This release keeps the application limited to the MRWD complaint-management workflow and its supporting administration:

- Commercial Services Department
- Engineering, Construction and Maintenance Department (ECMD)
- Maintenance Personnel
- System Administration / System Supervisor

The release intentionally does **not** add SLA/response-time tracking, a Maintenance Personnel accept/reject step, or maintenance before/after completion-photo requirements.

## Deployment order

1. Back up the current database using the backup method available for the Supabase project and record the verification in the System Health page.
2. Confirm all earlier migrations through `20260814133000_operational_complaint_features.sql` are already applied.
3. Run `supabase/migrations/20260819100000_production_readiness_features.sql` in the target Supabase project.
4. Configure the server-only production environment variables listed below.
5. Deploy the API/frontend.
6. Sign in as the existing System Supervisor and complete authenticator MFA enrollment when prompted.
7. Verify System Health, staff access, Commercial Review, ECMD Dispatch, Maintenance Tasks, and one customer complaint from submission through resolution.

## Required environment variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

Server/API:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — production administration only; **server-side secret, never expose it in a `VITE_*` variable or browser code**.
- `CRON_SECRET` — random secret used to authenticate the scheduled-report runner.
- `PASSWORD_RESET_REDIRECT_URL`
- `CORS_ORIGIN` for local/non-same-origin deployments.

## Account security workflow

### System Supervisor

- System Supervisor accounts require authenticator MFA after this migration.
- On first sign-in after MFA becomes required, the app redirects the supervisor to MFA setup if no verified TOTP factor exists.
- Future sign-ins challenge for the 6-digit authenticator code before system capabilities are available.
- Staff creation, access changes, audit, recovery, and health modules remain System Supervisor-only.

### New staff accounts

New Commercial Services Staff, ECMD Staff, Maintenance Personnel, and System Supervisor accounts are marked `must_change_password = true`.

1. Supervisor creates the staff account with a temporary password.
2. Staff signs in with the temporary password.
3. The app redirects to My Account and requires a replacement password.
4. Only after the password change does normal module navigation continue.
5. A newly created System Supervisor must then enroll authenticator MFA.

### Password recovery

Use the existing Forgot Password flow or the System Supervisor's **Send password reset** action. A successful reset clears the first-login password-change requirement and records the security event.

### Disabling accounts

Use System Administration → Staff Accounts to deactivate an account instead of deleting its profile. This preserves audit and assignment history.

### Session response

From My Account, a staff user can sign out other sessions. Use this after suspected credential exposure or a password/security change.

## Complaint production workflows

### Commercial review

Commercial Services can:

- review and classify complaints;
- save personal queue views;
- select complaints for bulk actions;
- override priority with an audited reason;
- request additional customer information;
- merge true duplicate complaints before field work begins;
- add a Commercial → ECMD handoff note;
- watch important complaints;
- request archival of eligible closed records;
- use recent/watched records and global Quick Find.

### Customer information requests

Only one unanswered information request may remain open for a complaint at a time. The customer responds from Complaint Details. The response is retained in the complaint history and Commercial Services is notified.

### Duplicate merge

Only a duplicate complaint that is still `Pending` or `Forwarded to ECMD` and has no active maintenance task may be merged. The selected primary complaint must remain active. The merged record is retained as history and points to the primary complaint.

### ECMD operations

ECMD can:

- use saved dispatch views and bulk assignment/priority/watch actions;
- use workload-aware personnel recommendations;
- manage maintenance crews and individual members;
- record temporary crew substitutions;
- review the availability calendar;
- review assignment history;
- use maintenance note templates;
- monitor incidents/hotspots/recurring locations;
- verify Maintenance completion before a complaint becomes Resolved;
- generate or schedule Maintenance Workload reports.

### Maintenance Personnel

Maintenance Personnel continue the approved field workflow without an acceptance step. They update field-work status and submit completion notes. There is no required maintenance completion photo.

## Bulk actions

Bulk operations return an outcome per selected complaint. The UI keeps failed/skipped records selected so the user can correct them without reselecting everything. Review the returned reason when a record is skipped because its status changed or it is no longer eligible.

## Saved views, watchlist, and recent items

Saved views are private to the current account and module. Watchlists and recently viewed complaints are also personal. They do not change complaint ownership or assignment.

## CSV import procedure

For Commercial account/billing imports:

1. Select the CSV.
2. Choose **Validate File**.
3. Review duplicates, invalid values, missing account/customer links, and other row errors.
4. Download error rows if corrections are needed.
5. Only after validation passes, choose **Import Validated File**.

The server revalidates the CSV immediately before writing, so bypassing the preview does not disable validation.

## Reports and scheduled reports

Report types are separated by department:

- Commercial Services: Complaint Summary, Complaint Export, Customer Satisfaction
- ECMD: Maintenance Workload
- System Administration: Audit Summary

The database policy enforces the same separation as the API.

`vercel.json` contains a daily check for `/api/production/cron/run-reports`. The runner checks due weekly/monthly schedules, records the generated summary in the report archive, advances the next run, and notifies the schedule owner.

If scheduled reports stop running:

1. Open System Administration → System Health.
2. Confirm **Scheduled Reports** is configured.
3. Confirm both `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` exist in the production environment.
4. Check the deployment/function logs for the cron endpoint.
5. Use **Run Now** on a schedule to distinguish report-generation failure from cron invocation failure.

## Audit and security review

System Administration → Audit Log contains:

- Operational Audit: complaint changes, assignments, exports, staff administration, merge/archive actions, etc.
- Security Events: login success/failure, password/security activity, and related account events.

Use server-side filters for actor, action/event, record type, result, and date range.

Recommended periodic checks:

- unexpected failed logins;
- staff-access changes;
- complaint priority/assignment changes;
- bulk actions;
- exports;
- archive/restore actions;
- MFA/password activity.

## Archive and restore

Operational users never hard-delete complaints from the normal workflow.

1. Commercial Services requests archive for an eligible closed complaint.
2. System Administration handles the governance approval/archive workflow.
3. Archived complaints remain recoverable and auditable.
4. System Health → Archived Complaints can restore an archived record with a required reason.

The System Supervisor receives read access only to archived complaints for this recovery purpose; it does not grant access to active Commercial/ECMD operations.

## Internal announcements

System Administration can target internal notices to Commercial Services, ECMD, Maintenance Personnel, all staff, customers, or everyone. Commercial customer advisories remain separate from internal System Administration notices.

## Backup and recovery procedure

The **Backup Verification Register does not create a backup by itself.** It records that an external/managed backup or restore test was checked.

Recommended routine:

1. Verify the project's managed backup status where available.
2. Periodically create a logical database export appropriate to the deployment policy.
3. Record the check in System Health as `Supabase Managed`, `Logical Export`, or `Restore Test`.
4. Perform a restore drill in a non-production project/environment on a planned schedule.
5. Record whether the restore test was Verified, Warning, or Failed and include notes.

Before a risky schema release, confirm a recent recoverable backup/export and keep the prior application artifact available for rollback.

## System Health interpretation

System Health checks or reports:

- API process status/uptime;
- database reachability/latency;
- server-side Auth Admin/service-role configuration;
- Storage reachability when the service role is configured;
- scheduled-report secret/configuration state;
- staff count;
- billing/import batches needing attention;
- latest audit activity;
- latest recorded backup verification;
- recent security events;
- archived complaint recovery records.

A `not_checked` Storage state means the server-side service role is not configured; it does not necessarily mean Supabase Storage is down.

## Rollback notes

- Application rollback: redeploy the previous known-good frontend/API artifact.
- Database rollback should not be done by blindly deleting new tables/columns after they contain production records.
- If the migration must be reversed, first export the new production-readiness tables and assess dependent records.
- For emergency access after MFA configuration issues, fix the Auth/MFA enrollment/configuration rather than weakening department RLS or exposing the service-role key.

## Smoke-test checklist after deployment

- [ ] Customer can submit a complaint and recover/respond to an information request.
- [ ] Commercial account sees Commercial modules only.
- [ ] Commercial can save a view, watch a complaint, bulk-forward eligible complaints, and attach a handoff note.
- [ ] Commercial can merge a duplicate only before field work begins.
- [ ] ECMD account sees ECMD modules only.
- [ ] ECMD can assign/reassign Maintenance Personnel, manage crews, and use the availability calendar.
- [ ] Maintenance Personnel sees only assigned task workflow and can submit completion notes without an acceptance/photo requirement.
- [ ] ECMD can verify completion and resolve the complaint.
- [ ] Customer can leave resolution feedback.
- [ ] System Supervisor is challenged for MFA and can open Audit, Announcements, and System Health.
- [ ] CSV validation rejects a deliberately invalid file before import.
- [ ] Each department can create only its allowed scheduled-report type.
- [ ] System Supervisor can register a backup check and restore an archived complaint.

## Date and timezone convention

Operational date-only values use **Asia/Manila** calendar dates. This applies to availability/schedule dates, crew substitutions, manpower work dates, and report/export defaults. Keep this convention when adding future date-only fields so UTC conversion does not move an MRWD operational date backward or forward by one day.
