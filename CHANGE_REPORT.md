# MRWD Complaint Workflow Update

## Implemented

- Removed the complaint-description character limit while keeping a non-empty validation rule.
- Added human-readable complaint reference numbers and replaced visible internal IDs.
- Expanded Customer My Profile with account number, phone, barangay, and service address.
- Replaced automatic latest-announcement pinning with explicit Important notices.
- Removed Submit Complaint from the sidebar and added the action to My Complaints.
- Made Pending the default All Complaints view and sorted it by priority, then date.
- Reduced All Complaints row actions to one Open action.
- Added audited administrator priority overrides while preserving the classifier score.
- Simplified Maintenance Personnel My Tasks and added assignment dates.
- Standardized Customer, Administrator, and Maintenance Personnel terminology.
- Unified En Route and On Site as In Progress while keeping legacy `en_route` records readable.
- Prevented Leaflet maps from appearing above modals.
- Added customer completion acknowledgment with timeline, notifications, and audit history.
- Added classifier synonym and suggestive-phrase matching without double-counting one dataset entry.

## Database

Run this migration after the earlier project migrations:

`supabase/migrations/20260728152348_complaint_workflow_polish.sql`

It adds complaint references, customer profile fields, Important announcement state, priority-override metadata, and completion acknowledgments.

## Verification

- `npm run verify`: passed
- Production frontend build: passed
- ESLint: passed with two React Hook Form compiler advisory warnings and no errors
- Server JavaScript syntax: 17 files passed
- Automated backend/classifier tests: 10/10 passed
- Classifier development cases:
  - Category: 25/25
  - Priority: 24/25
  - One case scores exactly 60, which correctly maps to High under the documented thresholds

The build reports a non-blocking bundle-size advisory. Dependency installation reported four package advisories; no automatic breaking upgrade was applied.

## Security and packaging

Real `.env` files remain local and are ignored by Git. They are not included in the delivered archive. Only `.env.example` files are packaged.
