-- =============================================================================
-- 020_three_role_system.sql
-- Replaces binary staff/student split with three roles: admin, school_staff, student.
-- Adds invite-only signup (invitations table).
-- Drops staff_users and is_staff() once all dependent policies are replaced.
-- =============================================================================

-- ─── 1. New enum, tables, and column ─────────────────────────────────────────

CREATE TYPE public.user_role AS ENUM ('admin', 'school_staff', 'student');

CREATE TABLE public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role       user_role   NOT NULL,
  school_id  text        REFERENCES public.ncaa_schools (ceeb_code) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  role        user_role   NOT NULL,
  school_id   text        REFERENCES public.ncaa_schools (ceeb_code) ON DELETE SET NULL,
  token       text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by  uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at  timestamptz
);

CREATE INDEX invitations_token_idx ON public.invitations (token);
CREATE INDEX invitations_email_idx ON public.invitations (email);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_athletes
  ADD COLUMN IF NOT EXISTS school_ceeb_code text
    REFERENCES public.ncaa_schools (ceeb_code) ON DELETE SET NULL;

-- ─── 2. Backfill profiles ─────────────────────────────────────────────────────

-- Hard-coded admins (julianviera99@gmail.com added in migration 021 as well)
INSERT INTO public.profiles (id, role)
SELECT au.id, 'admin'::user_role
FROM auth.users au
WHERE au.email IN ('julian@ballersandbookworms.org', 'julianviera99@gmail.com')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Other pre-seeded staff_users → admin
INSERT INTO public.profiles (id, role)
SELECT au.id, 'admin'::user_role
FROM public.staff_users su
JOIN auth.users au ON (au.id = su.user_id OR au.email = su.email)
WHERE au.email IS DISTINCT FROM 'julian@ballersandbookworms.org'
ON CONFLICT (id) DO NOTHING;

-- Existing student athletes → student
INSERT INTO public.profiles (id, role)
SELECT sa.user_id, 'student'::user_role
FROM public.student_athletes sa
WHERE sa.user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ─── 3. New helper functions ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_school_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'school_staff'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'student'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_school_id()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ─── 4. Drop all old is_staff()-dependent policies ───────────────────────────

-- student_athletes
DROP POLICY IF EXISTS "Users can select their own row"        ON public.student_athletes;
DROP POLICY IF EXISTS "Users can insert their own row"        ON public.student_athletes;
DROP POLICY IF EXISTS "Users can update their own row"        ON public.student_athletes;
DROP POLICY IF EXISTS "Users can delete their own row"        ON public.student_athletes;
DROP POLICY IF EXISTS "Staff can select all student athletes" ON public.student_athletes;

-- funding_requests
DROP POLICY IF EXISTS "Students can select own requests" ON public.funding_requests;
DROP POLICY IF EXISTS "Students can insert own requests" ON public.funding_requests;
DROP POLICY IF EXISTS "Staff can select all requests"    ON public.funding_requests;
DROP POLICY IF EXISTS "Staff can update all requests"    ON public.funding_requests;

-- mentors
DROP POLICY IF EXISTS "Mentors can select own profile"              ON public.mentors;
DROP POLICY IF EXISTS "Mentors can insert own profile"              ON public.mentors;
DROP POLICY IF EXISTS "Mentors can update own profile"              ON public.mentors;
DROP POLICY IF EXISTS "Authenticated users can view active mentors" ON public.mentors;
DROP POLICY IF EXISTS "Staff can select all mentors"                ON public.mentors;
DROP POLICY IF EXISTS "Staff can insert mentors"                    ON public.mentors;
DROP POLICY IF EXISTS "Staff can update all mentors"                ON public.mentors;
DROP POLICY IF EXISTS "Staff can delete mentors"                    ON public.mentors;

-- mentor_mentorship_areas
DROP POLICY IF EXISTS "Mentors can select own areas"                        ON public.mentor_mentorship_areas;
DROP POLICY IF EXISTS "Mentors can insert own areas"                        ON public.mentor_mentorship_areas;
DROP POLICY IF EXISTS "Mentors can delete own areas"                        ON public.mentor_mentorship_areas;
DROP POLICY IF EXISTS "Authenticated users can view areas of active mentors" ON public.mentor_mentorship_areas;
DROP POLICY IF EXISTS "Staff can select all areas"                          ON public.mentor_mentorship_areas;
DROP POLICY IF EXISTS "Staff can insert areas"                              ON public.mentor_mentorship_areas;
DROP POLICY IF EXISTS "Staff can delete areas"                              ON public.mentor_mentorship_areas;

