# MRWD Terminology Audit

Audited: September 2, 2026

This audit covers navigation, page headings, filters, badges, analytics, help text, forms, notifications, timeline events, exports, and account-management screens.

## Canonical glossary

| Concept | Use | Avoid |
| --- | --- | --- |
| Service record | Complaint | Case, ticket, report |
| Person receiving service | Customer | Resident |
| Identifier | Complaint reference number | Complaint reference, reference number |
| On-site work | Field work | Field-work, maintenance work |
| Work summary | Completion notes | Maintenance notes, maintenance completion |
| Customer notices | Service advisories | Announcements |
| Internal staff notices | Announcements | Service advisories |
| Generated artifact | Report | Complaint, when referring to a service record |

## Organization and roles

| Level | Canonical term |
| --- | --- |
| Commercial department | Commercial Services Department |
| Commercial division | New Service Connection and Customer Care Division (NSCCCD) |
| Commercial role | Commercial Services Staff (NSCCCD) |
| Field department | Engineering, Construction and Maintenance Department (ECMD) |
| Field division | Water Distribution and Leakage Control Division (WDLCD) |
| Field staff role | ECMD Staff (WDLCD) |
| Assigned field role | Maintenance Personnel |
| Administration workspace | System Administration |
| Administration role | System Supervisor |

NSCCCD reviews incoming complaints and sends field-related complaints to WDLCD. WDLCD assigns field work and monitors progress. Assigned Maintenance Personnel resolve completed field work directly by submitting the required completion notes and photo evidence.

## Complaint statuses

| Stored value | Display label |
| --- | --- |
| `pending` | Pending review |
| `forwarded` | Sent to WDLCD |
| `assigned` | Assigned |
| `en_route` / `in_progress` | In progress |
| `blocked` | Needs attention |
| `awaiting_verification` | Resolved (legacy stored value mapped for backward compatibility) |
| `resolved` / `completed` | Resolved |
| `rejected` | Rejected |
| `cancelled` | Cancelled |
| `merged` | Merged |

“Mark field work complete” opens the dedicated completion report. A valid report with completion notes and the required clear photo marks the task **Completed** and the complaint **Resolved** immediately.

## Findings and fixes

### High impact

- Complaint statuses had different casing and wording across badges, filters, analytics cards, maps, audit details, notifications, and server timeline events. All of these now use the shared status glossary.
- Legacy verification wording was removed from the active workflow. Historical `awaiting_verification` records render as **Resolved** for backward compatibility.
- Server notifications distinguish NSCCCD review and WDLCD dispatch; completion notifications now state that assigned Maintenance Personnel resolved the complaint by submitting the required completion evidence.

### Medium impact

- Customer-facing complaint text sometimes used “report” or “case.” Those references now use **complaint**; report remains only for generated reporting artifacts.
- The customer notice page was called **Announcements**, while Commercial Services managed the same content as **Service advisories**. Customer-facing notices now use **Service advisories**; Maintenance Personnel continue to receive internal **Announcements**.
- Navigation and page titles had competing labels for Accounts & billing, Complaint analytics, Exports & schedules, and Field operations analytics. Their shared labels now come from the glossary.
- Role and audience labels now use the complete names for Commercial Services Staff (NSCCCD), ECMD Staff (WDLCD), Maintenance Personnel, and System Supervisor.

### Minor polish

- Availability labels now consistently use sentence case: **Available**, **Busy**, **On leave**, and **Off duty**.
- Identifier labels now use **Complaint reference number**.
- Field completion copy now uses **Completion notes**.
- A source-integrity rule now rejects known legacy variants before they can be merged.

## Source of truth

- Shared labels and formatters: `src/config/terminology.js`
- Writing rules: `docs/CONTENT_STYLE_GUIDE.md`
- Automated drift check: `scripts/check-source.mjs`
