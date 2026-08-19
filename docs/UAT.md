# User Acceptance Test Checklist

Run these checks after every fresh deployment.

## Authentication and access

- [ ] Customer can register and receives a Customer profile.
- [ ] Commercial Services Staff lands only in Commercial Services modules.
- [ ] ECMD Staff lands only in ECMD modules.
- [ ] Maintenance Personnel lands only in the assigned-task workspace.
- [ ] System Supervisor lands only in System Administration.
- [ ] System Supervisor is required to complete/authenticate with MFA.
- [ ] A Commercial account cannot open ECMD operational routes.
- [ ] An ECMD account cannot open Commercial operational routes.

## Customer → Commercial

- [ ] Customer submits a complaint with valid location and optional complaint photo.
- [ ] Complaint receives a human-readable reference number.
- [ ] Commercial sees the new complaint.
- [ ] Classifier result and priority are visible only to authorized staff at the intended detail level.
- [ ] Commercial can request additional information and Customer can respond.
- [ ] Commercial can override priority only with a reason.
- [ ] Commercial can forward the complaint to ECMD.

## ECMD → Maintenance

- [ ] Forwarded complaint appears in ECMD Complaint Dispatch.
- [ ] Maintenance availability/workload is visible to ECMD.
- [ ] ECMD can assign an eligible Maintenance Personnel account.
- [ ] Assigned task appears for that Maintenance Personnel account.
- [ ] Unassigned Maintenance Personnel cannot access the task.
- [ ] Maintenance can update field progress and submit completion notes.
- [ ] No task acceptance step or required completion photo appears.
- [ ] ECMD can verify completion and resolve the complaint.

## Reopen / duplicate / history

- [ ] Eligible resolved complaint can be reopened.
- [ ] Duplicate/related complaint controls retain traceable history.
- [ ] Complaint timeline records department and staff actions.
- [ ] Assignment/reassignment history remains visible.

## Commercial tools

- [ ] Billing/account CSV validates before import.
- [ ] Invalid rows are reported before writing.
- [ ] Reports/export filters work.
- [ ] Customer advisory publishing works.

## Production tools

- [ ] Saved views persist per user.
- [ ] Watchlist and Recent Complaints work.
- [ ] Bulk actions report skipped/failed records correctly.
- [ ] Crew management and availability calendar work for ECMD.
- [ ] System Supervisor can view audit/security events.
- [ ] Internal announcements respect audience.
- [ ] System Health detects API/database configuration.
- [ ] Backup verification can be recorded.
- [ ] Scheduled reports can be run manually.

## Responsive UI

- [ ] No desktop table requires horizontal page scrolling at normal laptop widths.
- [ ] Action button labels do not split inside words.
- [ ] Long addresses/statuses wrap without covering the sidebar.
- [ ] Mobile/card layouts remain usable.
