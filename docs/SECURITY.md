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

RLS is the primary database boundary for customer ownership, department access, assigned Maintenance Personnel, System Administration, reports, and operational records.

The workspace split is also enforced by database capabilities:

- Commercial Services Staff cannot use ECMD operational capabilities.
- ECMD Staff cannot use Commercial capabilities.
- System Supervisors do not inherit department operations.
- Maintenance Personnel are restricted to assigned/authorized field records.

## System Supervisor MFA

System Administration capabilities require AAL2 when `mfa_required` is enabled. The existing System Supervisor flow uses authenticator TOTP MFA.

## Privileged database functions

Privileged implementations are kept under `app_private` using `SECURITY DEFINER` only where RLS bypass is required. Public RPC entry points use `SECURITY INVOKER` wrappers and perform capability/self-ownership checks.

Do not move server-only privileged logic back into publicly exposed `SECURITY DEFINER` RPCs without reviewing Supabase Security Advisor.

## Staff lifecycle

Deactivate staff instead of deleting their profiles. This preserves assignment and audit history.

New staff accounts use temporary passwords and are marked for password replacement on first login.

## Password protection

The application enforces its normal account workflow and MFA requirements. System Health can read whether Supabase leaked-password protection is enabled when a read-only Management API token is configured. Enable the platform feature in Supabase when the project plan supports it; the application does not imitate or bypass that service.

## External notification delivery

Application notifications are queued in the database and claimed by a server-only worker. Email uses Resend and SMS uses Twilio when their server credentials are configured. Retries are bounded to three automatic attempts. A provider-accepted message whose database receipt cannot be recorded stays in `processing` for manual reconciliation, preventing an automatic retry from silently duplicating an SMS.

Only System Supervisors with audit access can run the worker manually or requeue a failed delivery. Delivery health does not expose recipients or provider credentials.

## Recommended checks after schema changes

- Supabase Security Advisor
- RLS tests for every role
- System Supervisor MFA/AAL2 capability test
- Customer isolation test
- Commercial vs ECMD isolation test
- Maintenance assignment isolation test