-- mentor_availability
DROP POLICY IF EXISTS "Mentors can select own availability"                         ON public.mentor_availability;
DROP POLICY IF EXISTS "Mentors can insert own availability"                         ON public.mentor_availability;
DROP POLICY IF EXISTS "Mentors can update own availability"                         ON public.mentor_availability;
DROP POLICY IF EXISTS "Mentors can delete own availability"                         ON public.mentor_availability;
DROP POLICY IF EXISTS "Authenticated users can view availability of active mentors" ON public.mentor_availability;
DROP POLICY IF EXISTS "Staff can select all availability"                           ON public.mentor_availability;
DROP POLICY IF EXISTS "Staff can insert availability"                               ON public.mentor_availability;
DROP POLICY IF EXISTS "Staff can update all availability"                           ON public.mentor_availability;
DROP POLICY IF EXISTS "Staff can delete availability"                               ON public.mentor_availability;

-- mentee_intake
DROP POLICY IF EXISTS "Athletes can insert own intake" ON public.mentee_intake;
DROP POLICY IF EXISTS "Athletes can select own intake" ON public.mentee_intake;
DROP POLICY IF EXISTS "Staff can select all intake"    ON public.mentee_intake;
DROP POLICY IF EXISTS "Staff can delete intake"        ON public.mentee_intake;

-- matches
DROP POLICY IF EXISTS "Mentees can select own matches" ON public.matches;
DROP POLICY IF EXISTS "Mentors can select own matches" ON public.matches;
DROP POLICY IF EXISTS "Staff can select all matches"   ON public.matches;
DROP POLICY IF EXISTS "Staff can insert matches"       ON public.matches;
DROP POLICY IF EXISTS "Staff can update all matches"   ON public.matches;
DROP POLICY IF EXISTS "Staff can delete matches"       ON public.matches;

-- mentor_embeddings
DROP POLICY IF EXISTS "Staff can select embeddings" ON public.mentor_embeddings;
DROP POLICY IF EXISTS "Staff can insert embeddings" ON public.mentor_embeddings;
DROP POLICY IF EXISTS "Staff can update embeddings" ON public.mentor_embeddings;
DROP POLICY IF EXISTS "Staff can delete embeddings" ON public.mentor_embeddings;

-- session_requests
DROP POLICY IF EXISTS "Athletes can insert own session requests" ON public.session_requests;
DROP POLICY IF EXISTS "Athletes can select own session requests" ON public.session_requests;
DROP POLICY IF EXISTS "Mentors can select own session requests"  ON public.session_requests;
DROP POLICY IF EXISTS "Staff can manage session requests"        ON public.session_requests;

-- eligibility_assessments
DROP POLICY IF EXISTS "Athletes can select own assessments" ON public.eligibility_assessments;
DROP POLICY IF EXISTS "Athletes can insert own assessments" ON public.eligibility_assessments;
DROP POLICY IF EXISTS "Athletes can update own assessments" ON public.eligibility_assessments;
DROP POLICY IF EXISTS "Staff can select all assessments"    ON public.eligibility_assessments;

-- eligibility_courses
DROP POLICY IF EXISTS "Athletes can select own courses" ON public.eligibility_courses;
DROP POLICY IF EXISTS "Athletes can insert own courses" ON public.eligibility_courses;
DROP POLICY IF EXISTS "Athletes can update own courses" ON public.eligibility_courses;
DROP POLICY IF EXISTS "Staff can select all courses"    ON public.eligibility_courses;

-- ncaa_schools
DROP POLICY IF EXISTS "Staff full access to ncaa_schools" ON public.ncaa_schools;

-- storage: receipts bucket
DROP POLICY IF EXISTS "Users can upload own receipts"     ON storage.objects;
DROP POLICY IF EXISTS "Users and staff can read receipts" ON storage.objects;

-- storage: transcripts bucket
DROP POLICY IF EXISTS "Users can upload own transcripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own transcripts"   ON storage.objects;
DROP POLICY IF EXISTS "Staff can read all transcripts"   ON storage.objects;

-- staff_users own policies
DROP POLICY IF EXISTS "Staff can read own record"    ON public.staff_users;
DROP POLICY IF EXISTS "Staff can link their user_id" ON public.staff_users;

-- ─── 5. Drop is_staff() and staff_users ─────────────────────────────────────

DROP FUNCTION IF EXISTS public.is_staff();
DROP TABLE  IF EXISTS public.staff_users;

-- ─── 6. New RLS policies ─────────────────────────────────────────────────────

-- ── profiles ──────────────────────────────────────────────────────────────────

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── invitations ───────────────────────────────────────────────────────────────

CREATE POLICY "Admins can manage invitations"
  ON public.invitations FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── student_athletes ──────────────────────────────────────────────────────────

