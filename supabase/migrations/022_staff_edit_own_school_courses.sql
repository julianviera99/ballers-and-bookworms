-- Allow school staff to edit NCAA courses / grading scale for THEIR OWN school only.
-- ncaa_schools SELECT is already open to all authenticated users (020). Writes were
-- admin-only. This adds an UPDATE-only, school-scoped policy for staff so they can
-- manage their school's approved_courses (stored as jsonb on the school row) and
-- grading_scale. Staff still cannot INSERT/DELETE schools (add/remove from the DB).
--
-- profiles.school_id and ncaa_schools.ceeb_code are both CEEB codes, so the scope
-- check is a direct match. The WITH CHECK pins ceeb_code to the staff member's own
-- school, preventing them from reassigning the row to a different school.

create policy "School staff can update own school"
  on public.ncaa_schools
  for update
  to authenticated
  using      (public.is_school_staff() and ceeb_code = public.my_school_id())
  with check (public.is_school_staff() and ceeb_code = public.my_school_id());
