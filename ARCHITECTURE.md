# ARCHITECTURE.md

This document captures the full decision history behind the Ballers & Bookworms codebase — not just what the code does, but why it was built this way, what went wrong, what was deliberately left out, and where the fragile parts are. It is intended to give a new developer or Claude Code session enough context to make good decisions without repeating past mistakes.

---

## Table of Contents

1. [Major Technical Decisions](#1-major-technical-decisions)
2. [Significant Bugs and How They Were Resolved](#2-significant-bugs-and-how-they-were-resolved)
3. [Known Fragile Areas](#3-known-fragile-areas)
4. [Things Intentionally Left Out](#4-things-intentionally-left-out)

---

## 1. Major Technical Decisions

---

### 1.1 Claude vision for transcript parsing instead of a structured entry form

**Decision:** Athletes upload a transcript image or PDF. Claude Haiku reads it and extracts all course data automatically.

**Why:** The alternative was a manual entry form where athletes type in every course, grade, and credit. That would have been more reliable technically but far worse for users — transcripts can have 30+ courses across four years. The upload-and-parse approach required zero data entry.

**Cost:** AI variability became the main reliability problem. Claude misreads numbers, applies inconsistent grading scales, and produces different outputs for the same input when temperature is non-zero. Several bugs and fixes (see §2) were direct consequences of this choice. The determinism work (temperature=0, explicit grading rules) was added after encountering these problems in practice.

---

### 1.2 Two-pass Claude architecture for transcript processing

**Decision:** `process-transcript` makes two separate Claude calls. Pass 1 is cheap (256 max tokens, 20s timeout) and only extracts the school name, state, and CEEB code. Pass 2 is the full analysis (8192 max tokens, 60s timeout) and maps all courses.

**Why:** Without Pass 1, there is no way to show the user the extracted school name and let them confirm or correct it before the expensive analysis runs. The school name is used to fetch the NCAA approved course list — if it is wrong, every course mapping is wrong. The two-pass split also means the fast "school confirmation" step costs almost nothing, and the full analysis only runs once the school is confirmed.

**Alternative considered:** One large call that does everything. Rejected because it removes the ability to catch school misidentification before committing to the full analysis.

---

### 1.3 Explicit grading scale rules and temperature=0 for Pass 2

**Decision:** Pass 2 runs at `temperature: 0`. The system prompt includes a mandatory 4-step grading process: (1) identify the scale, (2) use the transcript's own printed legend if present, (3) apply exact 100-point cutoffs (90=A, 80=B, 70=C, 65=D, 0–64=F) when no legend exists, (4) best judgment for other scales. Plus/minus variants are suppressed unless the transcript's own legend specifies them.

**Why:** Without these rules, the same transcript uploaded twice produced different GPAs. Claude was inferring grading scales from context (school name, format, printed GPA) and applying different conventions across runs. A 62 was mapped to a B in one case because Claude likely misread it as 82, and in other cases because it inferred a non-standard scale. Setting temperature=0 eliminates run-to-run variation. The explicit cutoffs eliminate scale ambiguity for the most common case (100-point US scale).

**What is still non-deterministic:** For non-100-point scales with no printed legend (4.0 scales, unusual regional conventions), Claude still uses best judgment (step 4). This is an acceptable tradeoff — these cases are rare and harder to define rules for.

---

### 1.4 In-progress courses get credit=0 at the source

**Decision:** When building `extractedCourses`, any course whose grade has no valid entry in `GRADE_POINTS` (in-progress, blank, unrecognized) gets `credit: 0` and `quality_points: 0` before any GPA calculation happens.

**Why:** The first attempt filtered in-progress courses out of the GPA calculation after the fact using `gradedApproved = approvedOnly.filter(c => c.grade !== 'In Progress')`. This was fragile — if Claude returned "in progress", "IP", or any other variant, the filter missed it and the course's full credit went into the GPA denominator with zero quality points, artificially lowering the GPA. Zeroing credit at the source is more robust: it uses the same `GRADE_POINTS` lookup that drives quality point calculation, so any grade Claude can't assign points to automatically contributes nothing to either side of the GPA fraction. It also means in-progress courses display 0 credits in the UI and save 0 to the database, which is the correct representation.

---

### 1.5 GPA minimums enforced inside the eligibility check, not just displayed

**Decision:** `diEligible` requires `coreGpa >= 2.3`; `diiEligible` requires `coreGpa >= 2.2`. These thresholds are part of the boolean, not a separate downstream check.

**Why:** Originally, `diEligible` and `diiEligible` only checked course counts. A student who met all the course count requirements but had a 1.8 GPA was shown as "On Track" because `diEligible` was true. The fix was to incorporate the GPA threshold directly into the eligibility boolean so that `overall_status` correctly reflects it. This also means the `di.eligible` and `dii.eligible` fields returned in the API response are accurate, not just the `overall_status`.

---

### 1.6 Live NCAA portal scraping with 30-day cache instead of a static dataset

**Decision:** `scrape-ncaa-courses` fetches approved course lists from `web3.ncaa.org/hsportal` at request time and caches results per school for 30 days in `ncaa_approved_courses_cache`.

**Why:** The NCAA portal does not offer a bulk data export or public API. The approved course list is school-specific and changes when schools submit new courses for approval. A static copy would go stale. Live scraping with caching balances freshness against portal load and latency.

**Cost:** The portal has Akamai bot protection, requires a specific session establishment flow, and the form submission mechanics were non-obvious (see §2.1). This is the most operationally fragile part of the entire system.

---

### 1.7 CEEB-first search strategy on the NCAA portal

**Decision:** If a CEEB code is available (extracted by Pass 1), `scrape-ncaa-courses` searches by CEEB before falling back to name/state search.

**Why:** CEEB codes uniquely identify schools. A name/state search can return multiple matches (e.g. "Lincoln High" in a large state) and requires the user to disambiguate, adding a round trip. CEEB search skips this entirely. There is also a portal-specific behavior that makes CEEB search faster: when a CEEB uniquely identifies a school, the portal returns the approved course tables directly rather than a school-selection page (see §2.2).

---

### 1.8 pgvector cosine similarity for mentor matching instead of keyword filtering

**Decision:** Mentor matching uses pre-computed 1536-dimension embeddings (OpenAI text-embedding-3-small) stored in `mentor_embeddings`, with cosine similarity search via the `match_mentors()` Postgres function using the pgvector `<=>` operator.

**Why:** Keyword filtering would only match mentors whose profile text contains the exact words an athlete uses. Semantic similarity allows matches based on meaning — an athlete asking for help "balancing school and training" can match a mentor who lists "time management" as an area even without word overlap. This produces meaningfully better matches for the open-ended free-text requests athletes submit.

**Cost:** Infrastructure complexity: the embedding pipeline, `mentor_embeddings` table, the `match_mentors()` Postgres function, and the `embed-mentor` edge function. Mentor embeddings must be pre-computed and kept in sync with profile updates.

---

### 1.9 Embedding model evolution: OpenAI → Supabase built-in → OpenAI

**Decision (final):** 1536-dimension embeddings using OpenAI text-embedding-3-small.

**History:**
- **Migration 007** (original): OpenAI text-embedding-3-small, 1536 dims
- **Migration 013**: Switched to Supabase built-in AI (gte-small, 384 dims) to eliminate the OpenAI dependency and external API key requirement for the matching pipeline
- **Migration 014**: Switched back to OpenAI 1536 dims due to cold-start latency on Supabase's built-in AI model — the first request after a period of inactivity had unacceptable latency; OpenAI's embeddings API is always warm

Each dimension change required truncating `mentor_embeddings`, resizing the column, and dropping/recreating `match_mentors()`. All existing embeddings had to be regenerated via `npm run embed:mentors`.

---

### 1.10 Embedding trigger approach: pg_net → dropped → dashboard webhook

**History:**
- **Migration 009**: Added a Postgres trigger using `pg_net` to call `embed-mentor` automatically on mentor INSERT/UPDATE
- **Migration 010**: Dropped the trigger because hosted Supabase does not allow setting `app.settings.supabase_url` and `app.settings.service_role_key` in `postgresql.conf`, which the `pg_net` call depended on

**Current approach:** The Supabase dashboard has a Database Webhook configured (Database → Webhooks) that fires `embed-mentor` on `public.mentors` INSERT and UPDATE. This is not in the migration files and must be set up manually in a new project. The seed scripts call `embed-mentor` directly rather than relying on the webhook.

---

### 1.11 RLS as the sole security boundary

**Decision:** All data isolation is enforced through Postgres Row Level Security. The `is_staff()` helper function (defined in `002_profile_and_staff.sql`, `SECURITY DEFINER`) is used in policies across all tables. There are no application-level permission checks in the frontend or edge functions beyond verifying that the calling user is authenticated.

**Why:** RLS enforcement lives at the database layer and cannot be bypassed by a misconfigured edge function, a direct PostgREST call, or a bug in React state. Centralizing security in one place reduces the surface area for mistakes. `SECURITY DEFINER` on `is_staff()` means subqueries in other tables' RLS policies can call it without needing direct SELECT on `staff_users`.

**Implication:** Never add application-level permission checks as a substitute for an RLS policy. If a user should not be able to read a row, the RLS policy must enforce that — not a `if (isStaff)` check in a component.

---

### 1.12 staff_users as an email allowlist

**Decision:** Staff privileges are determined by the presence of a row in `staff_users`. There is no role column on `auth.users`. Only service-role code can insert into `staff_users` (no client insert policy).

**Why:** This prevents privilege escalation — a user cannot grant themselves staff access through any client-side operation. The service role key is never in the browser, so `staff_users` can only be modified via seed scripts or direct database access.

---

### 1.13 Supabase Edge Functions instead of a separate backend

**Decision:** All server-side logic (AI calls, scraping, email) lives in Deno-based Edge Functions deployed to Supabase.

**Why:** Keeps everything on one platform — database, auth, storage, and compute. No separate server to deploy, monitor, or pay for. The Supabase service role key is auto-injected into edge functions, eliminating a credential management problem.

**Cost:** Deno runtime has different module import conventions from Node (no npm, `https://esm.sh/` imports). 60-second execution limit required careful timeout management in `process-transcript`. Cold starts add latency on the first request after inactivity.

---

### 1.14 DEV persona switcher instead of documented test credentials

**Decision:** A floating black-and-yellow DEV button in the bottom-right corner of every page allows instant switching between any seeded persona without logging out or navigating to a login page. The switcher is in `src/dev/` and Vite tree-shakes it from production builds.

**Why:** Traditional test credentials (a README section with emails and passwords) require manual navigation to the login page and re-entry of credentials for each switch. The switcher makes demo and testing workflows significantly faster and was essential for the professor demo. It uses `signInWithPassword` rather than mocking sessions, so the full Supabase auth context and RLS policies are real.

---

### 1.15 Separate Supabase project for the professor demo submission

**Decision:** A second Supabase project (`vrzstkorkpzkckduimxf`) was created as a frozen copy of the main project for the professor's evaluation. It runs off the `dsail-submission` branch on Cloudflare Pages.

**Why:** Ongoing development on `main` could break the professor's experience if both the demo and development shared the same project. The frozen project means schema changes, redeployments, and seed resets on the main project have no effect on the submission environment.

**How it was built:** All 17 migrations were applied via the Supabase Management API using a personal access token (no re-linking of the CLI). Edge functions were deployed with `--project-ref`. Seed scripts were run against a temporary `.env.new` file that was deleted afterward. The original `.env` was not changed.

---

## 2. Significant Bugs and How They Were Resolved

---

### 2.1 NCAA portal always returning its homepage instead of search results

**Symptom:** Every search request — by name, state, or CEEB — returned the portal's homepage HTML. The DIAG logs showed `#selectHsFormTable` was never present in the response.

**Root cause (two separate issues):**

1. **Wrong session URL.** The scraper was establishing its session by GETting the portal homepage (`homeAction`). This gave a `JSESSIONID` cookie, but that session was not associated with the search form. The portal requires a GET to `?hsActionSubmit=searchHighSchool` to initialize a session that can process search submissions.

2. **`hsActionSubmit` in the query string instead of the POST body.** The search was POSTing to `/hsAction?hsActionSubmit=Search`. The portal's form submit button sends `hsActionSubmit=Search` as a form field in the POST body, to `/hsAction` with no query string. Putting it in the query string only navigates to the search form — it does not submit a search.

**Fix:** Changed the session GET URL to `NCAA_SESSION_URL` (`?hsActionSubmit=searchHighSchool`) and moved `hsActionSubmit=Search` into the `URLSearchParams` POST body targeting `NCAA_ACTION_URL` (`/hsAction` with no query string).

---

### 2.2 CEEB search returning no results even after the portal fix

**Symptom:** After fixing the session and POST body issues, name/state searches worked correctly but CEEB searches still returned nothing.

**Root cause:** The old code parsed CEEB search results by looking for `#selectHsFormTable` (the school-selection list). But when a CEEB code uniquely identifies a school, the portal skips the school-selection step entirely and returns the approved course tables (`#approvedCourseTable_1` through `#approvedCourseTable_5`) directly in the same response. The code was looking for something that was never going to be there.

**Fix:** After a CEEB search, try `parseCourseList()` first. If it finds course tables, return them directly via `cacheAndReturn()` without a second round trip. Only fall through to `parseSearchResults()` if no course tables are found.

---

### 2.3 CEEB code always empty in the scraper's search body

**Symptom:** DIAG logs showed `ceebCode: ""` in the search body even when Pass 1 had successfully extracted a CEEB code like `310148`.

**Root cause (two separate issues):**

1. **Type coercion.** Claude sometimes returns CEEB codes as JSON numbers (`310148`) rather than strings (`"310148"`). The code called `schoolInfo.ceeb_code?.trim()`, which fails silently when called on a number — `trim` is not a method on numbers, so the result was `undefined`, which then became `null`. Fix: `String(schoolInfo.ceeb_code).trim()` in both `process-transcript` and `scrape-ncaa-courses`.

2. **React state closure.** In `Eligibility.jsx`, the two-step flow stores the CEEB code in React state via `setExtractedCeebCode`. If Pass 1 returns `ceeb_code: null` (because the CEEB was not visible on the transcript), the state stays null and the second call correctly omits it. But if the value was a number that got coerced to null before being stored, the state was never set correctly. This was resolved by fixing issue 1.

---

### 2.4 `sessionCookie` referenced before declaration in the scraper

**Symptom:** JavaScript `ReferenceError` in `scrape-ncaa-courses` when the `ncaa_school_code` fast path was taken.

**Root cause:** A refactor moved the `ncaa_school_code` fast path (which bypassed the school search and jumped directly to course fetching) to run before the session establishment block. The fast path called `scrapeSchool(admin, code, ..., sessionCookie)` but `sessionCookie` was declared with `let` further down in the function.

**Fix:** Moved session establishment before the fast path check so `sessionCookie` is always defined by the time any code path needs it.

---

### 2.5 Anthropic API returning 403 Cloudflare challenge

**Symptom:** `process-transcript` was failing with a 403 response from `api.anthropic.com`. The response body was a Cloudflare challenge HTML page.

**Root cause:** The `ANTHROPIC_API_KEY` secret in Supabase Edge Functions had expired or been revoked. Anthropic's API returns a Cloudflare challenge when the key is invalid rather than a standard 401.

**Fix:** Generated a new API key in the Anthropic Console, updated the secret in Supabase Dashboard → Edge Functions → Secrets, and redeployed `process-transcript`.

---

### 2.6 Inconsistent grade conversion across runs

**Symptom:** Uploading the same transcript multiple times produced different letter grades and GPAs. A 62 was mapped to a B in one run.

**Root cause:** The Pass 2 system prompt only said "normalize to A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F" with no scale definition. Claude inferred a grading scale from context — school name, format, GPA already printed on the transcript — and applied different conventions each run. The 62→B case was most likely a visual misread (62 read as 82) compounded by temperature > 0 introducing variation.

**Fix:** Set `temperature: 0` on the Pass 2 Claude call. Added a mandatory 4-step grading decision tree to the system prompt with hard numeric cutoffs for 100-point scales and explicit suppression of plus/minus variants unless the transcript's own scale legend specifies them.

---

### 2.7 In-progress courses inflating the GPA denominator

**Symptom:** Students with in-progress senior year courses had artificially low GPAs. Each in-progress course was contributing its full credit (typically 1.0) to the GPA denominator while contributing 0 to the numerator.

**Root cause:** In-progress courses had `quality_points: 0` (correct — no grade) but retained their `credit` value (incorrect — not yet earned). The GPA formula is `totalQualityPoints / totalCoreCredits`. Adding a course with 0 quality points but 1.0 credit lowers the GPA.

**First fix attempt:** Added a `gradedApproved` filter: `approvedOnly.filter(c => c.grade !== 'In Progress')`. This was fragile — if Claude returned "in progress", "IP", or blank, the filter missed it.

**Second fix attempt:** Changed the filter to check `GRADE_POINTS[c.grade] !== undefined`. Still fragile for the same reason, and the filter was downstream of where the problem originated.

**Final fix:** Zero out `credit` at the source when building `extractedCourses`: if `GRADE_POINTS[c.grade]` is null (no valid quality point value exists for this grade string), set `credit: 0` and `quality_points: 0`. This means in-progress courses have `credit: 0` everywhere — in the response, in the database, and in the GPA calculation — and no downstream filtering is needed.

---

### 2.8 Overall status showing "On Track" despite GPA below the minimum

**Symptom:** A student who met all 16 core course requirements with the correct subject distribution but had a 1.6 GPA was shown as "On Track" (DI eligible).

**Root cause:** `diEligible` and `diiEligible` only checked course counts. The GPA minimums (2.3 for DI, 2.2 for DII) were calculated and displayed separately but not included in the eligibility boolean. Since `diEligible` was true, `overall_status` resolved to `on_track`.

**Fix:** Added `&& coreGpa >= 2.3` to `diEligible` and `&& coreGpa >= 2.2` to `diiEligible`. Now a student below both GPA floors has both flags false, which drives `overall_status` to `needs_attention`.

---

### 2.9 DevSwitcher not navigating after persona switch

**Symptom:** Clicking a persona in the DevSwitcher signed in correctly but the page did not change. If used from `/demo`, the user stayed on `/demo` even though they were now authenticated as an athlete.

**Root cause:** `switchTo()` called `supabase.auth.signInWithPassword()` and on success just set `setSwitching(null)`. It did not navigate anywhere. The auth state change eventually propagated through `AuthContext`, but pages that don't listen for auth changes (like `/demo`) simply remained.

**Fix:** Added `window.location.replace(persona.role === 'staff' ? '/staff' : '/dashboard')` after a successful sign-in in `switchTo()`. Also added a `goToLanding()` function that signs out and calls `window.location.replace('/')`, exposed as a "← Landing Page" button in the switcher footer (necessary because the Landing page redirects authenticated users away from `/`).

---

### 2.10 Embedding dimension mismatch requiring two migrations

**Symptom:** After switching to Supabase built-in AI (gte-small, 384 dims) in migration 013, the mentor matching pipeline had unacceptable first-request latency due to Supabase's model cold-start behavior.

**Root cause:** Supabase's built-in AI model takes several seconds to warm up after a period of inactivity. OpenAI's embedding API is always warm. The latency was noticeable enough in the matching UX to warrant switching back.

**Fix:** Migration 014 switched back to OpenAI text-embedding-3-small (1536 dims). Both migrations required truncating `mentor_embeddings`, resizing the vector column, dropping and recreating `match_mentors()`, and regenerating all embeddings via `npm run embed:mentors`. The back-and-forth is preserved in the migration history and should not be repeated — the 1536/OpenAI choice is intentional.

---

## 3. Known Fragile Areas

---

### 3.1 NCAA portal scraper

**Why it is fragile:** The scraper depends on:
- A specific GET URL to establish a valid search session (`?hsActionSubmit=searchHighSchool`)
- `hsActionSubmit=Search` sent as a POST body field, not a query parameter
- Akamai bot protection that currently allows the requests but could begin blocking server IPs at any time
- The HTML structure of `#selectHsFormTable` and `#approvedCourseTable_1..5` not changing
- The `JSESSIONID` cookie being accepted without additional fingerprinting checks

Any change to the portal's session flow, form submission mechanics, or HTML structure will silently break the scraper — it will return `not_found` for all schools without throwing an error. The 30-day cache means breakage may not be noticed immediately for schools that were recently cached.

**What to watch for:** If `scrape-ncaa-courses` suddenly returns `not_found` for schools that were previously found, check the DIAG logs in `process-transcript` for the raw HTML returned by the portal. A homepage response (containing "NCAA Home") indicates a session/POST issue. A response with no course tables but also no homepage content may indicate an HTML structure change.

---

### 3.2 Synchronous transcript processing

**Why it is fragile:** `process-transcript` must complete within Supabase's 60-second edge function limit. The pipeline includes: a Claude Pass 1 call (fast), an internal HTTP call to `scrape-ncaa-courses` (variable — first call for a school can take 5–10 seconds), and a Claude Pass 2 call (slow — up to 30 seconds for a dense transcript). Under normal conditions this fits within 60 seconds. Under adverse conditions (slow NCAA portal, large PDF, Claude API latency) it can time out.

**Current mitigations:** 20-second timeout on Pass 1, 60-second timeout on Pass 2, 10-second timeout on the NCAA scrape. The client has a 30-second timeout that will fire before the edge function limit.

**What will break it:** PDFs over ~5MB, especially multi-page PDFs. Slow NCAA portal responses on first cache miss. Claude API degradation events.

---

### 3.3 Mentor embeddings have no monitoring or recovery

**Why it is fragile:** If `embed-mentor` fails during the seed process (network error, Supabase AI timeout, OpenAI rate limit), the mentor gets inserted into `mentors` with no corresponding row in `mentor_embeddings`. That mentor will never appear in search results. There is no alert, no dashboard indicator, and no automatic retry. The only way to detect it is to query `mentors` LEFT JOIN `mentor_embeddings` and look for NULLs.

**Recovery:** Run `npm run embed:mentors` which re-calls `embed-mentor` for any mentor missing an embedding.

---

### 3.4 DIAG logging in process-transcript

**What it is:** A diagnostic logging block added during the NCAA scraper debugging session. It calls Claude an extra time per request (raw text transcription), logs the full approved course list, the complete Pass 2 response, and a per-course token overlap comparison for non-approved courses. This runs on every transcript submission.

**Why it is still there:** It was left in place after the debugging session to verify the fix worked end-to-end. It should be removed once the transcript pipeline is confirmed stable, as it adds one extra Claude call per transcript upload.

**Where it is:** `process-transcript/index.ts`, lines starting with `[DIAG]` in `console.log` calls, in the block between the Pass 2 response and the GPA calculation.

---

### 3.5 Grade conversion for non-100-point scales

**Why it is fragile:** The explicit grading rules (step 3 of the system prompt) only apply to 100-point scales. For letter-only transcripts, 4.0 GPA scales, or other regional conventions, Claude uses "best judgment" (step 4). This is still non-deterministic in the sense that it depends on Claude's training — it is deterministic within a single model version but could change across model updates. Transcripts from schools that use non-standard scales (weighted GPAs, pass/fail, numeric scales other than 100-point) are the most likely to produce questionable grade conversions.

---

### 3.6 No rate limiting on edge functions

Any authenticated user can call `process-transcript` or `find-mentors` an unlimited number of times. Each `process-transcript` call makes 2–3 Claude API calls (including the DIAG call). Each `find-mentors` call makes 2 Claude calls and 1 OpenAI call. There is no per-user quota, no spending cap, and no circuit breaker. This is acceptable at small scale but would be exploitable at larger scale.

---

## 4. Things Intentionally Left Out

---

### 4.1 Receipt uploads for fund requests

**What:** The `funding_requests` table has a `receipt_url` column. The schema supports storing receipts in Supabase Storage.

**Why left out:** The receipt upload UI was not implemented. The column is there for future use but nothing writes to it. Staff currently rely on the request description text when evaluating requests.

---

### 4.2 Budget rollover between academic years

**What:** The $1,000 annual budget limit is a display convention in the UI based on summing approved/pending requests. There is no year column on `funding_requests`, no academic year boundary logic, and no rollover mechanism.

**Why left out:** The scope of the project did not require year-based budget management. A real deployment would need to define the academic year, enforce the limit in the database rather than just displaying it, and handle rollovers.

---

### 4.3 Multi-step approval workflow

**What:** Fund requests have a single `status` field. There is no approval chain, no secondary review step, and no distinction between who approved what.

**Why left out:** For the current use case (small organization, known staff), a single approval step is sufficient. A multi-step workflow (e.g. coach recommends → admin approves) would require a separate approvals table, notification triggers, and additional UI.

---

### 4.4 Audit logs

**What:** There is no record of who changed a fund request's status, when, or from what previous value.

**Why left out:** Adds schema and trigger complexity that was not needed at this scale. The `updated_at` column on `funding_requests` shows when the last change happened but not by whom or what the previous status was.

---

### 4.5 Admin tooling

**What:** There is no super-admin interface. Adding staff members, adjusting per-athlete budget limits, viewing platform-wide analytics, moderating mentor applications, and managing the NCAA course cache all require direct database access.

**Why left out:** The platform was built for a small, known organization. Direct database access via the Supabase dashboard was sufficient for administrative tasks during this phase.

---

### 4.6 Email verification for athletes

**What:** Athletes sign in with GitHub OAuth. There is no email verification step, no onboarding form to verify school affiliation, and no mechanism to confirm that a person claiming to be a student athlete at a specific school actually is.

**Why left out:** The app is private (invite-only by nature of GitHub OAuth being the only login method). The user base is assumed to be known to the organization. A production deployment with open registration would need identity verification.

---

### 4.7 Async job queue for transcript processing

**What:** Transcript processing is synchronous — the HTTP request from the browser must stay open until the entire pipeline completes (up to 60 seconds). There is no background job system, no polling endpoint, and no websocket notification.

**Why left out:** Async job infrastructure (a queue table, a worker, a polling or push mechanism) would have significantly increased complexity. The synchronous approach works within Supabase's 60-second edge function limit for the current transcript sizes and typical API response times. It was identified as a known limitation rather than built around.

---

### 4.8 Automated tests

**What:** There is no test suite. No unit tests, no integration tests, no end-to-end tests.

**Why left out:** The project was built and iterated quickly. The eligibility logic (GPA calculation, course counting, 10/7 rule) is the highest-risk area — a silent regression could give athletes incorrect NCAA eligibility information. This is the first place tests should be added.

---

### 4.9 NAIA and NJCAA eligibility

**What:** The eligibility checker only calculates NCAA DI and DII eligibility. NAIA and NJCAA have different core course requirements and are not covered.

**Why left out:** NCAA DI/DII is the primary use case for the target user base. Adding NAIA and NJCAA would require separate rule sets, additional UI sections, and potentially different course approval lists.

---

### 4.10 Additional Preferences field in Find a Mentor

**What:** The Find a Mentor form previously had a second textarea labeled "Additional preferences (optional)" where athletes could add context beyond the main request.

**Why removed:** It was redundant with the main free-text request box — anything the athlete could write in "Additional preferences" could also be written in the main box. It was also buggy (the content was appended to the main request before the API call in a way that introduced inconsistent formatting). It was removed in favor of encouraging athletes to be specific in the single main request field.
