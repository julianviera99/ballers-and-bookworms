# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A private web app for Ballers and Bookworms student athletes with three core features:

1. **Fund Requests** — student athletes submit funding requests across eight categories (academic supplies, athletic equipment, tutoring, athletic training, nutrition consulting, camp fees, travel costs, other) up to $1,000/year. Staff approve, deny, flag, or reimburse.
2. **Mentor Matching** — AI pipeline matches athletes to mentors via free-text request, OpenAI embeddings, pgvector cosine similarity search, and Claude-generated match explanations.
3. **NCAA Eligibility Checker** — two-pass Claude vision pipeline: extracts school info, scrapes the NCAA HS Portal for the approved course list, maps every transcript course, calculates core-course GPA, and checks DI/DII eligibility including the 10/7 rule.

## Tech Stack

- **React + Vite** — frontend
- **React Router** — client-side routing
- **Supabase** — Postgres database, Auth, Storage, Edge Functions
- **GitHub OAuth** — login provider (configured in Supabase Auth)
- **Tailwind CSS** — styling
- **Anthropic Claude Haiku** — transcript parsing (vision/document API), mentor match explanations
- **OpenAI text-embedding-3-small** — mentor and request embeddings for vector search
- **pgvector** — cosine similarity search for mentor matching
- **Cloudflare Pages** — frontend hosting
- **Resend** — transactional email for mentor session notifications (optional)

## Key Rules

- Every database table must have Row Level Security (RLS) enabled.
- Every protected page must check for an active Supabase session before rendering.
- Never expose data from one user to another.
- Use environment variables for all secrets and keys.
- Write all database changes as SQL migration files in `supabase/migrations/` using sequential numbering, and apply them with `npx supabase db query --linked -f <file>` — never ask the user to paste SQL into the Supabase dashboard manually.
- Edge function secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) are set in the Supabase dashboard → Edge Functions → Secrets, not in `.env`.
- Git: never add or commit anything without explicit user instruction. Even when given permission, treat it as one-time permission only.

## Environment

`.env` (gitignored) must contain:

| Variable | Required for |
|----------|-------------|
| `VITE_SUPABASE_URL` | All environments |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | All environments |
| `SUPABASE_SERVICE_ROLE_KEY` | Dev seed scripts only — never `VITE_` prefix |
| `OPENAI_API_KEY` | Seed scripts only (`npm run seed:mentors`) |

`SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are only read by Node seed scripts and are never exposed to the browser.

## Commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Seed athletes + staff | `npm run seed` |
| Seed mentors | `npm run seed:mentors` |
| Seed everything | `npm run seed:all` |
| Reset + re-seed | `npm run seed:reset` |
| Run migration | `npx supabase db query --linked -f supabase/migrations/<file>.sql` |
| Deploy edge function | `npx supabase functions deploy <function-name>` |
| Deploy to specific project | `npx supabase functions deploy <function-name> --project-ref <ref>` |

## Edge Functions

All edge functions live in `supabase/functions/`. Each uses Deno and is deployed to Supabase. Auto-injected env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.

| Function | Trigger | Purpose | Extra secrets needed |
|----------|---------|---------|----------------------|
| `embed-mentor` | POST from seed scripts | Generates 1536-dim embedding for a mentor using Supabase built-in AI (gte-small); stores in `mentor_embeddings` | none |
| `find-mentors` | POST from browser | Full AI matching pipeline: Claude extracts structured needs → filter mentor pool → OpenAI embed request → `match_mentors()` pgvector search → Claude explains each match | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |
| `request-session` | POST from browser | Inserts `session_requests` row + sends Resend email to mentor | `RESEND_API_KEY` (optional), `FROM_EMAIL` (optional) |
| `scrape-ncaa-courses` | POST from browser or internal | Establishes NCAA HS Portal session, searches by CEEB code (preferred) or name/state, parses approved course tables, caches 30 days in `ncaa_approved_courses_cache` | none |
| `process-transcript` | POST from browser | Two-pass Claude pipeline: Pass 1 extracts school name + CEEB (256 tokens, temp=1); Pass 2 maps all courses at temp=0 with explicit grading scale rules, calculates GPA (excluding in-progress courses), checks DI/DII eligibility, saves to `eligibility_assessments` + `eligibility_courses` | `ANTHROPIC_API_KEY` |

Secrets are set in the Supabase dashboard → Edge Functions → Secrets. They are shared across all functions in the project.

## Database Schema

All tables have RLS enabled. The `is_staff()` helper function (defined in `002_profile_and_staff.sql`) is used in RLS policies to grant staff full read/write access.

| Table | Purpose |
|-------|---------|
| `student_athletes` | One row per athlete linked to `auth.users` |
| `staff_users` | Email allowlist; `is_staff()` checks this table |
| `funding_requests` | Fund requests with status: `pending`, `approved`, `reimbursed`, `denied`, `flagged` |
| `mentors` | Mentor profiles; status `pending`/`active`/`inactive` — only `active` mentors appear in search |
| `mentor_mentorship_areas` | Many-to-one with `mentors`; areas/topics a mentor covers |
| `mentor_availability` | One-to-one with `mentors`; hours/week, format, timezone |
| `mentor_embeddings` | One-to-one with `mentors`; 1536-dim vector — service role only |
| `mentee_intake` | Athlete's free-text mentor request and structured preferences |
| `matches` | Mentor/mentee pairs produced by the matching pipeline |
| `session_requests` | Created when athlete clicks "Request a Session" on a mentor card |
| `ncaa_approved_courses_cache` | NCAA portal course list per school; keyed on `ncaa_school_code`; 30-day TTL |
| `eligibility_assessments` | One per transcript upload; overall status, core GPA, credit counts |
| `eligibility_courses` | One per course extracted from transcript; grade, credit (0 for in-progress), quality points, approval status |

Key Postgres function: `match_mentors(query_embedding, candidate_ids, match_count)` — `SECURITY DEFINER`, callable by service role only, runs cosine similarity via `<=>` pgvector operator.

## NCAA Eligibility Logic

- **DI:** 4 English, 3 Math (Algebra I+), 2 Science (1 lab), 1 extra English/Math/Science, 2 Social Science, 4 additional — 16 total, GPA ≥ 2.3
- **DII:** 3 English, 2 Math, 2 Science, 3 extra English/Math/Science, 2 Social Science, 4 additional — 16 total, GPA ≥ 2.2
- **10/7 rule:** 10 core courses before 7th semester, 7 of those in English/Math/Science
- **overall_status:** `on_track` (DI eligible + 10/7 met) | `at_risk` (DI or DII only) | `needs_attention` (neither)
- In-progress courses (no valid GRADE_POINTS entry) get `credit: 0` and `quality_points: 0` — excluded from GPA denominator and numerator
- GPA minimum is enforced in the eligibility check itself, not just displayed separately

## Grade Conversion (process-transcript)

Pass 2 runs at `temperature: 0` for deterministic output. The system prompt instructs Claude to:
1. Identify the grading scale on the transcript
2. Use the transcript's own printed scale legend if one exists
3. Fall back to exact 100-point cutoffs: 90–100=A, 80–89=B, 70–79=C, 65–69=D, 0–64=F
4. No +/- variants unless the transcript's own legend specifies them

## Scraper Notes (scrape-ncaa-courses)

The NCAA portal requires a two-step flow:
- **Session:** GET `https://web3.ncaa.org/hsportal/exec/hsAction?hsActionSubmit=searchHighSchool` to obtain `JSESSIONID`
- **Search:** POST to `https://web3.ncaa.org/hsportal/exec/hsAction` with `hsActionSubmit=Search` in the **body** (not the URL)
- CEEB searches often return `#approvedCourseTable_*` directly without a school-selection step — always try `parseCourseList` before `parseSearchResults`
- CEEB codes from Claude may be numbers, not strings — always coerce with `String()` before use

## Storage Buckets

| Bucket | Access | Purpose |
|--------|--------|---------|
| `transcripts` | Private | Athlete transcript uploads |
| `demo-transcripts` | Public | Anonymized sample transcripts for the professor demo |

## Dev Tooling

`src/dev/` contains dev-only code that Vite excludes from production builds:

- **`personas.js`** — 3 athlete + 2 staff test personas with realistic funding request history
- **`DevSwitcher.jsx`** — floating black and yellow "DEV" button (bottom-right) for instant persona switching; navigates to the correct dashboard after switching; includes a "← Landing Page" option that signs out and returns to `/`

After `npm run seed`, use the DEV button to switch between any persona — it calls `signInWithPassword` so the full Supabase session and RLS context are real. All test accounts use password `devpass123` and email domain `@bandb.test`.

## Demo Page

`/demo` is a public page (no auth required) for the professor demo. It includes an app overview, DEV button instructions, all 5 test personas, download links for 3 anonymized sample transcripts, and step-by-step feature guides. The "Demo Guide" link appears in the Nav on every authenticated page and in the Landing page top bar and hero.
