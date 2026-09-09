# Demo maintenance assignment correction — September 7, 2026

User-approved data correction for `maintenance@demo.com` in the connected MRWD database. This is an account configuration repair, not a workflow or schema redesign.

- Before: `role=maintenance_personnel`, active and available, but department and division were null.
- After: department ECMD, division WDLCD. Role, staff position, supervisor, active flag, availability and credentials were not changed by the repair.
- Only this account's department/division fields were targeted. No other account or access policy was modified.
- Reproducible, guarded repair: `supabase/repairs/link_demo_maintenance_department.sql`. This is an explicitly invoked data repair, not an automatic schema migration. It refuses conflicting assignments or a different role; repeated execution after correction is a no-op.

## Verification

- Read-back confirmed ECMD/WDLCD and the existing dispatch function's assignee eligibility predicate returned true.
- `supabase/tests/demo_maintenance_assignment.sql` passed against the live database in a rollback-only transaction, without temporarily normalizing the profile. WDLCD dispatched to the actual demo account, Maintenance started and completed its task, and the customer submitted feedback.
- Assertions confirmed a resolved complaint, completed assigned task, feedback, and no WDLCD verification timestamp.
- Historical note: this September 7 run used a deliberately non-resolving test URL and therefore did not validate Storage. After the September 9 private-evidence hardening, the rollback SQL refuses fabricated paths and requires `qa.completion_photo_path` to name a real Maintenance-owned object under the `completion` folder.
- All QA complaint/task/feedback records were rolled back; the targeted cleanup check found zero remaining fixtures. The approved department/division correction persists.

## Earlier admin review and remaining limits

- User completed admin MFA manually. Dashboard, departments/access, staff accounts, audit history, announcements and system health loaded. No account creation, announcement publication or security-setting changes were tested.
- This historical database regression must not be presented as browser → API → private Storage validation. No separate real-photo browser journey has yet been recorded; current reruns of this SQL test require a genuine secure Storage fixture.
- Email/SMS sending remains blocked: the queue exists, but no sending worker was found in the project, no deployed Edge Functions were listed, and no database scheduler was present. The administration UI already states that a provider is not connected. No real delivery was attempted.
- No push or deployment was performed. Local changes for this correction are the repair SQL, rollback test SQL and this record only.
