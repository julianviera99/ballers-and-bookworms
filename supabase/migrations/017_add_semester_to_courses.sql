-- Add semester column to eligibility_courses.
-- This column was referenced in the edge function and 10/7 rule logic
-- but was omitted from the original 015_eligibility.sql migration.

alter table public.eligibility_courses
  add column if not exists semester text;
