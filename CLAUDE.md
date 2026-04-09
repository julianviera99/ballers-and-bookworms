# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A private web app for Ballers and Bookworms student athletes with two core features:

1. **Fund Requests** — student athletes can request financial support across three categories: academic, athletic, and financial.
2. **Mentor Matching** — connects student athletes with mentors.

## Tech Stack

- **React + Vite** — frontend
- **React Router** — client-side routing
- **Supabase** — database and authentication
- **GitHub OAuth** — login provider (configured in Supabase)
- **Tailwind CSS** — styling
- **Supabase CLI** — database migrations (linked to the project)

## Key Rules

- Every database table must have Row Level Security (RLS) enabled.
- Every protected page must check for an active Supabase session before rendering.
- Never expose data from one user to another.
- Use environment variables for all secrets and keys.
- Write all database changes as SQL migration files in `supabase/migrations/` and apply them with `npx supabase db query --linked -f <file>` — never ask the user to paste SQL into the Supabase dashboard manually.

## Environment

`.env` (gitignored) must contain:

| Variable | Required for |
|----------|-------------|
| `VITE_SUPABASE_URL` | All environments |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | All environments |
| `SUPABASE_SERVICE_ROLE_KEY` | Dev seed scripts only — never `VITE_` prefix |

`SUPABASE_SERVICE_ROLE_KEY` is the service role key from the Supabase dashboard (Settings → API). It is only read by the Node seed scripts and is never exposed to the browser.

## Commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Seed dev data | `npm run seed` |
| Reset + re-seed | `npm run seed:reset` |
| Run migration | `npx supabase db query --linked -f supabase/migrations/<file>.sql` |

## Dev tooling

`src/dev/` contains dev-only code that Vite excludes from production builds:

- **`personas.js`** — 3 athlete + 2 staff test personas with realistic funding request history
- **`DevSwitcher.jsx`** — floating yellow "DEV" button (bottom-right) for instant persona switching

After `npm run seed`, use the DEV button to switch between any persona — it calls `signInWithPassword` so the full Supabase session and RLS context are real. All test accounts use password `devpass123` and email domain `@bandb.test`.
