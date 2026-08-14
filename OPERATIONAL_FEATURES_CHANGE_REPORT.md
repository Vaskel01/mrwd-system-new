# MRWD Complaint System — Production Operational Features Update

Date: August 14, 2026

## Scope

This update keeps MRWD as a complaint management and maintenance task assignment system with two operational department workspaces:

- Commercial Services
- Engineering, Construction and Maintenance Department (ECMD)

Maintenance Personnel remain separate field accounts, while System Administration remains separate from both operational departments.

## Explicit exclusions

The following are intentionally NOT part of the active workflow:

- Response-time / SLA tracking
- Maintenance accept / acknowledge / reject-assignment flow
- Required before-and-after maintenance evidence or completion photos

The customer's original complaint attachment/photo remains supported because it is part of complaint submission, not maintenance completion evidence.

## New operational workflow

Customer submission → Commercial review → Forward to ECMD → ECMD dispatch → Maintenance work → Maintenance completion notes → Awaiting ECMD verification → ECMD verifies → Resolved

A resolved complaint can be reopened by the customer and returns to Commercial review.

## Implemented features

### 1. Complaint timeline / activity history
- New `complaint_events` table.
- Records submission, forwarding, assignment/reassignment, priority changes, field progress, completion, verification, reopening, internal actions, and incident grouping.
- Stores actor, department, timestamp, message, and customer-visibility flag.
- Customer sees only customer-visible timeline events; operational staff can see the full timeline allowed by RLS.

### 2. Explicit Commercial → ECMD handoff
- Commercial gets a dedicated **Forward to ECMD** action.
- Complaints must be forwarded before ECMD can dispatch them.
- Forwarding creates timeline/audit entries and department/customer notifications.
- Commercial can see the later complaint progress but ECMD owns the field workflow after handoff.

### 3. ECMD Dispatch Board
- Dedicated board view grouped into:
  - Ready for Dispatch
  - Assigned
  - In Progress
  - Needs Attention
  - Awaiting Verification
- Search and priority filters.
- Map/board toggle.
- Direct assignment and reassignment.

### 4. Maintenance workload and availability
- ECMD sees availability, active-task count, and blocked-task count per Maintenance Personnel account.
- Available personnel with the lowest active workload are surfaced first as recommended choices.
- On Leave / Off Duty personnel cannot be selected for assignment.
- Maintenance Personnel can continue managing their own availability from My Account.

### 5. Operational priority override with reason
- Commercial retains classifier-score review and can override the numeric operational score with an audited reason.
- ECMD can change Low / Medium / High operational priority after handoff when field conditions require it.
- ECMD does not receive the classifier's internal evidence/score breakdown.
- Priority changes are recorded in the timeline and audit log.

### 6. Duplicate complaint detection
- Possible duplicates use complaint category, submission window, GPS proximity when available, and normalized address similarity.
- GPS detection uses an approximately 250-meter proximity threshold.
- Related candidates can be linked persistently instead of remaining only a temporary warning.

### 7. Related complaints and incident grouping
- New `complaint_relations`, `complaint_incidents`, and `complaint_incident_members` tables.
- Complaints can be linked as possible duplicates, duplicates, related complaints, or the same incident.
- ECMD can group multiple complaints into one operational incident while preserving each customer's complaint record.
- Incident status supports Active, Monitoring, and Resolved.

### 8. Map-based complaint operations
- New ECMD operational map using the existing Leaflet/OpenStreetMap approach.
- Shows active complaint locations and supports opening complaint details from a marker.
- Used by the Dispatch Board and Field Operations page.

### 9. Structured complaint reassignment
- Reassigning to another Maintenance Personnel account requires a standard reassignment reason.
- Reason codes include personnel unavailable, workload balancing, different expertise, and location reassignment.
- The reason is captured in assignment notes, timeline metadata, and the audit trail.

### 10. Complaint reopening
- A customer can reopen a resolved complaint with a required explanation.
- The previous active maintenance assignment is retired from the active task list.
- The complaint returns to Commercial review and both timeline/audit records are created.

### 11. ECMD completion verification
- Maintenance Personnel do not close complaints directly.
- Maintenance submits completion/resolution notes.
- Complaint becomes **Awaiting ECMD Verification**.
- ECMD can:
  - Verify and resolve the complaint, or
  - Return it for additional field work with an explanation.
- Customer and department notifications are created at each stage.

### 12. Completion / resolution notes
- Maintenance completion requires text resolution notes.
- Materials/work notes remain optional.
- No completion photo is required or uploaded.
- ECMD may add final verification notes.

### 13. Internal staff notes
- New `complaint_internal_notes` table.
- Commercial and ECMD can add department-attributed internal notes.
- Internal notes are not customer-visible.

### 14. Customer communication log
- New `customer_contact_log` table.
- Commercial/ECMD can record Phone, SMS, Email, In-System, In-Person, or Other communication.
- Supports outbound, inbound, status update, information request, and follow-up classifications.

### 15. Standard reason codes
- New `complaint_reason_codes` table.
- Used for Commercial rejection/closure reasons, ECMD reassignment reasons, ECMD resolution verification, return reasons, and complaint relations.
- Commercial rejection UI supports a standard reason plus optional customer-visible details.

### 16. Department-specific notifications
- Commercial forwarding notifies ECMD and the customer.
- ECMD assignment/reassignment notifies Maintenance Personnel and the customer.
- Maintenance completion notifies ECMD and the customer.
- ECMD verification notifies the customer and Commercial.
- Reopening notifies Commercial.
- Maintenance field issues notify ECMD.

### 17. Complaint hotspot analysis
- ECMD Field Operations summarizes active complaint volume by area.
- Highlights high-priority, leak-related, and no-water/interruption complaints.

### 18. Recurring location problems
- Field Operations identifies addresses with multiple complaint records.
- Helps ECMD see repeat problems instead of treating every complaint as unrelated.

### 19. Daily operational dashboards

#### Commercial Dashboard
- Pending Review
- Forwarded to ECMD
- Billing-related complaints
- Resolved Today
- High-priority/reopened attention items

#### ECMD Dashboard / Field Operations
- Received / Forwarded
- Unassigned
- Active Field Work
- Awaiting Verification
- Resolved Today
- Maintenance availability/workload
- Hotspots
- Recurring locations
- Operational incidents
- Active complaint map

## Database migration

New migration:

`supabase/migrations/20260814133000_operational_complaint_features.sql`

Run it AFTER:

`supabase/migrations/20260814122500_separate_department_workspaces.sql`

The migration adds the operational tables, fields, reason codes, RLS policies, department-change guard updates, and the stricter ECMD dispatch RPC.

Legacy service-target columns/tables from an older migration are left in the schema for compatibility, but the active complaint application no longer uses the service-target/escalation APIs or UI.

## Verification performed

- 89 JS/JSX source/test files parsed: **0 syntax errors**
- Relative imports checked: **0 broken relative imports**
- Server JavaScript syntax checks: **passed**
- Backend test suite: **16/16 passed**
- Search for excluded active feature references: **none found**
- Connected MRWD Supabase prerequisites checked: capability function, existing dispatch RPC, legacy compatibility columns, and maintenance assignment-history columns are present.
- The new migration was NOT applied to the live MRWD database during this update; it is packaged for controlled execution in Supabase SQL Editor.

A full Vite/ESLint build was not rerun because project `node_modules` are not available in the working package environment. Static JSX/JS parsing, import resolution, Node syntax checks, and backend tests were used for verification.
