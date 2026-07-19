# Metro Roxas Water District — Complaint Management System

A React (Vite) frontend, an Express API, and Supabase (Postgres + Auth +
Storage) as the database layer.

## First-time setup

### 1. Set up the database

1. Open your Supabase project → **SQL Editor** → New Query.
2. Paste the contents of `supabase/migration.sql` and run it. It creates
   the `profiles`, `complaints`, `bills`, and `announcements` tables, all
   Row Level Security policies, and a `complaint-photos` storage bucket.
   It's safe to re-run.
3. Create the three demo accounts (Supabase only lets you create Auth
   users through the Auth API/Dashboard, not plain SQL):
   **Dashboard → Authentication → Add User**, for each of:

   | Email                  | Password   | User metadata (raw JSON)                                  |
   |-------------------------|------------|-------------------------------------------------------------|
   | customer@demo.com       | demo1234   | `{"full_name": "Juan dela Cruz", "role": "customer"}`       |
   | admin@demo.com          | demo1234   | `{"full_name": "Maria Santos", "role": "admin"}`             |
   | maintenance@demo.com    | demo1234   | `{"full_name": "Pedro Reyes", "role": "maintenance"}`        |

   The migration's trigger auto-creates a matching `profiles` row for
   each one. If a profile doesn't appear, double check the metadata
   JSON was entered under "User Metadata", not "App Metadata".

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

## How it's wired together

- **Frontend (`src/`)** never talks to Postgres directly except for
  photo uploads (straight to Supabase Storage, using the signed-in
  user's own session). Everything else — auth, complaints, billing,
  announcements — goes through the Express API.
- **Backend (`server/`)** holds the priority-scoring engine and all
  business logic. It never uses a Supabase service-role key; every
  request is made with the caller's own access token forwarded to
  Supabase, so Postgres Row Level Security is what actually enforces
  who can see or change what. If you inspect a request in devtools,
  you're seeing real permission checks, not just UI-level hiding.
- **Database (Supabase)** — schema and policies are in
  `supabase/migration.sql`. Row Level Security is the source of truth
  for authorization, not the Express routes.

## Project structure

```
src/            React frontend (Vite)
server/         Express API (separate Node project — own package.json)
supabase/       SQL migration (schema + RLS + storage bucket)
```
