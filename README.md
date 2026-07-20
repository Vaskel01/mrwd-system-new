# Metro Roxas Water District — Complaint Management System

A React (Vite) frontend, an Express API, and Supabase (Postgres + Auth +
Storage) as the database layer.

## First-time setup

### 1. Set up the database

Your Supabase project already has the real schema (`profiles`,
`complaints`, `complaint_categories`, `maintenance_tasks`,
`task_updates`, `feedback`) — you built that yourself, not from a file
in this repo. Two things still need to be run against it, in order,
from **Supabase Dashboard → SQL Editor → New Query**:

1. `supabase/seed_categories.sql` — creates the complaint categories
   the frontend's dropdown expects (names matter — the backend looks
   categories up by exact name).
2. `supabase/rls-patch.sql` — Row Level Security policies written
   against your actual column names (`resident_id`, `category_id`,
   etc.). Safe to re-run.
3. `supabase/enable-signup.sql` — lets people actually create accounts:
   a policy allowing a new user to insert their own `profiles` row, plus
   a trigger that does it automatically (covers the case where your
   Supabase project requires email confirmation, so there's no session
   yet to act with at signup time). Safe to re-run.

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

The frontend already has a `.env` with the Supabase URL/key and
`VITE_API_URL=http://localhost:4000/api`. From the project root:

```bash
npm install
npm run dev                 # http://localhost:5173
```

Both servers need to be running at the same time for the app to work.

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
  Postgres Row Level Security is what actually enforces who can see
  or change what — not the Express routes themselves.
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

