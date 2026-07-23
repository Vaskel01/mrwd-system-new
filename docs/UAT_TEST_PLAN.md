# MRWD User Acceptance and End-to-End Test Plan

Use a separate Supabase test project or test accounts. Record the actual result, tester, date, and evidence screenshot for every item.

## Prerequisites

1. Run every migration listed in `README.md`, ending with `complete-workflow-features.sql`.
2. Create one customer, two maintenance accounts, and one admin.
3. Give one technician `Available` status and the other `On Leave`.
4. Keep browser developer tools open to record unexpected API errors.

## Customer workflow

| ID | Test | Expected result |
|---|---|---|
| C-01 | Register a public account | Profile is created only as `customer`; no staff role can be selected. |
| C-02 | Use Forgot Password and open the email link | User reaches Reset Password and can sign in with the new password. |
| C-03 | Submit a complaint without a photo | Complaint saves and details show `No photo attached.` |
| C-04 | Edit a pending complaint | Type, description, and address update successfully. |
| C-05 | Cancel a pending complaint with a reason | Status becomes Cancelled and the reason remains visible. |
| C-06 | Try to edit or cancel after assignment | Action is unavailable and the API rejects a direct attempt. |
| C-07 | Search and paginate My Reports | Correct matching records and page counts appear. |
| C-08 | Print complaint receipt | Print preview omits navigation and includes complaint details/timeline. |
| C-09 | Reopen a completed complaint | Complaint returns to Pending and admins receive a notification. |
| C-10 | Submit feedback | One rating/comment is saved; duplicate feedback is rejected. |
| C-11 | Inspect the complaint API response | No priority score, keywords, confidence, sentiment, or predicted category is exposed. |

## Administrator workflow

| ID | Test | Expected result |
|---|---|---|
| A-01 | Create maintenance/admin accounts | Accounts are created with the selected staff role only through Staff Accounts. |
| A-02 | Deactivate staff with no active task | Login is blocked until the account is reactivated. |
| A-03 | Deactivate staff with an active task | System refuses and asks the admin to reassign active tasks first. |
| A-04 | Send staff password reset | Staff receives a reset email; action appears in the audit log. |
| A-05 | Assign a complaint | Exactly one current task exists; customer and technician are notified. |
| A-06 | Reassign the complaint | Old task becomes historical/inactive, new technician gets the current task, old technician loses active access. |
| A-07 | Reject and undo rejection | Reason is required; customer sees it; restore returns to Pending or Assigned correctly. |
| A-08 | Open Assign Tasks on laptop width | Action column remains visible; horizontal scrolling does not clip buttons. |
| A-09 | Open Reports and export CSV | Counts match records and CSV opens with correct columns. |
| A-10 | Print Reports | Browser print/save-PDF produces a readable report without navigation. |
| A-11 | Open Audit Log | Assignment, reassignment, rejection, staff, completion, and feedback actions are recorded. |
| A-12 | Review classifier | Full evidence is visible only to admin accounts. |

## Maintenance workflow

| ID | Test | Expected result |
|---|---|---|
| M-01 | Open My Tasks on laptop width | One `Open Task` button remains fully visible in every row. |
| M-01B | View an assigned task created by a real customer account | The customer name appears instead of `Unknown` when the profile exists. |
| M-02 | Acknowledge a task | Acknowledgement date and timeline entry appear. |
| M-03 | Move Assigned → En Route → On Site | Only valid next steps are accepted; invalid transitions are rejected. |
| M-04 | Save ETA and materials | Customer/admin details show the saved plan and timeline entry. |
| M-05 | Complete without notes/photo | Submission is blocked. |
| M-06 | Complete with notes, materials, and photo | Status becomes Completed and completion report/proof appear in details. |
| M-07 | Request additional assistance | Admin is notified and reason is visible without closing the assignment. |
| M-08 | Request reassignment | Task becomes Needs Attention; admin can reassign it. |
| M-09 | Report cannot complete | Task becomes Needs Attention and the reason is logged. |
| M-10 | Set On Leave in My Profile | Admin sees the availability and cannot select that technician for new assignment. |
| M-11 | Inspect complaint API response | Final category/priority are visible, but score, keywords, confidence, and reasoning are absent. |
| M-12 | View completed feedback | Assigned technician sees customer rating/comment or a clear empty state. |

## Data integrity checks

Run these in Supabase SQL Editor after assignment/reassignment testing:

```sql
-- Must return no rows: more than one current assignment for a complaint.
select complaint_id, count(*)
from public.maintenance_tasks
where is_active = true
group by complaint_id
having count(*) > 1;

-- Review current and historical assignment records.
select complaint_id, assigned_staff_id, status, is_active, created_at, superseded_at
from public.maintenance_tasks
order by complaint_id, created_at;

-- Verify every completed task has proof and resolution notes.
select id, complaint_id
from public.maintenance_tasks
where status = 'completed'
  and (completion_notes is null or completion_photo_url is null);
```

## Classifier evaluation

The included 25 cases are development checks. Final research results should use a separate, blinded set of 50–100 anonymized complaints labeled by MRWD personnel. Do not tune the dataset using the final test set.
