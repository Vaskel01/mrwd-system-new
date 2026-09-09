# Security Model

## Secrets

Never expose these values to the browser:

```text
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
RESEND_API_KEY
TWILIO_AUTH_TOKEN
SUPABASE_MANAGEMENT_TOKEN
```

Only variables prefixed with `VITE_` are intended for the Vite frontend.

## Row Level Security

RLS is the primary database boundary for customer ownership, department access, assigned Maintenance Personnel, System Administration, reports, and operational records. Route capability checks add a second application-layer boundary.

## Private complaint and completion photos

The `complaint-photos` Storage bucket is private. Fresh setup and the 2026-09-09 hardening migration set a 6 MB bucket limit and allow only `image/jpeg`, `image/png`, and `image/webp`. The frontend uploads into the signed-in user's UUID folder, while the API stores the private object path rather than a permanent public URL.

Authorized complaint responses mint short-lived signed URLs (5 minutes). Storage RLS permits reads only for the uploader, the complaint customer, assigned Maintenance Personnel, or staff whose configured Commercial Services/WDLCD capability allows the related complaint. New complaint/completion API writes reject object paths that do not belong to the signed-in uploader and confirm that the object exists. Completion evidence must be under that Maintenance Personnel account's `completion/` folder. Database completion guards independently require matching Storage metadata, and Storage deletion rules allow owners to clean up only unlinked uploads so retained complaint evidence cannot be removed after submission.

Apply the latest migrations to every target environment before claiming this control is live, then run `npm run check:photo-storage` with isolated QA accounts. The configured demonstration project passed this controlled policy check on September 10, 2026.

## System Supervisor MFA

System Administration privileges configured with `mfa_required` require Supabase AAL2. `server/src/middleware/auth.js` rejects protected System Supervisor/manager/supervisor requests whose authenticated session is below AAL2. The current flow uses authenticator TOTP MFA.

## Privileged database functions

Privileged implementations are kept under `app_private` using `SECURITY DEFINER` only where RLS bypass is required. Public RPC entry points use `SECURITY INVOKER` wrappers and perform capability/self-ownership checks.

Do not move server-only privileged logic back into publicly exposed `SECURITY DEFINER` RPCs without reviewing Supabase Security Advisor.

## Staff lifecycle

Deactivate staff instead of deleting their profiles. This preserves assignment and audit history.

New staff accounts use temporary passwords and are marked for password replacement on first login.

## Password protection

The application enforces its account workflow and MFA requirements. Supabase leaked-password protection is a **production-readiness requirement** and must be enabled in the hosted Supabase Auth settings before production credentials are issued. System Health can report the hosted setting when a read-only Management API token is configured. The application cannot enable this remote platform control from source code and does not imitate or bypass it.

## External notification delivery

Application notifications are queued in the database and claimed by a server-only worker. Resend email and Twilio SMS adapters, retries, manual delivery, cron authorization, and health controls are implemented and configuration-ready. Do not describe external email/SMS as operational until MRWD IT approves the provider, production credentials are configured, the hosted scheduler is observed invoking the route, and controlled recipients confirm receipt.

Only authorized System Administration users can run the worker manually or requeue a failed delivery. Delivery health does not expose recipients or provider credentials.

## Foreign-key and policy advisor checks

The 2026-09-08 hardening migration adds support indexes to previously unindexed foreign-key columns used by joins and RLS predicates. After applying it, rerun Supabase Performance Advisor. Multiple-permissive-policy findings should be reviewed against the live policy set and consolidated only when equivalence has been proven; do not weaken or merge RLS rules merely to silence an advisor warning.

## Backup recovery

Backup-readiness records are operational evidence only. Production readiness requires a documented isolated restore rehearsal using `docs/RECOVERY.md`; do not claim recoverability from backup availability alone.

## Recommended checks after schema changes

- Supabase Security and Performance Advisors
- RLS tests for every role
- private Storage signed-URL test
- System Supervisor MFA/AAL2 capability test
- customer isolation test
- Commercial vs ECMD isolation test
- Maintenance assignment isolation test
- isolated backup restoration rehearsal before production
