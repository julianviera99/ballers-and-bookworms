-- Persist the full DI/DII eligibility detail and 10/7 rule result so a saved
-- assessment can be re-rendered (course breakdown + division status) at any time
-- without re-uploading a transcript. Previously only the summary (overall_status,
-- core_course_gpa, credits) and the per-course rows were stored; the di/dii detail
-- objects and the 10/7 boolean were computed, returned to the browser, then lost.

alter table public.eligibility_assessments
  add column if not exists di              jsonb,   -- { eligible, core_courses, meets_10_7_rule, *_count, status }
  add column if not exists dii             jsonb,   -- { eligible, core_courses, *_count, status }
  add column if not exists meets_10_7_rule boolean, -- DI 10/7 rule pass/fail
  add column if not exists current_grade   text;    -- student's current grade level as extracted
