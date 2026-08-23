# MRWD Complaint Management System

Production-ready web application for the **Metro Roxas Water District (MRWD)** complaint workflow. The system separates Commercial Services, ECMD, Maintenance Personnel, Customers, and System Administration into role-specific workspaces while keeping one shared complaint record and audit trail.

## What this release contains

- Customer complaint submission, geolocation, attachments, tracking, follow-up responses, reopening, notifications, and feedback.
- **Commercial Services Department** workspace for complaint review, classifier review, priority overrides, customer-account/billing tools, advisories, reports, duplicate handling, customer follow-up requests, and Commercial → ECMD handoff.
- **Engineering, Construction and Maintenance Department (ECMD)** workspace for dispatch, workload/availability, crew management, field coordination, related incidents, map operations, verification, inventory, and maintenance reporting.
- **Maintenance Personnel** workspace for assigned field tasks, progress updates, manpower/material recording, completion notes, and reassignment/assistance requests.
- **System Administration** workspace for System Supervisor account management, department access, audit/security events, announcements, archive recovery, backup verification, and system-health checks.
- Dataset-backed hybrid complaint classification and Low / Medium / High priority recommendation.
- Row Level Security, MFA-gated System Supervisor privileges, department capability isolation, hardened privileged RPCs, and first-login password replacement for staff accounts.
- Saved views, watchlists, recent complaints, clearer contextual bulk actions, export/report scheduling, Quick Find, responsive tables, and keyboard/QoL improvements.
- Lazy-loaded role routes, shared page/dialog/metric components, accessible complaint-progress guidance, and a top-level recovery screen for unexpected UI errors.
- GitHub Actions quality checks plus a source-integrity guard for secrets, fresh-install SQL, and removed legacy workflow artifacts.

### Intentionally not included

This project does **not** use:

- SLA or response-time tracking;
- a Maintenance Personnel task accept/reject step;
- required maintenance before/after completion photos.

Customer-submitted complaint photos are still supported.

---

## Technology

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| API | Node.js + Express |
| Database / Auth / Storage | Supabase |
| Maps | OpenStreetMap / Leaflet integration |
| Deployment | Vercel-ready; generic Node deployment also supported |

The package lock requires **Node `^20.19.0` or `>=22.12.0`**.

---

## Repository structure

```text
.
├── api/                    # Vercel serverless entry point
├── docs/                   # Deployment, database, operations, security, testing
├── public/                 # Static frontend files
├── .github/workflows/      # CI verification on pushes and pull requests
├── scripts/                # Environment and source-integrity checks
├── server/                 # Express API, classifier, tests
├── src/                    # React application
├── supabase/
│   ├── setup.sql           # ONE fresh-project database installer
│   └── README.md           # Database installation notes
├── .env.example            # Browser-safe local variables
├── package.json
├── vercel.json
└── vite.config.js
```

Historical migration/change-report files are intentionally **not shipped** in this deployment package. `supabase/setup.sql` is the canonical fresh-install database snapshot for this release and defines the supported workflow without legacy SLA, task-acknowledgement, or completion-photo structures.

---

# Quick start

## 1. Create a Supabase project

Create an empty Supabase project. Do not import an older MRWD schema first.

## 2. Install the database

Open **Supabase → SQL Editor**, paste the entire contents of:

```text
supabase/setup.sql
```

and run it once.

> `setup.sql` is for a **fresh project only**. Do not run it over an existing MRWD production database.

See [`docs/DATABASE.md`](docs/DATABASE.md) for details.

## 3. Configure Supabase Auth

Add these redirect URLs for local development:

```text
http://localhost:5173/reset-password
```

Add your deployed `/reset-password` URL before production use.

## 4. Create the first System Supervisor

Create a normal user in **Supabase → Authentication → Users**. After the Auth user exists, run this once in the SQL Editor:

```sql
update public.profiles
set role = 'admin',
    staff_position = 'supervisor',
    department_id = null,
    is_active = true,
    mfa_required = true,
    must_change_password = false,
    updated_at = now()
where lower(email) = lower('admin@example.com');
```

Replace `admin@example.com` with the real supervisor email.

