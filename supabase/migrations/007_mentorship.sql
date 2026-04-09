-- =============================================================================
-- Mentorship platform tables
-- =============================================================================


-- -----------------------------------------------------------------------------
-- mentors
-- One row per mentor. Mentors register with a Supabase account (user_id).
-- Status starts as 'pending' until staff approves.
-- -----------------------------------------------------------------------------
create table public.mentors (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null unique references auth.users (id) on delete cascade,
  name             text        not null,
  photo_url        text,
  hometown         text,
  state            text,
  sport            text,
  college          text,
  division         text,
  major            text,
  current_job      text,
  current_employer text,
  bio              text,
  status           text        not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.mentors enable row level security;

create trigger set_mentors_updated_at
  before update on public.mentors
  for each row execute function public.set_updated_at();

-- Mentors can read their own profile
create policy "Mentors can select own profile"
  on public.mentors for select
  using (auth.uid() = user_id);

-- Mentors can register (insert their own row)
create policy "Mentors can insert own profile"
  on public.mentors for insert
  with check (auth.uid() = user_id);

-- Mentors can edit their own profile (status is staff-controlled — staff policy below takes precedence)
create policy "Mentors can update own profile"
  on public.mentors for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Any authenticated user (mentees) can browse active mentor profiles
create policy "Authenticated users can view active mentors"
  on public.mentors for select
  using (status = 'active' and auth.uid() is not null);

-- Staff can read and write everything
create policy "Staff can select all mentors"
  on public.mentors for select
  using (public.is_staff());

create policy "Staff can insert mentors"
  on public.mentors for insert
  with check (public.is_staff());

create policy "Staff can update all mentors"
  on public.mentors for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can delete mentors"
  on public.mentors for delete
  using (public.is_staff());


-- -----------------------------------------------------------------------------
-- mentor_mentorship_areas
-- The areas/topics a mentor is willing to help with.
-- Examples: area = 'SAT prep', category = 'academic'
-- -----------------------------------------------------------------------------
create table public.mentor_mentorship_areas (
  id        uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.mentors (id) on delete cascade,
  area      text not null,
  category  text not null
);

alter table public.mentor_mentorship_areas enable row level security;

-- Mentors can manage their own areas
create policy "Mentors can select own areas"
  on public.mentor_mentorship_areas for select
  using (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

create policy "Mentors can insert own areas"
  on public.mentor_mentorship_areas for insert
  with check (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

create policy "Mentors can delete own areas"
  on public.mentor_mentorship_areas for delete
  using (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

-- Mentees can see areas for active mentors
create policy "Authenticated users can view areas of active mentors"
  on public.mentor_mentorship_areas for select
  using (
    auth.uid() is not null and
    exists (
      select 1 from public.mentors m
      where m.id = mentor_id and m.status = 'active'
    )
  );

-- Staff can read and write everything
create policy "Staff can select all areas"
  on public.mentor_mentorship_areas for select
  using (public.is_staff());

create policy "Staff can insert areas"
  on public.mentor_mentorship_areas for insert
  with check (public.is_staff());

create policy "Staff can delete areas"
  on public.mentor_mentorship_areas for delete
  using (public.is_staff());


-- -----------------------------------------------------------------------------
-- mentor_availability
-- How much time a mentor can give, in what format, and from which timezone.
-- -----------------------------------------------------------------------------
create table public.mentor_availability (
  id             uuid    primary key default gen_random_uuid(),
  mentor_id      uuid    not null unique references public.mentors (id) on delete cascade,
  hours_per_week integer not null check (hours_per_week > 0),
  format         text    not null,
  timezone       text    not null
);

alter table public.mentor_availability enable row level security;

-- Mentors can manage their own availability
create policy "Mentors can select own availability"
  on public.mentor_availability for select
  using (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

create policy "Mentors can insert own availability"
  on public.mentor_availability for insert
  with check (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

create policy "Mentors can update own availability"
  on public.mentor_availability for update
  using (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

create policy "Mentors can delete own availability"
  on public.mentor_availability for delete
  using (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

-- Mentees can see availability for active mentors
create policy "Authenticated users can view availability of active mentors"
  on public.mentor_availability for select
  using (
    auth.uid() is not null and
    exists (
      select 1 from public.mentors m
      where m.id = mentor_id and m.status = 'active'
    )
  );

-- Staff can read and write everything
create policy "Staff can select all availability"
  on public.mentor_availability for select
  using (public.is_staff());

create policy "Staff can insert availability"
  on public.mentor_availability for insert
  with check (public.is_staff());

create policy "Staff can update all availability"
  on public.mentor_availability for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can delete availability"
  on public.mentor_availability for delete
  using (public.is_staff());


-- -----------------------------------------------------------------------------
-- mentee_intake
-- Submitted by student athletes when requesting a mentor match.
-- The plain_text_request is what gets embedded for similarity matching.
-- -----------------------------------------------------------------------------
create table public.mentee_intake (
  id                 uuid        primary key default gen_random_uuid(),
  athlete_id         uuid        not null references public.student_athletes (id) on delete cascade,
  plain_text_request text        not null,
  sport              text,
  grade              text,
  format_preference  text,
  hours_preference   text,
  created_at         timestamptz not null default now()
);

alter table public.mentee_intake enable row level security;

-- Athletes can submit and view their own intake forms
create policy "Athletes can insert own intake"
  on public.mentee_intake for insert
  with check (exists (
    select 1 from public.student_athletes sa
    where sa.id = athlete_id and sa.user_id = auth.uid()
  ));

create policy "Athletes can select own intake"
  on public.mentee_intake for select
  using (exists (
    select 1 from public.student_athletes sa
    where sa.id = athlete_id and sa.user_id = auth.uid()
  ));

-- Staff can read and write everything
create policy "Staff can select all intake"
  on public.mentee_intake for select
  using (public.is_staff());

create policy "Staff can delete intake"
  on public.mentee_intake for delete
  using (public.is_staff());


-- -----------------------------------------------------------------------------
-- matches
-- Produced by the matching pipeline. Staff reviews before confirming.
-- match_score is typically cosine similarity (0–1).
-- -----------------------------------------------------------------------------
create table public.matches (
  id                uuid        primary key default gen_random_uuid(),
  mentor_id         uuid        not null references public.mentors (id) on delete cascade,
  mentee_id         uuid        not null references public.student_athletes (id) on delete cascade,
  match_score       numeric(5,4) check (match_score between 0 and 1),
  match_explanation text,
  status            text        not null default 'pending_review' check (status in (
                      'pending_review', 'confirmed', 'declined', 'completed'
                    )),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.matches enable row level security;

create trigger set_matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- Mentees can see their own matches
create policy "Mentees can select own matches"
  on public.matches for select
  using (exists (
    select 1 from public.student_athletes sa
    where sa.id = mentee_id and sa.user_id = auth.uid()
  ));

-- Mentors can see matches they are part of
create policy "Mentors can select own matches"
  on public.matches for select
  using (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

-- Staff can read and write everything
create policy "Staff can select all matches"
  on public.matches for select
  using (public.is_staff());

create policy "Staff can insert matches"
  on public.matches for insert
  with check (public.is_staff());

create policy "Staff can update all matches"
  on public.matches for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can delete matches"
  on public.matches for delete
  using (public.is_staff());


-- -----------------------------------------------------------------------------
-- mentor_embeddings
-- One vector(1536) per mentor, computed server-side by the matching pipeline.
-- Not directly exposed to the client — read/write via service role only.
-- Staff can inspect for debugging; all other access is denied.
-- -----------------------------------------------------------------------------
create table public.mentor_embeddings (
  id        uuid                    primary key default gen_random_uuid(),
  mentor_id uuid                    not null unique references public.mentors (id) on delete cascade,
  embedding vector(1536)            not null
);

alter table public.mentor_embeddings enable row level security;

create policy "Staff can select embeddings"
  on public.mentor_embeddings for select
  using (public.is_staff());

create policy "Staff can insert embeddings"
  on public.mentor_embeddings for insert
  with check (public.is_staff());

create policy "Staff can update embeddings"
  on public.mentor_embeddings for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can delete embeddings"
  on public.mentor_embeddings for delete
  using (public.is_staff());
