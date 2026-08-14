# Department Modules and Operations Guide

Run `supabase/migrations/20260813110000_client_operations_expansion.sql`, followed by `supabase/migrations/20260814100000_department_module_access.sql`. Complaint handling is divided between two operational departments, with System Administration retained only as a support and oversight workspace.

## Department access matrix

| Module | Intended accounts | Main functions |
|---|---|---|
| Commercial Services Department | Commercial Department Staff (`COMMERCIAL`) | Department dashboard, complaint review and classifier evidence, audited priority overrides, complaint reports, customer accounts/billing concerns, Important advisories, and archival requests |
| ECMD | ECMD Staff (`ECMD`) and assigned Maintenance Personnel | Department dashboard, complaint dispatch, crew and manpower management, shifts, service targets, escalations, inventory, field operations, and official maintenance reports |
| System Administration | System Supervisor (`Supervisor` or `Manager`) | Cross-department dashboard, departments and staff access, approvals, approved archival, delivery records, and audit logs |

The sidebar is only the visible navigation layer. The same separation is enforced by protected frontend routes, Express API capability checks, PostgreSQL triggers, grants, and Row Level Security policies. An unassigned Department Staff account receives no department capabilities until a System Supervisor assigns access. A System Supervisor retains cross-department oversight.

The two operational department page families are `/commercial/*` and `/ecmd/*`. `/system/*` is the supporting administration area, not another operational department. Older `/admin/*` links exist only as compatibility redirects and still pass through the destination page's capability checks.

## Departments, positions, crews, and team leaders

- Seeded operational departments: **Commercial Services Department** and **Engineering, Construction and Maintenance Department (ECMD)**. No Finance, Administrative Services, Production, HR, or other department module is part of this complaint system.
- A staff account keeps its internal security role (`admin` or `maintenance_personnel`) and may also receive an operational access designation such as System Supervisor, Commercial Department Staff, ECMD Staff, Team Leader, or Maintenance Crew member.
- Team Leader is an operational position, not a new authentication role. Access remains protected by the ECMD module and the existing Maintenance Personnel role.
- A Maintenance Crew can have one active Team Leader and multiple members. ECMD Staff may assign an individual Maintenance Personnel account, an optional crew, or both to a complaint.
- Staff schedules record date, shift start/end, availability, and notes. The available-staff list considers the current day's schedule.

## Service targets and escalations

- ECMD Staff define resolution targets in hours for Low, Medium, and High priorities.
- Assigning a complaint records its service-target due date.
- **Scan Now** identifies overdue active High Priority complaints and creates escalation records. The scan is intentionally triggered by ECMD Staff in this prototype; production automation requires a scheduled worker or cron job.
- ECMD Staff can acknowledge and resolve escalations, and each action is audited.

## Supervisor approval

- Sensitive actions create approval requests for an independent System Supervisor.
- The requester cannot approve their own request.
- Complaint archival uses this independent-approval workflow and performs a soft archive rather than deleting operational history.

## Customer account validation and billing imports

- Import the authorized customer account registry before expecting account-number validation to succeed.
- Customer account CSV columns: `account_number,registered_name,service_address,barangay,meter_number,is_active`.
- Billing CSV columns: `account_number,billing_period,previous_reading,current_reading,consumption,amount_due,due_date,status`.
- Imports return row-level errors so invalid account numbers or values can be corrected without hiding failures.
- Keep imported files free of unnecessary personal information and follow MRWD retention rules.

## Inventory, materials, equipment, and manpower

- ECMD Staff create inventory items and record stock adjustments.
- ECMD Staff and assigned Maintenance Personnel can record task manpower, materials, and equipment.
- Inventory usage uses an atomic database function so stock cannot fall below zero during concurrent updates.
- Official maintenance reports show the complaint, assignment, crew, progress, manpower, inventory usage, completion evidence, and customer acknowledgment, and can be printed or saved as PDF.

## Email and SMS notifications

- Customers and staff can opt into email and SMS delivery in **My Profile**.
- The database queues eligible notification deliveries and records their status.
- Actual sending is not enabled until MRWD selects an approved provider, supplies credentials, verifies sender identities, confirms consent wording, and deploys a secure delivery worker. In-app notifications continue to work without an external provider.

## Items requiring MRWD confirmation

Before formal deployment, obtain written confirmation for:

1. Official complaint-category names, including whether **No Water** is the approved replacement for Water Interruption.
2. Which department owns complaint monitoring, dispatch, reports, billing imports, and complaint closure.
3. Team Leader authority, crew membership rules, shift rules, and whether multiple crews may be assigned to one complaint.
4. Official Low/Medium/High service targets and escalation recipients.
5. Which actions require supervisor approval and who may act as a backup System Supervisor.
6. Customer account-number format and authoritative account source.
7. Billing CSV format, import frequency, correction process, and retention rules.
8. Inventory units, stock-adjustment approval, and whether the current billing or inventory systems expose an integration interface.
9. Email/SMS provider, cost owner, consent language, message templates, and delivery hours.
10. Archival retention period and legal access requirements.
11. Official maintenance-report format, signatories, and required report number.
12. Classifier phrases, weights, severity values, and test labels. The current dataset is domain-informed but not yet formally MRWD-validated.
