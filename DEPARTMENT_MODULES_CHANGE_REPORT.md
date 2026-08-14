# Department Module Separation Report

Date: August 14, 2026

## Outcome

The previous shared staff workspace is separated into three page families and access modules. Access is based on the signed-in staff profile's department and operational position, not only on which sidebar links are visible.

## Access matrix

| Module | Accessible functions |
|---|---|
| Commercial Department | Complaint review, classifier evidence, priority overrides, complaint reports, customer-account registry, bulk billing import, important advisories, and archival requests |
| ECMD | Dispatch and reassignment, field operations, crews and manpower, shifts, service targets, overdue escalation, inventory, task resources, and official maintenance reports |
| System Administration | Cross-department dashboard, staff accounts, department assignment, independent approvals, final archival, delivery records, and audit logs |

System Supervisors and Managers retain cross-department oversight. A Department Staff account without a department or supervisor/manager position is intentionally restricted until assigned by a System Supervisor.

## Department pages

| Department | Canonical pages |
|---|---|
| Commercial Department | `/commercial/complaints`, `/commercial/reports`, `/commercial/accounts-billing`, `/commercial/service-advisories` |
| ECMD | `/ecmd/dispatch`, `/ecmd/field-operations` |
| System Administration | `/system/dashboard`, `/system/departments-access`, `/system/staff-accounts`, `/system/audit-log` |

Older `/admin/*` bookmarks redirect to the appropriate department page. They are compatibility redirects only and do not bypass capability checks.

## Enforcement added

- Capability-based frontend route protection and department-specific navigation.
- Capability middleware on the Express API for every administrative mutation and sensitive report.
- Department metadata returned with the authenticated profile and refreshed after sign-in.
- PostgreSQL capability function backed by `profiles.department_id`, `profiles.staff_position`, and `departments.code`.
- Row Level Security policies for department-owned records.
- Guard triggers that protect complaints, staff access fields, maintenance operations, inventory, shifts, escalations, and archival records from direct Data API bypass.
- Commercial-only classifier evidence and priority override controls.
- ECMD responses contain final category and operational priority but exclude score, sentiment, confidence, matched phrases, and classifier reasons.
- Department-aware notifications for complaint review and field escalation.
- Staff-account creation requires an explicit Commercial, ECMD, or System module.

## Required database step

Back up the Supabase database, then run:

1. `supabase/migrations/20260813110000_client_operations_expansion.sql` if it has not already been applied.
2. `supabase/migrations/20260814100000_department_module_access.sql`.

The department-access migration preserves the existing pre-department management account by assigning `manager` access to internal `admin` profiles that have neither a department nor a staff position. It does not grant that fallback to future accounts.

## Verification results

- ESLint: passed with no errors. Four existing React Hook Form compiler notices remain warnings only.
- Production build: passed; 212 modules transformed.
- Backend/core tests: 17/17 passed.
- Department capability-isolation tests: passed.
- Canonical terminology and distinct department-home-route test: passed.
- ECMD classifier-privacy test: passed.
- Backend syntax checks: passed.
- Classifier development checks: category 25/25 and priority 24/25. The single priority disagreement remains the documented score-60 boundary case.

## Deployment notes

- Sign out and sign back in after applying the migration so the profile contains the department relationship.
- Use **Staff Accounts** as a System Supervisor to assign each Department Staff account to Commercial Department Staff, ECMD Staff, or System Supervisor access.
- Real `.env` files and secrets remain local and are excluded from the delivered archive. `.env.example` files remain included.
- Apply and test the migration in a backup or staging Supabase project before the live project.
