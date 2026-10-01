-- The public eligibility tool computes everything in-memory per request and
-- never persists a transcript, an assessment, or any personal data. Drop the
-- now-dead persisted-history tables and add an anonymous usage counter.

drop table if exists public.eligibility_courses;
drop table if exists public.eligibility_assessments;

-- Only admins interact with ncaa_schools now (no more staff/student readers).
drop policy if exists "Authenticated users can read ncaa_schools" on public.ncaa_schools;

-- One row per successfully completed public eligibility check. No user data,
-- just a timestamp — written by process-transcript via the service role.
create table public.eligibility_checks (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.eligibility_checks enable row level security;

create policy "Admins can read eligibility_checks"
  on public.eligibility_checks for select
  using (public.is_admin());
