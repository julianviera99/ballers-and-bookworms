-- Replace ncaa_approved_courses_cache with a permanent, staff-managed ncaa_schools table.
-- Courses and grading scale are stored here; the scraper is called only from the staff UI.

create table public.ncaa_schools (
  ceeb_code         text        primary key,
  ncaa_portal_code  text,
  school_name       text        not null,
  state             text        not null,
  approved_courses  jsonb       not null default '[]'::jsonb,
  grading_scale     jsonb,
  last_scraped_at   timestamptz,
  manually_edited   boolean     not null default false,
  edited_by         uuid        references auth.users(id),
  edited_at         timestamptz,
  added_by          uuid        references auth.users(id),
  added_at          timestamptz not null default now()
);

alter table public.ncaa_schools enable row level security;

-- Staff can read and write; athletes have no direct access (all reads go through service role in edge functions)
create policy "Staff full access to ncaa_schools"
  on public.ncaa_schools
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Drop the old cache table
drop table if exists public.ncaa_approved_courses_cache;
