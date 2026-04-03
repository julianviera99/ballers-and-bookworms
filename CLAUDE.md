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

Copy `.env` and fill in values before running locally. The required variables are:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Commands

> To be filled in once `package.json` and build tooling are set up.

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Tests | `npm test` |
