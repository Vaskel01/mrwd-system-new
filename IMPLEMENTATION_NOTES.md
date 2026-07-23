# Requested complaint/task improvements

Implemented in this version:

1. **Rejected complaint reason**
   - Admin rejection now requires a written reason.
   - The reason is stored on the complaint and shown to the customer.
   - Single and bulk rejection are supported.

2. **Undo rejected complaints**
   - Admins can undo a rejection from All Complaints, Assign Tasks, or the complaint details page.
   - Restored complaints return to `assigned` when a technician is already attached; otherwise they return to `pending`.

3. **Shared full complaint details page**
   - Customers, admins, and assigned maintenance personnel can open `/complaints/:id`.
   - Shows description, address/map, attached photo, assignment details, important dates, rejection reason, full task timeline, and customer feedback where applicable.

4. **Completed task details**
   - Completed maintenance tasks now have a button/card that opens their complete details and timeline.

5. **Clickable admin dashboard complaints**
   - Desktop and mobile recent-complaint entries redirect to the full details page.

6. **Search for every role**
   - Customer: My Reports search.
   - Maintenance: My Tasks search across active and completed tasks.
   - Admin: expanded All Complaints search and a new Assign Tasks search.

## Required database step

Before running/deploying this version, execute this file in Supabase SQL Editor:

`supabase/rejection-reason-and-restore.sql`

It adds `rejection_reason` and `rejected_at` to `public.complaints`.

## Second UI/QOL update

This revision also includes:

1. **Clear missing-photo state**
   - Complaint Details always includes an Attached Photo section.
   - When no image was submitted, it displays “No photo attached.”
   - Broken/unavailable image links display a separate loading-error message.

2. **Assign Tasks redesign**
   - Reworked into the same responsive table/mobile-card pattern as All Complaints.
   - Added queue summary cards, full search, priority/status/technician filters, sorting, reset controls, inline actions, bulk selection, bulk assignment, and bulk rejection.
   - Staff task links can open this page already filtered to one technician.

3. **Maintenance My Tasks redesign**
   - Reworked into a responsive complaint-style table and mobile cards.
   - Added active/completed/rejected/all summary views, advanced filters, sorting, quick status actions, map/address tools, admin instructions, and inline timeline updates.

4. **Wave headers**
   - Added the shared water-wave treatment to every in-app page header.

5. **Staff Accounts QOL**
   - Search, role filters, workload sorting, summary counters, refresh controls, mobile cards, technician task links, copy-email actions, workload/completion metrics, password show/hide, secure password generation, and temporary credential copying.

No additional database migration is required for this second UI/QOL update.

## Feedback visibility and Submit Complaint sizing update

- Completed complaint details now show customer feedback to administrators and the assigned maintenance personnel.
- Customers can still submit one rating and optional comment from their own completed complaint details.
- Staff see a clear "No customer feedback yet" state when nothing has been submitted.
- Run `supabase/feedback-staff-visibility.sql` in the Supabase SQL Editor so assigned maintenance personnel can read feedback under Row Level Security.
- The Submit Complaint page now uses the same available content width as the other portal tabs.
- Sidebar navigation items now share a consistent minimum height and non-wrapping label treatment.

## Classifier visibility and task UI refinement

- Customer-facing screens no longer display classifier results, scores, predicted categories, confidence, sentiment, matched terms, or classifier wording.
- Customer complaint API responses are also stripped of classifier fields and the computed priority, so the information is not merely hidden with CSS.
- Maintenance personnel receive only the final assigned category and Low/Medium/High priority needed for field work. They do not receive the numerical score, confidence, sentiment, matched keywords, or decision explanation.
- Administrators retain the complete classifier analysis for review, testing, and auditing.
- The four Submit Complaint phases now use an equal four-column grid with a uniform height.
- My Tasks now has one `Open Task` action per row/card. Status progression, copy-address, map, timeline, and work-note tools are located on the task details page.
- No new Supabase migration is required for these UI and API-response changes.

## Complete workflow and table-layout update

This revision completes the previously identified customer, admin, and maintenance workflow gaps.

### Customer
- Forgot/reset password pages and email flow.
- Editable and cancellable pending complaints.
- Reopen completed complaints that were not resolved.
- Printable/save-as-PDF complaint receipt.
- Search and pagination for report history.
- Profile editing and in-app notifications.

### Admin
- Public signup is forced to the customer role at the database trigger level.
- Staff activation/deactivation and password-reset email actions.
- Deactivation is blocked until a technician's active tasks are reassigned.
- Transactional reassignment keeps historical task records but permits only one current assignment.
- Reports, CSV export, print/PDF reporting, technician workload, and customer satisfaction summaries.
- Insert-only audit history and role-aware notifications.

### Maintenance personnel
- Assignment acknowledgement.
- ETA/work plan and materials recording.
- Required completion notes and proof photo.
- Cannot-complete, reassignment, and assistance requests.
- Availability/leave status in My Profile.
- Role-appropriate notifications and feedback viewing.

### Layout fixes
- Assign Tasks and My Tasks use fixed, responsive column widths inside horizontal scroll containers.
- Their action columns are sticky on the right, so buttons remain fully visible instead of being clipped.
- Both screens use one primary row action and pagination.

### Required migration
Run `supabase/complete-workflow-features.sql` after every earlier migration.

### Final hardening and display fixes
- Increased the sticky action-column width in **Assign Tasks** and **My Tasks**, removed nested fixed-width overflow, and kept one full-width primary row action.
- Added a restricted `visible_profile_names` database RPC so assigned maintenance personnel can see the real customer name without exposing unrelated customer profiles or email addresses.
- Inactive historical assignments are no longer treated as current after a complaint is reopened.
- Public/self-registration cannot request staff roles; duplicate staff email creation is rejected clearly.
- Direct status forcing is restricted: admins use assignment, rejection/restoration, and completion workflows; maintenance follows the valid task sequence.
- Notification badges now count all unread notifications, not only the first page.
- Supabase background token refreshes are synchronized with the Express API bearer token.