The System Supervisor can then create Commercial Services Staff, ECMD Staff, and Maintenance Personnel accounts from **System Administration → Staff Accounts**.

## 5. Configure local environment files

Frontend:

```bash
cp .env.example .env
```

Backend:

```bash
cp server/.env.example server/.env
```

Fill both files with your Supabase project values.

Check the configuration:

```bash
npm run check:env
```

## 6. Install dependencies

```bash
npm ci
npm --prefix server ci
```

## 7. Start the project

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev:client
```

Local URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`
- API health: `http://localhost:4000/api/health`

## 8. Verify before deployment

```bash
npm run verify
```

The same verification runs automatically in GitHub Actions for pull requests and pushes to `main`. See [`docs/QUALITY_ASSURANCE.md`](docs/QUALITY_ASSURANCE.md).

Additional classifier check:

```bash
npm run test:classifier
```

---

# Environment variables

## Frontend — safe for the browser

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
```

## Server only

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
PASSWORD_RESET_REDIRECT_URL=
CORS_ORIGIN=
PORT=4000
```

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` must **never** use a `VITE_` prefix or appear in frontend source code.

---

# Vercel deployment

The repository is configured for a single Vercel project:

- Vite builds the frontend.
- `api/index.js` exposes the Express application as `/api`.
- SPA routes rewrite to `index.html`.
- `vercel.json` contains the scheduled-report cron route.

Add these project environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL=/api
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
PASSWORD_RESET_REDIRECT_URL=https://YOUR_DOMAIN/reset-password
```

For same-origin Vercel deployment, `CORS_ORIGIN` can be omitted unless your deployment policy requires an explicit origin. Redeploy after changing frontend `VITE_*` variables.

Full instructions: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

# Account/workspace model

| Account | Workspace |
|---|---|
| Customer | Customer portal |
| Commercial Services Staff | Commercial Services only |
| ECMD Staff | ECMD operations only |
| Maintenance Personnel | Assigned maintenance task workspace |
| System Supervisor | System Administration only; MFA required |

System Supervisors do not inherit Commercial or ECMD operational access.

---

# Canonical interface terminology

Use these terms in code-facing documentation, demonstrations, and training:

- **Commercial Services Department**
- **Commercial Services Staff**
- **Engineering, Construction and Maintenance Department (ECMD)**
- **ECMD Staff**
- **Maintenance Personnel**
- **Maintenance Crew**
- **System Administration**
- **System Supervisor**
- **Complaint Type**
- **Submitted**
- **Active Complaints**
- **Assigned Maintenance Personnel**
- **Awaiting ECMD Verification**
- **Resolved** only after ECMD verification

Internal database values such as `admin`, `department_staff`, and `maintenance_personnel` remain implementation details.

---

# Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production deployment checklist
- [`docs/DATABASE.md`](docs/DATABASE.md) — fresh database setup and first supervisor
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — department workflow and operational behavior
- [`docs/SECURITY.md`](docs/SECURITY.md) — secrets, RLS, MFA, and hardened RPC design
- [`docs/UAT.md`](docs/UAT.md) — post-install acceptance tests
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — application structure and module boundaries
- [`docs/CLASSIFIER_GUIDE.md`](docs/CLASSIFIER_GUIDE.md) — classifier implementation and limitations

---

# Security reminders

- Never commit `.env` or `server/.env`.
- Never expose the Supabase service-role/server Secret key in browser code.
- Keep RLS enabled on exposed `public` tables.
- System Supervisor capabilities require MFA/AAL2.
- Use Staff Accounts to deactivate users instead of deleting profiles with operational history.
- Run Supabase Security Advisor after schema changes.
- The paid Supabase leaked-password-protection warning may remain unavailable depending on the project plan; it is not bypassed or simulated by this application.

---

# Deployment status of this package

This is a **fresh-deployment release snapshot**, not a historical development archive. If you are maintaining an older live MRWD database, do not replay `setup.sql`; keep that database's existing migration history and apply targeted upgrades instead.


## UI content conventions

When changing labels, help text, empty states, or workflow messages, follow [`docs/CONTENT_STYLE_GUIDE.md`](docs/CONTENT_STYLE_GUIDE.md) so wording stays consistent across all workspaces.
