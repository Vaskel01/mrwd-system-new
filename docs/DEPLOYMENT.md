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

Optional for split-origin deployments:

```text
CORS_ORIGIN=https://YOUR_FRONTEND_DOMAIN
```

### Cron

`vercel.json` invokes:

```text
/api/production/cron/run-reports
```

The endpoint is protected by `CRON_SECRET`. Scheduled reports also have a manual **Run Now** path in the application for troubleshooting.

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

The database setup creates the required storage/RLS configuration used by complaint attachments. Verify a customer can upload a complaint attachment during UAT.

## Production smoke test

At minimum verify:

- Customer registration and complaint submission.
- Commercial review and ECMD forwarding.
- ECMD dispatch to Maintenance Personnel.
- Maintenance progress and completion notes.
- ECMD verification to Resolved.
- Customer notification and feedback.
- System Supervisor MFA and Staff Accounts.
- Commercial billing CSV validation/import.
- Scheduled-report configuration and System Health.

## Rollback

Application rollback is performed by redeploying the previous known-good artifact.

Database rollback should not be attempted by blindly removing tables or columns after production data exists. Take a backup/export before schema changes and restore into a separate project when testing recovery.
