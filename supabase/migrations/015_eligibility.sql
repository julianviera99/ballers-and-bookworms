-- =============================================================================
-- NCAA Eligibility Checker
-- Tables: eligibility_assessments, eligibility_courses,
--         ncaa_approved_courses_cache
-- =============================================================================

-- ── 1. eligibility_assessments ───────────────────────────────────────────────

create table public.eligibility_assessments (
  id                       uuid        primary key default gen_random_uuid(),
  athlete_id               uuid        not null references public.student_athletes (id) on delete cascade,
  transcript_url           text,
  high_school_name         text,
  high_school_state        text,
  ncaa_school_code         text,
  overall_status           text        check (overall_status in ('on_track', 'at_risk', 'needs_attention')),
  core_course_gpa          numeric(4,3),
  total_core_credits       numeric(5,2),
  pre_7th_semester_credits numeric(5,2),
  assessment_date          date,
  created_at               timestamptz not null default now()
);

create index eligibility_assessments_athlete_id_idx
  on public.eligibility_assessments (athlete_id);

alter table public.eligibility_assessments enable row level security;

-- Athletes can read their own assessments
create policy "Athletes can select own assessments"
  on public.eligibility_assessments for select
  using (
    auth.uid() = (select user_id from public.student_athletes where id = athlete_id)
  );

-- Athletes can create assessments for themselves
create policy "Athletes can insert own assessments"
  on public.eligibility_assessments for insert
  with check (
    auth.uid() = (select user_id from public.student_athletes where id = athlete_id)
  );

-- Athletes can update their own assessments
create policy "Athletes can update own assessments"
  on public.eligibility_assessments for update
  using  (auth.uid() = (select user_id from public.student_athletes where id = athlete_id))
  with check (auth.uid() = (select user_id from public.student_athletes where id = athlete_id));

-- Staff can read all assessments
create policy "Staff can select all assessments"
  on public.eligibility_assessments for select
  using (public.is_staff());


-- ── 2. eligibility_courses ───────────────────────────────────────────────────

create table public.eligibility_courses (
  id              uuid    primary key default gen_random_uuid(),
  assessment_id   uuid    not null references public.eligibility_assessments (id) on delete cascade,
  course_name     text    not null,
  mapped_category text,
  credit          numeric(4,2),
  grade           text,
  quality_points  numeric(5,2),
  is_approved     boolean not null default false,
  confidence      text    check (confidence in ('high', 'medium', 'low')),
  needs_review    boolean not null default false
);

create index eligibility_courses_assessment_id_idx
  on public.eligibility_courses (assessment_id);

alter table public.eligibility_courses enable row level security;

-- Athletes can read courses belonging to their own assessments
create policy "Athletes can select own courses"
  on public.eligibility_courses for select
  using (
    auth.uid() = (
      select sa.user_id
      from   public.eligibility_assessments ea
      join   public.student_athletes        sa on sa.id = ea.athlete_id
      where  ea.id = assessment_id
    )
  );

-- Athletes can insert courses into their own assessments
create policy "Athletes can insert own courses"
  on public.eligibility_courses for insert
  with check (
    auth.uid() = (
      select sa.user_id
      from   public.eligibility_assessments ea
      join   public.student_athletes        sa on sa.id = ea.athlete_id
      where  ea.id = assessment_id
    )
  );

-- Athletes can update courses in their own assessments
create policy "Athletes can update own courses"
  on public.eligibility_courses for update
  using (
    auth.uid() = (
      select sa.user_id
      from   public.eligibility_assessments ea
      join   public.student_athletes        sa on sa.id = ea.athlete_id
      where  ea.id = assessment_id
    )
  )
  with check (
    auth.uid() = (
      select sa.user_id
      from   public.eligibility_assessments ea
      join   public.student_athletes        sa on sa.id = ea.athlete_id
      where  ea.id = assessment_id
    )
  );

-- Staff can read all courses
create policy "Staff can select all courses"
  on public.eligibility_courses for select
  using (public.is_staff());


-- ── 3. ncaa_approved_courses_cache ───────────────────────────────────────────
-- Written only by server-side scripts / edge functions via service_role.
-- No client insert/update policies — service_role bypasses RLS entirely.

create table public.ncaa_approved_courses_cache (
  id               uuid        primary key default gen_random_uuid(),
  ncaa_school_code text        not null unique,
  school_name      text,
  state            text,
  courses          jsonb       not null default '[]',
  scraped_at       timestamptz not null default now()
);

alter table public.ncaa_approved_courses_cache enable row level security;

-- Staff can read the cache (for inspection / debugging)
create policy "Staff can select course cache"
  on public.ncaa_approved_courses_cache for select
  using (public.is_staff());
