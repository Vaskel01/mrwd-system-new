# MRWD Complaint Workflow Update

## Implemented

- Removed the complaint-description character limit while keeping a non-empty validation rule.
- Added human-readable complaint reference numbers and replaced visible internal IDs.
- Expanded Customer My Profile with account number, phone, barangay, and service address.
- Replaced automatic latest-announcement ordering with explicit Important notices.
- Removed Submit Complaint from the sidebar and added the action to My Complaints.
- Made Pending the default Complaint Review view and sorted it by priority, then oldest filing date within each priority group.
- Reduced Complaint Review row actions to one Open action.
- Added audited Commercial Department priority overrides while preserving the classifier score.
- Simplified Maintenance Personnel My Tasks and added assignment dates.
- Standardized Customer, Commercial Department Staff, ECMD Staff, System Supervisor, and Maintenance Personnel terminology.
- Unified En Route and On Site as In Progress while keeping legacy `en_route` records readable.
- Prevented Leaflet maps from appearing above modals.
- Added customer completion acknowledgment with timeline, notifications, and audit history.
- Added classifier synonym and suggestive-phrase matching without double-counting one dataset entry.

## Follow-up usability and accountability updates

- Added a prominent **How to settle your bill** panel beside unpaid/overdue billing information. It directs customers to the MRWD cashier or authorized payment center and avoids publishing unverified digital-payment details.
- Added filing-date scoping to Reports with **This Month**, **Last 30 Days**, and **This Quarter** presets. Summary cards, charts, workload measures, feedback measures, and CSV exports use the selected date range.
- Confirmed that Important announcements respect the active category filter.
- Added a dismissible active service-interruption banner across Customer pages to reduce duplicate reports during announced outages.
- Replaced the Audit Log's silent 500-row cap with server-side pagination, exact totals, date filters, and visible paging. High-stakes, review-needed, and routine actions now use distinct badges.
- Added authenticated in-app password changes to My Profile with current-password verification, audit logging, an eight-character letter-and-number policy, and a strength meter.
- Reused each Customer's saved service address in Submit Complaint while keeping GPS and map pinning available for issues at another location.
- Added clear purpose panels to distinguish **Complaint Review** (records and review) from **Complaint Dispatch** (dispatch and batch assignment).
- Standardized the Complaint Dispatch purpose panel to the same white card treatment used by Complaint Review.
- Reorganized Staff Accounts into five readable columns, combined related account and workload information, and restored one **Manage** action per row.
- Reworked Maintenance > My Tasks into five task-focused columns on larger screens and clean cards below the desktop breakpoint, eliminating the narrow seven-column layout and page-level horizontal overflow.
- Rebuilt the System Dashboard around morning triage: removed repeated counters, added Today/This Week/All Time statistics and a today-versus-yesterday filing trend, combined unassigned work with live Maintenance Personnel availability, and separated urgency-sorted **Needs Attention** records from the non-duplicated **Recently Filed** feed.
- Standardized the dashboard Operational Overview cards to the compact rounded-card design used by Complaint Dispatch.
- Fixed Customer My Profile persistence by introducing a dedicated customer-profile RPC, normalizing and verifying the stored account number, phone, service address, and barangay before reporting success, and refreshing the authoritative profile state after saving.
- Changed Complaint Dispatch notices to fixed overlays to prevent page jumps.
- Completed Complaint Dispatch URL state for view, search, priority, status, Maintenance Personnel, sort, and page. Reset Filters now returns to the Unassigned dispatch view.
- Added quick task acknowledgment from Maintenance > My Tasks without removing access to the full task details.
- Added service-advisory editing with preserved author/original posting date, audit history, optional **Active Until**, automatic customer/staff hiding after expiry, and a Commercial Department-visible Expired state.
- Kept the original MRWD navy/gold palette, wave headers, role layouts, terminology, and existing complaint workflow behavior.

## Interface and accessibility

