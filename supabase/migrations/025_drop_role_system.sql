-- Remove the school_staff / student role system and the invite system.
-- Only 'admin' exists as a role now (see 024_admin_table.sql).
-- student_athletes and funding_requests are left untouched — the funding
-- request feature is intentionally kept dormant-but-restorable, not deleted.

-- ── Drop policies that reference is_school_staff() / is_student() / my_school_id() ──

drop policy if exists "School staff can select own school athletes"    on public.student_athletes;
drop policy if exists "School staff can select own school assessments" on public.eligibility_assessments;
drop policy if exists "School staff can select own school courses"     on public.eligibility_courses;
drop policy if exists "School staff can update own school"             on public.ncaa_schools;

drop policy if exists "School staff can upload transcripts for their athletes" on storage.objects;
drop policy if exists "School staff can read transcripts for their athletes"   on storage.objects;

-- ── Drop the now-unused role-check functions ──────────────────────────────────

drop function if exists public.is_school_staff();
drop function if exists public.is_student();
drop function if exists public.my_school_id();

-- ── Drop the invite system ────────────────────────────────────────────────────

drop table if exists public.invitations;

-- ── Drop profiles and the role enum ───────────────────────────────────────────
-- (profiles' own policies drop automatically with the table)

drop function if exists public.get_admin_user_list();

drop table if exists public.profiles;
drop type  if exists public.user_role;