CREATE POLICY "Students can select own athlete row"
  ON public.student_athletes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Students can insert own athlete row"
  ON public.student_athletes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update own athlete row"
  ON public.student_athletes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can delete own athlete row"
  ON public.student_athletes FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can select all student athletes"
  ON public.student_athletes FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all student athletes"
  ON public.student_athletes FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "School staff can select own school athletes"
  ON public.student_athletes FOR SELECT
  USING (public.is_school_staff() AND school_ceeb_code = public.my_school_id());

-- ── funding_requests ──────────────────────────────────────────────────────────

CREATE POLICY "Students can select own requests"
  ON public.funding_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Students can insert own requests"
  ON public.funding_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can select all requests"
  ON public.funding_requests FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all requests"
  ON public.funding_requests FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── mentors ───────────────────────────────────────────────────────────────────

CREATE POLICY "Mentors can select own profile"
  ON public.mentors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Mentors can insert own profile"
  ON public.mentors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Mentors can update own profile"
  ON public.mentors FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view active mentors"
  ON public.mentors FOR SELECT
  USING (status = 'active' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can select all mentors"
  ON public.mentors FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert mentors"
  ON public.mentors FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update all mentors"
  ON public.mentors FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete mentors"
  ON public.mentors FOR DELETE
  USING (public.is_admin());

-- ── mentor_mentorship_areas ───────────────────────────────────────────────────

CREATE POLICY "Mentors can select own areas"
  ON public.mentor_mentorship_areas FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.user_id = auth.uid()));

CREATE POLICY "Mentors can insert own areas"
  ON public.mentor_mentorship_areas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.user_id = auth.uid()));

CREATE POLICY "Mentors can delete own areas"
  ON public.mentor_mentorship_areas FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.user_id = auth.uid()));

CREATE POLICY "Authenticated users can view areas of active mentors"
  ON public.mentor_mentorship_areas FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.status = 'active')
  );

CREATE POLICY "Admins can select all areas"
  ON public.mentor_mentorship_areas FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert areas"
  ON public.mentor_mentorship_areas FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete areas"
  ON public.mentor_mentorship_areas FOR DELETE
  USING (public.is_admin());

-- ── mentor_availability ───────────────────────────────────────────────────────

CREATE POLICY "Mentors can select own availability"
  ON public.mentor_availability FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.user_id = auth.uid()));

CREATE POLICY "Mentors can insert own availability"
  ON public.mentor_availability FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.user_id = auth.uid()));

CREATE POLICY "Mentors can update own availability"
  ON public.mentor_availability FOR UPDATE
  USING  (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.user_id = auth.uid()));

CREATE POLICY "Mentors can delete own availability"
  ON public.mentor_availability FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.user_id = auth.uid()));

CREATE POLICY "Authenticated users can view availability of active mentors"
  ON public.mentor_availability FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.mentors m WHERE m.id = mentor_id AND m.status = 'active')
  );

CREATE POLICY "Admins can select all availability"
  ON public.mentor_availability FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert availability"
  ON public.mentor_availability FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update all availability"
  ON public.mentor_availability FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete availability"
  ON public.mentor_availability FOR DELETE
  USING (public.is_admin());

-- ── mentee_intake ─────────────────────────────────────────────────────────────

CREATE POLICY "Athletes can insert own intake"
  ON public.mentee_intake FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.student_athletes sa
    WHERE sa.id = athlete_id AND sa.user_id = auth.uid()
  ));

CREATE POLICY "Athletes can select own intake"
  ON public.mentee_intake FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.student_athletes sa
    WHERE sa.id = athlete_id AND sa.user_id = auth.uid()
  ));

CREATE POLICY "Admins can select all intake"
  ON public.mentee_intake FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can delete intake"
  ON public.mentee_intake FOR DELETE
  USING (public.is_admin());

-- ── matches ───────────────────────────────────────────────────────────────────

CREATE POLICY "Mentees can select own matches"
  ON public.matches FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.student_athletes sa
    WHERE sa.id = mentee_id AND sa.user_id = auth.uid()
  ));

CREATE POLICY "Mentors can select own matches"
  ON public.matches FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.mentors m
    WHERE m.id = mentor_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "Admins can select all matches"
  ON public.matches FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert matches"
  ON public.matches FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update all matches"
  ON public.matches FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete matches"
  ON public.matches FOR DELETE
  USING (public.is_admin());

-- ── session_requests ──────────────────────────────────────────────────────────

CREATE POLICY "Athletes can insert own session requests"
  ON public.session_requests FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.student_athletes sa
    WHERE sa.id = mentee_id AND sa.user_id = auth.uid()
  ));

CREATE POLICY "Athletes can select own session requests"
  ON public.session_requests FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.student_athletes sa
    WHERE sa.id = mentee_id AND sa.user_id = auth.uid()
  ));

