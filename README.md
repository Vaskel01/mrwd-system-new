# Metro Roxas Water District — Complaint Management System

A React (Vite) frontend, an Express API, and Supabase (Postgres + Auth +
Storage) as the database layer.

## First-time setup

### 1. Set up the database

Your Supabase project already has the real schema (`profiles`,
`complaints`, `complaint_categories`, `maintenance_tasks`,
`task_updates`, `feedback`) — you built that yourself, not from a file
in this repo. Run the included migrations against it, in order,
from **Supabase Dashboard → SQL Editor → New Query**:

1. `supabase/seed_categories.sql` — creates the complaint categories expected by the frontend and classifier.
2. `supabase/rls-patch.sql` — baseline Row Level Security policies for the original schema.
3. `supabase/enable-signup.sql` — creates customer profiles during Auth signup.
4. `supabase/create-announcements-and-bills.sql` — creates announcements and billing tables.
5. `supabase/qol-status-and-feedback.sql` — expands complaint/task statuses, timeline access, and feedback constraints.
6. `supabase/fix-table-grants.sql` — adds the baseline grants needed by tables created through SQL.
7. `supabase/rejection-reason-and-restore.sql` — stores rejection reasons and supports Undo Rejection.
8. `supabase/feedback-staff-visibility.sql` — lets assigned maintenance personnel view feedback for completed work.
9. `supabase/dataset-backed-classification.sql` — stores classifier output and supports dataset-backed category/priority analysis.
10. `supabase/complete-workflow-features.sql` — **run last**. It adds secure customer-only signup, profile/availability controls, one-current-assignment enforcement, complaint cancellation/reopening, maintenance completion reports, notifications, audit logs, and storage policies for complaint/completion photos.

The final migration is safe to re-run and is required by the newest pages and API routes.

### Optional demo billing records

After at least one customer account exists, run `supabase/seed_mock_billing.sql` to add six realistic monthly billing records to every active customer. The script is idempotent for each customer and billing period, so re-running it will not duplicate the same demo months. It is intended for pre-oral demonstrations, screenshots, and testing rather than production data.

With that in place, customers can create their own accounts from
**Sign up** on the login page. Admin and maintenance accounts aren't
open to public self-registration (anyone could otherwise pick "admin"
from a dropdown) — an existing admin creates those from **Staff
Accounts** in the admin panel instead.

For your very first admin account, before any admin exists yet to use
that page: **Dashboard → Authentication → Add User**, enter an email +
password (leave "Auto confirm user?" checked), click **Create user**.
Supabase's dashboard doesn't expose a way to set the role at creation
time, so it'll default to `customer` — fix that with one query in the
**SQL Editor**:

```sql
update public.profiles
set role = 'admin', full_name = 'Your Name'
where email = 'the-email-you-just-used@example.com';
```

Then log in with that email/password. Every account after that first
one can be created from inside the app instead.

### 2. Backend

```bash
cd server
cp .env.example .env       # then fill in your Supabase URL + anon key
npm install
npm run dev                 # http://localhost:4000
```

### 3. Frontend

Copy the frontend example file and provide the public Supabase values:

```bash
cp .env.example .env
```

Then, from the project root:

```bash
npm install
npm run dev                 # http://localhost:5173
```

Both servers need to be running at the same time for the app to work.


## Complete workflow features

- **Customers:** edit or cancel pending complaints, reopen unresolved completed complaints, print/save complaint receipts, search and paginate reports, edit their profile, receive in-app notifications, reset forgotten passwords, and submit feedback.
- **Administrators:** secure staff creation, activation/deactivation, staff password-reset emails, correct transactional reassignment, workload/availability visibility, reports with CSV and print/PDF export, audit history, and notifications for new complaints and technician requests.
- **Maintenance personnel:** acknowledge assignments, update status, save ETA/work plans, record materials, submit required resolution notes and completion proof photos, request help/reassignment, report tasks that cannot be completed, set work availability, and review customer feedback.
- **Privacy:** customers receive no classifier fields; maintenance receives only the operational category and priority; administrators retain the complete classifier evidence.

## Verification

After installing dependencies:

```bash
cd server
npm test
npm run evaluate:classifier
cd ..
npm run build
```

The automated tests cover classifier behavior and role-based classifier privacy. `docs/UAT_TEST_PLAN.md` contains a manual end-to-end acceptance checklist for all three roles.