- Preserved the established MRWD navy, blue, gold, and water-themed palette.
- Preserved the original wave headers, split authentication pages, typography, badges, and page layouts.
- Extended the page headers' navy pattern to the primary sidebar and anchored one matching layered water-wave treatment at its bottom.
- Replaced the login information panel's decorative bubbles with three subtle animated water layers contained within its lower 35%, including reduced-motion support.
- Refined the login water artwork with clearer independent wave motion, a restrained gold crest, and gentle pointer-following parallax. The moving layers now meet a divider-anchored impact shape instead of forming a clipped circular loop. A rising crest, irregular white foam, and localized spray make the wave visibly crash against the white login panel before receding. The earlier sweeping shine and cursor glow remain removed. Feature rows retain a small hover response, while reduced-motion users receive a static treatment.
- Replaced decorative emoji with a consistent stroke-based SVG icon system and accessible labels.
- Kept the conventional topbar notification bell and removed the duplicate sidebar destination.
- Added priority-band help and a visual base/dataset/sentiment/photo score composition diagram for Commercial Department Staff and System Supervisors.
- Made completed complaint-submission steps directly navigable and clarified that reverse-geocoded addresses remain editable.
- Made Saved Address, Device Location, and Map Pin equal first-class location choices with one consistent selected treatment, while showing the confirmed address only in the address field.
- Added subtle high-priority/pending emphasis, active-filter counts, and a single clear table-row action.
- Simplified Maintenance Personnel task actions into one dominant next step, location tools, and a More actions disclosure.
- Preserved complaint, task, and staff filters in the URL so browser Back returns users to the same working view.
- Standardized the Complaint Review filter panel to the same search-and-dropdown layout used by the task lists.
- Added optional refresh notices to complaint lists/details instead of silently replacing data while a user is working.
- Added paginated notifications with per-item dismissal and account-scoped deletion security.
- Added a visible masked/reveal fallback for temporary staff passwords when clipboard access is unavailable.
- Added a keyboard-accessible “Skip to main content” link and visible gold focus indicators.
- Added accessible navigation, pagination, loading, error, badge, and dialog labels without changing their visual design.
- Added reduced-motion support for users who request it through their operating-system settings.
- Kept Leaflet maps below dialogs and modal backdrops.
- Added shared width constraints to the application shell, top bar, main content, and footer so long child content cannot widen the page.
- Made filter panels stack cleanly on narrow phones and reduced page-header padding below the small-screen breakpoint.
- Kept dense operational tables for true desktop widths and automatically switched Complaint Review, Complaint Dispatch, Staff Accounts, Audit Log, Complaint Reports, and My Tasks to readable cards on tablets and sidebar-width laptops.
- Made announcement actions and Staff Accounts dialogs wrap, scroll, and remain fully reachable on small screens.

## Database

Run these migrations after the earlier project migrations, in this order:

`supabase/migrations/20260728152348_complaint_workflow_polish.sql`

`supabase/migrations/20260729101153_notification_cleanup_policy.sql`

`supabase/migrations/20260729193000_announcement_lifecycle.sql`

`supabase/migrations/20260729204500_fix_customer_profile_persistence.sql`

`supabase/migrations/20260729210000_harden_profile_update_access.sql`

They add complaint references, customer profile fields, Important announcement state, priority-override metadata, completion acknowledgments, user-scoped notification dismissal, the announcement lifecycle fields, verified Customer profile saving, and least-privilege profile-update access.

## Verification

- `npm run verify`: passed
- Production frontend build: passed
- ESLint: passed with three React Hook Form compiler advisory warnings and no errors
- Server JavaScript syntax: 19 files passed
- Automated backend/core-feature tests: 12/12 passed
- Responsive browser audit: 100/100 route-and-viewport combinations passed at 320, 375, 768, 1024, and 1366 pixels with no page-level horizontal overflow or off-screen form controls
- Mobile Staff Accounts dialog check: passed at 320 × 700, including the taller Maintenance Personnel action dialog
- Login motion check: passed in the production preview at the reported 1882 × 957 viewport; the impact stays flush with the white-panel divider, its foam ribbon remains attached to the rising crest, localized spray is visible during impact, and the old circular tail is gone. No cursor glow or sweeping shine remains, and reduced-motion disables both animation and pointer response
- Original split authentication design, MRWD navy/gold palette, wave styling, and responsive form layout were preserved
- Classifier development cases:
  - Category: 25/25
  - Priority: 24/25
  - One case scores exactly 60, which correctly maps to High under the documented thresholds

The build reports a non-blocking bundle-size advisory. Dependency installation reported four package advisories; no automatic breaking upgrade was applied.

## Security and packaging

Real `.env` files remain local and are ignored by Git. They are not included in the delivered archive. Only `.env.example` files are packaged.

## Client operations expansion — August 13, 2026

