# Architecture

## Runtime flow

```text
Browser (React/Vite)
        |
        | Supabase Auth session + REST calls
        v
Express API (/api) --------------------+
        |                               |
        | user JWT                      | server-only secret for privileged jobs
        v                               v
Supabase Postgres / RLS            Supabase Auth Admin / system jobs
        |
        +-- Storage (complaint attachments)
```

## Frontend

- `src/pages/` contains role/workspace pages.
- `src/components/` contains shared UI and complaint operational components.
- `src/lib/` contains API/Supabase utilities.
- `src/store/` contains application state.
- `src/config/` contains static labels/configuration.

Role routing is enforced in the frontend for UX, but database/API authorization remains authoritative.

## API

- `server/app.js` creates the Express application.
- `server/index.js` runs it locally.
- `api/index.js` exposes the same app through Vercel serverless functions.
- `server/src/routes/` contains feature routes.
- `server/src/` also contains the canonical complaint classifier and data/configuration.

## Database

A fresh deployment uses `supabase/setup.sql`.

The database uses:

- `profiles` linked to `auth.users`;
- department capability checks;
- RLS on exposed operational tables;
- private `app_private` SECURITY DEFINER implementations only where privileged access is required;
- public SECURITY INVOKER RPC wrappers;
- audit/security event tables for important operations.

## Workspace ownership

```text
Customer submission
      |
      v
Commercial Services review
      |
      v
Forward to ECMD
      |
      v
ECMD dispatch
      |
      v
Maintenance Personnel field work
      |
      v
ECMD verification
      |
      v
Resolved / Customer feedback
```

System Administration is parallel governance and does not inherit operational department access.
