# Backup and Recovery Runbook

Use this runbook to validate recovery without risking the live MRWD project.

## Before an incident

1. Confirm the latest completed Supabase database backup in System Health or the Supabase dashboard.
2. Export the database before risky schema work when managed backups are unavailable.
3. Maintain a separate inventory of Storage buckets and objects. Database backups do not contain the actual Storage files.
4. Keep server environment variables, Auth redirect URLs, SMTP configuration, Edge Functions, cron settings, and provider credentials in the deployment record. They must be recreated separately from a database restore.
5. Record each backup review or restore rehearsal in System Health.

## Isolated restore rehearsal

1. Never overwrite the production project for a rehearsal.
2. Create or select an isolated Supabase project with no production traffic. Restoring to a new project may incur Supabase charges, so obtain explicit approval before starting it.
3. Restore the selected backup or import a current logical export into the isolated project.
4. Recreate non-database configuration: Auth URLs and SMTP, Storage buckets and objects, Edge Functions, secrets, cron configuration, and application environment variables.
5. Point a temporary application deployment at the isolated project.
6. Verify table counts, Auth access, RLS boundaries, complaint submission, Commercial review, WDLCD assignment, completion-photo access, billing data, audit history, and notification queue behavior.
7. Record the result as a `restore_test` backup check. Include the backup date, isolated project, tests passed, exceptions, tester, and cleanup date.
8. Remove the isolated environment only after the evidence has been retained and cleanup is approved.

## Production recovery

Pause writes if practical, preserve logs, identify the last known-good recovery point, and obtain the project owner's approval before restoring or changing DNS/environment variables. Validate database, Auth, Storage, server secrets, and user-facing workflows before returning traffic.
