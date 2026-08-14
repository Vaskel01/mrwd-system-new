# MRWD Separate Department Workspaces — Change Report

Date: August 14, 2026

## Final scope

The project remains a **complaint management system**. The operational staff workspaces are intentionally separated into distinct login experiences:

1. **Commercial Services Staff**
2. **ECMD Staff**
3. **Maintenance Personnel**
4. **System Supervisor**

Commercial Services and ECMD are no longer presented as sections that a generic administrator can switch between. Each staff member is a separate Supabase Auth user and is assigned to the correct workspace when the System Supervisor creates the account.

## Login and workspace behavior

| Account type shown in Staff Accounts | Internal profile mapping | Home page | Workspace visible after login |
|---|---|---|---|
| Commercial Services Staff | `role=admin`, Commercial department, `staff_position=commercial_staff` | `/commercial/dashboard` | Commercial Services only |
| ECMD Staff | `role=admin`, ECMD department, `staff_position=department_staff` | `/ecmd/dashboard` | ECMD only |
| Maintenance Personnel | `role=maintenance_personnel`, ECMD department, `staff_position=crew_member` | `/maintenance/tasks` | Assigned maintenance tasks only |
| System Supervisor | `role=admin`, no operational department, `staff_position=supervisor` | `/system/dashboard` | System Administration only |

The existing database `role` constraint is deliberately retained for compatibility. Separation is enforced using separate Auth users, department membership, staff position, frontend/server capabilities, and PostgreSQL RLS/capability checks.

## Commercial Services module

Commercial Services staff receive their own sidebar and routes:

- `/commercial/dashboard`
- `/commercial/complaints`
- `/commercial/accounts-billing`
- `/commercial/service-advisories`
- `/commercial/reports`

They do **not** receive ECMD or System Administration navigation.

## ECMD module

ECMD staff receive their own sidebar and routes:

- `/ecmd/dashboard`
- `/ecmd/dispatch`
- `/ecmd/field-operations`

They do **not** receive Commercial Services or System Administration navigation.

## System Administration

System Supervisors receive only:

- `/system/dashboard`
- `/system/staff-accounts`
- `/system/departments-access`
- `/system/audit-log`

The System Supervisor dashboard is now account/access focused and no longer acts as a combined Commercial + ECMD operational dashboard.

## Staff account creation

The Staff Accounts form now has one direct **Account Type** selector instead of a generic role plus a second department/module selector. Available account types are:

- Commercial Services Staff
- ECMD Staff
- Maintenance Personnel
- System Supervisor

When an account is created, the application automatically applies the matching department and staff position. Each created staff record corresponds to a separate Supabase Auth login with its own email/password.

## Authorization changes

- System Supervisors no longer inherit Commercial or ECMD operational capabilities.
- Commercial Services capabilities are granted only to active admin-type staff assigned to `COMMERCIAL`.
- ECMD capabilities are granted only to active admin-type staff assigned to `ECMD`.
- Protected React routes and Express API routes use the same capability model.
- PostgreSQL `current_user_has_capability()` is updated so direct Data API/RLS access follows the same separation.
- Routine department notifications resolve to members of that department rather than System Supervisors.

## Required SQL migration

Run this migration after the existing department-access migration:

`supabase/migrations/20260814122500_separate_department_workspaces.sql`

This migration is required for the **database/RLS layer** to match the newly separated frontend and backend authorization model.

## Verification

- 86 JavaScript/JSX files checked: **0 syntax errors**.
- Relative import check: **0 missing imports**.
- Backend/core-feature test suite: **17/17 passed**.
- Server route syntax check: passed.

