# MRWD Complaint Management System

A web-based complaint management and maintenance task assignment system for Metro Roxas Water District. The project uses a React/Vite frontend, an Express REST API, and Supabase for PostgreSQL, Authentication, Storage, and Row Level Security.

## Main features

- **Customer:** register, maintain service-account details, submit geotagged complaints, attach photos, track timelines, acknowledge completed work, view billing records and important advisories, receive notifications, reopen completed complaints, print receipts, and submit feedback.
- **Administrator:** review complaints and classifier evidence, apply audited priority overrides, assign or reassign maintenance work, manage staff accounts and availability, publish important advisories, review feedback, export reports, and inspect audit logs.
- **Maintenance Personnel:** view and acknowledge assigned tasks, open complaint locations, record progress and materials, request assistance or reassignment, submit completion reports, and view customer feedback.
- **Decision support:** a dataset-backed Hybrid Sentiment-Aware Priority Scoring Algorithm supports synonyms and suggestive phrases and generates the initial category, sentiment, score, and Low/Medium/High priority.
- **Privacy:** Customers receive no classifier internals. Maintenance Personnel receive only the operational category and priority. Administrators can review the complete classifier breakdown.
- **Interface:** the original MRWD navy, blue, gold, wave-header, and role-based visual design is retained, with keyboard focus, reduced-motion, dialog, navigation, and status-label accessibility support.

## Project structure

```text
src/                       React frontend
server/                    Express API and canonical classifier
api/index.js               Vercel serverless adapter for the Express app
docs/                      Classifier and user-acceptance-test documentation
supabase/                   Required incremental SQL migrations
supabase/demo/              Optional and potentially destructive demo-data scripts
```

## Requirements

- Node.js and npm
- A Supabase project containing the existing core tables:
  - `profiles`
  - `complaints`
  - `complaint_categories`
  - `maintenance_tasks`
  - `task_updates`
  - `feedback`

The repository intentionally does **not** include the obsolete guessed baseline schema that used incompatible column names such as `customer_id`. Do not recreate the database from an old `migration.sql` file.

## Environment setup

### Frontend

```bash
cp .env.example .env
```

Fill in:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_API_URL=http://localhost:4000/api
```

### Backend

```bash
cp server/.env.example server/.env
```

Fill in the Supabase URL and public anon key. The backend uses each signed-in user's access token, so it does not require a service-role key.

## Database migrations

Run the SQL files below in the Supabase SQL Editor in this order. The files are incremental and are designed for the project's existing core schema.

1. `supabase/seed_categories.sql`
2. `supabase/rls-patch.sql`
3. `supabase/enable-signup.sql`
4. `supabase/create-announcements-and-bills.sql`
5. `supabase/qol-status-and-feedback.sql`
6. `supabase/fix-table-grants.sql`
7. `supabase/rejection-reason-and-restore.sql`
8. `supabase/feedback-staff-visibility.sql`
9. `supabase/dataset-backed-classification.sql`
10. `supabase/complete-workflow-features.sql`
11. `supabase/migrations/20260728152348_complaint_workflow_polish.sql`
12. `supabase/migrations/20260729101153_notification_cleanup_policy.sql`
13. `supabase/migrations/20260729193000_announcement_lifecycle.sql` — run last

See [`supabase/README.md`](supabase/README.md) for the purpose of each migration and the optional demo scripts.

## Create the first administrator

Public registration always creates a Customer account. To create the first Administrator:

1. In Supabase, open **Authentication → Users → Add User**.
2. Create the account and leave automatic confirmation enabled.
3. Run:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrator Name'
where email = 'admin@example.com';
```

After that, Administrators can create staff accounts through **Staff Accounts** in the system.

## Local development

Install frontend and backend dependencies:

```bash
npm install
npm --prefix server install
```

Start the backend:

```bash
npm --prefix server run dev
```

Start the frontend in another terminal:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`
- Health check: `http://localhost:4000/api/health`

## Verification

```bash
npm run lint
npm run build
npm run test
npm run test:classifier
```

`npm run test` runs the backend unit tests. `npm run test:classifier` regenerates `docs/classifier-evaluation-results.json` from the development test cases.

The included classifier cases are deterministic development checks, not real-world accuracy results. Formal validation should use a separate blinded set of anonymized complaints reviewed by MRWD personnel.

## Vercel deployment

The frontend and API can be deployed as one Vercel project. `api/index.js` imports the same Express app used by the local backend.

Add these environment variables in Vercel:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_API_URL` | `/api` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `PASSWORD_RESET_REDIRECT_URL` | Deployed URL ending in `/reset-password` |

Redeploy after changing any `VITE_` variable because frontend variables are embedded during the build.

## Security notes

- Never commit `.env` or `server/.env`.
- Never expose a Supabase service-role key to the frontend.
- Keep Row Level Security enabled.
- Use the caller's access token for backend Supabase queries.
- Run demo reset scripts only on a dedicated test/demo database.

## Additional documentation

- [`docs/CLASSIFIER_GUIDE.md`](docs/CLASSIFIER_GUIDE.md)
- [`docs/UAT_TEST_PLAN.md`](docs/UAT_TEST_PLAN.md)
- [`docs/README.md`](docs/README.md)
