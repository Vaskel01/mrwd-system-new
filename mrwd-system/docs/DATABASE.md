# Database Setup

## Fresh deployment

The release contains one canonical installer:

```text
supabase/setup.sql
```

It includes the supported core/feature schema, RLS, functions, storage rules, seed/reference data, department separation, production-readiness features, and privileged-function hardening. Removed SLA, task-acknowledgement, and maintenance completion-photo structures are not created in a fresh deployment.

Run it **once on a fresh Supabase project**.

## Why there is only one SQL installer

Earlier development versions accumulated many incremental SQL patch files. Those files were useful while the system was evolving but were confusing for a fresh deployment and depended on an undocumented pre-existing core schema.

This release replaces that history with a single fresh-project baseline. New developers no longer need to determine migration order or replay obsolete workflow changes.

## Existing databases

Do not run `setup.sql` against an existing MRWD deployment. Existing databases already contain data and migration history. Upgrade them with a targeted migration prepared for that specific version.

## First System Supervisor

1. Create the Auth user in Supabase Authentication.
2. Confirm that `public.profiles` contains the corresponding Customer profile.
3. Promote it from the SQL Editor:

```sql
update public.profiles
set role = 'admin',
    staff_position = 'supervisor',
    department_id = null,
    division_id = null,
    is_active = true,
    mfa_required = true,
    must_change_password = false,
    updated_at = now()
where lower(email) = lower('admin@example.com');
```

4. Sign in and complete authenticator MFA enrollment.

## Staff accounts

After bootstrap, create staff through **System Administration → Staff Accounts**. Do not manually assign department roles in routine operations.

The application maps account types to the internal database model:

| UI account type | Internal role | Department | Division | Position |
|---|---|---|---|---|
| Commercial Services Staff | `admin` | `COMMERCIAL` | `NSCCCD` | `commercial_staff` |
| ECMD Staff | `admin` | `ECMD` | `WDLCD` | `department_staff` |
| Maintenance Personnel | `maintenance_personnel` | `ECMD` | `WDLCD` | team leader or crew member |
| System Supervisor | `admin` | none | none | supervisor |

## Reference data

The setup SQL seeds the supported complaint types, department and division records (NSCCCD/WDLCD), reason codes, and other required reference/configuration rows used by the application.

## Demo data

Destructive historical demo-reset SQL is intentionally not included in the deployment release. Build demo records through the application or use a dedicated development project.


### Existing production upgrade

The targeted upgrade used for deployments that predate division routing is stored at:

```text
docs/database-upgrades/20260826_division_routing.sql
```

Do not run this on a fresh database; `supabase/setup.sql` already includes the final organization model.
