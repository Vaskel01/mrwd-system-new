# Supabase SQL Guide

This folder contains incremental migrations for the existing MRWD database. It does not contain a complete fresh-database schema.

## Required order

| Order | File | Purpose |
|---:|---|---|
| 1 | `seed_categories.sql` | Adds the eight complaint categories and base severity scores. |
| 2 | `rls-patch.sql` | Applies baseline RLS policies using the actual `resident_id`, `category_id`, and assignment structure. |
| 3 | `enable-signup.sql` | Creates Customer profiles during Supabase Auth signup. |
| 4 | `create-announcements-and-bills.sql` | Creates announcement and billing tables. |
| 5 | `qol-status-and-feedback.sql` | Expands workflow statuses and enforces feedback integrity. |
| 6 | `fix-table-grants.sql` | Grants the authenticated role access required before RLS policies are evaluated. |
| 7 | `rejection-reason-and-restore.sql` | Adds rejection reasons and restore support. |
| 8 | `feedback-staff-visibility.sql` | Allows assigned Maintenance Personnel to view completed-work feedback. |
| 9 | `dataset-backed-classification.sql` | Adds stored classifier fields to complaints. |
| 10 | `complete-workflow-features.sql` | Final workflow, notification, audit, assignment-history, profile, and storage migration. Run last. |
| 11 | `migrations/20260728152348_complaint_workflow_polish.sql` | Adds complaint references, expanded customer profiles, important announcements, audited priority overrides, and completion acknowledgments. |
| 12 | `migrations/20260729101153_notification_cleanup_policy.sql` | Allows each authenticated user to dismiss only notifications addressed to that account. |
| 13 | `migrations/20260729193000_announcement_lifecycle.sql` | Adds optional announcement expiry and edit timestamps while preserving existing RLS policies. |

Many statements are safe to rerun, but always back up the database and review the SQL before executing it.

## Demo-only scripts

The scripts under `demo/` are not required by the application.

- `demo/seed_mock_billing.sql` adds sample billing records and is designed to avoid duplicate customer/month rows.
- `demo/reset_and_seed_mock_complaints.sql` **deletes all current complaint-related records** before creating comprehensive demonstration records.

Only run the reset script on a dedicated test or demonstration project. Never run it against real MRWD operational data.

## Removed legacy SQL

The old `migration.sql` was removed because it described a guessed schema with incompatible columns and role values. The current project relies on the real existing core schema plus the incremental files listed above.