- Renamed the complaint category **Water Interruption** to **No Water** while retaining the previous wording as a classifier synonym.
- Added separate Commercial Department and ECMD records, operational staff positions, supervisors, Team Leaders, maintenance crews, crew membership, and optional crew assignment.
- Added staff schedules and shift-aware availability.
- Added ECMD-defined Low/Medium/High service targets, assignment due dates, overdue High Priority scanning, escalation acknowledgment, and resolution.
- Added independent approval requests for sensitive actions; complaint archival requires approval by someone other than the requester.
- Added customer account-registry import and account-number validation.
- Added bulk billing CSV import with row-level validation results.
- Added inventory items, stock adjustments, task materials/equipment usage, manpower records, and atomic stock deduction.
- Added a printable official maintenance report with assignment, crew, manpower, inventory, completion evidence, and customer acknowledgment.
- Added email/SMS opt-in preferences and an external delivery queue. Actual sending intentionally remains disabled until MRWD provides an approved provider and credentials.
- Added monthly filed-versus-completed reporting to the existing date-scoped Reports page.
- Expanded the classifier from 129 to 149 entries with additional synonyms, suggestive symptoms, and commonly used Filipino/Hiligaynon phrases.
- Added operational tools for departments/crews, shifts/targets, imports, inventory, approvals, and archival controls; these tools are now separated into Commercial Department, ECMD, and System Administration pages.

### Required migration

Run `supabase/migrations/20260813110000_client_operations_expansion.sql` after migration 15. Review and back up the database before applying it.

### Boundaries requiring client confirmation

- Official complaint-category terms and classifier weights remain subject to MRWD review.
- Default service targets are provisional until MRWD approves them.
- Email/SMS delivery needs a selected provider, credentials, verified sender, consent language, and a deployed worker.
- The prototype uses controlled CSV import because no authorized legacy billing/account integration interface was supplied.
- Archival is a reversible soft archive; retention and deletion policies require MRWD approval.

### Final verification for this expansion

- ESLint: passed with no errors; three pre-existing React Hook Form compiler advisories remain warnings only.
- Production build: passed (200 modules transformed).
- Backend/core-feature tests: 14/14 passed.
- Classifier development checks: category 25/25; priority 24/25. TC-016 remains High at the documented exact score boundary of 60.
- Browser verification: Operations, Reports, My Profile, and Official Maintenance Report passed at 1366 × 900 and 375 × 812, with no error overlays, console errors, or page-level horizontal overflow.
- Updated classifier workbook: 149 entries, 25 test cases, no formula-error values, and visually checked Summary, Dataset, and Test Cases sheets.
- Environment files remain present locally and are excluded from the archive.

## Department module separation — August 14, 2026

- Replaced the shared staff workspace with distinct Commercial Department, ECMD, and System Administration page families and navigation groups.
- Restricted complaint classification, priority overrides, reports, billing, announcements, and archival requests to the Commercial Department.
- Restricted dispatch, crews, manpower, schedules, service targets, escalations, inventory, field updates, and maintenance reports to ECMD.
- Restricted cross-department dashboard access, staff-account management, department assignment, independent approvals, final archival, and audit logs to System Supervisors.
- Added capability enforcement to protected React routes and Express endpoints; hiding a sidebar link is no longer the only control.
- Added PostgreSQL capability checks, guarded update triggers, grants, and RLS policies so direct Data API requests cannot bypass department ownership.
- Limited ECMD complaint responses to the final operational category and priority; classifier scores, evidence, sentiment, and matched phrases remain Commercial/System-only.
- Updated Staff Accounts so every new administrative account is explicitly assigned to Commercial, ECMD, or System Supervisor access.
- Routed complaint-review notifications to Commercial and field/escalation notifications to ECMD, with compatibility fallback while the migration is pending.

### Required migration

Run `supabase/migrations/20260814100000_department_module_access.sql` after `20260813110000_client_operations_expansion.sql`. Back up the database first. Existing unassigned internal `admin` profiles are promoted to System Supervisor during this migration so the current management account is not locked out; future unassigned Department Staff accounts are intentionally restricted.

### Verification

- Production build: passed (201 modules transformed).
- ESLint: passed with no errors; four existing React Hook Form compiler advisories remain warnings only.
- Backend/core-feature tests: 16/16 passed, including capability isolation and ECMD classifier-privacy checks.
- Backend route syntax checks: passed.
