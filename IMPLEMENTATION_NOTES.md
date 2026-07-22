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
