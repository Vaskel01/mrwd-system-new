# Deployment Guide

This guide is for a new deployment of the MRWD Complaint Management System.

## Pre-deployment checklist

1. Use Node `^20.19.0` or `>=22.12.0`.
2. Create a fresh Supabase project.
3. Run `supabase/setup.sql` once.
4. Create and promote the first System Supervisor.
5. Configure password-reset redirect URLs in Supabase Auth.
6. Configure frontend and server environment variables.
7. Run `npm ci` and `npm --prefix server ci`.
8. Run `npm run verify`.
9. Deploy.
10. Complete the UAT checklist in `docs/UAT.md`.

## Vercel

This repository can deploy frontend and API together.

### Required project variables

Browser/build variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL=/api
```

Server variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
PASSWORD_RESET_REDIRECT_URL=https://YOUR_DOMAIN/reset-password
```

Optional application-notification providers:

```text
APP_BASE_URL=https://YOUR_DOMAIN
RESEND_API_KEY
NOTIFICATION_EMAIL_FROM=MRWD <notifications@YOUR_DOMAIN>
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_MESSAGING_SERVICE_SID
```

Use `TWILIO_FROM_NUMBER` instead of `TWILIO_MESSAGING_SERVICE_SID` only when the Twilio account sends from one approved number. Configure either email, SMS, or both. Provider secrets are server-only variables and must never use the `VITE_` prefix.

Optional platform-readiness monitoring:

```text
SUPABASE_PROJECT_REF
SUPABASE_MANAGEMENT_TOKEN
```

Create the management token with read-only Auth configuration and backup permissions. The System Health response reports only readiness state; it does not return the token or SMTP credentials.

Optional for split-origin deployments:

```text
CORS_ORIGIN=https://YOUR_FRONTEND_DOMAIN
```

### Cron

`vercel.json` invokes:

```text
/api/production/cron/run-reports
/api/production/cron/run-notifications
```

Both endpoints are protected by `CRON_SECRET`. Scheduled reports have a manual **Run Now** path, and System Health has **Deliver pending now** for notification troubleshooting.

The checked-in schedules run daily so they remain compatible with Vercel Hobby scheduling. On a plan that supports more frequent cron execution, change the notification schedule to the required service level, such as every five minutes, and verify the production invocation after deployment.

### Authentication email

Password resets, confirmations, and other Auth messages are sent by Supabase Auth—not by the application notification worker. Configure an approved custom SMTP provider in Supabase **Authentication → SMTP Settings**, add the deployed reset URL to the Auth redirect allow list, then test receipt with an address controlled by the project team.

## Generic Node hosting

The frontend can be built with:

```bash
npm ci
npm run build
```

Serve the generated `dist/` directory with SPA fallback to `index.html`.

Run the API separately with:

```bash
npm --prefix server ci
npm --prefix server start
```

Set `VITE_API_URL` to the public API URL before building the frontend, and set `CORS_ORIGIN` on the API to the frontend origin.

## Supabase Storage

The database setup creates a **private** `complaint-photos` bucket with a 6 MB limit, JPEG/PNG/WebP MIME restrictions, uploader-folder writes, role/ownership reads, and short-lived signed URLs served by the API. For an existing project, apply `supabase/migrations/20260909143044_private_complaint_photos_and_fk_indexes.sql` followed by `supabase/migrations/20260909145541_remaining_complaint_fk_indexes.sql`, then run `npm run check:photo-storage`. The configured demonstration project completed this policy check on September 10, 2026.

## Production smoke test

At minimum verify:

- Customer registration and complaint submission.
- Commercial review and ECMD forwarding.
- WDLCD dispatch to Maintenance Personnel.
- Maintenance progress, completion notes, and required completion photo.
- Direct transition to Resolved after assigned Maintenance Personnel submit the completion report; no WDLCD verification step.
- Customer notification and feedback.
- System Supervisor MFA and Staff Accounts.
- Commercial billing CSV validation/import.
- Scheduled-report configuration and System Health.
- External email/SMS delivery with clearly labelled test recipients **only after MRWD approves and configures the provider**. Until then, describe the feature as implemented and configuration-ready.
- Actual password-reset email receipt through Supabase custom SMTP.
- Production cron invocations in hosting logs.
- Backup availability and one isolated restore rehearsal using `docs/RECOVERY.md`.

## Production readiness gates

Do not describe the system as production-ready until all of these environment-dependent checks are recorded:

- Supabase leaked-password protection enabled.
- Private complaint-photo migration applied and storage policy check passed.
- Supabase Security/Performance Advisor re-run after the migration; remaining findings reviewed.
- Approved Resend/Twilio (or replacement) provider configured and controlled recipient delivery confirmed.
- Hosted cron invocation confirmed from production logs.
- Real browser → API → private Storage completion-photo journey passed.
- Isolated backup restoration rehearsal completed and recorded.
- Formal thesis respondent evaluation and independent two-reviewer classifier validation completed separately from engineering tests.

## Rollback

Application rollback is performed by redeploying the previous known-good artifact.

Database rollback should not be attempted by blindly removing tables or columns after production data exists. Take a backup/export before schema changes and restore into a separate project when testing recovery.
