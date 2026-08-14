# Complaint-System Department Modules Report

Date: August 14, 2026

## Corrected scope

The MRWD project remains a **complaint management system**. It has only **two operational department modules**:

1. **Commercial Services Department**
2. **Engineering, Construction and Maintenance Department (ECMD)**

System Administration is retained only for access control, staff accounts, audit records, and cross-department supervision. It is not treated as a third operational department. Customer and Maintenance Personnel pages are also retained because they are part of the complaint lifecycle.

## Department access matrix

| Department | Complaint-system responsibilities |
|---|---|
| Commercial Services | Department dashboard, complaint review and validation, classifier evidence, priority review/override, customer-account and billing concerns, service advisories, complaint reports, and archival requests |
| ECMD | Department dashboard, complaint dispatch/reassignment, field operations, crews/manpower, service targets, escalations, inventory/resources, task completion, and maintenance reports |

System Supervisors and Managers retain cross-department oversight. Ordinary Department Staff receive only the pages for their assigned department.

## Department pages

| Department | Canonical pages |
|---|---|
| Commercial Services | `/commercial/dashboard`, `/commercial/complaints`, `/commercial/accounts-billing`, `/commercial/service-advisories`, `/commercial/reports` |
| ECMD | `/ecmd/dashboard`, `/ecmd/dispatch`, `/ecmd/field-operations` |
| System support | `/system/dashboard`, `/system/departments-access`, `/system/staff-accounts`, `/system/audit-log` |

The new department dashboards summarize live complaint records and link only to tools that belong to the complaint-management workflow.

## Commercial Services dashboard

- Pending complaints needing review
- Active High-priority complaints
- Billing/account-related complaint count
- Completed complaint count
- Quick access to Complaint Review, Accounts & Billing, Service Advisories, and Complaint Reports
- A live **Needs Commercial Attention** list

## ECMD dashboard

- Unassigned dispatch queue
- Active field work
- Blocked complaints needing attention
- Completed complaint count
- Quick access to Complaint Dispatch and Field Operations
- A live **Needs ECMD Attention** list

## Access behavior

- Commercial Services staff land on `/commercial/dashboard` after sign-in.
- ECMD staff land on `/ecmd/dashboard` after sign-in.
- System Supervisors continue to land on `/system/dashboard` and may access both department modules for oversight.
- Maintenance Personnel continue to use `/maintenance/tasks` for assigned complaint work.
- Customers continue to use the customer complaint pages.

## Database scope

No Finance, Administrative Services, Production, HR, accounting, water-quality, or generic department-work tables were added.

The existing department-access migration remains the relevant migration:

1. `supabase/migrations/20260813110000_client_operations_expansion.sql` if it has not already been applied.
2. `supabase/migrations/20260814100000_department_module_access.sql`.

There is **no full-department-workspace migration** in this corrected project.

## Verification

- Parsed all project JavaScript/JSX source files: **94 files, 0 syntax errors**.
- Confirmed the corrected archive contains no Administrative Services, Finance Services, Production Department, or generic department-workspace implementation.
- Backend complaint workflow and database logic are unchanged from the department-separated source version; this correction only adds the two complaint-focused department dashboards and navigation/home routing.
