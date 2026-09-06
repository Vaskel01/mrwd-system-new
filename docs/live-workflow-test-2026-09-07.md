# Live complaint workflow test — September 7, 2026

Engineering verification using the supplied demo accounts, local frontend at `http://localhost:5175`, local API at port 4010, and the connected Supabase project. This is not client acceptance, a real service complaint, or questionnaire evidence.

## Result

The live customer → Commercial → WDLCD → Maintenance → customer feedback journey passed after correcting a handoff-note persistence defect. The completion photo was actually uploaded to Storage and rendered in both the Maintenance and Customer sessions. Requests were not mocked.

| Boundary | Evidence |
| --- | --- |
| Customer submission | Browser displayed “Complaint submitted” and reference `MRWD-2026-000001`; database status was pending. |
| Commercial handoff | Status became forwarded. Initial test revealed the note was only written to history, not `commercial_handoff_note`. After the fix and a scoped QA-only reset to pending, the repeated browser handoff saved the note and displayed it in complaint details. |
| WDLCD dispatch | Browser selected Michael Schumacher; saved active task `1491c0bc-553d-4167-aecc-a9fa0dedc959` belonged to `maintenance@demo.com`. |
| Maintenance receipt | My tasks showed the assignment and instructions. Opening the “New maintenance task” notification opened the correct complaint and cleared its unread indicator. |
| Start work | Field actions changed from “Start work” to “Mark field work complete”; status became in progress. |
| Required photo | With completion notes but no file, “Complete and resolve” remained disabled. Attaching the QA PNG enabled completion. |
| Actual Storage upload | Uploaded a 960×540 PNG, 12,032 bytes, clearly labelled “QA TEST ONLY” and “No real field work performed.” The saved object was under the signed-in Maintenance user's completion folder. |
| Direct resolution | Database read-back confirmed complaint resolved, task completed, completion notes and photo URL saved, and `verified_at` null. No WDLCD verification step was used. |
| Customer notification/photo | Customer's All updates view included “Complaint resolved.” Opening it showed the resolution report; the image had `complete=true` and `naturalWidth=960`. |
| Feedback | Browser displayed the submitted 5/5 QA-only feedback; database confirmed the exact labelled comment and rating. This fabricated test rating was removed afterward and must not be counted as an evaluation response. |

## Fix and checks

- The single-complaint `PATCH /complaints/:id/forward-to-ecmd` route omitted `commercial_handoff_note`, unlike the existing bulk-handoff route. It now uses `buildCommercialHandoff` to persist the trimmed note alongside routing metadata and clear any rejection fields.
- Two added regression tests cover populated and blank/omitted notes. `npm test`: 39 passed, 0 failed.
- `npm run lint`: passed. `npm run build`: passed; existing bundle-size warning remains.
- The local API restart initially lacked the test origin and outbound network permission. Restoring `CORS_ORIGIN=http://localhost:5175` and authorized network access restored browser sign-in. No passwords or authentication settings were changed.

## Cleanup

- Temporary complaint ID: `60f0cace-bca3-4fc8-8267-b8f7c61d7049`. The description and address were prominently marked `QA ONLY - E2E-20260907`.
- Removed exactly the uploaded QA object through the Storage API, not by deleting Storage metadata directly.
- Deleted only this resolved QA complaint after checking its ID and description; existing foreign-key cascades removed its tasks, feedback, notifications/deliveries and related operational records.
- Final exact-target queries returned zero QA complaints, tasks, feedback, notifications and Storage objects. Normal login/security and audit history were retained. Reference numbering was not reset or reused.
- Browser screenshot evidence of the saved completion report and QA feedback was captured in the task before cleanup. Local QA image/generator/guarded teardown script are in the Codex artifact workspace under `outputs/live-qa`, not application assets.

## Limits and follow-up observations

- Email/SMS delivery remains untested and blocked by the missing sending provider/worker. No external recipient messages were sent.
- This verifies one successful live journey and the missing-photo UI gate, not every failure mode or a security certification. Earlier rollback and simulated-failure tests remain documented separately.
- Customer notification defaults put assignment/handoff messages in “Action needed,” while resolution appears under “All updates.” Those labels could be refined; the resolution notification itself arrived and opened correctly.
- Customer details show “Priority: Not set” because priority is intentionally removed from customer API responses; the UI should eventually hide that field rather than imply missing data.
- During the local network-denied restart, the login route labelled the upstream connection failure “Incorrect email or password.” Error classification is a follow-up reliability improvement, not a credentials defect.
- No Git push or hosted application deployment was performed. The handoff-note fix needs deployment before it affects the hosted site.