## Deploying (Vercel)

The `api/` folder is a Vercel Serverless Function that wraps the exact
same Express app — one deployment, no separate backend host, no CORS
between frontend and backend since they end up on the same domain.

1. Push this repo to GitHub, then **Import Project** in Vercel.
2. Vercel auto-detects it as a Vite project — leave build settings as
   default (it'll run `npm run build`, publish `dist/`, and pick up
   `api/[...path].js` as a function automatically).
3. **Project Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | same as your local `.env` |
   | `VITE_SUPABASE_ANON_KEY` | same as your local `.env` |
   | `VITE_API_URL` | `/api` *(relative — same origin now, not `localhost:4000`)* |
   | `SUPABASE_URL` | same value as `VITE_SUPABASE_URL`, **without** the `VITE_` prefix (this one is read by the serverless function, server-side) |
   | `SUPABASE_ANON_KEY` | same value as `VITE_SUPABASE_ANON_KEY`, without the `VITE_` prefix |
   | `PASSWORD_RESET_REDIRECT_URL` | deployed URL ending in `/reset-password` |

4. Deploy. Any time you change an env var, trigger a redeploy —
   `VITE_*` vars are baked into the build at build time, not read at
   runtime, so just saving the variable in the dashboard isn't enough.

If complaints stop saving specifically on the deployed site (but work
locally), it's almost always one of: `VITE_API_URL` not set to `/api`,
or the two non-`VITE_` server vars missing.

## How it's wired together

- **Frontend (`src/`)** never talks to Postgres directly except for
  photo uploads (straight to Supabase Storage, using the signed-in
  user's own session). Everything else — auth, complaints, billing,
  announcements — goes through the Express API.
- **Backend (`server/app.js`)** holds the priority-scoring engine and
  all business logic, as one Express app used two different ways:
  - locally, `server/index.js` imports it and calls `.listen()` — a
    normal, persistent Node process
  - on Vercel, `api/[...path].js` imports the same app and exports it
    directly — Vercel calls it per-request as a serverless function,
    no `.listen()` needed
  It never uses a Supabase service-role key; every request is made
  with the caller's own access token forwarded to Supabase, so
  Postgres Row Level Security enforces record visibility, while the Express routes enforce workflow rules such as allowed status transitions, required completion proof, and role-specific actions.
- **Database (Supabase)** — your actual schema (built independently of
  this repo), with `supabase/seed_categories.sql` and
  `supabase/rls-patch.sql` layered on top. Row Level Security is the
  source of truth for authorization, not the Express routes.

## Project structure

```
src/                    React frontend (Vite)
server/app.js           The Express app (routes, middleware) — no listener
server/index.js         Local dev only: imports app.js, calls .listen()
server/package.json     Backend's own dependencies, for local `npm run dev`
api/[...path].js        Vercel only: imports app.js, exports it as a function
vercel.json             SPA rewrite rules for Vercel
supabase/                seed_categories.sql + rls-patch.sql (run against your existing schema)
```


## Hybrid Sentiment-Aware Priority Scoring Algorithm

Classifier version `hybrid-sentiment-v1.1.0` uses four explicit components:

```
Final Priority Score = Base Severity + Keyword Severity + Sentiment Adjustment + Photo Evidence
```

- Neutral sentiment: `+0`
- Negative sentiment: `+5`
- Urgent sentiment: `+10`
- Attached complaint photo: `+10`

The complete score breakdown is available only to administrators. Maintenance personnel receive the final operational category and priority, while customers receive no classifier internals. After upgrading, use **Admin > All Complaints > Classify Existing** to recalculate older complaints.

## Resetting complaints and loading complete demo data

For a clean pre-oral demonstration, run `supabase/reset_and_seed_mock_complaints.sql` in the Supabase SQL Editor after the final migrations and demo user accounts are ready.

**Warning:** the script permanently deletes every existing complaint and the complaint-related maintenance tasks, updates, feedback, notifications, and audit entries. It does not delete profiles, billing records, complaint categories, or announcements.

The script requires at least one active account for each role: `customer`, `admin`, and `maintenance_personnel`. It creates ten mock complaints for every active customer, covering all eight categories and the Pending, Assigned, En Route, In Progress, Blocked, Completed, Rejected, and Cancelled states. It also adds a reopened complaint, reassignment history, task updates, completion evidence, feedback, notifications, and readable audit records.