CREATE POLICY "Mentors can select own session requests"
  ON public.session_requests FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.mentors m
    WHERE m.id = mentor_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage session requests"
  ON public.session_requests FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── eligibility_assessments ───────────────────────────────────────────────────

CREATE POLICY "Athletes can select own assessments"
  ON public.eligibility_assessments FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM public.student_athletes WHERE id = athlete_id));

CREATE POLICY "Athletes can insert own assessments"
  ON public.eligibility_assessments FOR INSERT
  WITH CHECK (auth.uid() = (SELECT user_id FROM public.student_athletes WHERE id = athlete_id));

CREATE POLICY "Athletes can update own assessments"
  ON public.eligibility_assessments FOR UPDATE
  USING  (auth.uid() = (SELECT user_id FROM public.student_athletes WHERE id = athlete_id))
  WITH CHECK (auth.uid() = (SELECT user_id FROM public.student_athletes WHERE id = athlete_id));

CREATE POLICY "Admins can select all assessments"
  ON public.eligibility_assessments FOR SELECT
  USING (public.is_admin());

CREATE POLICY "School staff can select own school assessments"
  ON public.eligibility_assessments FOR SELECT
  USING (
    public.is_school_staff()
    AND EXISTS (
      SELECT 1 FROM public.student_athletes sa
      WHERE sa.id = athlete_id AND sa.school_ceeb_code = public.my_school_id()
    )
  );

-- ── eligibility_courses ───────────────────────────────────────────────────────

CREATE POLICY "Athletes can select own courses"
  ON public.eligibility_courses FOR SELECT
  USING (auth.uid() = (
    SELECT sa.user_id
    FROM   public.eligibility_assessments ea
    JOIN   public.student_athletes        sa ON sa.id = ea.athlete_id
    WHERE  ea.id = assessment_id
  ));

CREATE POLICY "Athletes can insert own courses"
  ON public.eligibility_courses FOR INSERT
  WITH CHECK (auth.uid() = (
    SELECT sa.user_id
    FROM   public.eligibility_assessments ea
    JOIN   public.student_athletes        sa ON sa.id = ea.athlete_id
    WHERE  ea.id = assessment_id
  ));

CREATE POLICY "Athletes can update own courses"
  ON public.eligibility_courses FOR UPDATE
  USING (auth.uid() = (
    SELECT sa.user_id
    FROM   public.eligibility_assessments ea
    JOIN   public.student_athletes        sa ON sa.id = ea.athlete_id
    WHERE  ea.id = assessment_id
  ))
  WITH CHECK (auth.uid() = (
    SELECT sa.user_id
    FROM   public.eligibility_assessments ea
    JOIN   public.student_athletes        sa ON sa.id = ea.athlete_id
    WHERE  ea.id = assessment_id
  ));

CREATE POLICY "Admins can select all courses"
  ON public.eligibility_courses FOR SELECT
  USING (public.is_admin());

CREATE POLICY "School staff can select own school courses"
  ON public.eligibility_courses FOR SELECT
  USING (
    public.is_school_staff()
    AND EXISTS (
      SELECT 1
      FROM   public.eligibility_assessments ea
      JOIN   public.student_athletes        sa ON sa.id = ea.athlete_id
      WHERE  ea.id = assessment_id AND sa.school_ceeb_code = public.my_school_id()
    )
  );

-- ── ncaa_schools ──────────────────────────────────────────────────────────────

CREATE POLICY "Admins can manage ncaa_schools"
  ON public.ncaa_schools FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Any authenticated user can read school names/CEEB codes (for the school selector in Profile)
CREATE POLICY "Authenticated users can read ncaa_schools"
  ON public.ncaa_schools FOR SELECT
  TO authenticated
  USING (true);

-- ── storage: receipts ─────────────────────────────────────────────────────────

CREATE POLICY "Users can upload own receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users and admins can read receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- ── storage: transcripts ──────────────────────────────────────────────────────

CREATE POLICY "Users can upload own transcripts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'transcripts'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "School staff can upload transcripts for their athletes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'transcripts'
    AND public.is_school_staff()
    AND EXISTS (
      SELECT 1 FROM public.student_athletes sa
      WHERE  sa.user_id::text = (string_to_array(name, '/'))[1]
        AND  sa.school_ceeb_code = public.my_school_id()
    )
  );

CREATE POLICY "Users can read own transcripts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'transcripts'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "School staff can read transcripts for their athletes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'transcripts'
    AND public.is_school_staff()
    AND EXISTS (
      SELECT 1 FROM public.student_athletes sa
      WHERE  sa.user_id::text = (string_to_array(name, '/'))[1]
        AND  sa.school_ceeb_code = public.my_school_id()
    )
  );

CREATE POLICY "Admins can read all transcripts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'transcripts'
    AND public.is_admin()
  );
